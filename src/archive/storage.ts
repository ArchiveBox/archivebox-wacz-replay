/** Viewer-local source bytes only; no ArchiveBox catalog or extension APIs. */
export async function archiveFileHandle(id: string, create = false) {
  if (!/^[a-f0-9-]{32,36}$/.test(id)) throw Error("Invalid archive ID");
  return (await navigator.storage.getDirectory()).getFileHandle(id + ".wacz", {
    create,
  });
}
export async function readArchive(id: string) {
  return (await archiveFileHandle(id)).getFile();
}
export async function removeArchive(id: string) {
  await (await navigator.storage.getDirectory()).removeEntry(id + ".wacz");
}
