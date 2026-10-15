"""Read-only extraction; never alters the source workbook."""
import json, re, sys
from pathlib import Path
import openpyxl

def extract(source):
    workbook=openpyxl.load_workbook(source,data_only=True)
    records=[]
    for sheet in workbook:
        if sheet.title not in ('治具料盒信息统计','治具料盒信息统计（CB端）'): continue
        def value(row,col):
            cell=sheet.cell(row,col)
            for merged in sheet.merged_cells.ranges:
                if cell.coordinate in merged:
                    return sheet.cell(merged.min_row,merged.min_col).value
            return cell.value
        for row in range(1,sheet.max_row+1):
            if sheet.cell(row,4).value != '载条定位销尺寸': continue
            raw=str(sheet.cell(row,5).value or '')
            found=re.match(r'\s*(\d+(?:\.\d+)?)\s*[*×xX]\s*(\d+(?:\.\d+)?)',raw)
            if not found: continue
            records.append({'code':str(value(row,2) or ''),'model':str(value(row,3) or ''),
                'x':found[1],'y':found[2],'raw':raw,'sheet':sheet.title,'cell':f'E{row}'})
    return records

if __name__=='__main__':
    dest=Path(__file__).resolve().parents[1]/'data'/'catalog.json'
    dest.parent.mkdir(exist_ok=True)
    rows=extract(sys.argv[1])
    dest.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Extracted {len(rows)} records; original workbook unchanged.')
