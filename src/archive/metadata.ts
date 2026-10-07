import {
  interchange,
  parseJSONL,
  validatePath,
  type OutputFile,
  type ArchiveResultRecord,
  type IndexRecord,
  type ResourceRef,
} from "../../abx-plugins/shared/records";
import type { Capture, HookStatus } from "../capture/types";

export type PluginFile = {
  url: string;
  ts: number;
  mime: string;
  status: number;
  headers: Record<string, string>;
  metadata: Record<string, unknown>;
  hash: string;
  bytes: number;
} & (
  | { path: string; record?: never }
  | { path?: never; record: { url: string; ts: number } }
);

/** Recorder metadata carried by the existing ArchiveResult.output_files entries. */
export type RecordedOutputFile = OutputFile & {
  url: string;
  ts: number;
  hash: string;
  headers: Record<string, string>;
  metadata: Record<string, unknown>;
  storage:
    | { type: "wacz-member"; path: string }
    | { type: "warc-response"; url: string; ts: number };
};

/** Runtime projection for existing plugin views; never serialized into WACZ. */
export type CaptureMetadata = {
  captureId: string;
  state: Capture["state"];
  created: number;
  url: string;
  finalUrl?: string;
  title: string;
  error?: string;
  tags?: string[];
  files: PluginFile[];
  plugins: {
    id: string;
    config: Record<string, unknown> | null;
    hooks: {
      id?: string;
      name: string;
      status: HookStatus;
      started: number;
      ended?: number;
      ready?: number;
      summary?: string;
      logs: string[];
      records: ResourceRef[];
      data?: unknown;
    }[];
  }[];
};

function outputFile(file: RecordedOutputFile): PluginFile {
  validatePath(file.path);
  if (
    !file.url?.startsWith("urn:") ||
    !Number.isSafeInteger(file.ts) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    !/^sha256:[0-9a-f]{64}$/.test(file.hash)
  )
    throw Error("Invalid recorded output file");
  const base = {
    url: file.url,
    ts: file.ts,
    mime: file.mimetype,
    status: 200,
    headers: file.headers,
    metadata: file.metadata,
    hash: file.hash,
    bytes: file.size,
  };
  if (file.storage?.type === "wacz-member") {
    validatePath(file.storage.path);
    return { ...base, path: file.storage.path };
  }
  if (
    file.storage?.type === "warc-response" &&
    /^https?:\/\//.test(file.storage.url) &&
    Number.isSafeInteger(file.storage.ts)
  ) {
    return { ...base, record: { url: file.storage.url, ts: file.storage.ts } };
  }
  throw Error("Invalid recorded output location");
}

export async function readCaptureMetadata(
  manifest: any,
  read: (path: string) => Promise<Uint8Array>,
): Promise<CaptureMetadata | undefined> {
  const descriptor = manifest.archivebox;
  if (!descriptor) return undefined;
  // Existing immutable experimental captures predate the interchange records.
  // One read boundary keeps those captures usable; all writes use JSONL only.
  if (descriptor.format === "archivebox-plugins" && descriptor.version === 1)
    return { ...descriptor, files: descriptor.files || [] };
  if (
    descriptor.format !== interchange.format ||
    descriptor.version !== interchange.version ||
    descriptor.index !== interchange.index
  )
    throw Error("Unsupported ArchiveBox interchange version");
  const decoder = new TextDecoder();
  const indexBytes = await read(interchange.index);
  const records = parseJSONL<IndexRecord>(
    decoder.decode(indexBytes),
    interchange.index,
  );
  const snapshots = records.filter((record) => record.type === "Snapshot");
  if (snapshots.length !== 1)
    throw Error("Expected one Snapshot in capture index.jsonl");
  const metadata = metadataFromRecords(records);
  if (metadata && descriptor.artifacts) {
    validatePath(descriptor.artifacts);
    const artifacts = parseJSONL<any>(
      decoder.decode(await read(descriptor.artifacts)),
      descriptor.artifacts,
    );
    for (const artifact of artifacts) {
      if (artifact.type !== "Artifact") continue;
      if (artifact.snapshot_id !== metadata.captureId)
        throw Error("Artifact belongs to another snapshot");
      const file = outputFile({
        ...artifact,
        path: artifact.storage?.path || artifact.plugin + "/resource",
        url: artifact.id,
        ts: Date.parse(artifact.created_at),
      });
      if (
        !metadata.files.some(
          (existing) => existing.url === file.url && existing.ts === file.ts,
        )
      )
        metadata.files.push(file);
    }
  }
  return metadata;
}

/** Read the common records without assuming browser-only hook payloads. */
export function metadataFromRecords(
  records: any[],
): CaptureMetadata | undefined {
  const snapshots = records.filter((record) => record?.type === "Snapshot");
  if (snapshots.length !== 1) return undefined;
  const snapshot = snapshots[0];
  const results = records.filter(
    (record) =>
      record?.type === "ArchiveResult" &&
      record.snapshot_id?.replaceAll("-", "") ===
        snapshot.id?.replaceAll("-", ""),
  );
  const created =
    Date.parse(snapshot.created_at || snapshot.bookmarked_at) || 0;
  const files: PluginFile[] = [];
  const pluginNames = [
    ...new Set<string>([
      ...(Array.isArray(snapshot.plugins) ? snapshot.plugins : []),
      ...results.map((result) => result.plugin).filter(Boolean),
    ]),
  ];
  for (const result of results) {
    const outputs = Array.isArray(result.output_files)
      ? result.output_files
      : Object.entries(result.output_files || {}).map(([path, value]) => ({
          ...(value as object),
          path,
        }));
    for (const file of outputs) {
      if (file.storage) {
        files.push(outputFile(file));
        continue;
      }
      validatePath(file.path);
      validatePath(result.plugin);
      const path = file.path.startsWith(result.plugin + "/")
        ? file.path
        : result.plugin + "/" + file.path;
      files.push({
        path,
        url: "urn:" + result.plugin + ":" + result.id + ":" + file.path,
        ts: Date.parse(result.start_ts) || created,
        mime: file.mimetype || "application/octet-stream",
        status: 200,
        headers: {
          "content-type": file.mimetype || "application/octet-stream",
        },
        metadata: { plugin: result.plugin },
        hash: file.hash || "",
        bytes: file.size || 0,
      });
    }
  }
  return {
    captureId: snapshot.id,
    state: snapshot.capture_state || "complete",
    created,
    url: snapshot.url || "",
    title: snapshot.title || "",
    finalUrl: snapshot.final_url,
    tags: Array.isArray(snapshot.tags)
      ? snapshot.tags
      : typeof snapshot.tags === "string"
        ? snapshot.tags
            .split(",")
            .map((tag: string) => tag.trim())
            .filter(Boolean)
        : [],
    files,
    plugins: pluginNames.map((id) => ({
      id,
      config: { ...snapshot.config, ...snapshot.plugin_config?.[id] },
      hooks: results
        .filter((result) => result.plugin === id)
        .map((result) => ({
          id: result.id,
          name: result.output_json?.hook_filename || result.hook_name || id,
          status: result.output_json?.termination || result.status,
          started: Date.parse(result.start_ts) || created,
          ended: Date.parse(result.end_ts) || undefined,
          summary: result.output_str,
          logs: result.output_json?.logs || [],
          records:
            result.output_json?.records ||
            files
              .filter((file) => file.metadata.plugin === id)
              .map((file) => ({
                url: file.url,
                ts: file.ts,
                captureId: snapshot.id,
              })),
          data: result.output_json?.data,
        })),
    })),
  };
}
