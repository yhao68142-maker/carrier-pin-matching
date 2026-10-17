// Run after build_local_engine.py. Accept STEP paths without committing customer models.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {analyzeLocal} from './static/local-geometry.mjs';
globalThis.require=createRequire(import.meta.url);
globalThis.__dirname=fileURLToPath(new URL('./static/vendor/',import.meta.url));
const {default:init}=await import('./static/vendor/occt.mjs');
const oc=await init({wasmBinary:fs.readFileSync(new URL('./static/vendor/occt.wasm',import.meta.url)),print:()=>{},printErr:()=>{}});
for(const file of process.argv.slice(2)){
 const started=performance.now(),result=analyzeLocal(oc,fs.readFileSync(file));
 const reference=JSON.parse(fs.readFileSync(file+'.reference.json','utf8'));
 assert.equal(result.pins.length,reference.pins.length);
 for(let i=0;i<result.pins.length;i++)for(const k of ['x','y','diameter'])assert.ok(Math.abs(result.pins[i][k]-reference.pins[i][k])<1e-6,`${file} pin ${i} ${k}`);
 for(const k of ['length','width'])assert.ok(Math.abs(result.outer[k]-reference.outer[k])<1e-6,`${file} ${k}`);
 assert.ok(result.triangles.length>0&&result.triangles.length<=30000);
 console.log('PASS',file,Math.round(performance.now()-started)+'ms');
}
