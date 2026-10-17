const VERSION='local-occt-b5ff984-v1';
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('carrier-local-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('results',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function cached(key){try{const db=await database();return await new Promise(resolve=>{const tx=db.transaction('results'),r=tx.objectStore('results').get(key);r.onsuccess=()=>resolve(r.result?.result);r.onerror=()=>resolve(null);tx.oncomplete=()=>db.close()})}catch{return null}}
async function save(key,result){try{const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('results','readwrite'),s=tx.objectStore('results');s.put({key,result,time:Date.now()});const all=s.getAll();all.onsuccess=()=>all.result.sort((a,b)=>b.time-a.time).slice(5).forEach(v=>s.delete(v.key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{/* A blocked/full cache must not prevent measurement. */}}
export async function clearLocalCache(){const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('results','readwrite');tx.objectStore('results').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
export async function importLocal(file,report,{signal}={}){
 if(!/\.(step|stp)$/i.test(file.name))throw Error('请选择 STEP/STP 文件');
 if(!file.size||file.size>50*1024*1024)throw Error('文件为空或超过 50 MB');
 if(!globalThis.Worker||!globalThis.WebAssembly||!globalThis.crypto?.subtle)throw Error('当前浏览器不支持本地计算，请更换新版浏览器或手动选择云端解析');
 report({stage:'localread',message:'读取本机文件并核对缓存'});
 const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes),key=VERSION+':'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
 if(signal?.aborted)throw Error('已取消本地计算');
 const hit=await cached(key);if(signal?.aborted)throw Error('已取消本地计算');if(hit){report({stage:'done',message:'加载完成 · 已复用本机缓存，文件未上传'});return hit}
 const result=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./local-worker.mjs',import.meta.url),{type:'module'});
  const finish=(err,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();err?reject(err):resolve(value)};
  const abort=()=>finish(Error('已取消本地计算'));
  const timer=setTimeout(()=>finish(Error('本地计算超过五分钟，已停止。可以手动选择云端解析。')),300000);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>finish(Error('本地计算引擎未能运行，可能为内存不足、浏览器限制或下载失败。文件未上传，可手动选择云端解析。'));
  worker.onmessage=({data})=>{if(data.type==='progress')report(data.state);else if(data.type==='result')finish(null,data.result);else if(data.type==='error')finish(Error(data.message))};
  worker.postMessage(bytes,[bytes]);
 });
 await save(key,result);report({stage:'done',message:'加载完成 · 本机计算，文件未上传'});return result;
}
