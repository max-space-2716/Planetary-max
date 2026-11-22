import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
async function hasAdminSession(path: string, signal?: AbortSignal) {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) return false;
  const data = await response.json() as { authenticated?: boolean };
  return data.authenticated === true;
}

const AccessContext = createContext(false);
export function useAdministrator() { return useContext(AccessContext); }
// Visitors always see the public command center. Operators can opt in to sign-in.
export default function AdminAccess({ children, durableSession = false }: { children: React.ReactNode; durableSession?: boolean }) {
  const sessionPath = durableSession ? '/api/admin/session?mode=durable' : '/api/admin/session';
  const [authenticated, setAuthenticated] = useState(false); const [checking, setChecking] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const revision = useRef(0); const interacting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      if (interacting.current) return;
      const request = ++revision.current;
      try { const verified = await hasAdminSession(sessionPath, controller.signal); if (request !== revision.current || controller.signal.aborted) return; setAuthenticated(verified); }
      catch { if (request === revision.current && !controller.signal.aborted) setAuthenticated(false); }
      finally { if (!controller.signal.aborted) setChecking(false); }
    };
    void check(); const interval = window.setInterval(() => void check(), 60_000); const focus = () => void check(); window.addEventListener('focus', focus);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [sessionPath]);
  if (checking) return <div className="admin-access" role="status">Opening command center…</div>;
  return <AccessContext.Provider value={authenticated}><div className="operator-access">{authenticated ? <button disabled={busy} onClick={async () => {
    interacting.current = true; ++revision.current; setBusy(true); setError('');
    try { const response = await fetch('/api/admin/logout', { method: 'POST' }); if (!response.ok) throw new Error('Sign-out failed. Please try again.'); setAuthenticated(false); setShowSignIn(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-out failed.'); }
    finally { interacting.current = false; setBusy(false); }
  }}>Sign out</button> : <button aria-expanded={showSignIn} onClick={() => { setShowSignIn(value => !value); setError(''); setPassword(''); }}>{showSignIn ? 'Close operator sign-in' : 'Operator sign-in'}</button>}{!authenticated && showSignIn && <form onSubmit={async e => {
    e.preventDefault(); interacting.current = true; ++revision.current; setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error(response.status === 401 ? 'Incorrect administrator password. Please try again.' : response.status === 429 ? 'Too many sign-in attempts. Try again in a minute.' : 'Sign-in is temporarily unavailable. Please try again later.');
      if (!await hasAdminSession(sessionPath)) throw new Error('The login cookie could not establish a session. Enable site cookies and retry.');
      setAuthenticated(true); setShowSignIn(false); setPassword('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { interacting.current = false; setBusy(false); }
  }}><h2>Operator sign-in</h2><p>Sign in to publish and manage MAX. Public browsing stays open.</p><label>Administrator password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)}/></label><button disabled={busy}>{busy ? 'Signing in…' : 'Sign in to publishing desk'}</button></form>}{error && <p role="alert">{error}</p>}</div>{children}</AccessContext.Provider>;
}
