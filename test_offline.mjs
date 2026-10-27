import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {rankLocally} from './static/ranking.mjs';
test('local matching retains exact tolerance boundaries and missing-data status',()=>{
 const records=[{x:'117.5',y:'24',length:'180',width:'92'},{x:'117.5',y:'24',length:null,width:null}];
 const query={x:'117.51',y:'23.99',length:'180.01',width:'91.99'};
 assert.equal(rankLocally(records,query)[0].qualified,true);
 assert.equal(rankLocally(records,{...query,x:'117.5100000000001'})[0].qualified,false);
 assert.equal(rankLocally(records,query)[1].rank,null);
 assert.throws(()=>rankLocally(records,{...query,x:'NaN'}));
});
function harness(){
 const events={},stores=new Map();let calls=0,fail=false;
 const key=x=>new URL(typeof x==='string'?x:x.url,'https://test.local').pathname;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const s=stores.get(name);return {async match(k){return s.get(key(k))?.clone()},async put(k,r){s.set(key(k),new Response(await r.arrayBuffer(),{status:r.status,headers:r.headers}))},async delete(k){return s.delete(key(k))}}},async delete(n){return stores.delete(n)}};
 const scope={location:{origin:'https://test.local'},addEventListener:(n,fn)=>events[n]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 class LocalRequest extends Request{constructor(url,opts){super(new URL(url,'https://test.local'),opts)}}
 vm.runInNewContext(fs.readFileSync('static/offline-sw.js','utf8'),{self:scope,caches,URL,Response,Request:LocalRequest,Date,fetch:async req=>{calls++;if(fail)throw Error('network offline');return new Response(key(req)==='/api/catalog'?'[{"x":"1"}]':'cached-content')}});
 return {calls:()=>calls,fail:v=>fail=v,async message(type,extra={}){let task,last;events.message({data:{type,...extra},ports:[{postMessage:r=>last=r}],waitUntil:p=>task=p});await task;return last},async fetch(path,method='GET'){let task;events.fetch({request:{url:'https://test.local'+path,method,mode:path==='/'?'navigate':'cors'},respondWith:p=>task=p});return task}};
}
test('offline preparation is complete before enabling; offline requests never reach network',async()=>{
 const h=harness();assert.match((await h.message('mode',{enabled:true})).error,/准备/);
 h.fail(true);assert.ok((await h.message('prepare')).error);assert.equal((await h.message('status')).done.ready,false);
 h.fail(false);assert.equal((await h.message('prepare')).done.ready,true);await h.message('mode',{enabled:true});
 h.fail(true);const calls=h.calls();assert.equal((await h.fetch('/')).status,200);assert.equal((await h.fetch('/static/app.js?v=anything')).status,200);assert.equal((await h.fetch('/local-engine/b5ff984.wasm')).status,200);assert.equal((await h.fetch('/api/jobs','POST')).status,503);assert.equal(h.calls(),calls);
 await h.message('mode',{enabled:false});assert.equal((await h.fetch('/')).status,200);assert.equal(h.calls(),calls+1);
});
