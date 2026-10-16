import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api} from './static/api.mjs';
import {renderResults} from './static/results.mjs';
import {importModel,stageStep} from './static/import.mjs';

test('upload percentage comes from bytes; parsing uses stages until result arrives',async()=>{
 const oldXHR=globalThis.XMLHttpRequest,oldFetch=globalThis.fetch;const stages=[];
 try{
  globalThis.XMLHttpRequest=class{
   upload={};open(){}send(){this.upload.onprogress({lengthComputable:true,loaded:5,total:10});this.upload.onload();this.status=202;this.responseText='{"id":"abc"}';this.onload();}
  };
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/result')?{pins:[]}:{state:'done'}));
  assert.deepEqual(await importModel(new Blob(['STEP']),s=>stages.push(s)),{pins:[]});
  assert.ok(stages.some(s=>s.stage==='uploading'&&s.percent===50));
  assert.equal(stages.find(s=>s.stage==='receiving').percent,undefined);
  assert.equal(stages.find(s=>s.stage==='downloading').percent,undefined);
  assert.equal(stages.at(-1).percent,100);
  assert.equal(stageStep('outline'),3);
 }finally{globalThis.XMLHttpRequest=oldXHR;globalThis.fetch=oldFetch;}
});

test('ranking renders separate dimension status and escapes catalog text',()=>{
 const html=renderResults([{rank:1,code:'<script>',model:'test',x:'10',y:'20',deltaX:'0',deltaY:'1',passX:true,passY:false,qualified:false,complete:true,length:'180',width:'92',deltaLength:'0',deltaWidth:'0',passLength:true,passWidth:true,similarity:'97.62',raw:'10*20',sheet:'sheet',cell:'E3'}]);
 assert.match(html,/97.62%/);assert.match(html,/dimension-pass/);assert.match(html,/dimension-fail/);
 assert.match(html,/仍不符合公差/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

test('valid response, empty body, truncated body, and proxy errors',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('{"pins":[]}');
    assert.deepEqual(await api('/api/analyze'),{pins:[]});
    for(const body of ['', '{"pins":', '<html>starting</html>']) {
      globalThis.fetch=async()=>new Response(body);
      await assert.rejects(api('/api/analyze'),/结果为空或不完整/);
    }
    globalThis.fetch=async()=>new Response('',{status:502});
    await assert.rejects(api('/api/analyze'),/服务中断.*HTTP 502/);
    globalThis.fetch=async()=>new Response('{"detail":"服务器正在解析另一个模型"}',{status:503});
    await assert.rejects(api('/api/analyze'),/正在解析另一个模型/);
    globalThis.fetch=async()=>{throw new TypeError('Failed to fetch')};
    await assert.rejects(api('/api/analyze'),/连接中断/);
  } finally {globalThis.fetch=original;}
});
