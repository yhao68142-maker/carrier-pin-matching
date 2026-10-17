// Analytic OCCT measurement. Display triangles never participate in measurements.
export function analyzeLocal(oc, bytes, report=()=>{}) {
 const xyz=p=>[p.X(),p.Y(),p.Z()], sub=(a,b)=>a.map((v,i)=>v-b[i]), add=(a,b)=>a.map((v,i)=>v+b[i]);
 const mul=(a,s)=>a.map(v=>v*s), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), norm=a=>mul(a,1/Math.hypot(...a));
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const T=oc.TopAbs_ShapeEnum,G=oc.GeomAbs_SurfaceType;
 const parts=(shape,kind,cast)=>{const e=new oc.TopExp_Explorer_2(shape,kind,T.TopAbs_SHAPE),out=[];while(e.More()){out.push(cast(e.Current()));e.Next()}e.delete();return out};
 const facesOf=s=>parts(s,T.TopAbs_FACE,s=>oc.TopoDS.Face_1(s));
 const props=s=>{const p=new oc.GProp_GProps_1();oc.BRepGProp.SurfaceProperties_1(s,p,false,false);return p};
 const surface=f=>new oc.BRepAdaptor_Surface_2(f,true);
 oc.FS.writeFile('/model.step',bytes);report('reading');
 const reader=new oc.STEPControl_Reader_1();
 if(reader.ReadFile('/model.step')!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)throw Error('无法读取 STEP 文件');
 reader.SetSystemLengthUnit(1);report('transferring');
 reader.TransferRoots(new oc.Message_ProgressRange_1());const shape=reader.OneShape();
 if(shape.IsNull())throw Error('STEP 不含有效实体');
 report('basis');const faces=facesOf(shape),areas=[];let base,origin,largest=-1;
 for(const f of faces){const p=props(f),area=p.Mass();areas.push({f,area});if(surface(f).GetType()===G.GeomAbs_Plane&&area>largest){base=f;largest=area;origin=xyz(p.CentreOfMass())}p.delete()}
 if(!base)throw Error('未找到载条平面');
 const p=new oc.gp_Pnt_1(),normal=new oc.gp_Vec_1(),bs=surface(base);
 new oc.BRepGProp_Face_2(base,false).Normal((bs.FirstUParameter()+bs.LastUParameter())/2,(bs.FirstVParameter()+bs.LastVParameter())/2,p,normal);
 const n=norm(xyz(normal));let u,longest=-1;
 for(const e of parts(base,T.TopAbs_EDGE,s=>oc.TopoDS.Edge_1(s))){const c=new oc.BRepAdaptor_Curve_2(e);if(c.GetType()!==oc.GeomAbs_CurveType.GeomAbs_Line)continue;const d=sub(xyz(c.Value(c.LastParameter())),xyz(c.Value(c.FirstParameter()))),l=dot(d,d);if(l>longest&&l>0){longest=l;u=norm(d)}}
 if(!u)throw Error('无法确定载条横向');const v=norm(cross(n,u));
 let carrier;for(const solid of parts(shape,T.TopAbs_SOLID,s=>s)){if(facesOf(solid).some(f=>f.IsSame(base))){carrier=solid;break}}
 report('outline');let outer=null;
 if(carrier){const tr=new oc.gp_Trsf_1();tr.SetValues(...u,-dot(u,origin),...v,-dot(v,origin),...n,-dot(n,origin));const aligned=new oc.BRepBuilderAPI_Transform_2(carrier,tr,true).Shape(),box=new oc.Bnd_Box_1();oc.BRepBndLib.AddOptimal(aligned,box,false,false);const lo=xyz(box.CornerMin()),hi=xyz(box.CornerMax()),[length,width]=[hi[0]-lo[0],hi[1]-lo[1]].sort((a,b)=>b-a);outer={length,width,method:'原始 CAD 实体在载条基准平面的解析几何包络；不使用显示网格。'}}
 report('pins');const pins=[];
 for(const f of faces){const s=surface(f);if(s.GetType()!==G.GeomAbs_Cylinder)continue;const c=s.Cylinder(),axis=xyz(c.Axis().Direction());if(Math.abs(dot(axis,n))<1-1e-7)continue;const point=xyz(c.Location());new oc.BRepGProp_Face_2(f,false).Normal(.5,.5,p,normal);const offset=sub(xyz(p),point),radial=sub(offset,mul(axis,dot(offset,axis)));if(dot(xyz(normal),radial)<=0)continue;const center=add(point,mul(axis,dot(sub(origin,point),n)/dot(axis,n)));if(pins.some(q=>Math.hypot(...sub(q.center,center))<1e-7))continue;pins.push({id:pins.length,center,diameter:2*c.Radius(),x:dot(sub(center,origin),u),y:dot(sub(center,origin),v)})}
 report('preview');const vertices=[],triangles=[];
 for(const {f:source} of areas.sort((a,b)=>b.area-a.area).slice(0,160).filter(q=>q.area>=2)){
  let face=source;
  if(surface(source).GetType()===G.GeomAbs_Plane){try{const wire=oc.BRepTools.OuterWire(source),builder=new oc.BRepBuilderAPI_MakeFace_15(wire,true);for(const w of parts(source,T.TopAbs_WIRE,s=>oc.TopoDS.Wire_1(s))){if(w.IsSame(wire))continue;const hole=new oc.BRepBuilderAPI_MakeFace_15(w,true),pr=props(hole.Face());if(pr.Mass()>=2)builder.Add(w);pr.delete()}if(builder.IsDone())face=builder.Face()}catch{face=source}}
  new oc.BRepMesh_IncrementalMesh_2(face,.3,false,.5,false);
  const loc=new oc.TopLoc_Location_1(),handle=oc.BRep_Tool.Triangulation(face,loc,0);
  if(handle.IsNull())continue;const mesh=handle.get();if(triangles.length+mesh.NbTriangles()>30000)continue;
  const offset=vertices.length,tr=loc.Transformation();for(let i=1;i<=mesh.NbNodes();i++)vertices.push(xyz(mesh.Node(i).Transformed(tr)));
  const reverse=face.Orientation_1()===oc.TopAbs_Orientation.TopAbs_REVERSED;for(let i=1;i<=mesh.NbTriangles();i++){const t=mesh.Triangle(i);triangles.push((reverse?[1,3,2]:[1,2,3]).map(j=>t.Value(j)+offset-1))}
 }
 return {pins,outer,vertices,triangles,basis:{origin,x:u,y:v,normal:n},unit:'mm',basisNote:'本机 CAD 测量：最大平面及最长直边作基准，请核对轴心与方向。',previewNote:'简化预览：省略小面及刻字细节；尺寸来自未简化的 CAD 实体。'};
}
