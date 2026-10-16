"""Analytic STEP geometry. Display tessellation is never used for measurements."""
from decimal import Decimal, InvalidOperation
import math
def analyze(path):
    from cad_geometry import analyze as analyze_geometry
    return analyze_geometry(path)

def exact_matches(records, x, y):
    try:
        x, y = Decimal(str(x)), Decimal(str(y))
        if not x.is_finite() or not y.is_finite() or x < 0 or y < 0:
            raise ValueError('尺寸必须为有限非负数')
    except InvalidOperation as exc:
        raise ValueError('请输入有效尺寸') from exc
    results=[]
    tolerance=Decimal('0.01')
    for record in records:
        dx=x-Decimal(record['x'])
        dy=y-Decimal(record['y'])
        if abs(dx)<=tolerance and abs(dy)<=tolerance:
            results.append({**record,'deltaX':str(dx),'deltaY':str(dy)})
    return results

def ranked_matches(records, x, y):
    # Reuse input validation; never round the values used for pass/fail.
    exact_matches([], x, y)
    x, y = Decimal(str(x)), Decimal(str(y))
    ranked = []
    tolerance = Decimal('0.01')
    for record in records:
        sx, sy = Decimal(record['x']), Decimal(record['y'])
        dx, dy = x-sx, y-sy
        pass_x, pass_y = abs(dx)<=tolerance, abs(dy)<=tolerance
        ex = abs(dx)/max(x,sx) if max(x,sx) else Decimal(0)
        ey = abs(dy)/max(y,sy) if max(y,sy) else Decimal(0)
        loss = (ex+ey)/2
        score = (1-loss)*100
        # Only suppress numerical CAD noise in presentation, never in tolerance checks.
        display = '100.00' if abs(dx)<Decimal('1e-9') and abs(dy)<Decimal('1e-9') else str(min(Decimal('99.99'),score.quantize(Decimal('0.01'))))
        key = (not(pass_x and pass_y),loss,dx*dx+dy*dy)
        ranked.append((key,{**record,'deltaX':str(dx),'deltaY':str(dy),
                            'passX':pass_x,'passY':pass_y,'qualified':pass_x and pass_y,
                            'similarity':display}))
    ranked.sort(key=lambda item:item[0])
    previous=None;rank=0;results=[]
    for index,(key,row) in enumerate(ranked,1):
        if key!=previous: rank=index
        results.append({**row,'rank':rank})
        previous=key
    return results

def measure(pins, a, b, swap=False):
    if a == b or not 0 <= a < len(pins) or not 0 <= b < len(pins):
        raise ValueError('请选择两个不同的定位销')
    dx = abs(pins[a]['x']-pins[b]['x'])
    dy = abs(pins[a]['y']-pins[b]['y'])
    if swap: dx,dy=dy,dx
    return {'x':repr(dx), 'y':repr(dy), 'distance':math.hypot(dx,dy)}
