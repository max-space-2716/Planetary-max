import { safeVideoUrl } from './video-search';
import { clearSportsViewport, mountSessionSportsIframe } from './session-sports-iframe';

/** Owns the media elements mounted into the dedicated sports viewport container. */
export function mountSportsFeedViewport({ container }: { container: HTMLElement }) {
  return {
    clearFeed() { clearSportsViewport(container); },
    loadEmbed(url: string, title: string) {
      const result = mountSessionSportsIframe({ container, inputUrl: url, title });
      if (result.status !== 'mounted_iframe') throw new Error(result.note);
    },
    loadStream(url: string, title: string) {
      const source = safeVideoUrl(url);
      if (!source) throw new Error('Feed URL must use HTTPS without embedded credentials.');
      clearSportsViewport(container);
      const video = container.ownerDocument.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
      video.setAttribute('aria-label', title);
      video.src = source;
      container.appendChild(video);
    },
  };
}
