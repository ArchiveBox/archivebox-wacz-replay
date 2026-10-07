import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { browserAssets, pythonRuntimeRevision } from "./scripts/browser-assets";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: root + "player",
  base: "./",
  // Opaque WASM/Python sandboxes fetch public bundled modules with Origin: null.
  server: { cors: true },
  preview: { cors: true },
  publicDir: false,
  resolve: {
    alias: {
      "@": root,
      "node:buffer": "buffer",
      "node:path": "path-browserify",
      "node:events": "events",
      "node:stream": "readable-stream",
      "node:url": "url",
    },
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  define: {
    __ABX_HOOK_PATHS__: "[]",
    __ABX_PYTHON_RUNTIME_REVISION__: JSON.stringify(pythonRuntimeRevision()),
  },
  worker: {
    format: "es",
    rollupOptions: { output: { entryFileNames: "[name]-[hash].js" } },
  },
  build: {
    outDir: root + "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: root + "player/index.html",
        ocr: root + "player/ocr-sandbox.html",
        python: root + "player/python-sandbox.html",
      },
    },
  },
  plugins: [
    {
      name: "vendored-viewer-assets",
      closeBundle() {
        cpSync(root + "public", root + "dist", { recursive: true });
        for (const asset of browserAssets()) {
          const dest = path.join(root, "dist", asset.relativeDest);
          mkdirSync(path.dirname(dest), { recursive: true });
          cpSync(asset.absoluteSrc, dest);
        }
      },
    },
  ],
});
