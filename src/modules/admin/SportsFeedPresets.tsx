import { useCallback, useEffect, useState } from 'react';
import { publishSportsPresetFromCommand, type SportsFeedOption } from './sports-feed-options';
import { safeVideoUrl } from './video-search';
import { loadSharedSportsPresets, saveSharedSportsPresets } from './sports-presets-api';

export default function SportsFeedPresets() {
  const [options, setOptions] = useState<SportsFeedOption[]>([]);
  const [notice, setNotice] = useState('');
  const [localNotice, setLocalNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const items = await loadSharedSportsPresets(signal);
      if (!signal?.aborted) { setOptions(items); setReady(true); setNotice(''); }
    } catch {
      if (!signal?.aborted) { setReady(false); setNotice('Shared choices could not be loaded. Retry before editing.'); }
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const edit = (index: number, field: 'label' | 'url', value: string) => {
    setOptions(previous => previous.map((option, i) => i === index ? { ...option, [field]: value } : option));
    setNotice('');
  };
  return <section className="sports-presets" aria-label="Overview sports feed choices">
    <h4>Overview feed choices</h4>
    <p className="spatial-hint">Publish up to 12 HTTPS sources for visitors to Overview and MAX-SPORTS. Changes may take time to reach all locations.</p>
    {loading ? <p role="status">Loading shared choices…</p> : !ready ? <button type="button" onClick={() => void load()}>Retry loading choices</button> : <>
      {options.map((option, index) => <div className="sports-preset-row" key={index}>
        <label>Feed label {index + 1}<input value={option.label} maxLength={200} disabled={saving} onChange={event => edit(index, 'label', event.target.value)}/></label>
        <label>Feed URL {index + 1}<input type="text" inputMode="url" value={option.url} maxLength={2048} disabled={saving} onChange={event => edit(index, 'url', event.target.value)} placeholder="https://example.com/live"/></label>
        <button type="button" disabled={saving} onClick={() => { setOptions(previous => previous.filter((_, i) => i !== index)); setNotice(''); }}>Remove</button>
      </div>)}
      <div className="sports-preset-actions">
        <button type="button" disabled={saving || options.length >= 12} onClick={() => { setOptions(previous => [...previous, { id: '', label: '', url: '' }]); setNotice(''); }}>Add source</button>
        <button type="button" disabled={saving} onClick={async () => {
          setSaving(true); setNotice('');
          try {
            const saved = await saveSharedSportsPresets(options);
            const skipped = options.length - saved.length;
            if (!skipped) setOptions(saved);
            setNotice(`Published ${saved.length} feed choice(s).${skipped ? ` Skipped ${skipped} invalid or non-HTTPS URL(s); correct the drafts before saving again.` : ''}`);
          } catch { setNotice('Could not publish choices. Check the operator session and try again.'); }
          finally { setSaving(false); }
        }}>{saving ? 'Saving…' : 'Save choices'}</button>
      </div>
    </>}
    {notice && <p role="status" className="spatial-hint">{notice}</p>}
    <form aria-label="Save a sports feed to this browser" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      const url = String(fields.get('url') ?? '').trim();
      if (!safeVideoUrl(url)) { setLocalNotice('Enter an HTTPS feed URL without embedded credentials.'); return; }
      const result = publishSportsPresetFromCommand(String(fields.get('label') ?? ''), url);
      setLocalNotice(result.ok ? 'Feed saved to this browser.' : 'Could not save the feed. Browser storage may be unavailable.');
      if (result.ok) form.reset();
    }}>
      <div className="sports-preset-row">
        <label>Local feed label<input name="label" maxLength={200}/></label>
        <label>Local feed URL<input name="url" inputMode="url" maxLength={2048} required/></label>
        <button type="submit">Save to this browser</button>
      </div>
      {localNotice && <p role="status" className="spatial-hint">{localNotice}</p>}
    </form>
  </section>;
}
