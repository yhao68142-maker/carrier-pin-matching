"""Read analytic STEP geometry directly with OCCT, without CadQuery's UI/solver stack."""
import logging
import math
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder, GeomAbs_Line
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp, BRepGProp_Face
from OCP.BRepTools import BRepTools
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.gp import gp_Pnt, gp_Vec

log = logging.getLogger('uvicorn.error')
def xyz(p): return (p.X(), p.Y(), p.Z())
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def mul(a,s): return tuple(x*s for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def norm(a): return mul(a,1/math.sqrt(dot(a,a)))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def parts(shape, kind, cast):
    explorer = TopExp_Explorer(shape,kind)
    while explorer.More():
        yield cast(explorer.Current())
        explorer.Next()

def analyze(path):
    Interface_Static.SetCVal_s('xstep.cascade.unit','MM')
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise ValueError('无法读取 STEP')
    reader.TransferRoots()
    shape = reader.OneShape()
    if shape.IsNull(): raise ValueError('STEP 不含实体')
    del reader
    faces = list(parts(shape,TopAbs_FACE,TopoDS.Face_s))
    log.info('CAD geometry imported faces=%s',len(faces))
    base = None
    largest = -1
    for face in faces:
        if BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane:
            props=GProp_GProps()
            BRepGProp.SurfaceProperties_s(face,props)
            if props.Mass()>largest:
                largest=props.Mass();base=face;origin=xyz(props.CentreOfMass())
    if base is None: raise ValueError('未找到载条平面')
    u0,u1,v0,v1 = BRepTools.UVBounds_s(base)
    p=gp_Pnt();normal=gp_Vec()
    BRepGProp_Face(base).Normal((u0+u1)/2,(v0+v1)/2,p,normal)
    n=norm(xyz(normal))
    longest=-1;u=None
    for edge in parts(base,TopAbs_EDGE,TopoDS.Edge_s):
        curve=BRepAdaptor_Curve(edge)
        if curve.GetType()!=GeomAbs_Line: continue
        direction=sub(xyz(curve.Value(curve.LastParameter())),xyz(curve.Value(curve.FirstParameter())))
        length=dot(direction,direction)
        if length>longest and length>0: longest=length;u=norm(direction)
    if u is None: raise ValueError('无法从载条平面确定横向直边')
    v=norm(cross(n,u));candidates=[]
    for face in faces:
        surface=BRepAdaptor_Surface(face)
        if surface.GetType()!=GeomAbs_Cylinder: continue
        cylinder=surface.Cylinder();axis=xyz(cylinder.Axis().Direction())
        if abs(dot(axis,n))<1-1e-7: continue
        point=xyz(cylinder.Location())
        BRepGProp_Face(face).Normal(0.5,0.5,p,normal)
        offset=sub(xyz(p),point)
        radial=sub(offset,mul(axis,dot(offset,axis)))
        if dot(xyz(normal),radial)<=0: continue
        center=add(point,mul(axis,dot(sub(origin,point),n)/dot(axis,n)))
        if any(math.dist(center,c['center'])<1e-7 for c in candidates): continue
        candidates.append({'id':len(candidates),'center':center,'diameter':2*cylinder.Radius(),
                           'x':dot(sub(center,origin),u),'y':dot(sub(center,origin),v)})
    log.info('CAD analytic axes complete pins=%s; generating preview',len(candidates))
    # Display mesh only. Axis coordinates above never use mesh vertices.
    BRepMesh_IncrementalMesh(shape,0.15,True,0.1,False)
    vertices=[];triangles=[]
    for face in faces:
        location=TopLoc_Location()
        mesh=BRep_Tool.Triangulation_s(face,location)
        if mesh is None: continue
        offset=len(vertices);transform=location.Transformation()
        vertices.extend(xyz(mesh.Node(i).Transformed(transform)) for i in range(1,mesh.NbNodes()+1))
        reverse=face.Orientation()==TopAbs_REVERSED
        for i in range(1,mesh.NbTriangles()+1):
            triangle=mesh.Triangle(i)
            order=(1,3,2) if reverse else (1,2,3)
            triangles.append(tuple(triangle.Value(j)+offset-1 for j in order))
    return {'pins':candidates,'vertices':vertices,'triangles':triangles,
            'basis':{'origin':origin,'x':u,'y':v,'normal':n},
            'basisNote':'自动基准：最大平面及其最长直边。请核对横向，必要时交换 X/Y。','unit':'mm'}
