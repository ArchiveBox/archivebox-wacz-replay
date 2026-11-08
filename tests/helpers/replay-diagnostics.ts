import type { Page } from '@playwright/test';

// Diagnostic branch only: observe the unchanged real-archive acceptance flow.
export async function replayDiagnostics(page: Page) {
  page.on('console', message => {
    if (message.text().startsWith('[replay-diagnostic]')) console.log(message.text());
  });
  await page.addInitScript(() => {
    const report = (event: string) => {
      if (!location.pathname.includes('/w/')) return;
      const canvas = document.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      const style = canvas && getComputedStyle(canvas);
      const frame = window.frameElement as HTMLElement | null;
      console.log('[replay-diagnostic]', JSON.stringify({
        event, time: performance.timeOrigin + performance.now(), url: location.href,
        viewport: [innerWidth, innerHeight], ready: document.readyState,
        root: [document.documentElement?.clientWidth, document.documentElement?.clientHeight],
        frame: frame && [frame.getBoundingClientRect().width, frame.getBoundingClientRect().height],
        canvas: canvas && { width: canvas.width, height: canvas.height,
          bounds: rect && [rect.width, rect.height], style: style && [style.width, style.height, style.display, style.position] },
        headings: document.querySelectorAll('h1,h2,h3').length,
      }));
    };
    addEventListener('resize', () => report('resize'), true);
    addEventListener('error', event => report('error: ' + event.message), true);
    addEventListener('DOMContentLoaded', () => report('DOMContentLoaded'));
    addEventListener('load', () => report('load'));
    const observer = new MutationObserver(() => {
      if (document.getElementById('Table-of-Contents')) {
        report('Table-of-Contents rendered');
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}
