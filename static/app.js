import {setupOffline} from './offline.mjs?v=offline-v1';
import {rankLocally} from './ranking.mjs?v=offline-v1';
import {importLocal,clearLocalCache} from './local-import.mjs?v=local-cad-1';
import {importModel,stageNames,stageStep,overallPercent} from './import.mjs?v=local-cad-1';
import {renderResults} from './results.mjs?v=local-cad-1';
const $=id=>document.getElementById(id);let model=null,angle=.35,tilt=.65,zoom=1,drag=null,confirmed=false;
import {api} from './api.mjs?v=import-recovery-1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=[];const catalogReady=api('/api/catalog').then(rows=>{catalog=rows;$('count').textContent=`内嵌尺寸库 · ${rows.length} 条记录`;return rows}).catch(e=>{$('count').textContent=e.message;return null});
function invalidate(){confirmed=false;$('x').value='';$('y').value='';$('length').value='';$('width').value='';$('result').textContent='请重新确认定位销与方向。';$('provenance').textContent='尚未确认 CAD 测量。';draw()}
let activeMode='local',localAbort=null,selectedFile=null,offlineMode=!navigator.onLine;
setupOffline({onChange:enabled=>{offlineMode=enabled;$('cloud').disabled=enabled||!selectedFile||$('file').disabled},isBusy:()=> $('file').disabled});
let importStarted=0,importTimer=null,importState={},importPercent=0;
function showProgress(state){
 importState=state;importPercent=overallPercent(state,importPercent);$('importProgress').hidden=false;
 $('importBar').value=importPercent;
 const detail=state.stage==='uploading'?(state.percent==null?'上传中':`上传 ${state.percent}%`):'阶段估算';
 $('importStage').textContent=`整体进度 ${importPercent}%${state.stage==='done'?'':`（${detail}）`} · ${state.message||stageNames[state.stage]||'正在处理'}`;
 $('importElapsed').textContent=`已用时 ${Math.floor((Date.now()-importStarted)/1000)} 秒`;
 $('importSteps').textContent=`${stageStep(state.stage)} / 5：${activeMode==='local'?'本机读取':'上传'} → 读取实体 → 测量 → 简化预览 → 完成`;
 $('importNote').textContent=state.stage==='done'?'完成。请核对轴心、方向与长宽。':(activeMode==='local'?'本机计算，文件未上传。整体百分比按阶段估算，阶段不变时会停留；结果返回后才到 100%。':'整体百分比按阶段估算；上传比例来自实际发送字节。结果返回后才到 100%。');
}
async function loadFile(mode='local'){const file=selectedFile;if(!file||$('file').disabled)return;if(mode==='cloud'&&(offlineMode||!navigator.onLine)){$('status').textContent='离线模式不能上传文件，请切回联网模式。';return}activeMode=mode;localAbort=new AbortController();$('cloud').disabled=true;$('cancelLocal').hidden=mode!=='local';model=null;invalidate();$('controls').hidden=true;$('status').textContent='正在解析 STEP 实体及圆柱轴线…';$('file').disabled=true;importPercent=0;importState={stage:'uploading',percent:0};importStarted=Date.now();importTimer=setInterval(()=>showProgress(importState),1000);try{model=await (mode==='local'?importLocal(file,showProgress,{signal:localAbort.signal}):importModel(file,showProgress));$('previewNote').textContent=model.previewNote||'';$('basisNote').textContent=model.basisNote+(model.outer?` 外形：长 ${model.outer.length.toFixed(3)} × 宽 ${model.outer.width.toFixed(3)} mm。${model.outer.method}`:' 未识别到载条实体，外形长宽需手动核对。');for(const key of ['pinA','pinB'])$(key).innerHTML=model.pins.map(p=>`<option value="${p.id}">候选 ${p.id+1} · Ø ${p.diameter.toPrecision(8)} mm</option>`).join('');if(model.pins.length>1)$('pinB').value='1';$('controls').hidden=model.pins.length<2;$('status').textContent=`识别到 ${model.pins.length} 个垂直于基准面的外圆柱轴心。${model.pins.length<2?'不足两个，请检查模型。':'请核对候选和方向。'}`;angle=.35;tilt=.65;zoom=1;draw()}catch(e){$('status').textContent=e.message;$('importBar').value=0;$('importStage').textContent='加载未完成';$('importNote').textContent=e.message}finally{clearInterval(importTimer);$('file').disabled=false;$('cloud').disabled=offlineMode||!navigator.onLine;$('cancelLocal').hidden=true}};
function selectFile(files){
 if($('file').disabled)return;
 if(files.length!==1){$('status').textContent='请每次只选择一个 STEP/STP 文件。';return}
 const file=files[0];
 if(!/\.(step|stp)$/i.test(file.name)){$('status').textContent='仅支持 STEP/STP 文件，请重新选择。';return}
 if(!file.size||file.size>50*1024*1024){$('status').textContent='文件为空或超过 50 MB，请重新选择。';return}
 selectedFile=file;$('selectedName').textContent='已选择：'+file.name;
 loadFile('local');
}
$('file').onchange=()=>selectFile(Array.from($('file').files));
const dropZone=$('dropZone');let dragDepth=0;
const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
function resetDrop(){dragDepth=0;dropZone.classList.remove('drag-over')}
for(const type of ['dragover','drop'])window.addEventListener(type,e=>{if(hasFiles(e))e.preventDefault()});
dropZone.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();if($('file').disabled)return;dragDepth++;dropZone.classList.add('drag-over')});
dropZone.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=$('file').disabled?'none':'copy'});
dropZone.addEventListener('dragleave',e=>{if(--dragDepth<=0)resetDrop()});
dropZone.addEventListener('drop',e=>{
 e.preventDefault();e.stopPropagation();resetDrop();
 if($('file').disabled)return;
 const files=Array.from(e.dataTransfer?.files||[]);
 selectFile(files);
 // Keep the native filename in sync when the browser supports assignment.
 if(files.length===1&&selectedFile===files[0])try{$('file').files=e.dataTransfer.files}catch{}
});
window.addEventListener('drop',resetDrop);window.addEventListener('dragend',resetDrop);

$('cloud').onclick=()=>loadFile('cloud');
$('cancelLocal').onclick=()=>localAbort?.abort();
$('clearCache').onclick=async()=>{try{await clearLocalCache();$('status').textContent='本机测量缓存已清除。'}catch{$('status').textContent='当前浏览器无法访问缓存。'}};
for(const id of ['pinA','pinB','swap'])$(id).onchange=invalidate;
$('measure').onclick=async()=>{const a=model?.pins[+$('pinA').value],b=model?.pins[+$('pinB').value];if(!a||!b||a.id===b.id){$('status').textContent='请选择两个不同的定位销。';return}let x=Math.abs(a.x-b.x),y=Math.abs(a.y-b.y);if($('swap').checked)[x,y]=[y,x];$('x').value=String(x);$('y').value=String(y);$('length').value=model.outer?String(model.outer.length):'';$('width').value=model.outer?String(model.outer.width):'';confirmed=!!model.outer;$('provenance').textContent=`CAD 轴心投影测量 · X=${x} mm / Y=${y} mm · 中心距 ${Math.hypot(x,y).toFixed(5)} mm（仅参考） · 外形长 ${model.outer?.length??"未测得"} / 宽 ${model.outer?.width??"未测得"} mm`;await search()};
async function search(){try{if(['x','y','length','width'].some(id=>!$(id).value.trim()))throw Error('请填写销钉 X、Y 和载条外形长、宽四项尺寸。');if(!await catalogReady)throw Error('尺寸库未加载，请联网准备离线资源后重试。');const rows=rankLocally(catalog,{x:$('x').value,y:$('y').value,length:$('length').value,width:$('width').value});$('result').innerHTML=renderResults(rows)}catch(e){$('result').textContent=e.message}}
$('search').onclick=()=>{if(!confirmed)$('provenance').textContent='手动尺寸查询 · 不代表 CAD 测量结果';search()};for(const id of ['x','y','length','width'])$(id).oninput=()=>{confirmed=false;$('provenance').textContent='手动尺寸查询 · 不代表 CAD 测量结果';$('result').textContent='尺寸已修改，请重新查询。'};
const canvas=$('canvas'),ctx=canvas.getContext('2d');function draw(){const dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);if(!model){ctx.fillStyle='#7c9383';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('导入 STEP，查看真实几何与轴心',w/2,h/2);return}const {origin,x:u,y:v,normal:n}=model.basis;const dot=(a,b)=>a.reduce((s,t,i)=>s+t*b[i],0);const local=p=>{const d=p.map((t,i)=>t-origin[i]);return[dot(d,u),dot(d,v),dot(d,n)]};const verts=model.vertices.map(local),radius=verts.reduce((r,p)=>Math.max(r,Math.hypot(...p)),1),scale=Math.min(w,h)*.43/radius*zoom;const project=p=>{const a=p[0]*Math.cos(angle)-p[1]*Math.sin(angle),b=p[0]*Math.sin(angle)+p[1]*Math.cos(angle);return[w/2+a*scale,h/2-(b*Math.cos(tilt)-p[2]*Math.sin(tilt))*scale,b*Math.sin(tilt)+p[2]*Math.cos(tilt)]};const pts=verts.map(project);const triangles=model.triangles.map(t=>({t,z:t.reduce((s,i)=>s+pts[i][2],0)/3})).sort((a,b)=>a.z-b.z);ctx.lineWidth=.3;for(const {t} of triangles){ctx.beginPath();t.forEach((i,j)=>j?ctx.lineTo(...pts[i].slice(0,2)):ctx.moveTo(...pts[i].slice(0,2)));ctx.closePath();ctx.fillStyle='#c6d5c8';ctx.strokeStyle='#8ca293';ctx.fill();ctx.stroke()}for(const pin of model.pins){const p=project(local(pin.center)),a=pin.id===+$('pinA').value,b=pin.id===+$('pinB').value;ctx.fillStyle=a?'#d45340':b?'#247cb4':'#667e6b';ctx.beginPath();ctx.arc(p[0],p[1],6,0,7);ctx.fill();ctx.font='bold 13px sans-serif';ctx.textAlign='left';ctx.fillText(`${a?'A':b?'B':pin.id+1}`,p[0]+9,p[1]-8)}}
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!drag)return;angle+=(e.clientX-drag[0])*.008;tilt+=(e.clientY-drag[1])*.008;drag=[e.clientX,e.clientY];draw()};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.2,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw()};$('reset').onclick=()=>{angle=.35;tilt=.65;zoom=1;draw()};new ResizeObserver(draw).observe(canvas);
