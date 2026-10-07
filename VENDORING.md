# Source provenance and boundaries

Initial extraction:

- ArchiveBox browser extension `05c02f078524bb87f5904cc2d9291e46e8f89cbd`:
  https://github.com/ArchiveBox/archivebox-browser-extension/tree/05c02f078524bb87f5904cc2d9291e46e8f89cbd
- ArchiveBox JS player entrypoint `6accc97adad02ce784bcb10ec6a6aedfef6d9d7d`:
  https://github.com/ArchiveBox/archivebox-js/tree/6accc97adad02ce784bcb10ec6a6aedfef6d9d7d

`src/ui`, `src/archive`, and `src/replay` are the extracted, independently maintained
view layer. `vendor/archivebox` retains the server's HTML/CSS/templates and stack
controller; `vendor/replaywebpage` retains the upstream replay component.

`abx-plugins/` is a byte-for-byte vendored subset of the source plugin library.
Only configurations, views, availability checks and their supporting files are
used. The LiteParse hook module is retained because a view imports its exported
type; its acquisition entrypoint is never registered or executed. No source plugin
repository was modified. `src/capture/` retains shared types, config registry,
request matching, and the isolated offline yt-dlp challenge helper solely to keep
vendored import paths intact. It contains no capture engine or hook runner.

`vendor/`, `public/`, `patches/`, and `LICENSES/` preserve the source notices and
bundled offline engines. `pnpm-lock.yaml` pins external runtime dependencies.
`scripts/browser-assets.ts` copies installed WASM/Python/media assets into the
static build. No sibling checkout is read during install, build, or runtime.

Updates should replace vendored files from a pinned upstream revision, preserve
licenses, and rerun acceptance tests. Changes to adapters belong in this repo's
view layer rather than edits to the source plugin library.
