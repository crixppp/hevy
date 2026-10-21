# Maintenance and recovery

## Backups

Hevy remains the read-only source. The dashboard can reimport workouts, but your dashboard-only notes, mappings, profiles, blocks, goals and forecast snapshots need a separate backup.

- Use Settings → Export dashboard context. Store that JSON securely; it can contain sensitive annotation text. Use Workouts → Export selection for user-initiated workout backups. Exports are never automatic.
- For complete backups, use the official Supabase CLI `db dump` with its supported database authentication, storing output outside this repository and shared folders. Do not include database URLs/passwords in shell history or source. See [Supabase backups](https://supabase.com/docs/guides/platform/backups) for your plan's actual retention and restore options. Free-plan projects do not provide the Pro backup guarantee.
- Prefer a full database restore to a separate private project first. Apply schema before data if restoring a logical data dump. Provision the auth owner and ensure restored owner IDs match. Verify record counts, entry IDs, foreign keys and policies before switching the frontend.
- A context-only export can be restored with the Supabase SQL editor or an authenticated owner client: iterate the `entries` array, validate kinds and UUIDs, and upsert `dashboard_entries` with original `id`, your `owner_id`, `kind`, `data`, and a new `updated_at`. Original UUIDs are necessary because goals/snapshots reference profiles. Never paste private export JSON into chat, a public issue, CI variable, or repository. Test against a backup project first. A dedicated restore UI is not included in v1.

## Credential rotation and recovery

- Hevy: rotate the key through Hevy, then replace **only** `HEVY_API_KEY` in Edge secrets. Update the original Mac Keychain entry separately if continuing that sync. Trigger a read-only sync and verify success before removing the old credential. No frontend rebuild is required.
- Scheduled sync: generate a new unrelated random secret, replace `SYNC_SCHEDULE_SECRET` in Edge secrets and `sync_schedule_secret` in Vault together. Test the next scheduled run. A temporary mismatch causes a safe failed request, not anonymous access.
- Supabase privileged credentials: use the platform's current rotation flow; update server-only consumers, verify service access, and revoke the old credential. Privileged keys are never frontend config. Follow [Supabase API key guidance](https://supabase.com/docs/guides/api/api-keys).
- Owner password: use Forgot password with your configured SMTP. Keep access to your Supabase organization account and email recovery methods. Administratively recover an account through Supabase if mail is unavailable; changing the dashboard owner requires migrating ownership FKs deliberately, not opening registration.
- Public frontend keys: designed for browser use. Rotation must be accompanied by the two public build variables and a rebuild; it is not a substitute for RLS.

## Dependency and operational checks

Monthly, review dependency/security advisories, update the lockfile on a branch, run tests/build/asset audit and repeat the synthetic desktop/mobile smoke test. Chart code is lazy-loaded; workout-derived summaries are memoized and retained only in memory. Do not introduce persistent response caches without explicitly reviewing privacy/invalidation.

Watch `sync_state` and `sync_runs`, pg_cron job results and pg_net status. Bounded upstream errors contain HTTP status/adapter diagnostics only. Never enable verbose upstream headers or request bodies in production logs. No telemetry SDK is installed. Limit log retention according to your privacy needs.

A stale `last_success` or repeated deadline failures means the import is not current. Previous complete data remains intact; it must not be described as a fresh successful sync. Large histories or slow upstream response times may need resumable page staging before production use.

## Delete dashboard account data

First export anything you want to retain. Disable the `hevy-melbourne-daily` cron job (`select cron.unschedule('hevy-melbourne-daily');`). Through Supabase administration, remove the owner row from `dashboard_owners`; cascading FKs delete imported workouts, context and sync state/runs. Then remove the Auth user and backend secrets/Vault secret, and disable the frontend deployment. Backups may retain deleted data for the platform retention period; consult Supabase before permanent erasure. This never deletes any Hevy record.

## After successful migration

Do not disable your existing Mac sync or Codex automation until the new backend passes live owner/non-owner tests, data reconciliation and a scheduled run while the Mac is off. Then disable the specific existing automation in Codex. Retain the local script/export until private backups are tested. No automation was changed during implementation.
