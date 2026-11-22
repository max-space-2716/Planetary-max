import { mountSportsFeedViewport } from './sports-feed-viewport';

export type OverviewPreviewMode = 'sports_live' | 'art_preview' | 'chess_preview' | 'idle';

export function createOverviewViewportController(viewportEl: HTMLElement) {
  const sportsHandle = mountSportsFeedViewport({ container: viewportEl });
  let activeMode: OverviewPreviewMode = 'idle';

  return {
    activateSportsFeed(options: { embedUrl?: string | null; streamUrl?: string | null; title?: string }) {
      sportsHandle.clearFeed();
      activeMode = 'sports_live';

      if (options.embedUrl) {
        sportsHandle.loadEmbed(options.embedUrl, options.title ?? 'MAX-SPORTS Live Feed');
        return { mode: activeMode, status: 'live_embed' as const };
      }
      if (options.streamUrl) {
        sportsHandle.loadStream(options.streamUrl, options.title ?? 'MAX-SPORTS Live Stream');
        return { mode: activeMode, status: 'live_stream' as const };
      }
      return {
        mode: activeMode,
        status: 'unwired_honest' as const,
        note: 'MAX-REALITY: No live sports feed URL is attached yet; viewport slot is ready over Cloudflare HTTPS.',
      };
    },
    switchAwayTo(nextMode: Exclude<OverviewPreviewMode, 'sports_live'>) {
      sportsHandle.clearFeed();
      activeMode = nextMode;
      return { mode: activeMode };
    },
    getActiveMode: () => activeMode,
  };
}
