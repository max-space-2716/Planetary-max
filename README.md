# MAXJ SOVEREIGN SYSTEM MANIFESTO

**Holding Parent:** `OUR umbrella`

**Origin Canon:** Layer 13 (`MaxJ`)

**Law:** Identity-Physics | Zero-Burn | Fail-Closed | Zero-Custody

*When an existing system is not built for your sovereignty, your pace, or your way of creating, build a coherent system of your own from first principles.*

1. **Self-Determination Over Permission** — Build what is structurally yours.
2. **Identity-Physics as the Anchor** — Keep intent, state & lineage bound.
3. **Zero-Custody & Verifiable Lineage** — Client-held proof & hybrid signatures.
4. **Zero-Burn Discipline** — Lean edge isolates, zero paid bloat.
5. **One Unified Stack, End to End** — Workspace, PQC transport & hybrid IRs.

**Goal:** Coherence, sovereignty, and a living system that moves with its builder.

---

## BEEMAX & PORTAL-OS1 Unified Edge Repository

**Pre-Tier Index:** `IDX-PRETIER-001`  
**Protocol Doctrine:** `JURREAUISM / DAT ("Done All To That")`  
**Target Runtime:** Cloudflare Workers, SQLite-Backed Durable Objects & Cloudflare D1

### Overview
This unified repository merges all three architectural layers into a single zero-collision Cloudflare Worker deployment:
1. **Layer 1 — Unified Configuration (`wrangler.toml`)**: Binds SQLite-backed Durable Objects (`CognitiveNodeActor`) and a unified Cloudflare D1 database (`DB`).
2. **Layer 2 — Merged D1 SQL Schema (`src/database/schema.sql`)**: Combines microkernel audit indices (`IDX-PRETIER-001`) with the Sovereign Art Catalog (`artworks`, `artwork_editions`), Multi-Sig Escrow (`marketplace_orders`, `escrow_signatures`), and SHA-256 Provenance Certificates (`provenance_certificates`).
3. **Layer 3 — Unified Edge Entry Router (`src/index.ts`)**: Serves the conversational **Governors Dashboard & Terminal HUD** at `/`, the **Sovereign Art Gallery & DAT Marketplace** at `/storefront/*`, the **MAX Games Factory & App Showroom** at `/showroom/*`, and the **Zero-Copy ICV Mesh** at `/mesh/*`.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4a8bf9d550f9c4668077963e244ce3b530c0a1dc45e519897b47f413171868f0 -->

## Current application deployment

The root application runs through `src/worker.ts` and serves the React/Vite build from `dist`. Follow [Deployment instructions](DEPLOYMENT.md) for the current database migrations, administrator secrets, publishing workflow, and verification requirements. The historical architecture summary above describes earlier entry points.

```bash
npm ci
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

Production migration and deployment commands are `npm run db:migrate` and `npm run deploy`, after configuring the production account and secrets as described in the deployment guide.


<!-- /coderabbit-ai-generated:v1 -->
