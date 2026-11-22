import { useEffect, useRef } from 'react';
import { attachSportsUrlBar } from '../modules/admin/sports-url-bar';
import './sports-feed-hub.css';

export default function SportsFeedHub() {
  const root = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || !viewport.current) return;
    const bar = attachSportsUrlBar({ rootEl: root.current, viewportEl: viewport.current });
    return () => bar.destroy();
  }, []);

  return <section className="sports-feed-hub" ref={root} aria-label="MAX-SPORTS live feed">
    <div className="sports-feed-heading"><span className="micro-label">MAX-SPORTS / LIVE FEED</span><h2>Watch the action<span>.</span></h2></div>
    <div className="sports-feed-screen" ref={viewport}/>
    <form className="sports-feed-controls" onSubmit={event => event.preventDefault()}>
      <label htmlFor="max-sports-url-input">HTTPS sports URL</label>
      <input id="max-sports-url-input" type="text" inputMode="url" maxLength={2048} placeholder="https://example.com/live"/>
      <button id="max-sports-load-btn" type="button">Load feed</button>
      <button id="max-sports-clear-btn" type="button">Clear</button>
    </form>
    <p id="max-sports-status" role="status">No live sports feed URL is attached yet.</p>
  </section>;
}
