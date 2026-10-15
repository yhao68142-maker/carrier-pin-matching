import unittest
from fastapi.testclient import TestClient
from app import app

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

if __name__=='__main__':unittest.main()
