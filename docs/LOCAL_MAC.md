# Local Mac connection · no paid server

Training Lens stays on GitHub Pages. A small Python helper runs on your Mac and delegates read-only Hevy syncing to the existing Keychain-backed script. The website stores its last received snapshot and dashboard context in this browser's IndexedDB. Your Mac does not need to be awake continuously; an old snapshot remains usable, with its sync timestamp visible. An internet connection may still be needed to load the website shell.

## Everyday use

1. Open https://crixppp.github.io/hevy/.
2. Click **Connect to my Mac** (first time), or **Refresh from Mac** later.
3. In the small localhost window, choose **Refresh from Hevy & send snapshot**. It may take a short while to fetch all pages. The key is read by the Mac script from macOS Keychain, never by the browser. If offline, choose **Send existing snapshot** instead.
4. Return to the dashboard. It labels the source **MAC SNAPSHOT** and shows the Hevy import timestamp. You can close the connection window.

This is on-demand syncing, not continuous polling. When you reopen the site on the same browser/profile, it restores the last saved snapshot and context. Changing browser/profile/device does not carry the cache across. Data remains in this browser until you clear it or the browser evicts site storage. Use Settings → Export dashboard context for backups. Clearing browser site data also clears these records.

**Forget saved Mac data** in Settings removes the local workout snapshot and dashboard context. It does not delete any Hevy record or the Mac's export. Closing the snapshot workspace leaves the saved cache available on the next reload.

## Installed on the owner's Mac

The helper is a per-user LaunchAgent, starts at login, and binds only to `127.0.0.1:8765`. It does not listen on your Wi-Fi/LAN address. Runtime files live in `~/Library/Application Support/Training Lens/` (owner-only directory permissions). This includes:

- `local_bridge.py`: the loopback server.
- `hevy_sync.py`: a copy of the original working sync script, using the same Keychain service/account. No API key is copied into this file.
- `hevy-workouts.json`: last complete local import, with owner-only file permissions.
- `bridge.log` and `bridge-error.log`: helper diagnostics; requests, credentials and workout contents are not logged.

The original script, original export and any existing Codex automation remain unchanged. The helper's copy writes its own snapshot in Application Support, so it does not compete for the original export file.

## Install on another Mac

Requires macOS, `/usr/bin/python3`, the existing Keychain entry, and a working read-only sync script that saves `hevy-workouts.json` beside itself. From the source checkout:

```sh
/usr/bin/python3 scripts/install_mac_helper.py \
  --source-sync /absolute/path/to/hevy_sync.py \
  --source-export /absolute/path/to/hevy-workouts.json
```

The installer copies the script/helper and seeds the initial export into Application Support, then registers only `com.traininglens.mac-bridge`. It never asks for or prints a Hevy API key. Keep the existing Keychain entry under its original service/account. If Keychain access requires approval, complete that prompt yourself.

## Security and browser behavior

The public site opens a top-level localhost connection window after your click. The local window makes same-origin requests to the helper and returns only workout data through `postMessage`. The receiver checks the exact loopback origin, expected popup window and a random connection nonce. This avoids requiring a public HTTPS page to fetch directly from localhost, which differs across browsers and can trigger local-network prompts.

Private helper endpoints require an ephemeral local-page capability unrelated to the Hevy key. Wrong Host headers, foreign Origins, missing capabilities and cross-origin preflights are denied. Connection pages only target the exact GitHub Pages owner origin (or explicitly enabled preview origins during synthetic tests). CORS is not used as authentication. No credentials are put in the popup URL, dashboard storage or messages. The connection nonce in the popup URL is not an API credential.

A sync overlap lock, a 60-second request cooldown and a 300-second subprocess deadline bound on-demand requests. The existing sync script atomically writes a complete export; failures preserve the previous complete file. The popup can send that previous snapshot when refresh fails, and the app shows its original timestamp/error. The local script currently performs full-history reads rather than the optional Supabase incremental adapter.

Do not use the helper from an untrusted OS account or grant other people access to your browser profile. This design protects the API key from the frontend; it does not encrypt the workout snapshot against someone who controls your logged-in Mac/browser.

## Troubleshooting

- If the popup says it cannot connect: confirm you are on the same Mac, logged into the user account where the helper is installed. Browser popup blocking must allow the connection window.
- If Hevy refresh fails: check internet connectivity, Keychain access and the Hevy subscription/API key. Send the existing snapshot to keep working.
- If a popup is opened directly without the dashboard: it cannot send data. Open the website and use its connection button.
- Inspect service state with `launchctl print gui/$(id -u)/com.traininglens.mac-bridge`. Do not paste verbose logs or credentials into public issues.
- To restart: `launchctl kickstart -k gui/$(id -u)/com.traininglens.mac-bridge`.
- To stop and disable login startup: `launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/com.traininglens.mac-bridge.plist"`, then remove that specific plist. Reinstall to enable it again. Retain or remove Application Support snapshots according to your backup needs. This never deletes the Keychain entry or changes Hevy records.

## Verification

Local verification covered a successful read-only Hevy refresh through the installed helper, a complete snapshot, loopback-only binding and direct access-control checks. Automated tests cover source validation, failure preservation, timeout, cooldown/overlap, Host/Origin/capability checks, connection-window targeting and message receiver validation. Browser transfer, saved-cache reload and hosted deployment are checked separately during delivery; consult VERIFICATION.md for the actual results.
