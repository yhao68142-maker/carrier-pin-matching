from pathlib import Path
import json
import tempfile
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from engine import analyze, exact_matches, measure

ROOT = Path(__file__).parent
app = FastAPI(title='载条定位销尺寸匹配')
DATA = ROOT/'data'/'catalog.json'
records = json.loads(DATA.read_text(encoding='utf-8')) if DATA.exists() else []

@app.get('/api/catalog')
def catalog():
    return records

@app.post('/api/analyze')
def upload(file: UploadFile):
    if Path(file.filename or '').suffix.lower() not in ('.step','.stp'):
        raise HTTPException(400,'请上传 STEP/STP。图片和 STL 不提供解析圆柱轴线，不能用于此精确测量。')
    raw = file.file.read(50*1024*1024+1)
    if len(raw)>50*1024*1024: raise HTTPException(413,'文件超过 50 MB')
    try:
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'model.step'
            path.write_bytes(raw)
            return analyze(path)
    except Exception as exc:
        raise HTTPException(422, f'无法测量此模型：{exc}') from exc

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
