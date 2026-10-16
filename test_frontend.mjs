import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api} from './static/api.mjs';

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
