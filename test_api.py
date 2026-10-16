import unittest
from unittest.mock import patch
import subprocess
from fastapi.testclient import TestClient
from app import app, analysis_lock

class ApiTests(unittest.TestCase):
    def setUp(self): self.client=TestClient(app)
    def test_home_and_catalog(self):
        self.assertEqual(self.client.get('/healthz').json()['status'],'ok')
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertEqual(self.client.get('/static/app.js').status_code,200)
        self.assertIsInstance(self.client.get('/api/catalog').json(),list)
    def test_invalid_values(self):
        self.assertEqual(self.client.post('/api/match',json={'x':'NaN','y':'57'}).status_code,400)
        self.assertEqual(self.client.post('/api/match',json={'x':'','y':'57'}).status_code,400)
    def test_no_image_or_stl_measurement(self):
        for filename in ['screenshot.png','mesh.stl']:
            result=self.client.post('/api/analyze',files={'file':(filename,b'test')})
            self.assertEqual(result.status_code,400)
    def test_invalid_step(self):
        result=self.client.post('/api/analyze',files={'file':('bad.step',b'not STEP')})
        self.assertEqual(result.status_code,422)
    def test_busy_analysis_keeps_health_available(self):
        with analysis_lock:
            result=self.client.post('/api/analyze',files={'file':('valid.step',b'test')})
            self.assertEqual(result.status_code,503)
            self.assertIn('正在解析',result.json()['detail'])
            self.assertEqual(self.client.get('/healthz').status_code,200)
    def test_rejected_upload_releases_lock(self):
        with patch('app.MAX_UPLOAD',4):
            result=self.client.post('/api/analyze',files={'file':('big.step',b'12345')})
            self.assertEqual(result.status_code,413)
        result=self.client.post('/api/analyze',files={'file':('empty.step',b'')})
        self.assertEqual(result.status_code,400)
        self.assertFalse(analysis_lock.locked())
    def test_worker_timeout_or_crash_returns_readable_error(self):
        with patch('app.subprocess.run',side_effect=subprocess.TimeoutExpired('cad',120)):
            result=self.client.post('/api/analyze',files={'file':('model.step',b'test')})
            self.assertEqual(result.status_code,504)
            self.assertIn('两分钟',result.json()['detail'])
        with patch('app.subprocess.run',return_value=subprocess.CompletedProcess('cad',-9)):
            result=self.client.post('/api/analyze',files={'file':('model.step',b'test')})
            self.assertEqual(result.status_code,422)
            self.assertIn('进程未能完成',result.json()['detail'])
        self.assertFalse(analysis_lock.locked())
        self.assertEqual(self.client.get('/healthz').status_code,200)

if __name__=='__main__':unittest.main()
