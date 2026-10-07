# Real capture fixtures

- `iframetest.wacz`: Webrecorder's public replay example, copied unchanged from
  ArchiveBox's existing memento fixture. Upstream:
  https://github.com/webrecorder/replayweb.page/blob/38305d70c9155caed8f58c84255fac9397155e27/mkdocs/site/docs/examples/iframetest.wacz
- `archivebox-js.wacz`: existing complete ArchiveBox JS capture of
  https://sweeting.me/ made 2026-10-05T02:16:28.510Z, snapshot
  1226d672-d4a2-4090-9d1a-3a0ccdc23d22. Copied unchanged from the local
  interchange validation evidence. Includes real plugin outputs and JSONL.

Generic ZIP tests package real repository documents/assets. No capture API,
plugin, browser service, or network response is mocked.

`server/` contains the unchanged index.jsonl, SingleFile and screenshot from a real
ArchiveBox server capture of https://news.ycombinator.com/item?id=1, Snapshot
01a108e7309f71b3bb706ea26e5e3f79 on 2026-10-04. Tests package these existing outputs
into a ZIP to check server-style records and unknown plugin visibility.
