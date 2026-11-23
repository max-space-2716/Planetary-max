import { useEffect, useRef, useState } from 'react';
import { mountSportsHudWithChoices, type SportsSourceOption } from '../modules/admin/sports-hud-choices';
import { loadSportsFeedOptions, SPORTS_FEED_OPTIONS_UPDATED, SPORTS_FEED_STORAGE_KEY, sportsFeedOptionsFromEvent } from '../modules/admin/sports-feed-options';
import { loadSharedSportsPresetsWithFallback, SHARED_SPORTS_PRESETS_UPDATED } from '../modules/admin/sports-presets-api';
import './sports-feed-hub.css';

const SPORTS_FEED_PRESETS: SportsSourceOption[] = [
  // Add verified HTTPS feed or embed sources here.
  // { id: 'feed-1', label: 'Feed 1 (Primary)', url: 'https://...' },
  // { id: 'feed-2', label: 'Feed 2 (Alt Embed)', url: 'https://...' },
];

export default function SportsFeedHub({ presetSources = SPORTS_FEED_PRESETS }: { presetSources?: SportsSourceOption[] }) {
  const controls = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const hud = useRef<ReturnType<typeof mountSportsHudWithChoices> | null>(null);
  const [savedSources, setSavedSources] = useState(loadSportsFeedOptions);
  const [sharedSources, setSharedSources] = useState<SportsSourceOption[]>([]);
  const [sharedStatus, setSharedStatus] = useState<'network' | 'cache' | 'unavailable'>('network');
  useEffect(() => {
    if (!controls.current || !viewport.current) return;
    // Cloudflare's DOM types conflict with React's HTMLElement type for ParentNode.prepend.
    const mounted = mountSportsHudWithChoices({ rootEl: controls.current as unknown as ParentNode, viewportEl: viewport.current });
    hud.current = mounted;
    return () => { mounted.destroy(); hud.current = null; };
  }, []);
  useEffect(() => {
    const merged = new Map(presetSources.map(source => [source.id, source]));
    for (const source of savedSources) merged.set(source.id, source);
    for (const source of sharedSources) merged.set(source.id, source);
    hud.current?.setPresetSources(Array.from(merged.values()));
  }, [presetSources, savedSources, sharedSources]);
  useEffect(() => {
    const update = (event: Event) => {
      if (!(event as Event & { sharedSportsPresets?: boolean }).sharedSportsPresets) setSavedSources(sportsFeedOptionsFromEvent(event));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SPORTS_FEED_STORAGE_KEY || event.key === null) setSavedSources(loadSportsFeedOptions());
    };
    window.addEventListener(SPORTS_FEED_OPTIONS_UPDATED, update);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SPORTS_FEED_OPTIONS_UPDATED, update);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  useEffect(() => {
    let request: AbortController | null = null;
    let disposed = false;
    const refresh = () => {
      request?.abort();
      const current = new AbortController();
      request = current;
      void loadSharedSportsPresetsWithFallback(current.signal).then(result => {
        if (!disposed && !current.signal.aborted) {
          if (result.source !== 'unavailable') setSharedSources(result.items);
          setSharedStatus(result.source);
        }
      }).catch(() => { if (!disposed && !current.signal.aborted) setSharedStatus('unavailable'); });
    };
    const updated = (event: Event) => {
      request?.abort();
      setSharedSources(sportsFeedOptionsFromEvent(event));
      setSharedStatus('network');
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(SHARED_SPORTS_PRESETS_UPDATED, updated);
    return () => { disposed = true; request?.abort(); window.removeEventListener('focus', refresh); window.removeEventListener(SHARED_SPORTS_PRESETS_UPDATED, updated); };
  }, []);

  return <section className="sports-feed-hub" aria-label="MAX-SPORTS live feed">
    <div className="sports-feed-heading"><span className="micro-label">MAX-SPORTS / LIVE FEED</span><h2>Watch the action<span>.</span></h2></div>
    <div id="overview-sports-panel" ref={controls}>
      <div id="overview-sports-viewport" className="sports-feed-screen" ref={viewport}/>
    </div>
    <p className="sports-feed-transport">Platform transport: Cloudflare HTTPS. P-STEP/1.0 and MAX-TELECOM are planned. Feed content loads from its provider.</p>
    {sharedStatus !== 'network' && <p role="status">{sharedStatus === 'cache' ? 'Shared feed choices are unavailable; showing cached choices that may be out of date.' : 'Shared feed choices are unavailable; any previously loaded choices may be out of date.'}</p>}
  </section>;
}
