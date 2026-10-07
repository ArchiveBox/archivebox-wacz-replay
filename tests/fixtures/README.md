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

## Crawler captures

`wget.warc.gz` and `grab-site.warc.gz` were produced by the actual tools on
2026-10-07 (UTC), capturing `crawl-site/` served by Python's static HTTP server at
http://127.0.0.1:8879/. Their `.warc` counterparts are byte-for-byte gzip
expansions. The origin is stopped before replay tests; no origin requests are
allowed by the assertions. `warcinfo` retains original software/argument records.

- wget: GNU Wget 1.25.0, WARC 1.0, 7 HTTP responses (including robots.txt 404)
  plus 3 wget metadata resources.
- grab-site: 2.2.7, wpull 3.0.9, Python 3.8.20, WARC 1.0, 6 HTTP responses.
  Upstream commit `0eaf88628f4d8ef5af4df4c13f594606a41de3cd`.
- `crawl-site/archive.png` is the viewer's existing `public/archive.png` asset.

To regenerate in a scratch directory outside the checkout, serve `crawl-site/`
at port 8879, then run (use a fresh `$capture_dir`):

```sh
wget --recursive --level=2 --page-requisites \
  --warc-file="$capture_dir/wget" --directory-prefix="$capture_dir/files" \
  http://127.0.0.1:8879/

GRAB_SITE_NO_CCHARDET=1 uv tool run --python 3.8 \
  --with 'html5-parser<0.5' --with 'google-re2==1.1.20240702' --with 'lmdb==1.4.1' \
  --from 'git+https://github.com/ArchiveTeam/grab-site@0eaf88628f4d8ef5af4df4c13f594606a41de3cd' \
  grab-site --dir="$capture_dir/grab-site" --no-global-igset \
  --no-offsite-links --no-sitemaps --delay=0 http://127.0.0.1:8879/
```

The dependency pins allow upstream's Python 3.8 application to install on Apple
Silicon; its source is unchanged. Optional cchardet is disabled through upstream's
supported installation setting. Use grab-site's `*-00000.warc.gz` content file,
not its separate `*-meta.warc.gz` crawler-log file. Stop the static server before
running acceptance tests. The archives retain local paths in producer metadata;
no credentials were supplied.
