import React, { useState } from 'react';

type OutputDomain =
  | 'video-hud'
  | 'max-chess'
  | 'max-art'
  | 'max-physics'
  | 'max-math'
  | 'max-institute'
  | 'max-architecture';

interface TierOption {
  id: string;
  label: string;
  priceUsdc: string;
  walletRequired: boolean;
  summary: string;
}

const TIER_OPTIONS: TierOption[] = [
  {
    id: 'free-preview',
    label: 'Free Output Preview',
    priceUsdc: '0.000000',
    walletRequired: false,
    summary: 'Wallet-free output preview on public MAX-INTERNET with 0.000000 MAX Compute.',
  },
  {
    id: 'base-usdc-tier',
    label: 'Base USDC Output Tier',
    priceUsdc: '1.000000',
    walletRequired: true,
    summary: 'Output tier preview. Payment and delivery are unavailable in this view.',
  },
];

const DOMAIN_OUTPUTS: Record<
  OutputDomain,
  { title: string; badge: string; outputSummary: string; hasVideoHud?: boolean }
> = {
  'video-hud': {
    title: 'MAX-SPORTS Video HUD',
    badge: 'OUTPUT-ONLY TELEMETRY',
    outputSummary: 'Live stream & kinematic overlay slot ready; MAX Compute locked at 0.000000.',
    hasVideoHud: true,
  },
  'max-chess': {
    title: 'MAX Chess Output',
    badge: 'POSITION & ENGINE SUMMARY',
    outputSummary: 'Evaluation & line output view; wallet signing remains strictly opt-in.',
  },
  'max-art': {
    title: 'MAX-ART Output',
    badge: 'CREATOR OUTPUT',
    outputSummary: 'Cover & output artifact preview (/assets/crown-cover.png verified as image/png).',
  },
  'max-physics': {
    title: 'MAX Physics Output',
    badge: 'MODEL SUMMARY',
    outputSummary: 'Read-only physical system output summary with 0.000000 MAX Compute.',
  },
  'max-math': {
    title: 'MAX Math Output',
    badge: 'PROOF & FORMULA SUMMARY',
    outputSummary: 'Structured mathematical output view; no raw internal module execution exposed.',
  },
  'max-institute': {
    title: 'MAX-INSTITUTE Output',
    badge: 'RESEARCH BRIEF',
    outputSummary: 'Charter & research output summary; operator controls remain server-gated.',
  },
  'max-architecture': {
    title: 'MAX Architecture Output',
    badge: 'TOPOLOGY OUTPUT',
    outputSummary: 'Non-custodial D1 & Durable Object summary (Base 8453 USDC, zero R2/Stripe/BTC).',
  },
};

export const BeemaxHubIteration: React.FC = () => {
  const [selectedTier, setSelectedTier] = useState<TierOption>(TIER_OPTIONS[0]);
  const [activeDomain, setActiveDomain] = useState<OutputDomain>('video-hud');
  const [statusNote, setStatusNote] = useState(
    '0.000000 USDC preview active • MAX Compute: 0.000000 • GET / zero-write',
  );

  const currentOutput = DOMAIN_OUTPUTS[activeDomain];

  const handleSelectTier = (tier: TierOption) => {
    setSelectedTier(tier);
    if (!tier.walletRequired) {
      setStatusNote(
        `Selected ${tier.label} (${tier.priceUsdc} USDC) • No wallet required • MAX Compute: 0.000000`,
      );
      return;
    }
    setStatusNote(
      `Selected ${tier.label} (${tier.priceUsdc} USDC on Base 8453) • Payment and delivery unavailable in this view`,
    );
  };

  return (
    <section
      aria-label="BEEMAX Output Hub"
      style={{ padding: 16, border: '1px solid #334155', borderRadius: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>BEEMAX User Output Hub</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            MAX Compute: <strong>0.000000</strong> • Base USDC (8453) • Outputs Only
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {TIER_OPTIONS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            aria-pressed={selectedTier.id === tier.id}
            onClick={() => handleSelectTier(tier)}
            style={{ fontWeight: selectedTier.id === tier.id ? 700 : 400 }}
          >
            {tier.label} ({tier.priceUsdc} USDC)
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, marginTop: 6 }}>{selectedTier.summary}</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        {(Object.keys(DOMAIN_OUTPUTS) as OutputDomain[]).map((domainKey) => (
          <button
            key={domainKey}
            type="button"
            aria-pressed={activeDomain === domainKey}
            onClick={() => setActiveDomain(domainKey)}
            style={{ fontWeight: activeDomain === domainKey ? 700 : 400 }}
          >
            {DOMAIN_OUTPUTS[domainKey].title}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: 12, border: '1px solid #475569', borderRadius: 8 }}>
        <strong>{currentOutput.title}</strong> — <span>{currentOutput.badge}</span>
        <p style={{ margin: '6px 0 0' }}>{currentOutput.outputSummary}</p>
        {activeDomain === 'max-architecture' && (
          <>
            <p>Operator sessions can access BEEMAX chat, configured research feeds, and the MAX LLM, neural, and solver connections.</p>
            <a href="/#/admin">Open the operator command center ↗</a>
          </>
        )}
        {currentOutput.hasVideoHud && (
          <div style={{ marginTop: 10 }}>
            <video
              controls
              playsInline
              poster="/assets/crown-cover.png"
              style={{ width: '100%', maxHeight: 280, borderRadius: 8, background: '#000' }}
            />
          </div>
        )}
      </div>

      <p aria-live="polite" style={{ fontSize: 12, marginTop: 10 }}>
        {statusNote}
      </p>
    </section>
  );
};

export default BeemaxHubIteration;
