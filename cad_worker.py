"""One model per process: release all native CAD memory after every request."""
import json
import logging
import sys
from pathlib import Path
from cad_geometry import analyze

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    result = analyze(Path(sys.argv[1]))
    with Path(sys.argv[2]).open('w',encoding='utf-8') as output:
        json.dump(result,output,ensure_ascii=False,separators=(',',':'),allow_nan=False)
