#!/usr/bin/env python3
"""Install the owner-authorized Training Lens loopback helper as a user LaunchAgent."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

LABEL = 'com.traininglens.mac-bridge'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sync', type=Path, required=True)
    parser.add_argument('--source-export', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'darwin':
        sys.exit('This installer is for macOS only.')
    if not args.source_sync.is_file() or not args.source_export.is_file():
        sys.exit('The existing sync script and export must be available. Nothing installed.')
    root = Path.home() / 'Library' / 'Application Support' / 'Training Lens'
    agents = Path.home() / 'Library' / 'LaunchAgents'
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    agents.mkdir(parents=True, exist_ok=True)
    plist = agents / (LABEL+'.plist')
    # Refresh our own service only; never modify other LaunchAgents or the original sync.
    if plist.exists():
        subprocess.run(['/bin/launchctl', 'bootout', 'gui/'+str(os.getuid()), str(plist)], capture_output=True)
    shutil.copyfile(Path(__file__).with_name('local_bridge.py'), root/'local_bridge.py')
    shutil.copyfile(args.source_sync, root/'hevy_sync.py')
    if not (root/'hevy-workouts.json').exists():
        shutil.copyfile(args.source_export, root/'hevy-workouts.json')
    for name in ['local_bridge.py', 'hevy_sync.py', 'hevy-workouts.json']:
        (root/name).chmod(0o600)
    config = {
        'Label': LABEL,
        'ProgramArguments': ['/usr/bin/python3', str(root/'local_bridge.py'), '--export', str(root/'hevy-workouts.json'), '--sync-script', str(root/'hevy_sync.py')],
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 15,
        'StandardOutPath': str(root/'bridge.log'),
        'StandardErrorPath': str(root/'bridge-error.log'),
        'ProcessType': 'Background',
    }
    with plist.open('wb') as f:
        plistlib.dump(config, f)
    plist.chmod(0o600)
    result = subprocess.run(['/bin/launchctl', 'bootstrap', 'gui/'+str(os.getuid()), str(plist)], capture_output=True)
    if result.returncode:
        sys.exit('Helper files installed, but launchctl could not start the service. See LOCAL_MAC.md.')
    print('Training Lens Mac helper installed. It starts at login and listens only on 127.0.0.1:8765.')
    print('The original sync and export are unchanged. No API key was copied into configuration.')

if __name__ == '__main__':
    main()
