import React from "react";
import type { ArchiveReader } from "../archive/reader";
import { mountDirectoryBrowser } from "./directory-browser";
import {
  memberMime,
  openZipMembers,
  type ZipMember,
} from "../archive/zip-members";
import { playerURL } from "../replay/client";

/** All members remain accessible, including unknown plugin outputs and JSONL. */
export function ArchiveFiles({
  archive,
  plugin,
}: {
  archive: ArchiveReader;
  plugin?: string;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const [selected, setSelected] = React.useState<{
    path: string;
    mime: string;
    url: string;
    text?: string;
  }>();
  const [nested, setNested] = React.useState<{
    name: string;
    members: ZipMember[];
  }>();
  const [error, setError] = React.useState("");
  const urls = React.useRef<string[]>([]),
    closeNested = React.useRef<(() => Promise<void>) | undefined>(undefined);
  React.useEffect(
    () => () => {
      urls.current.forEach(URL.revokeObjectURL);
      void closeNested.current?.();
    },
    [],
  );
  const pluginPaths = React.useMemo(
    () =>
      new Set(
        archive.metadata?.files
          .filter((file) => file.metadata.plugin === plugin)
          .flatMap((file) => (file.path ? [file.path] : [])) || [],
      ),
    [archive, plugin],
  );
  const belongs = (member: { path: string }) =>
    !plugin ||
    member.path.startsWith(plugin + "/") ||
    pluginPaths.has(member.path);
  const open = async (
    path: string,
    read: () => Promise<Uint8Array>,
    mime: string,
  ) => {
    setError("");
    try {
      const bytes = await read();
      if (/\.(zip|wacz)$/i.test(path)) {
        const zip = await openZipMembers(bytes);
        await closeNested.current?.();
        closeNested.current = zip.close;
        setNested({ name: path, members: zip.members });
        setSelected(undefined);
        return;
      }
      const blob = new Blob([bytes as BlobPart], { type: mime }),
        url = URL.createObjectURL(blob);
      urls.current.push(url);
      const text = /^(text\/|application\/(json|x-ndjson|xml|javascript))/.test(
        mime,
      )
        ? new TextDecoder().decode(bytes)
        : undefined;
      // Local members have a virtual directory so HTML/CSS keep relative assets.
      const previewURL = !nested
        ? playerURL(
            `package-file/${archive.captureId}/${path.split("/").map(encodeURIComponent).join("/")}`,
          )
        : url;
      setSelected({
        path,
        mime,
        url: mime === "text/html" ? previewURL : url,
        text,
      });
    } catch (reason) {
      setError(String(reason));
    }
  };
  React.useEffect(() => {
    if (plugin) {
      const file = archive.members.find(
        (member) =>
          belongs(member) && /\.(html?|pdf|png|jpe?g|webp)$/i.test(member.path),
      );
      if (file)
        void open(
          file.path,
          () => archive.member(file.path),
          memberMime(file.path),
        );
    }
  }, [archive, plugin]);
  React.useEffect(() => {
    const files =
      nested?.members ||
      archive.members.filter(belongs).map((member) => ({
        ...member,
        mime: memberMime(member.path),
        read: () => archive.member(member.path),
      }));
    return mountDirectoryBrowser(host.current!, {
      title: nested?.name || "Archive files",
      files: files.map((file) => ({
        ...file,
        read: async () =>
          new Blob([(await file.read()) as BlobPart], { type: file.mime }),
        open: () => open(file.path, file.read, file.mime),
      })),
    });
  }, [archive, nested, plugin]);
  return (
    <section className="archive-files">
      {nested && (
        <button
          onClick={() => {
            setNested(undefined);
            setSelected(undefined);
          }}
        >
          Back to archive
        </button>
      )}
      <div ref={host} />
      {error && <p role="alert">{error}</p>}
      {selected && (
        <section className="file-preview">
          <h2>{selected.path}</h2>
          {selected.mime === "text/html" ||
          selected.mime === "application/pdf" ? (
            <iframe
              title={selected.path}
              className="document-frame"
              sandbox="allow-same-origin"
              src={selected.url}
            />
          ) : selected.mime.startsWith("image/") ? (
            <img
              alt={selected.path}
              src={selected.url}
              style={{ maxWidth: "100%" }}
            />
          ) : selected.mime.startsWith("video/") ? (
            <video controls src={selected.url} />
          ) : selected.mime.startsWith("audio/") ? (
            <audio controls src={selected.url} />
          ) : selected.text !== undefined ? (
            <pre>{selected.text}</pre>
          ) : (
            <p>Use the file’s download button to open this format.</p>
          )}
        </section>
      )}
    </section>
  );
}
