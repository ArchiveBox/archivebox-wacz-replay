import type { ViewContext, ViewResult } from "./views";
import type { DocumentSource } from "../../abx-plugins/abx_plugins/plugins/liteparse/browser/view";
import {
  parseDocument,
  type ParsedDocument,
} from "../../abx-plugins/abx_plugins/plugins/liteparse/browser/parse";

/** Feed recorded original bodies into the existing offline document renderer.
 * Parsing is lazy and transient; it never invents saved OCR artifacts. */
export async function documentEvidence({
  archive,
  capture,
  signal,
}: ViewContext): Promise<ViewResult> {
  const documents: DocumentSource[] = [],
    seen = new Set<string>();
  const config = capture?.pluginConfig?.liteparse || {};
  const minimum = Number(config.LITEPARSE_MIN_IMAGE_DIMENSION ?? 128);
  for (const entry of archive.entries) {
    signal?.throwIfAborted();
    if (
      !/^https?:/.test(entry.url) ||
      entry.status !== 200 ||
      entry.method === "HEAD"
    )
      continue;
    const mime = entry.mime.split(";")[0]!.toLowerCase();
    if (!/^(application\/pdf|image\/(png|jpeg|webp|bmp|gif|tiff))$/.test(mime))
      continue;
    if (mime.startsWith("image/") && config.LITEPARSE_OCR_ENABLED === false)
      continue;
    const identity = entry.digest || entry.url;
    if (seen.has(identity)) continue;
    const { headers, image } = await archive.headers(entry);
    if (image && image.width < minimum && image.height < minimum) continue;
    seen.add(identity);
    let parsed: ParsedDocument | undefined,
      pending: Promise<ParsedDocument> | undefined;
    const listeners = new Set<() => void>();
    const update = (result: ParsedDocument) => {
      parsed = result;
      listeners.forEach((listener) => listener());
    };
    documents.push({
      entry,
      source: { captureId: archive.captureId!, url: entry.url, ts: entry.ts },
      name: new URL(entry.url).pathname.split("/").pop() || "document",
      mime,
      size: Number(headers["content-length"]) || 0,
      digest: entry.digest || "",
      ...(image ? { width: image.width, height: image.height } : {}),
      minimumDimension: minimum,
      peek: () => parsed,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      load(signal) {
        signal.throwIfAborted();
        if (parsed && !pending) return Promise.resolve(parsed);
        if (!pending) {
          pending = parseDocument(
            async () => (await archive.read(entry)).body,
            mime,
            config,
            signal,
            update,
          )
            .then((result) => {
              update(result);
              return result;
            })
            .finally(() => {
              pending = undefined;
            });
        }
        return pending;
      },
    });
  }
  documents.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  return {
    title: "LiteParse",
    summary: "Derived from recorded original responses.",
    sections: [],
    presentation: { type: "documents", documents },
  };
}
