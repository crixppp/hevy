#!/usr/bin/env python3
"""Training Lens localhost bridge. Delegates read-only Hevy sync to the existing Mac script."""
import argparse
import datetime as dt
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8765
PUBLIC_ORIGIN = 'https://crixppp.github.io'
MAX_BYTES = 25 * 1024 * 1024


def valid_connect(origin, state, allowed):
    return origin in allowed and bool(re.fullmatch(r'[a-f0-9]{64}', state or ''))


def validate_snapshot(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError('Export exceeds 25 MB')
    data = json.loads(raw)
    if not isinstance(data, dict) or not isinstance(data.get('workouts'), list):
        raise ValueError('Invalid workout export')
    ids = set()
    for w in data['workouts']:
        if not isinstance(w, dict) or not isinstance(w.get('id'), str) or w['id'] in ids or not isinstance(w.get('exercises'), list):
            raise ValueError('Invalid or duplicate workout')
        ids.add(w['id'])
    if len(ids) > 20000:
        raise ValueError('Export exceeds 20,000 workouts')
    return data


class Bridge:
    def __init__(self, export_path, script_path, python, allowed=None):
        self.export_path, self.script_path = Path(export_path), Path(script_path)
        self.python = python
        self.allowed = set(allowed or [PUBLIC_ORIGIN])
        self.token = secrets.token_urlsafe(32)  # Local page capability; never the Hevy key.
        self.lock = threading.Lock()
        self.running = False
        self.last_attempt = None
        self.error = None

    def status(self):
        with self.lock:
            return dict(running=self.running, last_attempt=self.last_attempt, error=self.error)

    def snapshot(self):
        return validate_snapshot(self.export_path.read_bytes())

    def start_sync(self):
        with self.lock:
            if self.running:
                return False
            if self.last_attempt and time.time() - self.last_attempt < 60:
                return False
            self.running = True
            self.last_attempt = time.time()
            self.error = None
        threading.Thread(target=self._sync, daemon=True).start()
        return True

    def _sync(self):
        try:
            # Existing script reads the API key from Keychain and atomically replaces its export.
            # Capture and discard all child output. Never log credentials or workout content.
            result = subprocess.run([self.python, str(self.script_path)], capture_output=True, timeout=300)
            if result.returncode:
                raise RuntimeError('Local Hevy sync failed. Check Keychain access and internet connectivity; previous snapshot preserved.')
            self.snapshot()
        except subprocess.TimeoutExpired:
            with self.lock:
                self.error = 'Sync timed out. The previous complete snapshot is still available.'
        except (OSError, ValueError, RuntimeError):
            with self.lock:
                self.error = 'Local sync could not complete. Check Keychain access, source paths and internet connectivity. Previous data remains available.'
        finally:
            with self.lock:
                self.running = False


PAGE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training Lens · Mac connection</title><style nonce="__NONCE__">body{font:15px -apple-system,sans-serif;background:#101315;color:#e9ece8;margin:0;padding:40px 28px;line-height:1.6}h1{font-size:26px}p{color:#aab3ad}button{background:#b8ec8b;color:#17230f;padding:12px 18px;border:0;border-radius:8px;font:inherit;cursor:pointer}button:disabled{opacity:.5}small{color:#aab3ad}#status{white-space:pre-wrap}</style></head><body><h1>Training Lens · Mac connection</h1><p>The Hevy key stays in macOS Keychain. Only workout records are sent back to your dashboard window.</p><p id="status">Ready to refresh from Hevy on this Mac.</p><button id="refresh">Refresh from Hevy &amp; send snapshot</button> <button id="saved">Send existing snapshot</button><p><small>If Keychain asks, allow the existing local sync to read its stored key. You can send the existing snapshot while offline.</small></p><script nonce="__NONCE__">
const token=__TOKEN__, target=__TARGET__, state=__STATE__;
const status=document.getElementById('status'), refresh=document.getElementById('refresh'), saved=document.getElementById('saved');
async function api(path,method='GET'){const response=await fetch(path,{method,cache:'no-store',headers:{'X-Training-Lens-Token':token}});const value=await response.json();if(!response.ok)throw Error(value.error||'Local request failed');return value;}
async function send(){const value=await api('/snapshot');if(!window.opener){status.textContent='Open Training Lens, then click Connect to Mac. This window needs to be opened by your dashboard.';return;}window.opener.postMessage({type:'training-lens:snapshot',state,payload:value},target);status.textContent='Snapshot sent to Training Lens. You can close this window.';}
saved.onclick=()=>send().catch(error=>status.textContent=error.message);
refresh.onclick=async()=>{refresh.disabled=true;try{await api('/sync','POST');status.textContent='Refreshing from Hevy… Your Mac may ask for Keychain access. The last complete snapshot is preserved if this fails.';for(let i=0;i<160;i++){const s=await api('/status');if(!s.running){await send();if(s.error)status.textContent=s.error+'\nThe existing snapshot was sent instead.';return;}await new Promise(r=>setTimeout(r,2000));}status.textContent='Sync is still running. Send the existing snapshot or try again shortly.';}catch(error){status.textContent=error.message;}finally{refresh.disabled=false;}};
if(!target||!state){refresh.disabled=true;saved.disabled=true;status.textContent='Open https://crixppp.github.io/hevy/ and click Connect to Mac to receive data from this helper.';}
</script></body></html>'''


def make_handler(bridge, port):
    local_origin = 'http://127.0.0.1:' + str(port)
    allowed_hosts = {'127.0.0.1:' + str(port), 'localhost:' + str(port)}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _reply(self, status, value, content_type='application/json', nonce=None):
            body = value.encode() if isinstance(value, str) else json.dumps(value).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type + '; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Length', str(len(body)))
            if nonce:
                self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def _host_allowed(self):
            if self.headers.get('Host') not in allowed_hosts:
                self._reply(403, {'error': 'Loopback host required'})
                return False
            return True

        def _private(self):
            if not self._host_allowed():
                return False
            origin = self.headers.get('Origin')
            if origin and origin not in {local_origin, 'http://localhost:'+str(port)}:
                self._reply(403, {'error': 'Same-origin local request required'})
                return False
            token = self.headers.get('X-Training-Lens-Token', '')
            if not hmac.compare_digest(token, bridge.token):
                self._reply(401, {'error': 'Local page capability required'})
                return False
            return True

        def do_GET(self):
            path = urlparse(self.path)
            if path.path in {'/', '/connect'}:
                if not self._host_allowed():
                    return
                if self.headers.get('Origin') not in {None, local_origin, 'http://localhost:'+str(port)}:
                    return self._reply(403, {'error': 'Open the helper as a browser window'})
                q = parse_qs(path.query)
                origin, state = q.get('origin', [''])[0], q.get('state', [''])[0]
                if path.path == '/connect' and not valid_connect(origin, state, bridge.allowed):
                    return self._reply(403, {'error': 'Dashboard origin or connection state rejected'})
                nonce = secrets.token_urlsafe(24)
                page = PAGE.replace('__NONCE__', nonce).replace('__TOKEN__', json.dumps(bridge.token)).replace('__TARGET__', json.dumps(origin)).replace('__STATE__', json.dumps(state))
                return self._reply(200, page, 'text/html', nonce)
            if not self._private():
                return
            if path.path == '/status':
                return self._reply(200, bridge.status())
            if path.path == '/snapshot':
                try:
                    value = bridge.snapshot()
                    value['bridge_status'] = bridge.status()
                    return self._reply(200, value)
                except (OSError, ValueError):
                    return self._reply(503, {'error': 'No complete local export is available yet. Refresh from Hevy first.'})
            self._reply(404, {'error': 'Unknown endpoint'})

        def do_POST(self):
            if not self._private():
                return
            if self.path != '/sync':
                return self._reply(404, {'error': 'Unknown endpoint'})
            if self.headers.get('Content-Length') not in {None, '0'}:
                return self._reply(400, {'error': 'Request bodies are not accepted'})
            started = bridge.start_sync()
            return self._reply(202 if started else 200, bridge.status())

        def do_OPTIONS(self):
            self._reply(403, {'error': 'Use the local connection window; cross-origin API access is disabled'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', required=True, type=Path)
    parser.add_argument('--sync-script', required=True, type=Path)
    parser.add_argument('--python', default='/usr/bin/python3')
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--allow-preview', action='store_true', help='Allow local development origins for synthetic testing')
    args = parser.parse_args()
    allowed = {PUBLIC_ORIGIN}
    if args.allow_preview:
        allowed.update({'http://127.0.0.1:4173', 'http://127.0.0.1:5173'})
    bridge = Bridge(args.export, args.sync_script, args.python, allowed)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(bridge, args.port))
    print('Training Lens Mac helper ready at http://127.0.0.1:'+str(args.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
