import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('local_bridge_http',Path(__file__).resolve().parents[1]/'scripts/local_bridge.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();p=Path(cls.tmp.name)/'export.json'
        p.write_text(json.dumps({'workouts':[{'id':'synthetic','exercises':[]}]}))
        cls.bridge=b.Bridge(p,Path(cls.tmp.name)/'sync.py','python')
        cls.server=b.ThreadingHTTPServer(('127.0.0.1',0),b.BaseHTTPRequestHandler)
        cls.port=cls.server.server_port;cls.server.RequestHandlerClass=b.make_handler(cls.bridge,cls.port)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
    def request(self,path,headers=None,method='GET'):
        try:
            with urlopen(Request('http://127.0.0.1:'+str(self.port)+path,headers=headers or {},method=method),timeout=2) as r:return r.status,r.read(),r.headers
        except HTTPError as e:return e.code,e.read(),e.headers
    def test_private_endpoints_require_capability(self):
        self.assertEqual(self.request('/snapshot')[0],401)
        code,body,headers=self.request('/snapshot',{'X-Training-Lens-Token':self.bridge.token})
        self.assertEqual(code,200);self.assertEqual(json.loads(body)['workouts'][0]['id'],'synthetic');self.assertEqual(headers['Cache-Control'],'no-store')
    def test_origin_host_and_preflight(self):
        auth={'X-Training-Lens-Token':self.bridge.token}
        self.assertEqual(self.request('/snapshot',{**auth,'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('/snapshot',{**auth,'Host':'evil.example'})[0],403)
        self.assertEqual(self.request('/snapshot',method='OPTIONS')[0],403)
        self.assertEqual(self.request('/sync',method='POST')[0],401)
    def test_connection_page_only_targets_owner_origin(self):
        self.assertEqual(self.request('/connect?origin=https%3A%2F%2Fevil.example&state='+'a'*64)[0],403)
        code,body,headers=self.request('/connect?origin=https%3A%2F%2Fcrixppp.github.io&state='+'a'*64)
        self.assertEqual(code,200);self.assertIn(b'window.opener.postMessage',body);self.assertIn("frame-ancestors 'none'",headers['Content-Security-Policy']);self.assertNotIn('Access-Control-Allow-Origin',headers)
    def test_endpoint_boundaries(self):
        auth={'X-Training-Lens-Token':self.bridge.token}
        self.assertEqual(self.request('/not-a-route',auth)[0],404)
        self.assertEqual(self.request('/status',auth)[0],200)

if __name__=='__main__':unittest.main()
