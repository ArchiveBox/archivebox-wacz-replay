import type { ViewContext, ViewResult } from "./views";
import {
  originalText,
  textFormat,
} from "../../abx-plugins/abx_plugins/plugins/search_contents/browser/text";
import {
  searchOptions,
  type SearchDocument,
} from "../../abx-plugins/abx_plugins/plugins/search_contents/browser/index";
import { searchPresentation } from "../ui/search-presentation";

/** Adapt producer-neutral responses to existing plugin models. These are views,
 * not invented capture hooks or results; original metadata and files stay intact. */
export async function evidenceView(
  name: string,
  context: ViewContext,
): Promise<ViewResult | undefined> {
  const { archive, capture, url, signal } = context;
  const recorded = capture?.hooks.some(
    (hook) => hook.plugin === name && hook.records?.length,
  );
  if (
    name === "liteparse" &&
    !archive.entries.some((entry) => entry.url.startsWith("urn:ocr:"))
  ) {
    const { documentEvidence } = await import("./document-evidence");
    return documentEvidence(context);
  }
  if (recorded) return;
  const refs = archive.entries.filter((entry) => /^https?:/.test(entry.url));
  if (name === "forumdl") {
    const { extractArchivedForum } =
      await import("../../vendor/forum-dl/offline");
    const result = await extractArchivedForum(archive, url, refs, true, signal);
    const records = (["board", "thread", "post", "file"] as const).flatMap(
      (type) =>
        result[`${type}s`].map((item) => ({
          type,
          extractor: result.family,
          item,
        })),
    );
    return {
      title: "Forum thread",
      summary: "",
      sections: [],
      presentation: { type: "forum", records },
    };
  }
  if (name === "gallerydl") {
    const { createArchivedTransport } =
      await import("../../vendor/python/transport");
    const { runExtractorWorker } =
      await import("../../vendor/python/worker-client");
    const request = await createArchivedTransport(archive, refs),
      logs: string[] = [];
    const result = await runExtractorWorker<
      import("../../vendor/gallery-dl/runtime").GalleryResult
    >(
      "gallery",
      [
        url,
        JSON.parse(
          String(capture?.pluginConfig?.gallerydl?.GALLERYDL_CONFIG || "{}"),
        ),
        false,
      ],
      { request, log: (message) => logs.push(message), sleep: async () => {} },
      signal,
    );
    const images: import("../../abx-plugins/abx_plugins/plugins/gallerydl/browser/view").GalleryImage[] =
        [],
      seen = new Set<string>();
    for (const message of result.messages) {
      if (message.type !== "url" || seen.has(message.url)) continue;
      const entry = archive.find(message.url);
      if (!entry || entry.status !== 200 || !entry.mime.startsWith("image/"))
        continue;
      seen.add(message.url);
      const { headers } = await archive.headers(entry);
      images.push({
        entry,
        name: String(
          message.metadata.filename ||
            new URL(message.url).pathname.split("/").pop() ||
            "Image",
        ),
        size: Number(headers["content-length"]) || 0,
      });
    }
    return {
      title: "Gallery",
      summary: `${images.length} images`,
      sections: [],
      presentation: {
        type: "gallery",
        images,
        messages: result.messages,
        errors: [...result.errors, ...request.failures],
        logs,
      },
    };
  }
  if (name === "git") {
    const { normalizeGitURL, cloneGit, gitDomains } =
      await import("../../vendor/git/runtime");
    const remote = normalizeGitURL(
      url,
      String(capture?.pluginConfig?.git?.GIT_DOMAINS || gitDomains),
    );
    if (
      !remote ||
      !refs.some((entry) =>
        /\/(info\/refs|git-upload-pack|objects\/)/.test(entry.url),
      )
    )
      return;
    const { createArchivedTransport } =
      await import("../../vendor/python/transport");
    const repository = await cloneGit(
      remote,
      await createArchivedTransport(archive, refs),
      { signal },
    );
    return {
      title: "Git",
      summary: "",
      sections: [],
      presentation: {
        type: "git",
        repository,
        source: url,
        page: archive.documentEntry()
          ? await archive.text(archive.documentEntry()!)
          : "",
      },
    };
  }
  if (name === "papersdl") {
    const entry = refs.find(
      (entry) => entry.mime === "application/pdf" && entry.status === 200,
    );
    if (entry)
      return {
        title: "Academic papers",
        summary: "",
        sections: [],
        presentation: { type: "paper", entry },
      };
  }
  if (name === "search_contents" && !archive.artifact("index")) {
    const { default: MiniSearch } = await import("minisearch");
    const search = new MiniSearch(searchOptions),
      documents: SearchDocument[] = [],
      texts = new Map<number, string>();
    for (const entry of refs) {
      signal?.throwIfAborted();
      if (entry.status !== 200 || !textFormat(entry.mime, entry.url)) continue;
      const record = await archive.read(entry);
      const result = await originalText(
        entry === archive.documentEntry()
          ? new TextEncoder().encode(
              (await archive.dom()).documentElement.outerHTML,
            )
          : record.body,
        record.headers["content-type"] || entry.mime,
        entry.url,
      );
      if (!result.text.trim()) continue;
      const id = documents.length,
        title = result.title || entry.url;
      documents.push({
        id,
        title,
        url: entry.url,
        mime: entry.mime,
        ref: { captureId: archive.captureId!, url: entry.url, ts: entry.ts },
      });
      texts.set(id, result.text);
      search.add({ id, title, text: result.text });
    }
    return {
      title: "Search",
      summary: "",
      sections: [],
      presentation: searchPresentation(
        {
          version: 1,
          engine: "MiniSearch 7.2.0",
          documents,
          index: search.toJSON(),
        },
        async (document) => texts.get(document.id) || "",
      ),
    };
  }
}
