# Setup and deployment

## Free Mac connection (selected)

Use the [local Mac helper](LOCAL_MAC.md) with the GitHub Pages frontend. The Hevy key stays in Keychain; **Refresh from Mac** transfers a snapshot to the browser. The browser keeps the last received snapshot and context until cleared. No Supabase project is needed.

## Free file-only alternative

The default website needs no Supabase account. Choose **Open my Hevy export** and select the JSON file created by your existing Mac sync. The app reads it on your device; it does not upload the file. All dashboard features use that imported dataset. Context edits stay in memory; export them before closing/reloading. Refresh records by opening an updated export. This mode does not automatically sync while your Mac is off.

The GitHub Actions Pages workflow builds and deploys on main-branch pushes or manual dispatch. Public frontend Supabase variables are optional. GitHub Pages is available for public repositories on GitHub Free; standard public-repository Actions usage follows GitHub's published plan rules. No paid host or domain is required for the github.io URL.

The following sections describe local development and the **optional** Supabase cloud mode. No live Supabase project or remote sync has been configured.

## 1. Review locally

Use Node 24 and pnpm 11.25.0 (pinned in package.json):

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm dev
```

Open the printed `/hevy/` URL and choose **Explore the synthetic demo**. Its data is deterministic and unrelated to personal workouts. Demo edits reset when you leave/reload. Hash routes (`/hevy/#/exercises`) support static hosting reloads without rewrites. For another host set `VITE_BASE_PATH=/` when building. Never put private JSON in public/, src/, dist/ or repository history.

Optional private check, without copying the source or retrieving the key:

```sh
node scripts/verify-local.ts /absolute/path/to/hevy-workouts.json
python3 scripts/audit_assets.py --source /absolute/path/to/hevy-workouts.json
```

This checks schemas/metrics locally and scans compiled assets for source IDs. It never uploads data. The existing Mac sync and any existing automation are untouched.

## 2. Approve the data destination and budget

Live setup sends your Hevy workout records (including descriptions, exercise notes and RPE) to a Supabase Postgres project you control. Your chosen dashboard annotations are also stored there. No external AI service is used. The source and public application shell are intended for the public `crixppp/hevy` repository and GitHub Pages. The static shell is public; all personal data requires backend authentication.

Costs checked 21 October 2026, USD, excluding tax/exchange and future changes:

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): public repositories can use GitHub Free. Your provided repository is public. Pages has [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), including 1 GB published site and a soft 100 GB monthly bandwidth limit. Actions usage is separate; check your account before enabling.
- [Supabase Free](https://supabase.com/pricing): $0, 500 MB database, 5 GB egress, 50,000 monthly active users; two active projects, pause after a week of inactivity. This may suffice for one user but is not a promise of perpetual free hosting. Review [Edge Function invocation pricing](https://supabase.com/docs/guides/functions/pricing) and SMTP requirements.
- [Supabase Pro](https://supabase.com/pricing): starts at $25/month, one project included, daily backups kept seven days. Additional usage and SMTP may cost extra. Check current billing and spend controls.
- Hevy API currently requires Hevy Pro. The existing connection is reused conceptually; this app does not purchase or alter subscriptions.

[Edge limits](https://supabase.com/docs/guides/functions/limits) include 150-second wall time on Free, 400 seconds paid, 2 seconds CPU and 256 MB memory. This implementation stops fetching before 95 seconds and commits only completed imports. Benchmark live initial imports before retiring the Mac sync. Years of records remain browsable; exceptionally large/slow full imports may need resumable staging.

If the entire site must be inaccessible before login, GitHub Pages cannot provide that. The smallest change is to host the same static build behind an identity-aware access proxy (for example Cloudflare Access), retaining Supabase policies. Choose the access provider and review its costs before enabling it.

### Frontend host choice

GitHub Pages was selected by the owner. The default file/demo build has no password form and makes no private backend requests. The existing Pages project path is `/hevy/`; Training Lens is the application name and Hevy is its data source. The repository path does not change the branding.

## 3. Optional: provision Supabase (account actions)

After approving the transfer and budget:

1. Create a Supabase project in your preferred region. Save database/recovery credentials in your password manager. Do not paste credentials into chat.
2. Disable new-user signup in Authentication settings (config.toml also disables it for local Supabase). Enable email/password sign-in. Create the single owner using the Supabase dashboard; set a strong password yourself. Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and test recovery mail delivery. Supabase's default mail sender has restrictions; do not assume it is a production email service.
3. Set the auth Site URL to `https://crixppp.github.io/hevy/` and allow that exact redirect, plus the local URL while developing. Configure recovery redirects as needed. Do not use broad wildcard redirects.
4. Apply `supabase/migrations/202610210001_core.sql` with the SQL editor or `supabase db push` after CLI project linking. Insert your actual auth user UUID administratively:

   ```sql
   insert into public.dashboard_owners(user_id) values ('YOUR_AUTH_USER_UUID');
   ```

5. In **Edge Functions → Secrets**, enter these server-only secrets directly in Supabase's secure UI:
   - `HEVY_API_KEY`: retrieve from the existing macOS Keychain service **Codex Hevy workout sync**, account your Mac username, using Keychain Access yourself; enter directly in Supabase. Do not save it in a source file, `.env`, screenshot, terminal history or chat.
   - `OWNER_USER_ID`: the same owner auth UUID.
   - `APP_ORIGIN`: `https://crixppp.github.io` (origin only; local testing uses `http://127.0.0.1:5173`).
   - `SYNC_SCHEDULE_SECRET`: a password-manager-generated random secret, at least 32 characters, unrelated to any other credential.
   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side. Never set them as frontend variables. Do not share them in chat.
6. Deploy the function using the official Supabase CLI, with explicit application authentication:

   ```sh
   supabase functions deploy sync-hevy --no-verify-jwt
   ```

   The function verifies the owner's bearer token or the independent schedule secret. `verify_jwt=false` is necessary for the separate scheduled path; it is not an anonymous-access bypass.
7. Enter **only public frontend values** in `.env.local` for local live testing and GitHub repository **Variables** for Pages: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable/anon key is designed for browsers; RLS enforces privacy. Do not use the service-role or secret key in this field. Set `VITE_BASE_PATH=/hevy/` locally. `.env.local` is gitignored.
8. In Supabase Vault UI, store `project_url` and `sync_schedule_secret` (same random schedule secret as the Edge Function). Apply `supabase/schedule.sql` once. It uses pg_cron + pg_net and a Melbourne local-time guard to run at 9:17 pm across DST. It runs remotely while your Mac is off. Check cron job and pg_net results; do not print request headers or Vault contents.

## 4. Verify live, then publish

- Sign in as owner, **Sync now**, confirm complete source counts and sample sets against the Mac export. Inspect last-attempt/success/error state. Repeat sync, edit/delete only a synthetic test dataset in a separate test project to exercise reconciliation; never mutate Hevy as a test.
- Verify a real anonymous REST request cannot read private records. Sign in as a deliberately provisioned second non-owner test account and verify direct reads return no rows, mutations fail, and the sync endpoint returns 401. Use private environment variables or an interactive script; never paste bearer tokens into shell history or logs. Re-enable signup restrictions afterward if changed for testing.
- Test session expiry, sign out, password recovery delivery and reset flow. Sign out clears memory and session persistence is disabled. A page reload requires sign-in. After source loading, no private data should remain when leaving the account.
- Verify scheduled authorization with a wrong secret fails; verify one genuine scheduled run completes. Test cooldown and duplicate clicks. Check the first weekly reconciliation. Do not expose schedule secrets in URLs.
- Run `pnpm test`, `pnpm run build`, and `pnpm run audit:assets`; optionally add the local source scan. Check the deployed bundle and network responses for private data and correct `Cache-Control: no-store` behavior. There is no service worker.
- Commit/push reviewed source to `crixppp/hevy`. Enable Pages source **GitHub Actions**. Set the two public Variables. The **Deploy Training Lens to GitHub Pages** workflow runs on main pushes or manual dispatch. Add an environment protection approval if desired. Validate `/hevy/` and direct hash links/reloads on the hosted URL.

Only after new live import, scheduling and direct authorization checks pass should you disable the old Mac/Codex sync automation. Use its existing automation entry in Codex; do not delete the old script or export until backups are verified. This build has not modified either.
