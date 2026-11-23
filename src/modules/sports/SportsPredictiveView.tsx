import React, { useCallback, useEffect, useState } from 'react';
import SportsSuite from './SportsSuite';
import SportsFeedHub from '../../components/SportsFeedHub';
interface SportsRecord { event_id: string; league: string; matchup: string; oracle_consensus: { predictedWinner?: string; confidenceScore?: number; dataSourcesCount?: number }; updated_at: string }
export default function SportsPredictiveView() { return <><SportsSuite><MatchupResearch/></SportsSuite><SportsFeedHub/></>; }
function MatchupResearch() {
  const [records, setRecords] = useState<SportsRecord[]>([]);
  const [league, setLeague] = useState('All leagues');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [selected, setSelected] = useState<SportsRecord | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const res = await fetch('/v1/dat/sports/list'); const data = await res.json() as {error?:string;telemetry:SportsRecord[]}; if (!res.ok) throw new Error(data.error || 'Sports records are unavailable.'); setRecords(data.telemetry); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load sports records.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = records.filter(r => league === 'All leagues' || r.league === league);
  return <div className="sports-research"><div className="sports-research-heading"><div><h3>Published research</h3><p>Author-entered predictions and source counts.</p></div><button className="neon-button" onClick={load} disabled={loading}>Refresh records ↗</button></div><div className="filter-row"><h2>Matchup research <sup>{visible.length}</sup></h2><select aria-label="Filter sports league" value={league} onChange={e => { setLeague(e.target.value); setSelected(null); }}>{['All leagues', 'NFL', 'NBA', 'MLB', 'SOCCER', 'MMA'].map(l => <option key={l}>{l}</option>)}</select></div>
    {loading ? <p role="status">Loading sports research…</p> : error ? <p className="data-state" role="alert">{error}</p> : !visible.length ? <p className="data-state">No {league === 'All leagues' ? '' : league} research has been published yet.</p> : <div className="sports-record-layout"><div className="sports-records">{visible.map(r => <button className={`sports-record ${selected?.event_id === r.event_id ? 'active' : ''}`} key={r.event_id} onClick={() => setSelected(r)}><span className="micro-label">{r.league} · {r.updated_at}</span><h3>{r.matchup}</h3><p>Pick: {r.oracle_consensus.predictedWinner || 'Not provided'}</p><span>View analysis ↗</span></button>)}</div><section className="research-detail"><span className="eyebrow">MATCHUP ANALYSIS</span>{selected ? <><h2>{selected.matchup}</h2><p>Published pick: <strong>{selected.oracle_consensus.predictedWinner || 'Not provided'}</strong></p><div className="research-confidence"><span style={{ width: `${Math.max(0, Math.min(100, selected.oracle_consensus.confidenceScore || 0))}%` }}/></div><p>Reported confidence: {selected.oracle_consensus.confidenceScore ?? '—'}%</p><p>Reported sources: {selected.oracle_consensus.dataSourcesCount ?? '—'}</p><small>Published research reflects the author’s prediction. Outcomes are uncertain.</small></> : <><h2>Explore the matchup.</h2><p>Select a published record to examine its research.</p></>}</section></div>}
  </div>;
}
