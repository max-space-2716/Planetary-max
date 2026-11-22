import React, { useState } from 'react';
import type { RoutingTarget } from '../../shared/max-routing';
import LineageReceipt from './LineageReceipt';
import type { LineageRun } from './lineage';
import SpatialViewport from './SpatialViewport';
import { scenarioModes, scenarioSnapshot, transportNote, type ViewportState, type WorkspaceSnapshot } from './workspace-state';

type ScenarioControls = {
  scenario: ReturnType<typeof scenarioSnapshot>;
  setBase: (base: number) => void;
  setHeight: (height: number) => void;
  snapshot: WorkspaceSnapshot;
  activeRoute: RoutingTarget | null;
  setViewport: (viewport: ViewportState) => void;
  nodeId: string;
};

export default function SubstrateModel({ controls }: { controls?: ScenarioControls }) {
  const [localBase, setLocalBase] = useState(2);
  const [localHeight, setLocalHeight] = useState(3);
  const [run, setRun] = useState<LineageRun>();
  const { scenario, setBase, setHeight } = controls ?? {
    scenario: scenarioSnapshot(localBase, localHeight), setBase: setLocalBase, setHeight: setLocalHeight,
  };
  const { base, height, results } = scenario;
  return <section className="panel substrate-panel" id="substrate">
    <header className="panel-header"><div><h3>MAX-SPACE · Scenario lab</h3><p>Bounded growth-model comparison</p></div></header>
    <div className="beemax-body">
      <p>Compare mathematical growth assumptions for distributed-compute planning. These unitless scenarios do not measure or predict terrestrial, oceanic, arctic, orbital, or lunar infrastructure.</p>
      <div className="model-controls">
        <label>Base: {base}<input type="range" min="2" max="10" step="1" value={base} onChange={event => setBase(Number(event.target.value))}/></label>
        <label>Height: {height}<input type="range" min="1" max="5" step="1" value={height} onChange={event => setHeight(Number(event.target.value))}/></label>
      </div>
      {controls && <SpatialViewport snapshot={controls.snapshot} activeRoute={controls.activeRoute} nodeId={controls.nodeId} setViewport={controls.setViewport}/>}
      <table>
        <caption>Scenario values (bounded to safe integers)</caption>
        <thead><tr><th>Model</th><th>Result</th></tr></thead>
        <tbody>{scenarioModes.map(mode => <tr key={mode}><th scope="row">{mode}</th><td>{results[mode]?.toLocaleString() ?? 'Exceeds safe integer limit'}</td></tr>)}</tbody>
      </table>
      {controls ? <>
        <button className="scenario-record" type="button" onClick={() => setRun({
          kind: 'scenario', nodeId: controls.nodeId, timestamp: new Date().toISOString(),
          intent: { action: 'evaluate-growth-scenario', base, height },
          ir: { model_set: 'bounded-growth-v1', base, height, models: [...scenarioModes], result_limit: Number.MAX_SAFE_INTEGER },
          result: { values: results, overflow_representation: 'null' },
        })}>Record scenario evaluation</button>
        {run && <p className="quiet">Latest recorded evaluation: {run.timestamp}. Slider changes do not alter this receipt.</p>}
        <LineageReceipt run={run}/>
      </> : <p className="quiet">{transportNote}</p>}
    </div>
  </section>;
}
