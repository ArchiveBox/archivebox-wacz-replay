import { ArchiveReader } from "../src/archive/reader";
import { readArchive } from "../src/archive/storage";
import { memberMime } from "../src/archive/zip-members";
import { PluginReplay } from "../src/replay/PluginReplay";
class PlayerReplay extends PluginReplay {
  override async wrapCSPForFrame(response: Response, request: Request) {
    const url = new URL(request.url),
      root = new URL(this.prefix);
    // Embedded output frames are the trusted player application, which reads
    // the user-selected WACZ origin. Keep upstream replay CSP on archived pages.
    if (
      url.origin === root.origin &&
      [root.pathname, new URL("index.html", root).pathname].includes(
        url.pathname,
      )
    )
      return response;
    return super.wrapCSPForFrame(response, request);
  }
}
const packageSources = new Map<string, string>();
const packages = new Map<string, Promise<ArchiveReader>>();
self.addEventListener("fetch", (event: Event) => {
  const request = (event as unknown as { request: Request }).request;
  const scope = (self as unknown as { registration: { scope: string } })
    .registration.scope;
  const packagePrefix = new URL("package-file/", scope).href;
  if (request.url.startsWith(packagePrefix)) {
    event.stopImmediatePropagation();
    const response = (async () => {
      try {
        const [id, ...parts] = new URL(request.url).pathname
          .slice(new URL(packagePrefix).pathname.length)
          .split("/");
        if (!id) throw Error("Missing archive");
        let reader = packages.get(id);
        if (!reader) {
          reader = packageSources.has(id)
            ? ArchiveReader.fromURL(packageSources.get(id)!, false)
            : readArchive(id).then((file) => ArchiveReader.from(file));
          packages.set(id, reader);
        }
        const path = parts.map(decodeURIComponent).join("/");
        const archive = await reader;
        if (!archive.members.some((member) => member.path === path))
          throw Error("Missing member");
        return new Response((await archive.member(path)) as BodyInit, {
          headers: {
            "Content-Type": memberMime(path),
            "Content-Security-Policy":
              "sandbox allow-same-origin; default-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self'; font-src 'self';",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (error) {
        return new Response(String(error), { status: 404 });
      }
    })();
    (
      event as unknown as { respondWith(response: Promise<Response>): void }
    ).respondWith(response);
    return;
  }
  if (
    !request.referrer.startsWith(new URL("w/", scope).href) &&
    !["w/", "static/", "plugin-record/"].some((path) =>
      request.url.startsWith(new URL(path, scope).href),
    )
  )
    event.stopImmediatePropagation();
});
const replay = new PlayerReplay();
self.addEventListener("message", (event: MessageEvent) => {
  if (!event.data?.archivebox || !event.ports[0]) return;
  const client = event.source as { url?: string } | null;
  const scope = (self as unknown as { registration: { scope: string } })
    .registration.scope;
  if (
    !client?.url ||
    ![scope, new URL("index.html", scope).href].includes(
      client.url.split(/[?#]/)[0]!,
    )
  )
    return;
  if (event.data.type === "package-source") {
    try {
      const source = new URL(event.data.sourceUrl);
      if (!/^https?:$/.test(source.protocol))
        throw Error("Invalid archive URL");
      packageSources.set(event.data.id, source.href);
      event.ports[0]!.postMessage({ ok: true });
    } catch (error) {
      event.ports[0]!.postMessage({ error: String(error) });
    }
    return;
  }
  if (event.data.type === "unmount-wacz") {
    packages.delete(event.data.id);
    packageSources.delete(event.data.id);
  }
  const work = replay.command(event.data).then(
    (result) => event.ports[0]!.postMessage(result),
    (error) => event.ports[0]!.postMessage({ error: String(error) }),
  );
  (event as unknown as { waitUntil(work: Promise<void>): void }).waitUntil(
    work,
  );
});
