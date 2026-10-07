import { test, expect } from "@playwright/test";
import path from "node:path";
import { openSnapshotOutput } from "./helpers/snapshot-controls";

for (const [filename, title, text, agent] of [
  [
    "wget-sweeting.warc.gz",
    "Nick Sweeting",
    "developer, bike rider",
    "Wget/1.25.0",
  ],
  [
    "wget-hackernews.warc.gz",
    "Hacker News",
    "Sharing AI progress in mathematics",
    "Wget/1.25.0",
  ],
  [
    "wget-blog.warc.gz",
    "Nick Sweeting: Blog & Projects",
    "This is my personal wiki",
    "Wget/1.25.0",
  ],
  [
    "grabsite-blog.warc.gz",
    "Nick Sweeting: Blog & Projects",
    "This is my personal wiki",
    "Firefox/103.0",
  ],
] as const)
  test(`real site stacks, replay and derivations: ${filename}`, async ({
    page,
  }, info) => {
    const external: string[] = [],
      errors: string[] = [];
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
      .setInputFiles(path.resolve("tests/fixtures/real-sites", filename));
    await expect(page.locator(".header-title-text")).toContainText(title);
    await expect(page.locator(".output-stack")).toHaveCount(6);
    const replay = page
      .getByLabel("ReplayWeb.page archive viewer")
      .frameLocator("iframe");
    await expect(replay.locator("body")).toContainText(text);
    if (filename.includes("blog"))
      await expect(
        replay.getByRole("heading", { name: "Table of Contents", exact: true }),
      ).toBeVisible();
    await page.screenshot({ path: info.outputPath("replay.jpg") });
    await openSnapshotOutput(page, "headers");
    const headers = page.frameLocator(
      '.plugin-view[data-plugin="headers"] iframe',
    );
    await expect(headers.locator("body")).toContainText(agent);
    await expect(headers.locator("body")).toContainText("200");
    await openSnapshotOutput(page, "hashes");
    await expect(
      page
        .frameLocator('.plugin-view[data-plugin="hashes"] iframe')
        .locator("body"),
    ).toContainText("archive.warc.gz");
    await expect(page.locator(".plugin-view:visible [role=alert]")).toHaveCount(
      0,
    );
    await openSnapshotOutput(page, "htmltotext");
    await expect(
      page
        .frameLocator('.plugin-view[data-plugin="htmltotext"] iframe')
        .locator("body"),
    ).toContainText(text);
    if (filename.includes("blog")) {
      await openSnapshotOutput(page, "readability");
      await expect(
        page
          .frameLocator('.plugin-view[data-plugin="readability"] iframe')
          .frameLocator("iframe")
          .locator("body"),
      ).toContainText("This is my personal wiki");
      await expect(
        page
          .frameLocator('.stack-tray iframe[data-plugin-preview="readability"]')
          .frameLocator("iframe")
          .locator("body"),
      ).toContainText("This is my personal wiki");
      await openSnapshotOutput(page, "search_contents");
      const search = page.frameLocator(
        '.plugin-view[data-plugin="search_contents"] iframe',
      );
      await search
        .getByPlaceholder("Search archived text…")
        .fill("mental health");
      await expect(search.locator("body")).toContainText(
        "1 matching documents",
      );
      await expect(search.locator("body")).toContainText(
        "Mental health treatment research",
      );
    }
    await page.screenshot({ path: info.outputPath("derived.jpg") });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

test("large captured HN thread derives its forum view through the packaged Python runtime", async ({
  page,
}, info) => {
  const external: string[] = [];
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
    .setInputFiles(
      path.resolve("tests/fixtures/real-sites/archivebox-hn-discussion.wacz"),
    );
  await expect(page.locator("#snapshot-output-browser")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 45000 },
  );
  await openSnapshotOutput(page, "forumdl");
  await expect(page.locator(".plugin-view:visible [role=alert]")).toHaveCount(
    0,
  );
  await expect(
    page
      .frameLocator('.plugin-view[data-plugin="forumdl"] iframe')
      .locator("body"),
  ).toContainText("safety");
  await expect(
    page
      .frameLocator('.plugin-view[data-plugin="forumdl"] iframe')
      .locator(".comment"),
  ).toHaveCount(486);
  expect(external).toEqual([]);
  await page.screenshot({ path: info.outputPath("forum.jpg") });
});
