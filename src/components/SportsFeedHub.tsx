import { useEffect, useRef } from 'react';
import { mountSportsHudWithChoices, type SportsSourceOption } from '../modules/admin/sports-hud-choices';
import './sports-feed-hub.css';

const SPORTS_FEED_PRESETS: SportsSourceOption[] = [
  // Add verified HTTPS feed or embed sources here.
  // { id: 'feed-1', label: 'Feed 1 (Primary)', url: 'https://...' },
  // { id: 'feed-2', label: 'Feed 2 (Alt Embed)', url: 'https://...' },
];

export default function SportsFeedHub({ presetSources = SPORTS_FEED_PRESETS }: { presetSources?: SportsSourceOption[] }) {
  const controls = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!controls.current || !viewport.current) return;
    // Cloudflare's DOM types conflict with React's HTMLElement type for ParentNode.prepend.
    const hud = mountSportsHudWithChoices({ rootEl: controls.current as unknown as ParentNode, viewportEl: viewport.current, presetSources });
    return () => hud.destroy();
  }, [presetSources]);

  return <section className="sports-feed-hub" aria-label="MAX-SPORTS live feed">
    <div className="sports-feed-heading"><span className="micro-label">MAX-SPORTS / LIVE FEED</span><h2>Watch the action<span>.</span></h2></div>
    <div id="overview-sports-panel" ref={controls}>
      <div id="overview-sports-viewport" className="sports-feed-screen" ref={viewport}/>
    </div>
  </section>;
}
