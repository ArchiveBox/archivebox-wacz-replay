import React from 'react';
import { Replay } from '../../vendor/replaywebpage/replay';
import type { ArchiveReader } from '../archive/reader';
import {createReplay} from '../archive/replay-frame';

/** Mount the original ReplayWeb.page component on the existing WACZ collection. */
export function ReplayWebPage({ archive, url, ts }: { archive: ArchiveReader; url: string; ts?: string }) {
  const host = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState('');
  const [mounting, setMounting] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let replay: Replay | undefined;
    const sizeReplay = (bounds: Pick<DOMRectReadOnly, 'width' | 'height'>) => {
      // ReplayWeb.page's nested percentage heights can momentarily resolve to
      // zero during full-page capture or a hidden-panel layout transition.
      // Keep the last real viewport until the host has a nonzero size again.
      if (replay && bounds.width > 0 && bounds.height > 0) {
        replay.style.width = `${bounds.width}px`;
        replay.style.height = `${bounds.height}px`;
      }
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry) sizeReplay(entry.contentRect);
    });
    if (host.current) observer.observe(host.current);
    setError('');
    setMounting(true);
    const mount = async () => {
      replay = await createReplay(archive,url,ts);
      if (!active || !host.current) return;
      sizeReplay(host.current.getBoundingClientRect());
      host.current.replaceChildren(replay);
      await replay.updateComplete;
      if (active) setMounting(false);
    };
    void mount().catch(reason => { if (active) { setError(String(reason)); setMounting(false); } });
    return () => {
      active = false;
      observer.disconnect();
      replay?.clearHilite(true);
      replay?.remove();
    };
  }, [archive, url, ts]);

  return <div className="replaywebpage-view">
    {error && <p className="error" role="alert">{error}</p>}
    {mounting && <p>Mounting ReplayWeb.page…</p>}
    <div ref={host} aria-label="ReplayWeb.page archive viewer" style={{ height: '75vh', minHeight: 480, display: error ? 'none' : undefined }} />
  </div>;
}
