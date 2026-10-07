import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4178",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm preview --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
  },
});
