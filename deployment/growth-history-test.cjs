'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('deployment/argus-growth.js','utf8');
const a=src.indexOf('function historyPager('),b=src.indexOf(' async function health(){',a);
assert(a>=0&&b>a);
const pager=new Function(src.slice(a,b)+'; return historyPager;')();
(async()=>{
 let requests=0,release;const ids=[];const states=[];
 const load=pager(async cursor=>{requests++;if(requests===1){await new Promise(r=>release=r);return {items:[{id:'a'}],next_cursor:'one'};}assert.equal(cursor,'one');return {items:[{id:'a'},{id:'b'}],next_cursor:null};},e=>ids.push(e.id),(busy,done)=>states.push([busy,done]));
 const first=load();await load();assert.equal(requests,1);release();await first;
 await Promise.all([load(),load()]);await load();
 assert.equal(requests,2);assert.deepEqual(ids,['a','b']);assert.deepEqual(states.at(-1),[false,true]);
 let tries=0;const retry=pager(async()=>{if(++tries===1)throw Error('fixture');return {items:[],next_cursor:null};},()=>{},()=>{});
 await assert.rejects(retry());await retry();assert.equal(tries,2);
 console.log('PASS: history single-flight, deduplication, final page and retry after failure.');
})().catch(e=>{console.error(e);process.exitCode=1;});
