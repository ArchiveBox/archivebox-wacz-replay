# ArchiveBox Replay

Keep this canonical checkout on `main`. This repository is a standalone view layer:
no server APIs, extension runtime, acquisition hooks, or sibling checkout paths.

Read README.md and VENDORING.md before changing the viewer. Keep vendored plugins
unchanged; adapt input formats in src/archive and presentation in src/ui. Preserve
source license notices. Never modify another repository as part of this viewer.

Use pnpm. Verify with pnpm typecheck and pnpm test. Browser acceptance must load
real archives through the public UI; no mocks, request interception, or fake hooks.
Do not hide failures with retries, timeouts, skipped tests, or looser assertions.
