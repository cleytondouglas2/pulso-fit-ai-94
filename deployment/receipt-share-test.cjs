const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('deployment/transaction-receipts.js','utf8');
const a=src.indexOf('async function shareReceipt('),b=src.indexOf('function render(',a);
const share=new Function(src.slice(a,b)+';return shareReceipt;')();
class FakeFile{constructor(parts,name,opts){this.name=name;this.type=opts.type}}
(async()=>{
 for(const [mode,want] of [['url','shared'],['text','shared'],['file','file-only'],['none','fallback'],['cancel','cancelled'],['error','fallback']]){
  const calls=[];const nav={canShare:p=>mode==='none'?false:mode==='text'?!p.url:mode==='file'?!p.url&&!p.text:true,share:async p=>{calls.push(p);if(mode==='cancel'||mode==='error')throw {name:mode==='cancel'?'AbortError':'NotAllowedError'}}};
  assert.equal(await share({},nav,FakeFile),want);
  for(const p of calls){assert.equal(p.files[0].name,'ArgusPay.pdf');assert.equal(p.files[0].type,'application/pdf');assert.ok(!p.url||p.url==='https://app.arguspay.com.br/conta#cadastro');assert.ok(!p.text||p.text.includes('#cadastro'));}
 }
 assert.equal(await share({}, {},FakeFile),'fallback');
 console.log('PASS: native share URL/text/file-only, cancellation, denied share and unsupported browser fallback (simulated APIs).');
})().catch(e=>{console.error(e);process.exit(1)});
