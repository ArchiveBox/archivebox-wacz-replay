import { deriveView, type ViewContext } from "./views";
import { textFormat } from "../../abx-plugins/abx_plugins/plugins/search_contents/browser/text";

const checks = import.meta.glob(
  "../../abx-plugins/abx_plugins/plugins/*/browser/available.ts",
  { eager: true, import: "default" },
) as Record<string, (context: ViewContext) => boolean | Promise<boolean>>;
const domViews = new Set([
  "archivewebpage",
  "dom",
  "singlefile",
  "readability",
  "mercury",
  "defuddle",
  "htmltotext",
  "seo",
  "title",
  "parse_html_urls",
  "parse_dom_outlinks",
]);
const observations: Record<string, string> = {
  screenshot: "screenshot",
  accessibility: "accessibility",
  consolelog: "consolelog",
  browsertrix_behaviors: "browsertrix_behaviors",
  infiniscroll: "infiniscroll",
  sslcerts: "sslcerts",
};
/** Eligibility comes from saved evidence, independent of the producer's hook list.
 * Renderer-specific checks remain in the vendored library; acquisition-only
 * observations need a saved artifact, while derived views can read HTTP bodies. */
export function hasOutput(
  name: string,
  context: ViewContext,
): boolean | Promise<boolean> {
  const { archive, url } = context,
    http = archive.entries.filter((entry) => /^https?:/.test(entry.url));
  if (observations[name])
    return Boolean(
      archive.artifact(observations[name]!) ||
      (name === "screenshot" && archive.artifact("fullPage")),
    );
  if (domViews.has(name)) return Boolean(archive.documentEntry());
  if (name === "liteparse")
    return deriveView(name, context).then(
      (view) =>
        view.presentation?.type === "documents" &&
        view.presentation.documents.length > 0,
    );
  if (name === "ytdlp" || name === "media")
    return deriveView(name, context).then(
      (view) =>
        view.presentation?.type === "ytdlp" &&
        view.presentation.files.length > 0,
    );
  if (name === "responses") return http.length > 0;
  if (name === "headers")
    return Boolean(archive.documentEntry() || archive.find(url));
  if (name === "pdf")
    return Boolean(
      archive.artifact("pdf") ||
      archive.documentEntry() ||
      http.some((entry) => entry.mime === "application/pdf"),
    );
  if (name === "favicon")
    return http.some(
      (entry) =>
        entry.mime.startsWith("image/") &&
        /favicon|apple-touch-icon/i.test(entry.url),
    );
  if (name === "robots")
    return http.some(
      (entry) =>
        entry.status === 200 && new URL(entry.url).pathname === "/robots.txt",
    );
  if (name === "search_contents")
    return (
      Boolean(archive.artifact("index")) ||
      http.some(
        (entry) => entry.status === 200 && textFormat(entry.mime, entry.url),
      )
    );
  if (name === "parse_txt_urls")
    return http.some((entry) => /^text\/(plain|markdown)/i.test(entry.mime));
  if (name === "parse_jsonl_urls")
    return http.some((entry) => /json|ndjson/.test(entry.mime));
  if (name === "papersdl")
    return http.some(
      (entry) => entry.status === 200 && entry.mime === "application/pdf",
    );
  if (name === "forumdl")
    return archive.documentEntry()
      ? deriveView(name, context).then(
          (view) =>
            view.presentation?.type === "forum" &&
            view.presentation.records.length > 0,
        )
      : false;
  if (name === "gallerydl")
    return http.some((entry) => entry.mime.startsWith("image/"))
      ? deriveView(name, context).then(
          (view) =>
            view.presentation?.type === "gallery" &&
            view.presentation.images.length > 0,
        )
      : false;
  if (name === "git")
    return http.some((entry) =>
      /\/(info\/refs|git-upload-pack|objects\/)/.test(entry.url),
    );
  if (name === "dns")
    return deriveView(name, context).then(
      (view) =>
        view.presentation?.type === "canonical" &&
        view.presentation.data.length > 0,
    );
  if (name === "rss" || name === "parse_rss_urls")
    return http.some(
      (entry) =>
        entry.status === 200 &&
        /^(?:application|text)\/(?:rss\+xml|atom\+xml|xml|feed\+json)$/i.test(
          entry.mime,
        ),
    );
  return (
    checks[
      `../../abx-plugins/abx_plugins/plugins/${name}/browser/available.ts`
    ]?.(context) ?? true
  );
}
