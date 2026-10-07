import {openSnapshotOutput} from "./helpers/snapshot-controls";
import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";

for (const filename of [
  "wget.warc",
  "wget.warc.gz",
  "grab-site.warc",
  "grab-site.warc.gz",
]) {
  test(`offline crawler replay: ${filename}`, async ({ page }, info) => {
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
      .setInputFiles(path.resolve("tests/fixtures", filename));
    await expect(
      page.locator(".stack-shelf"),
    ).toBeVisible();
    await openSnapshotOutput(page, "archivewebpage");
    const replay = page
      .getByLabel("ReplayWeb.page archive viewer")
      .frameLocator("iframe");
    await expect(
      replay.getByRole("heading", { name: "Archived crawler page" }),
    ).toBeVisible();
    await expect(replay.locator("#script-result")).toHaveText(
      "Archived JavaScript executed",
    );
    await expect(replay.locator("h1")).toHaveCSS("color", "rgb(17, 85, 153)");
    await expect
      .poll(() =>
        replay
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(
      replay
        .frameLocator("iframe")
        .getByRole("heading", { name: "Saved second page" }),
    ).toBeVisible();
    await replay.getByRole("link", { name: "Visit saved second page" }).click();
    await expect(
      replay.getByRole("heading", { name: "Saved second page" }),
    ).toBeVisible();
    await expect(replay.locator("h1")).toHaveCSS("color", "rgb(17, 85, 153)");
    await replay.getByRole("link", { name: "Back to archived page" }).click();
    await expect(
      replay.getByRole("heading", { name: "Archived crawler page" }),
    ).toBeVisible();
    await expect(replay.locator("#script-result")).toHaveText(
      "Archived JavaScript executed",
    );
    await page.getByText("Archive metadata", {exact:true}).click();
    await expect(page.getByText(/indexed resources/)).toHaveText(
      `0 JSONL records · ${filename.startsWith("wget") ? 10 : 6} indexed resources`,
    );
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download original" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(filename);
    const saved = info.outputPath(filename);
    await download.saveAs(saved);
    expect(await readFile(saved)).toEqual(
      await readFile(path.resolve("tests/fixtures", filename)),
    );
    await page.reload();
    await expect(
      page.locator(".stack-shelf"),
    ).toBeVisible();
    await openSnapshotOutput(page, "archivewebpage");
    await expect(
      replay.getByRole("heading", { name: "Archived crawler page" }),
    ).toBeVisible();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: info.outputPath("replay.png"),
      fullPage: true,
    });
  });
}
