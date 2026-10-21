import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('local_bridge',Path(__file__).resolve().parents[1]/'scripts/local_bridge.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class BridgeTests(unittest.TestCase):
    def test_origin_and_nonce(self):
        self.assertTrue(b.valid_connect(b.PUBLIC_ORIGIN,'a'*64,{b.PUBLIC_ORIGIN}))
        self.assertFalse(b.valid_connect('https://evil.example','a'*64,{b.PUBLIC_ORIGIN}))
        self.assertFalse(b.valid_connect(b.PUBLIC_ORIGIN,'bad',{b.PUBLIC_ORIGIN}))
    def test_snapshot_preserves_zero_and_missing(self):
        data={'synced_at':'2026-10-21T00:00:00Z','workouts':[{'id':'synthetic','exercises':[{'sets':[{'weight_kg':0,'reps':None}]}]}]}
        self.assertEqual(b.validate_snapshot(json.dumps(data).encode()),data)
    def test_duplicates_and_invalid_roots(self):
        for data in [[],{'workouts':[{'id':'a','exercises':[]},{'id':'a','exercises':[]}]}]:
            with self.assertRaises(ValueError):b.validate_snapshot(json.dumps(data).encode())
    def test_sync_failure_preserves_export_and_sanitizes_output(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'workouts.json';raw=json.dumps({'workouts':[]});p.write_text(raw)
            bridge=b.Bridge(p,Path(t)/'sync.py','python')
            with patch.object(b.subprocess,'run',return_value=type('Result',(),{'returncode':1,'stdout':b'PRIVATE','stderr':b'PRIVATE'})()):bridge._sync()
            self.assertEqual(p.read_text(),raw)
            self.assertNotIn('PRIVATE',bridge.error)
    def test_overlap_and_rate_limit(self):
        bridge=b.Bridge('none','none','python')
        bridge.running=True;self.assertFalse(bridge.start_sync())
        bridge.running=False;bridge.last_attempt=time.time();self.assertFalse(bridge.start_sync())
    def test_timeout_preserves_state(self):
        bridge=b.Bridge('none','none','python')
        with patch.object(b.subprocess,'run',side_effect=b.subprocess.TimeoutExpired('sync',300)):bridge._sync()
        self.assertFalse(bridge.running);self.assertIn('timed out',bridge.error)

if __name__=='__main__':unittest.main()
