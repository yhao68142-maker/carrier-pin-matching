import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
from fastapi.testclient import TestClient
import app as service

class JobsTests(unittest.TestCase):
    def test_job_lifecycle_and_result(self):
        client=TestClient(service.app)
        sample=Path(__file__).parent/'samples'/'demo-136.9x57.step'
        with sample.open('rb') as source:
            response=client.post('/api/jobs',files={'file':('demo.step',source)})
        self.assertEqual(response.status_code,202)
        job_id=response.json()['id']
        try:
            for _ in range(100):
                status=client.get('/api/jobs/'+job_id).json()
                self.assertIn(status['state'],('running','done','error'))
                self.assertEqual(client.get('/healthz').status_code,200)
                if status['state']!='running': break
                time.sleep(.1)
            self.assertEqual(status['state'],'done',status)
            result=client.get('/api/jobs/'+job_id+'/result').json()
            self.assertEqual(len(result['pins']),2)
            self.assertLess(len(result['triangles']),30001)
            self.assertAlmostEqual(result['outer']['length'],180,places=6)
            self.assertIn('简化预览',result['previewNote'])
        finally: service.expire_job(job_id)
        self.assertEqual(client.get('/api/jobs/'+job_id).status_code,404)

    def test_worker_failure_and_timeout_release_slot(self):
        for outcome in ('timeout','crash'):
            temporary=tempfile.TemporaryDirectory();path=Path(temporary.name)
            (path/'model.step').write_text('invalid')
            service.jobs['test']={'temporary':temporary,'path':path,'state':'running','started':time.monotonic()}
            service.analysis_lock.acquire()
            kwargs={'side_effect':subprocess.TimeoutExpired('cad',300)} if outcome=='timeout' else {'return_value':subprocess.CompletedProcess('cad',-9)}
            with patch('app.subprocess.run',**kwargs): service.process_job('test')
            self.assertEqual(service.jobs['test']['state'],'error')
            self.assertFalse(service.analysis_lock.locked())
            self.assertFalse((path/'model.step').exists())
            service.expire_job('test')

    def test_busy_and_invalid_uploads(self):
        client=TestClient(service.app)
        with service.analysis_lock:
            self.assertEqual(client.post('/api/jobs',files={'file':('a.step',b'abc')}).status_code,503)
        self.assertEqual(client.post('/api/jobs',files={'file':('a.step',b'')}).status_code,400)
        self.assertFalse(service.analysis_lock.locked())
