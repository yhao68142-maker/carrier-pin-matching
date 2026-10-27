const VERSION='offline-v1';
const CACHE='carrier-offline-'+VERSION, META='carrier-offline-settings';
const ASSETS=['/','/static/style.css','/static/app.js','/static/offline.mjs','/static/ranking.mjs','/static/lib/decimal.mjs','/static/lib/decimal-LICENCE.md','/static/local-import.mjs','/static/local-worker.mjs','/static/local-geometry.mjs','/static/import.mjs','/static/api.mjs','/static/results.mjs','/static/vendor/occt.mjs','/local-engine/b5ff984.wasm','/api/catalog','/static/third-party.html','/static/vendor/LICENSE.opencascade.txt'];
const MARK='/__offline_ready__',MODE='/__offline_mode__';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function state(){const cache=await caches.open(CACHE),r=await cache.match(MARK),meta=await caches.open(META),m=await meta.match(MODE);return {ready:!!r,savedAt:r?await r.text():null,enabled:!!m&&!!r,version:VERSION}}
let preparing=null;
async function prepare(send){
 const current=await state();if(current.ready)return current;
 try{
  const cache=await caches.open(CACHE);
  for(let i=0;i<ASSETS.length;i++){
   const url=ASSETS[i],response=await fetch(new Request(url,{cache:'reload'}));
   if(!response.ok)throw Error('离线资源下载失败，请保持联网后重试。');
   if(url==='/api/catalog'){const rows=await response.clone().json();if(!Array.isArray(rows)||!rows.length)throw Error('尺寸库下载不完整')}
   await cache.put(url,response);send({progress:Math.round((i+1)/ASSETS.length*100)});
  }
  await cache.put(MARK,new Response(new Date().toISOString()));return state();
 }catch(e){await caches.delete(CACHE);throw e}
}
self.addEventListener('message',event=>{
 const port=event.ports[0];if(!port)return;
 const send=data=>port.postMessage(data);
 event.waitUntil((async()=>{try{
  if(event.data.type==='prepare'){
   if(preparing)throw Error('正在准备离线资源，请等待完成。');
   preparing=prepare(send);try{send({done:await preparing})}finally{preparing=null}
  }else if(event.data.type==='mode'){
   const s=await state();if(event.data.enabled&&!s.ready)throw Error('请先完成离线准备');
   const meta=await caches.open(META);if(event.data.enabled)await meta.put(MODE,new Response('1'));else await meta.delete(MODE);
   send({done:await state()});
  }else send({done:await state()});
 }catch(e){send({error:e.message||'离线准备失败，可能是存储空间不足。'})}})());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const s=await state(),cache=await caches.open(CACHE);
  const hit=event.request.method==='GET'?await cache.match(event.request.mode==='navigate'?'/':url.pathname):null;
  if(s.enabled){if(hit)return hit;return new Response('离线模式无法访问此功能，请切回联网模式。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
  try{return await fetch(event.request)}catch(e){if(hit)return hit;throw e}
 })());
});
