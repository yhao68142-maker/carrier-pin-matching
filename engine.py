"""Analytic STEP geometry. Display tessellation is never used for measurements."""
from decimal import Decimal, InvalidOperation
import math
import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface

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

def analyze(path):
    shape = cq.importers.importStep(str(path)).val()
    faces = shape.Faces()
    planes = sorted([f for f in faces if f.geomType() == 'PLANE'], key=lambda f:f.Area(), reverse=True)
    if not planes:
        raise ValueError('未找到载条平面，请提供含解析平面的 STEP 实体')
    base = planes[0]
    n = base.normalAt().normalized()
    edges = sorted([e for e in base.Edges() if e.geomType() == 'LINE'], key=lambda e:e.Length(), reverse=True)
    if not edges:
        raise ValueError('无法从载条平面确定横向直边')
    u = (edges[0].endPoint()-edges[0].startPoint()).normalized()
    v = n.cross(u).normalized()
    origin = base.Center()
    candidates = []
    for face in faces:
        if face.geomType() != 'CYLINDER':
            continue
        cylinder = BRepAdaptor_Surface(face.wrapped).Cylinder()
        axis = cq.Vector(cylinder.Axis().Direction())
        if abs(axis.dot(n)) < 1-1e-7:
            continue
        point = cq.Vector(cylinder.Location())
        # Positive radial face normal distinguishes solid pins from bored holes.
        normal, surface_point = face.normalAt(0.5, 0.5)
        radial = surface_point-point-axis.multiply((surface_point-point).dot(axis))
        if normal.dot(radial) <= 0:
            continue
        center = point + axis.multiply((origin-point).dot(n)/axis.dot(n))
        if any((center-cq.Vector(*c['center'])).Length < 1e-7 for c in candidates):
            continue
        candidates.append({'id':len(candidates), 'center':center.toTuple(), 'diameter':2*cylinder.Radius(),
                           'x':(center-origin).dot(u),'y':(center-origin).dot(v)})
    vertices, triangles = shape.tessellate(0.15)
    return {'pins':candidates, 'vertices':[p.toTuple() for p in vertices], 'triangles':triangles,
            'basis':{'origin':origin.toTuple(),'x':u.toTuple(),'y':v.toTuple(),'normal':n.toTuple()},
            'basisNote':'自动基准：最大平面及其最长直边。请核对横向，必要时交换 X/Y。',
            'unit':'mm'}

def measure(pins, a, b, swap=False):
    if a == b or not 0 <= a < len(pins) or not 0 <= b < len(pins):
        raise ValueError('请选择两个不同的定位销')
    dx = abs(pins[a]['x']-pins[b]['x'])
    dy = abs(pins[a]['y']-pins[b]['y'])
    if swap: dx,dy=dy,dx
    return {'x':repr(dx), 'y':repr(dy), 'distance':math.hypot(dx,dy)}
