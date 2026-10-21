# Training Lens · Your training, understood.

Training Lens is a personal training dashboard for Hevy workout data, built with React, TypeScript and Vite.

**Free GitHub Pages mode:** open your existing Hevy JSON export in the browser, or explore the synthetic demo. File data and dashboard edits stay in memory for that session; export your context before leaving. No account, Supabase subscription or API key is needed. Opening a file does not upload it to GitHub.

**Optional cloud mode:** Supabase adds email/password access, saved context and remote scheduled syncing. The source code supports it, but live Supabase setup is not required for the free website.

## Run

Node 24, pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the printed `/hevy/` URL and choose **Open my Hevy export** or **Explore the synthetic demo**. Theme is the only browser-persisted preference; sessions and workout responses remain in memory.

```sh
pnpm test
pnpm run build
pnpm run audit:assets
```

## Included

- Responsive dark/light workspace, ten sections, global date filters, hash routing and accessible chart-data tables.
- Overview, selectable priorities, training calendar, exercise/session explorers and side-by-side workout details.
- Equipment conventions with effective dates, dashboard-only context, direct-set distribution mappings and length-normalized training-block comparisons.
- Rule-based weekly summaries, concrete exercise goals, conservative forecasts with chronological holdout/baseline comparison and saved prediction evaluation.
- Supabase email/password/recovery flow, owner allowlist, RLS, normalized security-invoker source views and private context CRUD.
- Read-only paginated Hevy adapter, incremental update/delete events, weekly reconciliation, retries, atomic imports, sync locks and Melbourne-time scheduler.
- GitHub Pages workflow, source-only CI checks, synthetic tests and a production asset audit.

## Read before live setup

[Setup, costs, secret entry and hosting choice](docs/SETUP.md) · [Metric contract](docs/METRICS.md) · [Data model](docs/DATA_MODEL.md) · [API contract](docs/HEVY_API.md) · [Backup and maintenance](docs/MAINTENANCE.md) · [Verification and limitations](docs/VERIFICATION.md).

Local implementation and synthetic browser checks are complete. Hosted Supabase authentication, the Edge runtime, live sync, scheduled execution and public deployment have **not** been verified. No private data was uploaded and the existing Mac sync was left untouched. Do not treat local SQL tests as a complete hosted security assessment.

GitHub Pages is the selected frontend host. The default build runs with local file import and the synthetic demo. Optional cloud setup remains documented separately; never put the Hevy key in public source or frontend variables.
