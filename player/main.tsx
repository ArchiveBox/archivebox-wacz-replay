import React from "react";
import { createRoot } from "react-dom/client";
import { Archive, FileUp } from "lucide-react";
import { ArchiveReader } from "../src/archive/reader";
import {
  archiveFileHandle,
  readArchive,
  removeArchive,
} from "../src/archive/storage";
import { captureInfo } from "../src/archive/capture-info";
import { SnapshotDetail } from "../src/ui/SnapshotDetail";
import { EmbeddedOutput } from "../src/ui/EmbeddedOutput";
import { ArchiveFiles } from "../src/ui/ArchiveFiles";
import { ReplayWebPage } from "../src/ui/ReplayWebPage";
import { replayCommand } from "../src/replay/client";
import replayWorkerURL from "./sw.ts?worker&url";
import "../src/ui/player.css";
async function startReplay() {
  const started = performance.now();
  // The content-hashed worker URL identifies this exact build. register()
  // installs a changed URL before resolving, without the browser's delayed
  // second update() check on every warm navigation.
  const workerURL = new URL(replayWorkerURL, location.href).href;
  const existing = await navigator.serviceWorker.getRegistration("./");
  const registration =
    existing?.active?.scriptURL === workerURL &&
    !existing.installing &&
    !existing.waiting
      ? existing
      : await navigator.serviceWorker.register(workerURL, {
          type: "module",
          scope: "./",
        });
  // Even skipWaiting cannot activate while the old worker has pending events.
  // Older replay tabs must release their live archived frames when a new build
  // installs; otherwise a long-lived document request can stall every new tab.
  let reloading = false;
  const watchUpdate = (worker: ServiceWorker | null) => {
    if (!worker || worker.scriptURL === workerURL) return;
    const changed = () => {
      if (worker.state === "installed" && !reloading) {
        reloading = true;
        location.reload();
      }
      if (["installed", "activated", "redundant"].includes(worker.state))
        worker.removeEventListener("statechange", changed);
    };
    worker.addEventListener("statechange", changed);
    changed();
  };
  registration.addEventListener("updatefound", () =>
    watchUpdate(registration.installing),
  );
  watchUpdate(registration.installing || registration.waiting);
  // register() may resolve with the previous active worker while an update is
  // still installing. Do not send a new archive to that retiring worker.
  const replacement = registration.installing || registration.waiting;
  if (replacement && replacement.state !== "activated")
    await new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (replacement.state === "activated") {
          replacement.removeEventListener("statechange", changed);
          resolve();
        } else if (replacement.state === "redundant") {
          replacement.removeEventListener("statechange", changed);
          reject(Error("Replay service worker update failed"));
        }
      };
      replacement.addEventListener("statechange", changed);
      changed();
    });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller)
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolve(),
        { once: true },
      ),
    );
  performance.measure("archivebox:replay:startup", { start: started });
}

const ready = startReplay();
function App() {
  const [archive, setArchive] = React.useState<ArchiveReader>(),
    [error, setError] = React.useState(""),
    [loading, setLoading] = React.useState(false);
  const [source, setSource] = React.useState(
    new URLSearchParams(location.search).get("source") || "",
  );
  const [tab, setTab] = React.useState("snapshot"),
    [pageURL, setPageURL] = React.useState(""),
    [integrity, setIntegrity] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState(
    new URLSearchParams(location.search).get("name") || "capture.wacz",
  );
  const capture = React.useMemo(
    () => (archive ? captureInfo(archive, filename) : undefined),
    [archive, filename],
  );
  const show = (reader: ArchiveReader, name?: string) => {
    if (name) setFilename(name);
    setArchive(reader);
    setTab(reader.isWACZ || reader.metadata ? "snapshot" : "files");
    setPageURL(reader.pages[0]?.url || "");
    setIntegrity("");
    document.title =
      (reader.metadata?.title || reader.manifest.title || "Archive") +
      " · ArchiveBox Replay";
  };
  async function openURL(url: string) {
    setLoading(true);
    setError("");
    try {
      await ready;
      const reader = await ArchiveReader.fromURL(url);
      show(reader, new URL(url, location.href).pathname.split("/").at(-1));
      const address = new URL(location.href);
      address.search = "";
      address.searchParams.set("source", new URL(url, location.href).href);
      history.replaceState(null, "", address);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }
  async function importFile(file: File) {
    setLoading(true);
    setError("");
    let id: string | undefined;
    try {
      await ready;
      id = crypto.randomUUID();
      const handle = await archiveFileHandle(id, true);
      await file.stream().pipeTo(await handle.createWritable());
      const reader = await ArchiveReader.from(await handle.getFile(), id);
      show(reader, file.name);
      setSource("");
      const address = new URL(location.href);
      address.search = "";
      address.hash = "";
      address.searchParams.set("capture", id);
      address.searchParams.set("name", file.name);
      history.replaceState(null, "", address);
    } catch (reason) {
      if (id) await removeArchive(id).catch(() => {});
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => {
    const id = new URLSearchParams(location.search).get("capture");
    if (source) void openURL(source);
    else if (id) {
      setLoading(true);
      void ready
        .then(() => readArchive(id))
        .then((file) => ArchiveReader.from(file, id))
        .then(show)
        .catch((reason) => setError(String(reason)))
        .finally(() => setLoading(false));
    } else void ready.catch((reason) => setError(String(reason)));
  }, []);
  async function download() {
    if (!archive) return;
    let local = "";
    const a = document.createElement("a");
    a.href = archive.sourceUrl || (local = URL.createObjectURL(archive.file!));
    a.download = filename;
    a.click();
    if (local) setTimeout(() => URL.revokeObjectURL(local), 60000);
  }
  async function close() {
    if (archive?.captureId && !archive.sourceUrl) {
      await replayCommand({ type: "unmount-wacz", id: archive.captureId });
      await removeArchive(archive.captureId);
    }
    setArchive(undefined);
    setError("");
    history.replaceState(null, "", location.pathname);
  }
  return (
    <div
      className="web-player"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <header className="player-masthead">
        <div className="brand">
          <Archive size={27} />
          <div>
            ArchiveBox Replay<span>STANDALONE ARCHIVE VIEWER</span>
          </div>
        </div>
        <div>
          <button disabled={loading} onClick={() => input.current?.click()}>
            <FileUp size={16} />
            Open archive file
          </button>
          {archive && (
            <button
              onClick={() =>
                void close().catch((reason) => setError(String(reason)))
              }
            >
              Close archive
            </button>
          )}
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept=".wacz,.zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = "";
          }}
        />
      </header>
      {!archive && !loading && (
        <main className="open-archive">
          <h1>Your archive, ready to explore.</h1>
          <p>
            Drop a WACZ or ZIP here. Replay pages, inspect plugin outputs, and
            browse every saved file.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void openURL(source);
            }}
          >
            <input
              aria-label="Archive URL"
              type="url"
              required
              placeholder="https://…/capture.wacz"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
            <button>Open URL</button>
          </form>
          <p className="muted">
            Files stay in this browser. No account, extension, or ArchiveBox
            server required.
          </p>
        </main>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="loading">
          Reading archive…
        </p>
      )}
      {archive && capture && (
        <>
          <nav className="viewer-tabs" aria-label="Archive views">
            {[
              ...(archive.isWACZ || archive.metadata ? ["snapshot"] : []),
              ...(archive.isWACZ ? ["replay"] : []),
              "files",
              "metadata",
              ...(archive.isWACZ ? ["integrity"] : []),
            ].map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name === "files"
                  ? "Files (" + archive.members.length + ")"
                  : name[0]!.toUpperCase() + name.slice(1)}
              </button>
            ))}
            <button onClick={() => void download()}>Download original</button>
          </nav>
          {archive.warnings.length > 0 && (
            <details className="archive-notices">
              <summary>Metadata notices ({archive.warnings.length})</summary>
              <pre>{archive.warnings.join("\n")}</pre>
            </details>
          )}
          {tab === "snapshot" && (
            <SnapshotDetail
              key={capture.id}
              archive={archive}
              capture={capture}
              onDownload={download}
              onIndex={() => void close()}
            />
          )}
          {tab === "replay" && (
            <section>
              <label className="page-picker">
                Saved page{" "}
                <select
                  aria-label="Saved page"
                  value={pageURL}
                  onChange={(event) => setPageURL(event.target.value)}
                >
                  {archive.pages.map((page, index) => (
                    <option key={index} value={page.url}>
                      {page.title || page.url} — {page.ts}
                    </option>
                  ))}
                </select>
              </label>
              {pageURL ? (
                <ReplayWebPage archive={archive} url={pageURL} />
              ) : (
                <p>
                  No pages index is available; use Files or the snapshot
                  response browser.
                </p>
              )}
            </section>
          )}
          {tab === "files" && <ArchiveFiles archive={archive} />}
          {tab === "metadata" && (
            <section className="view-section">
              <h2>Archive metadata</h2>
              <p>
                {archive.records.length} JSONL records ·{" "}
                {archive.entries.length} indexed resources
              </p>
              <details open>
                <summary>index.jsonl records</summary>
                <pre>
                  {archive.records
                    .map((record) => JSON.stringify(record, null, 2))
                    .join("\n")}
                </pre>
              </details>
              <details>
                <summary>datapackage.json</summary>
                <pre>{JSON.stringify(archive.manifest, null, 2)}</pre>
              </details>
            </section>
          )}
          {tab === "integrity" && (
            <section className="view-section">
              <h2>Package integrity</h2>
              <button
                disabled={integrity === "Checking…"}
                onClick={() => {
                  setIntegrity("Checking…");
                  void archive
                    .verifyPackage()
                    .then((checks) =>
                      setIntegrity(
                        checks
                          .map(
                            (check) =>
                              (check.valid ? "PASS" : "FAIL") +
                              " " +
                              check.path,
                          )
                          .join("\n"),
                      ),
                    )
                    .catch((reason) => setIntegrity(String(reason)));
                }}
              >
                Verify hashes
              </button>
              <pre role="status">{integrity}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
void ready
  .then(() =>
    root.render(
      new URLSearchParams(location.search).has("embed") ? (
        <EmbeddedOutput />
      ) : (
        <App />
      ),
    ),
  )
  .catch((reason) =>
    root.render(
      <p role="alert" className="error">
        {String(reason)}
      </p>,
    ),
  );
