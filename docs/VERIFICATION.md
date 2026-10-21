# Verification record · 21 October 2026

Update: Free local-file mode added for GitHub Pages. The suite now has 29 passing tests, including valid local exports, duplicate IDs and malformed source rejection. The original cloud verification limits below still apply to optional Supabase mode.

## Verified locally

- Official Hevy OpenAPI inspected, including auth, max page sizes, update/delete event shape, count endpoint and polling guidance. Existing sync script inspected without executing it or retrieving its key.
- Existing private export checked in place for source IDs, structural validity and deterministic set totals. No real workout fixture was added to this repository or opened in a public preview.
- 26 automated tests pass: 12 metric/forecast tests, 6 adapter/auth predicate tests, 8 database integration tests. Metrics use independent hand calculations (50 kg × 6 = 300 kg·reps and 60 kg Epley estimate). The integration tests execute the migration in PGlite, a local Postgres runtime, with synthetic auth tables/roles.
- Local direct SQL checks deny anon reads and private RPCs, return no rows for a second authenticated user, deny source writes by the owner, and isolate context CRUD. Tested overlap lease/cooldown, idempotent updates, deletion events and rollback of failed full reconciliation. These are real SQL/RLS checks, not a test of the login screen alone.
- Production TypeScript and Vite builds passed in demo-only mode and with explicitly synthetic public Supabase configuration. The latter proves the backend-enabled branch bundles; it does not verify a Supabase connection.
- The compiled production scan found no server credential identifiers or privileged-key patterns, and none of the real source workout IDs supplied for the private local scan. No Hevy key was retrieved, so no live secret was handled by the build. Build-time guards reject server keys in VITE variables, secret-key prefixes and legacy service-role JWTs.
- In-app browser inspected at desktop and narrow/mobile breakpoints (effective CSS widths observed: 1600, 1440, 433 and 390 px; browser zoom affected the requested override). Both had page width equal to viewport width. Desktop and mobile screenshots inspected. All ten navigation views rendered, with no browser error logs during the smoke test.
- Browser interactions checked: demo entry; date presets; block selection and normalized comparison; creating a synthetic block; saving a forecast snapshot with an awaiting-target status; source workout detail and side-by-side comparison; mobile navigation dismissal; keyboard Enter expanding the chart data table. Native HTML dialog provides focus containment and Escape handling. Reduced-motion CSS, visible focus rules and text table alternatives are present. Dark/light theme is implemented.
- The `/hevy/` project prefix is present in compiled asset references; navigation uses hash routes. Direct hash navigation/reload is checked locally, returning to the login boundary before explicit demo entry.

The final compiled production build was also opened with the local Vite preview server; overview and lazy chart rendering passed, with no new browser error logs. Transient development hot-reload messages occurred while source files were being replaced; a fresh production navigation resolved those.

## Not yet verified

No hosted service was provisioned and no private data was transferred. No source was pushed and no public deployment was triggered.

The following require owner account actions and a real test project: SMTP/recovery delivery, genuine sign-in and token expiry, Edge Function deployment/runtime and CORS, hosted direct REST access as anon/non-owner, live read-only Hevy import, source correction/deletion against real API responses, daily scheduled invocation across actual DST changes, cron/pg_net diagnostics, production response cache headers and hosted route behavior. A local passing test suite does not establish full production security.

Accessibility smoke checks are limited; no screen-reader audit, automated contrast suite, physical touch-device test or exhaustive keyboard audit has been completed. Colors and focus states were visually reviewed; do not claim WCAG certification.

## Scope and analytical limitations of this first version

This is a working first version, not every advanced feature in the original brief:

- Workout comparisons show source sets side by side. Block comparisons normalize counts/duration and link common exercise IDs; automatic matched-rep/RPE performance attribution, plateau detection, exercise-order associations and advanced drop-off insights are not implemented.
- Weekly reviews currently cover counts, effort coverage, source links and context. They do not persist historical reviews or track all goal/forecast changes week over week.
- Goals support exercise e1RM, load at exact reps with optional effort ceiling, and set distance/duration. Weekly frequency/consistency goals, planned schedules/adherence and frequency scenarios are not implemented.
- Forecasts estimate session e1RM only, with three holdout observations; evidence is limited. No goal-date prediction or calibrated confidence interval is claimed. Snapshot errors are shown per snapshot; pooled horizon/exercise calibration and bias dashboards require more completed evaluations and are not yet implemented.
- Equipment profiles preserve effective dates. Mapping labels are editable and timestamped, but full historical mapping revisions and explicit alias-merging tools are not implemented. Mapping edits must never silently make machines comparable. No indirect muscle-set fractions or muscle map are invented.
- Annotations currently attach to a date range and optionally an exercise. Direct workout/block attachment and chart overlay markers are not implemented; the context timeline remains available.
- Context export and private backup/restore instructions exist. There is no context-import UI or full edit audit log.
- Full sync uses one bounded worker request. If 95 seconds is insufficient, it fails safely, leaving the previous dataset. Resumable staging is not implemented. The source API does not provide snapshot isolation, so a concurrent update may be corrected on a later event sync.
- Public sample data is entirely synthetic. Equipment conventions for real records have not been reviewed; strength estimates/forecasts stay unavailable until profiles are configured. No clinical, recovery, injury-risk or physiological adaptation claims are made.

The local preview is useful now. Production use requires the setup and authorization checks in SETUP.md. The Mac sync and its existing automation remain unchanged.
