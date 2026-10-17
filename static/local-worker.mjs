import init from './vendor/occt.mjs';
import {analyzeLocal} from './local-geometry.mjs';
self.onmessage=async({data})=>{
 const report=(stage,message)=>self.postMessage({type:'progress',state:{stage,message}});
 try{
  report('engine','正在加载本地 CAD 引擎（首次需要下载，随后可缓存）');
  const response=await fetch('/local-engine/b5ff984.wasm',{cache:'force-cache'});
  if(!response.ok)throw Error('本地 CAD 引擎下载失败，请检查网络后重试');
  const oc=await init({wasmBinary:await response.arrayBuffer(),print:()=>{},printErr:()=>{}});
  const result=analyzeLocal(oc,new Uint8Array(data),report);
  self.postMessage({type:'result',result});
 }catch(e){self.postMessage({type:'error',message:typeof e?.message==='string'?e.message:'本机 CAD 解析失败，可能为内存不足或模型不兼容。'})}
};
