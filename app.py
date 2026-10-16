from pathlib import Path
import json
import tempfile
import logging
import threading
import time
import uuid
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from engine import analyze, exact_matches, measure

ROOT = Path(__file__).parent
app = FastAPI(title='载条定位销尺寸匹配')
DATA = ROOT/'data'/'catalog.json'
records = json.loads(DATA.read_text(encoding='utf-8')) if DATA.exists() else []
analysis_lock = threading.Lock()
MAX_UPLOAD = 50*1024*1024
logger = logging.getLogger('uvicorn.error')

@app.get('/healthz')
def health():
    return {'status':'ok','catalogRecords':len(records),'version':'import-recovery-1'}

@app.get('/api/catalog')
def catalog():
    return records

@app.post('/api/analyze')
def upload(file: UploadFile):
    if Path(file.filename or '').suffix.lower() not in ('.step','.stp'):
        raise HTTPException(400,'请上传 STEP/STP。图片和 STL 不提供解析圆柱轴线，不能用于此精确测量。')
    if not analysis_lock.acquire(blocking=False):
        raise HTTPException(503,'服务器正在解析另一个模型，请等待完成后重试。',headers={'Retry-After':'15'})
    request_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'model.step'
            total = 0
            with path.open('wb') as output:
                while chunk := file.file.read(1024*1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD:
                        raise HTTPException(413,'文件超过 50 MB')
                    output.write(chunk)
            if not total:
                raise HTTPException(400,'文件为空，请重新导出 STEP 文件。')
            logger.info('CAD %s start bytes=%s', request_id, total)
            result = analyze(path)
            logger.info('CAD %s complete seconds=%.1f pins=%s triangles=%s', request_id,
                        time.monotonic()-started, len(result['pins']),len(result['triangles']))
            return JSONResponse(result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('CAD %s failed', request_id)
        raise HTTPException(422, f'无法测量此模型，请检查 STEP 是否包含完整实体，或导出单个载条后重试。错误编号：{request_id}') from exc
    finally:
        analysis_lock.release()

class Query(BaseModel):
    x: str
    y: str

@app.post('/api/match')
def match(query: Query):
    try: return exact_matches(records,query.x,query.y)
    except ValueError as exc: raise HTTPException(400,str(exc)) from exc

@app.get('/')
def home(): return FileResponse(ROOT/'static'/'index.html')

app.mount('/static', StaticFiles(directory=ROOT/'static'),name='static')
