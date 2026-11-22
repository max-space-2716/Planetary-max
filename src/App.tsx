import React, { Suspense, useEffect, useState } from 'react';
import { CollectorVault } from './modules/art/CollectorCheckout';
import BeemaxPortalCommandHud from './components/BeemaxPortalCommandHud';
import { BeemaxHubIteration } from './components/BeemaxHubIteration';
import MaxSportsUserHud from './modules/sports/MaxSportsUserHud';
import PortalOS1Layout from './core/PortalOS1Layout';
import AdminAccess, { useAdministrator } from './modules/admin/AdminAccess';

const AdminConsole = React.lazy(() => import('./modules/admin/PortalOS1Console'));

const readRouteHash = (): string => {
  if (typeof window === 'undefined') return '';
  return window.location.hash.replace(/^#/, '').trim().toLowerCase();
};

function PrivateHud() {
  return useAdministrator() ? <BeemaxPortalCommandHud /> : (
    <main className="os-content">
      <h1>Private Portal-OS1 Command HUD Locked</h1>
      <p>Sign in with an operator session to open this view. MAX Compute is locked at 0.000000.</p>
      <a href="/#/">Return to Spaces</a>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState<string>(readRouteHash);

  useEffect(() => {
    const updateRoute = () => setRoute(readRouteHash());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/vault/')) {
    return <CollectorVault />;
  }
  if (route === '/sports-outputs') return <MaxSportsUserHud />;

  if (route === '/hud' || route === '/portal-os1') {
    return <AdminAccess durableSession><PrivateHud /></AdminAccess>;
  }

  if (
    route === '/admin' ||
    (typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/admin')
  ) {
    return (
      <Suspense fallback={<div className="loading-screen">INITIALIZING PORTAL...</div>}>
        <AdminConsole />
      </Suspense>
    );
  }

  return (
    <PortalOS1Layout>
      <BeemaxHubIteration />
    </PortalOS1Layout>
  );
}
