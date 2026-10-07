import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { downloadZip } from "client-zip";
import path from "node:path";

for (const filename of ["iframetest.wacz", "archivebox-js.wacz"])
  test(`standalone opens and replays ${filename}`, async ({ page }, info) => {
    const errors: string[] = [],
      external: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => {
      if (
        /^https?:/.test(request.url()) &&
        !request.url().startsWith("http://127.0.0.1:4178/")
      )
        external.push(request.url());
    });
    await page.goto("/");
    await page
      .locator("input[type=file]")
      .setInputFiles(path.resolve("tests/fixtures", filename));
    await expect(
      page.getByRole("navigation", { name: "Archive views" }),
    ).toBeVisible();
    await expect(page.locator(".error[role=alert]")).toHaveCount(0);
    await page.getByRole("button", { name: /^Files \(/ }).click();
    await expect(
      page.getByText("datapackage.json", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Metadata", exact: true }).click();
    if (filename === "archivebox-js.wacz")
      await expect(page.locator("pre").first()).toContainText("ArchiveResult");
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect(
      page.getByLabel("ReplayWeb.page archive viewer").locator("iframe"),
    ).toHaveCount(1);
    await expect
      .poll(() =>
        page
          .frames()
          .some(
            (frame) =>
              frame.url().includes("/w/") && frame.url().includes("mp_/"),
          ),
      )
      .toBe(true);
    const replay = page
      .frames()
      .find(
        (frame) => frame.url().includes("/w/") && frame.url().includes("mp_/"),
      )!;
    await expect(replay.locator("body")).toContainText(
      filename === "iframetest.wacz" ? "Outside iframe" : "Nick Sweeting",
    );
    await expect(replay.locator("body")).not.toContainText(
      "Sorry, this URL was not archived",
    );
    if (filename === "iframetest.wacz") {
      await expect(replay.frameLocator("iframe").locator("body")).toContainText(
        "Inside iframe",
      );
    } else {
      await expect
        .poll(() =>
          replay
            .locator("img")
            .evaluateAll(
              (images) =>
                images.filter(
                  (image) => (image as HTMLImageElement).naturalWidth > 0,
                ).length,
            ),
        )
        .toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath("replay.png"),
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Integrity", exact: true }).click();
    await page.getByRole("button", { name: "Verify hashes" }).click();
    await expect(page.locator("pre[role=status]")).toContainText("PASS");
    await expect(page.locator("pre[role=status]")).not.toContainText("FAIL");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download original" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(filename);
    const saved = info.outputPath(filename);
    await download.saveAs(saved);
    const sha = (bytes: Buffer) =>
      createHash("sha256").update(bytes).digest("hex");
    expect(sha(await readFile(saved))).toBe(
      sha(await readFile(path.resolve("tests/fixtures", filename))),
    );
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "Archive views" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    await page.screenshot({
      path: info.outputPath("snapshot.png"),
      fullPage: true,
    });
  });

test("ZIP file browser previews, searches and exports original bytes", async ({
  page,
}, info) => {
  // A ZIP of genuine project files exercises generic archives without invented plugin records.
  const text = await readFile("README.md");
  const zip = await downloadZip([
    { name: "docs/README.md", input: text },
    { name: "images/archive.png", input: await readFile("public/archive.png") },
  ]).arrayBuffer();
  const input = info.outputPath("source.zip");
  await writeFile(input, new Uint8Array(zip));
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(input);
  await expect(
    page.getByRole("button", { name: /^Files \(2\)/ }),
  ).toBeVisible();
  await page.getByText("docs/", { exact: true }).click();
  await page.getByText("README.md", { exact: true }).click();
  await expect(page.locator(".file-preview pre")).toHaveText(text.toString());
  await page.getByRole("searchbox", { name: "Filter files" }).fill("missing");
  await expect(page.getByText("No matching files.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Filter files" }).fill("");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download README.md", exact: true })
    .click();
  const download = await downloading;
  const file = info.outputPath("readme.md");
  await download.saveAs(file);
  expect(await readFile(file)).toEqual(text);
  await page.screenshot({ path: info.outputPath("files.png"), fullPage: true });
});

test("server JSONL ZIP displays stored plugin assets and all metadata", async ({
  page,
}, info) => {
  const entries = [
    {
      name: "index.jsonl",
      input: await readFile("tests/fixtures/server/index.jsonl"),
    },
    {
      name: "singlefile/singlefile.html",
      input: await readFile("tests/fixtures/server/singlefile.html"),
    },
    {
      name: "screenshot/screenshot.png",
      input: await readFile("tests/fixtures/server/screenshot.png"),
    },
  ];
  const file = info.outputPath("server-snapshot.zip");
  await writeFile(
    file,
    new Uint8Array(await downloadZip(entries).arrayBuffer()),
  );
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.locator(".header-title-text")).toHaveText(
    "Y Combinator | Hacker News",
  );
  await page.getByRole("button", { name: "Metadata", exact: true }).click();
  await expect(page.locator("pre").first()).toContainText("Process");
  await page.getByRole("button", { name: /^Files/ }).click();
  await page.getByText("singlefile/", { exact: true }).click();
  await page.getByText("singlefile.html", { exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="singlefile/singlefile.html"]')
      .locator("body"),
  ).toContainText("Y Combinator");
  await expect(
    page.locator('iframe[title="singlefile/singlefile.html"]'),
  ).toHaveAttribute("sandbox", "allow-same-origin");
  await page.screenshot({
    path: info.outputPath("server-singlefile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close archive" }).click();
  await expect(
    page.getByRole("heading", { name: "Your archive, ready to explore." }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const names = [];
      for await (const key of (
        (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle & {
          keys(): AsyncIterableIterator<string>;
        }
      ).keys())
        names.push(key);
      return names.filter((name) => name.endsWith(".wacz"));
    }),
  ).toEqual([]);
});

for (const filename of ["iframetest.wacz", "wget.warc", "grab-site.warc.gz"])
  test(`remote archive opens over HTTP ranges: ${filename}`, async ({
    page,
  }) => {
    const { createServer } = await import("node:http");
    const bytes = await readFile(path.resolve("tests/fixtures", filename));
    let ranges = 0;
    // Serve an existing capture with real HTTP byte ranges and CORS.
    const server = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "Range");
      response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }
      response.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Range, Accept-Ranges",
      );
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Content-Type", "application/wacz");
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
      if (range) {
        ranges++;
        const start = range[1]
          ? Number(range[1])
          : Math.max(0, bytes.length - Number(range[2]));
        const end =
          range[1] && range[2]
            ? Math.min(Number(range[2]), bytes.length - 1)
            : bytes.length - 1;
        response.statusCode = 206;
        response.setHeader(
          "Content-Range",
          `bytes ${start}-${end}/${bytes.length}`,
        );
        response.setHeader("Content-Length", end - start + 1);
        response.end(
          request.method === "HEAD"
            ? undefined
            : bytes.subarray(start, end + 1),
        );
      } else {
        response.setHeader("Content-Length", bytes.length);
        response.end(request.method === "HEAD" ? undefined : bytes);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address() as { port: number };
      await page.goto("/");
      await page
        .getByRole("textbox", { name: "Archive URL" })
        .fill(`http://127.0.0.1:${address.port}/${filename}`);
      await page.getByRole("button", { name: "Open URL", exact: true }).click();
      await expect(
        page.getByRole("navigation", { name: "Archive views" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Replay", exact: true }).click();
      await expect
        .poll(() => page.frames().some((frame) => frame.url().includes("mp_/")))
        .toBe(true);
      const frame = page
        .frames()
        .find((frame) => frame.url().includes("mp_/"))!;
      await expect(frame.locator("body")).toContainText(
        filename === "iframetest.wacz"
          ? "Outside iframe"
          : "Archived crawler page",
      );
      expect(ranges).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

test("nested ZIP browsing and folder ZIP download preserve members", async ({
  page,
}, info) => {
  const body = await readFile("README.md");
  const nested = new Uint8Array(
    await downloadZip([{ name: "docs/README.md", input: body }]).arrayBuffer(),
  );
  const outer = new Uint8Array(
    await downloadZip([{ name: "bundle.zip", input: nested }]).arrayBuffer(),
  );
  const source = info.outputPath("nested.zip");
  await writeFile(source, outer);
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(source);
  await page.getByText("bundle.zip", { exact: true }).click();
  await page.getByText("docs/", { exact: true }).click();
  await page.getByText("README.md", { exact: true }).click();
  await expect(page.locator(".file-preview pre")).toHaveText(body.toString());
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "⬇ Download Zip", exact: true })
    .click();
  const downloaded = await downloading;
  const target = info.outputPath("folder.zip");
  await downloaded.saveAs(target);
  const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } =
    await import("@zip.js/zip.js");
  const zip = new ZipReader(new Uint8ArrayReader(await readFile(target)));
  try {
    const entries = await zip.getEntries();
    expect(entries.map((entry) => entry.filename)).toEqual(["README.md"]);
    const entry = entries[0]!;
    expect(entry.directory).toBe(false);
    if (!entry.directory)
      expect(Buffer.from(await entry.getData(new Uint8ArrayWriter()))).toEqual(
        body,
      );
  } finally {
    await zip.close();
  }
});

test("snapshot cards derive SingleFile and show screenshot without capture APIs", async ({
  page,
}, info) => {
  const { openSnapshotOutput } = await import("./helpers/snapshot-controls");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("tests/fixtures/archivebox-js.wacz"));
  await openSnapshotOutput(page, "screenshot");
  const screenshot = page.frameLocator(
    '#main-frame-wrapper .plugin-view[data-plugin="screenshot"] iframe',
  );
  await expect
    .poll(() =>
      screenshot
        .locator("img")
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) => (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await openSnapshotOutput(page, "singlefile");
  await page
    .locator(
      '#main-frame-wrapper .plugin-view[data-plugin="singlefile"] iframe',
    )
    .waitFor();
  await expect(
    page
      .frameLocator(
        '#main-frame-wrapper .plugin-view[data-plugin="singlefile"] iframe',
      )
      .getByText("I'm a developer, bike rider, and unschooler.", {
        exact: false,
      }),
  ).toBeVisible();
  await expect(
    page.locator("#main-frame-wrapper .plugin-view:visible [role=alert]"),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("singlefile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("static build runs under a subdirectory on an ordinary file server", async ({
  page,
}) => {
  const { createServer } = await import("node:http");
  const root = path.resolve("dist");
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (!url.pathname.startsWith("/viewer/")) {
        response.writeHead(404).end();
        return;
      }
      const name =
        decodeURIComponent(url.pathname.slice("/viewer/".length)) ||
        "index.html";
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(target);
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".png": "image/png",
      };
      response.setHeader(
        "Content-Type",
        mime[path.extname(name)] || "application/octet-stream",
      );
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    await page.goto(`http://127.0.0.1:${port}/viewer/`);
    await page
      .locator("input[type=file]")
      .setInputFiles(path.resolve("tests/fixtures/iframetest.wacz"));
    await expect(
      page.getByRole("navigation", { name: "Archive views" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect
      .poll(() =>
        page
          .frames()
          .some(
            (frame) =>
              frame.url().includes("/viewer/w/") &&
              frame.url().includes("mp_/"),
          ),
      )
      .toBe(true);
    const replay = page
      .frames()
      .find(
        (frame) =>
          frame.url().includes("/viewer/w/") && frame.url().includes("mp_/"),
      )!;
    await expect(replay.locator("body")).toContainText("Outside iframe");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
