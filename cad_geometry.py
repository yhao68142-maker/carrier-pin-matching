"""Read analytic STEP geometry directly with OCCT, without CadQuery's UI/solver stack."""
import logging
import math
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_SOLID, TopAbs_WIRE, TopAbs_REVERSED
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
from OCP.gp import gp_Pnt, gp_Vec, gp_Trsf
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform, BRepBuilderAPI_MakeFace
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box

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

def analyze(path,progress=None):
    report=progress or (lambda stage: None)
    report('reading')
    Interface_Static.SetCVal_s('xstep.cascade.unit','MM')
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise ValueError('无法读取 STEP')
    report('transferring')
    reader.TransferRoots()
    shape = reader.OneShape()
    if shape.IsNull(): raise ValueError('STEP 不含实体')
    del reader
    faces = list(parts(shape,TopAbs_FACE,TopoDS.Face_s))
    report('basis')
    log.info('CAD geometry imported faces=%s',len(faces))
    base = None
    largest = -1
    areas=[]
    for face in faces:
        props=GProp_GProps()
        BRepGProp.SurfaceProperties_s(face,props)
        areas.append((props.Mass(),face))
        if BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane:
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
    carrier=None
    for solid in parts(shape,TopAbs_SOLID,TopoDS.Solid_s):
        if any(face.IsSame(base) for face in parts(solid,TopAbs_FACE,TopoDS.Face_s)):
            carrier=solid
            break
    outer=None
    report('outline')
    if carrier is not None:
        transform=gp_Trsf()
        transform.SetValues(*u,-dot(u,origin),*v,-dot(v,origin),*n,-dot(n,origin))
        aligned=BRepBuilderAPI_Transform(carrier,transform,True).Shape()
        bounds=Bnd_Box()
        # Analytic bounds in the carrier plane; never use display tessellation.
        BRepBndLib.AddOptimal_s(aligned,bounds,False,False)
        x0,y0,z0,x1,y1,z1=bounds.Get()
        length,width=sorted((x1-x0,y1-y0),reverse=True)
        outer={'length':length,'width':width,
               'method':'最大基准面所属实体在载条平面的几何包络，长取较大边、宽取较小边；不含独立装配零件。'}
    report('pins')
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
    report('preview')
    # Display-only simplification: retain major faces; exact measurements above
    # always use the unmodified model. Absolute mesh tolerance avoids excessive
    # subdivision of small radii/engraving. Omit tiny interior wires in planes.
    selected=[face for area,face in sorted(areas,key=lambda item:item[0],reverse=True)[:160] if area>=2]
    vertices=[];triangles=[]
    for source in selected:
        face=source
        if BRepAdaptor_Surface(source).GetType()==GeomAbs_Plane:
            try:
                outer_wire=BRepTools.OuterWire_s(source)
                builder=BRepBuilderAPI_MakeFace(outer_wire,True)
                for wire in parts(source,TopAbs_WIRE,TopoDS.Wire_s):
                    if wire.IsSame(outer_wire): continue
                    hole=BRepBuilderAPI_MakeFace(wire,True)
                    props=GProp_GProps()
                    BRepGProp.SurfaceProperties_s(hole.Face(),props)
                    if props.Mass()>=2: builder.Add(wire)
                if builder.IsDone(): face=builder.Face()
            except Exception:
                face=source
        BRepMesh_IncrementalMesh(face,0.3,False,0.5,False)
        location=TopLoc_Location()
        mesh=BRep_Tool.Triangulation_s(face,location)
        if mesh is None: continue
        if len(triangles)+mesh.NbTriangles()>30000: continue
        offset=len(vertices);transform=location.Transformation()
        vertices.extend(xyz(mesh.Node(i).Transformed(transform)) for i in range(1,mesh.NbNodes()+1))
        reverse=face.Orientation()==TopAbs_REVERSED
        for i in range(1,mesh.NbTriangles()+1):
            triangle=mesh.Triangle(i)
            order=(1,3,2) if reverse else (1,2,3)
            triangles.append(tuple(triangle.Value(j)+offset-1 for j in order))
    return {'pins':candidates,'vertices':vertices,'triangles':triangles,'outer':outer,
            'previewNote':'简化预览：省略小面、细小刻字和部分复杂细节；销钉标记与四项测量来自未简化的 CAD。',
            'basis':{'origin':origin,'x':u,'y':v,'normal':n},
            'basisNote':'自动基准：最大平面及其最长直边。请核对横向，必要时交换 X/Y。','unit':'mm'}
