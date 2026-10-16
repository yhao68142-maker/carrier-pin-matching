"""Analytic STEP geometry. Display tessellation is never used for measurements."""
from decimal import Decimal, InvalidOperation
import math
from cad_geometry import analyze

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

def measure(pins, a, b, swap=False):
    if a == b or not 0 <= a < len(pins) or not 0 <= b < len(pins):
        raise ValueError('请选择两个不同的定位销')
    dx = abs(pins[a]['x']-pins[b]['x'])
    dy = abs(pins[a]['y']-pins[b]['y'])
    if swap: dx,dy=dy,dx
    return {'x':repr(dx), 'y':repr(dy), 'distance':math.hypot(dx,dy)}
