import React from "react";
import type { ArchiveReader } from "../archive/reader";
import { printableHTML } from "../archive/print";
/** Native browser printing keeps this viewer independent of a CDP/server engine. */
export function LazyPDFPreview({
  archive,
  url,
  landscape,
}: {
  archive: ArchiveReader;
  url: string;
  landscape: boolean;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null),
    [html, setHTML] = React.useState(""),
    [error, setError] = React.useState("");
  React.useEffect(() => {
    let active = true;
    void printableHTML(archive, url)
      .then((value) => {
        if (active)
          setHTML(
            value.replace(
              "</head>",
              "<style>@page{size:" +
                (landscape ? "landscape" : "portrait") +
                "}</style></head>",
            ),
          );
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [archive, url, landscape]);
  return (
    <section>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <button
            disabled={!html}
            onClick={() => frame.current?.contentWindow?.print()}
          >
            Print / Save as PDF
          </button>
          <iframe
            ref={frame}
            title="Print preview"
            className="document-frame"
            sandbox="allow-same-origin allow-modals"
            srcDoc={html}
          />
        </>
      )}
    </section>
  );
}
