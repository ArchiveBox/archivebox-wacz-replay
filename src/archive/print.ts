import type { ArchiveReader } from "./reader";
import { replayHTML } from "./replay";

const policy =
  "default-src 'self' blob:; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'";
const readyExpression = `(async()=>{if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));document.querySelectorAll('img').forEach(image=>image.loading='eager');await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));await document.fonts.ready;return true})()`;
export async function printableHTML(
  archive: ArchiveReader,
  url: string,
  preserveForms = false,
) {
  const source = await archive.dom();
  const html = await replayHTML(
    archive,
    "<!doctype html>" + source.documentElement.outerHTML,
    url,
    { preserveForms },
  );
  return html.replace(
    /<head([^>]*)>/i,
    `<head$1><meta http-equiv="Content-Security-Policy" content="${policy}">`,
  );
}
export type AXNode = {
  nodeId: string;
  parentId?: string;
  childIds?: string[];
  ignored?: boolean;
  role?: { value?: unknown };
  name?: { value?: unknown };
  value?: { value?: unknown };
  properties?: { name: string; value: { value?: unknown } }[];
};

/** Browser accessibility APIs are privileged; show captured evidence only. */
export async function accessibilityTree(
  archive: ArchiveReader,
  _url: string,
  signal: AbortSignal,
): Promise<{ nodes: AXNode[] }> {
  signal.throwIfAborted();
  const entry = archive.artifact("accessibility");
  if (entry) {
    const tree = await archive.json(entry);
    if (Array.isArray(tree.nodes)) return tree;
  }
  throw Error("No accessibility tree was saved in this archive.");
}
