"""One model per process: release all native CAD memory after every request."""
import json
import logging
import sys
import os
from pathlib import Path
from cad_geometry import analyze

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    def progress(stage):
        if len(sys.argv)>3:
            target=Path(sys.argv[3]);temporary=target.with_suffix('.tmp')
            temporary.write_text(json.dumps({'stage':stage}),encoding='utf-8')
            os.replace(temporary,target)
    result = analyze(Path(sys.argv[1]),progress)
    progress('saving')
    with Path(sys.argv[2]).open('w',encoding='utf-8') as output:
        json.dump(result,output,ensure_ascii=False,separators=(',',':'),allow_nan=False)
