# Real-site acceptance captures

Unmodified captures, retained independently of the live sites. The viewer must
consume these through its public import UI. Tests prohibit requests to origins.

- `wget-sweeting.warc.gz`: GNU Wget 1.25.0, https://sweeting.me/, 2026-10-07 UTC.
- `wget-blog.warc.gz`: GNU Wget 1.25.0, https://docs.sweeting.me/s/blog,
  2026-10-07 UTC, `--page-requisites --span-hosts` (cross-host CSS/JS bundles).
- `wget-hackernews.warc.gz`: GNU Wget 1.25.0, https://news.ycombinator.com/,
  2026-10-07 UTC, `--page-requisites`.
- `grabsite-blog.warc.gz`: grab-site 2.2.7 / wpull 3.0.9, same blog,
  2026-10-07 UTC. Upstream commit and Python dependency pins are in the parent
  README. Invoked with `--no-global-igset --no-offsite-links --no-sitemaps
  --delay=100 --wpull-args='--level=1'`. This is its original `*-00000.warc.gz`,
  excluding the separate crawler log WARC.
- `archivebox-hn-discussion.wacz`: real ArchiveBox JS capture, 2026-10-04 UTC,
  https://news.ycombinator.com/item?id=49944227. Original 18 MB package retained
  from the all-plugin capture run; 511 indexed resources and 486 rendered forum
  replies. Hook records, API responses, WARC, screenshots and metadata are intact.

No response was fabricated or altered. Crawlers do not execute HedgeDoc's JS and
therefore miss images referenced only by client-rendered Markdown; this is a real
capture limitation. The browser-captured blog WACZ used in manual visual review
contains these images. A site being live today is not evidence of replay success.
