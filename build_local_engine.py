"""Download pinned upstream WASM at build time; verify package before extracting files."""
import gzip
import hashlib
import io
import tarfile
from pathlib import Path
from urllib.request import urlopen

VERSION='2.0.0-beta.b5ff984'
SHA256='ff789c20ff1bc0d7109d2d980fc7d5af68144a0f16f2cf0f8e59f9bc96d1630f'
def build():
    payload=urlopen(f'https://registry.npmjs.org/opencascade.js/-/opencascade.js-{VERSION}.tgz',timeout=120).read()
    if hashlib.sha256(payload).hexdigest()!=SHA256: raise RuntimeError('CAD package checksum mismatch')
    target=Path(__file__).parent/'static'/'vendor';target.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as archive:
        for source,name in [('dist/opencascade.full.js','occt.mjs'),('dist/opencascade.full.wasm','occt.wasm'),('LICENSE','LICENSE.opencascade.txt')]:
            data=archive.extractfile('package/'+source).read()
            (target/name).write_bytes(data)
            if name.endswith('.wasm'): (target/(name+'.gz')).write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
    print('Local CAD engine prepared:',VERSION)
if __name__=='__main__':build()
