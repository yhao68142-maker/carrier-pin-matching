import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importLocal} from './static/local-import.mjs';
const file=()=>Object.assign(new Blob(['STEP']),{name:'sample.step'});
test('local failure never uploads and terminates the worker',async()=>{
 const old=globalThis.Worker,fetch=globalThis.fetch;let terminated=false;
 globalThis.fetch=()=>{throw Error('Unexpected upload')};
 globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onerror())}terminate(){terminated=true}};
 try{await assert.rejects(importLocal(file(),()=>{}),/文件未上传/);assert.ok(terminated)}finally{globalThis.Worker=old;globalThis.fetch=fetch}
});
test('local cancellation stops native work',async()=>{
 const old=globalThis.Worker,controller=new AbortController();let terminated=false;
 globalThis.Worker=class{postMessage(){controller.abort()}terminate(){terminated=true}};
 try{await assert.rejects(importLocal(file(),()=>{},{signal:controller.signal}),/取消/);assert.ok(terminated)}finally{globalThis.Worker=old}
});
test('successful local result reports completion after worker result',async()=>{
 const old=globalThis.Worker,states=[];
 globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:{type:'result',result:{pins:[]}}}))}terminate(){}};
 try{assert.deepEqual(await importLocal(file(),s=>states.push(s)),{pins:[]});assert.equal(states.at(-1).stage,'done')}finally{globalThis.Worker=old}
});
