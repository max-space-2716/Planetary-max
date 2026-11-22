import DigitalPublishing from './DigitalPublishing';
import React, { useState } from 'react';
import { ArtworkUploadForm } from '../../ui/components/ArtworkUploadForm';
import { SportsTelemetryForm } from '../../ui/components/SportsTelemetryForm';
import PublishingLineage from './PublishingLineage';
export default function PublishingPanel({ nodeId }: { nodeId: string }) {
  const [notice, setNotice] = useState('');
  return <section className="panel publishing-panel" id="publishing"><header className="panel-header"><div><h3>Publishing desk</h3><p>Publish art, games, apps, media, and matchup research</p></div></header><div className="publishing-body"><PublishingLineage nodeId={nodeId}/><details><summary>Create artist profile</summary><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setNotice('Creating profile…'); try { const res = await fetch('/api/admin/artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) }); const result = await res.json() as {error?:string;id?:string}; if (!res.ok) throw new Error(result.error); setNotice(`Artist profile created: ${result.id}`); form.reset(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to create profile.'); } }}><label>Artist name<input name="username" maxLength={100} required/></label><label>Biography<textarea name="bio" maxLength={2000}/></label><button>Create artist</button></form><p role="status">{notice}</p></details><details><summary>Games, apps & media</summary><DigitalPublishing/></details><details><summary>Publish artwork</summary><ArtworkUploadForm/></details><details><summary>Publish sports research</summary><SportsTelemetryForm/></details></div></section>;
}
