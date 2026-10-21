# Training Lens · Your training, understood.

Training Lens is a personal training dashboard for Hevy workout data, built with React, TypeScript and Vite.

**Free Mac mode:** click **Connect to my Mac** / **Refresh from Mac** to receive a recent snapshot from the local Keychain-backed helper. The latest snapshot and dashboard context are saved in this browser, so they remain usable when the Mac helper is unavailable. The Hevy key never reaches GitHub or the frontend. [Mac connection guide](docs/LOCAL_MAC.md).

**File/demo modes:** open an existing Hevy JSON export or explore the synthetic demo. These modes remain session-only. No account, Supabase subscription or API key is needed in the browser.

**Optional cloud mode:** Supabase adds email/password access, saved context and remote scheduled syncing. The source code supports it, but live Supabase setup is not required for the free website.

**Live website:** [Training Lens](https://crixppp.github.io/hevy/)

## Run

Node 24, pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the printed `/hevy/` URL and choose **Open my Hevy export** or **Explore the synthetic demo**. Mac mode explicitly persists the last received snapshot/context in IndexedDB. Cloud sessions and demo/file responses remain in memory.

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

[Local Mac connection](docs/LOCAL_MAC.md) · [Setup, costs, secret entry and hosting choice](docs/SETUP.md) · [Metric contract](docs/METRICS.md) · [Data model](docs/DATA_MODEL.md) · [API contract](docs/HEVY_API.md) · [Backup and maintenance](docs/MAINTENANCE.md) · [Verification and limitations](docs/VERIFICATION.md).

GitHub Pages deployment, the live demo, local-file import with synthetic records and cloud-free dashboard editing have been verified. All 31 TypeScript tests and 10 Python helper tests pass locally and in GitHub Actions. The live Mac snapshot transfer and browser persistence are verified. Optional hosted Supabase authentication, the Edge runtime, live sync and scheduled execution have **not** been verified. No private data was uploaded and the existing Mac sync was left untouched. Do not treat local SQL tests as a complete hosted security assessment.

GitHub Pages is the selected frontend host. The default build runs with local file import and the synthetic demo. Optional cloud setup remains documented separately; never put the Hevy key in public source or frontend variables.
