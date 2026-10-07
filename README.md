# ArchiveBox Replay

A standalone, static web viewer for WACZ and ZIP archives. ArchiveBox's snapshot
cards, output stacks, file browser, and offline plugin views surround Webrecorder's
replay engine. No ArchiveBox server, browser extension, database service, or capture
engine is required.

## Run

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview --port 4178
```

Open http://localhost:4178. Select or drop a `.wacz` or `.zip`, or open an HTTP(S)
archive URL. Deploy the contents of `dist/` on any static HTTPS host, including
under a subdirectory. Service workers require HTTPS or localhost; `file://` is not
supported. Build before previewing: the replay service worker and WASM assets are
part of the production bundle.

## View

- **Snapshot:** ArchiveBox output stacks, screenshots, articles, documents, media,
  recorded responses, search, and the vendored plugin renderers.
- **Replay:** Webrecorder replay and a saved-page selector for ordinary WACZ files,
  including archives without ArchiveBox metadata.
- **Files:** Every ZIP member, directory navigation, filtering, sorting, individual
  downloads, folder ZIP downloads, and nested ZIP browsing.
- **Metadata:** Original parsed `index.jsonl` records and the datapackage manifest.
  Other JSONLs remain accessible in Files.
- **Integrity:** On-demand verification of the WACZ resource and manifest hashes.
- **Download original:** The original package bytes, unchanged.

ArchiveBox browser records and server-style Snapshot/ArchiveResult records enrich
views when present. Unknown plugins remain accessible as files and metadata.
Malformed or unsupported optional metadata produces a notice without hiding the
underlying package. Archives without a replay index remain browsable as ZIPs.

Local inputs are copied into browser OPFS so replay frames and output tabs can read
on demand. Reload retains the open archive. **Close archive** removes its local
source copy. This is viewer storage, not an ArchiveBox collection or sync client.
Remote WACZ replay uses range requests; the remote host must permit CORS and byte
ranges. `?source=https%3A...` opens an archive directly; use that URL in an iframe
to embed the viewer. An output card also opens its individual view in a new tab.

Plugin derivations operate on recorded responses. Python/WASM, OCR, media and
article libraries are bundled locally. Native browser **Print / Save as PDF**
replaces extension-only automatic PDF generation. Accessibility trees can be
shown when recorded; this website cannot ask Chrome's debugger to generate one.

## Develop and verify

```sh
pnpm typecheck
pnpm exec playwright install chromium
pnpm test
```

Tests open real WACZ captures through the public file picker in a normal browser,
check replay, original-byte downloads, package hashes, reload and ZIP browsing.
See `VENDORING.md` and `tests/fixtures/README.md` for provenance.

The viewer is derived from AGPL-3.0-or-later ArchiveBox JS and the browser extension.
Original notices and third-party licenses remain in `LICENSES/` and `vendor/`.
