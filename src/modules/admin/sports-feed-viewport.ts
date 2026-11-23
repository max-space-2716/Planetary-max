import type Hls from 'hls.js';
import { safeVideoUrl } from './video-search';
import { clearSportsViewport, mountSessionSportsIframe } from './session-sports-iframe';

/** Owns the media elements and HLS player mounted into the dedicated sports viewport. */
export function mountSportsFeedViewport({ container }: { container: HTMLElement }) {
  let player: Hls | null = null;
  let generation = 0;
  function clearFeed() {
    generation++;
    const previous = player;
    player = null;
    try { previous?.destroy(); } catch { /* Continue clearing media even if player teardown fails. */ }
    clearSportsViewport(container);
  }

  return {
    clearFeed,
    loadEmbed(url: string, title: string) {
      clearFeed();
      const result = mountSessionSportsIframe({ container, inputUrl: url, title });
      if (result.status !== 'mounted_iframe') throw new Error(result.note);
    },
    loadStream(url: string, title: string) {
      const source = safeVideoUrl(url);
      if (!source) throw new Error('Feed URL must use HTTPS without embedded credentials.');
      clearFeed();
      const current = generation;
      const video = container.ownerDocument.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
      video.setAttribute('aria-label', title);
      container.appendChild(video);
      const isHls = /\.m3u8$/i.test(new URL(source).pathname);
      if (!isHls || video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
        return;
      }
      const fail = () => {
        if (generation !== current) return;
        const failed = player;
        player = null;
        try { failed?.destroy(); } catch { /* The viewport can still be cleared. */ }
        video.dispatchEvent(new Event('error'));
      };
      void import('hls.js').then(({ default: HlsPlayer }) => {
        if (generation !== current) return;
        if (!HlsPlayer.isSupported()) { fail(); return; }
        const hls = new HlsPlayer();
        player = hls;
        hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () => { if (generation === current) hls.loadSource(source); });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => { if (generation === current) void video.play().catch(() => {}); });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
        hls.attachMedia(video);
      }).catch(fail);
    },
  };
}
