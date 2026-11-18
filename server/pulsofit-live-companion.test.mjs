import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,runInNewContext} from "node:vm";
const paths=["pulsofit-live-companion.js","pulsofit-training-lab-ui.js","pulsofit-outdoor-ui.js",
 "pulsofit-push-sw.js","pulsofit-push-server.mjs","pulsofit-plans-patch.mjs"];
const source=Object.fromEntries(paths.map(p=>[p,readFileSync(new URL("./"+p,import.meta.url),"utf8")]));
test("Javascript do player, atividades e service worker é válido",()=>{
 for(const n of paths.filter(p=>p.endsWith(".js")))new Script(source[n],{filename:n});
});
test("HTML entregue no Render inclui player, estilos e acompanhamento",()=>{
 const s=source["pulsofit-plans-patch.mjs"];
 assert.ok(s.includes('pulsofit-live-companion.js'));
 assert.ok(s.includes('pulsofit-live-companion.css'));
 assert.ok(s.includes('new JavaScriptSyntax(companionJS'));
 assert.ok(s.includes('pf-live-companion-js'));
});
test("Treino Vivo informa início, progresso, pausa e fim",()=>{
 const s=source["pulsofit-training-lab-ui.js"];
 for(const action of ["start","update","pause","finish"])
  assert.ok(s.includes('liveEvent("'+action+'")'),"Missing "+action);
 assert.ok(s.includes("pulso-live-activity"));
});
test("GPS envia métricas agregadas e evita falsa continuidade no iPhone",()=>{
 const s=source["pulsofit-outdoor-ui.js"];
 for(const action of ["start","update","pause","resume","finish"])
  assert.ok(s.includes('companionEvent("'+action+'")'));
 assert.ok(s.includes("/iPad|iPhone|iPod/i.test(navigator.userAgent)"));
 assert.ok(!s.includes("detail:activity.points"));
});
test("Push em segundo plano exige conta e endpoint do dispositivo",()=>{
 const s=source["pulsofit-push-server.mjs"];
 assert.ok(s.includes("pf_push_active_workouts"));
 assert.ok(s.includes('currentUser(req)'));
 assert.ok(s.includes('url.pathname===prefix+"/activity"'));
 assert.ok(s.includes("AND endpoint=$2 AND enabled=true AND training=true"));
 assert.ok(s.includes("last_notified_at<now()-interval '3 minutes'"));
});
test("Arquivos pessoais ficam no navegador e playlists por conta",()=>{
 const s=source["pulsofit-live-companion.js"];
 assert.ok(s.includes('new Audio()'));
 assert.ok(s.includes('indexedDB.open("pulsofit-music-v1-"+id'));
 assert.ok(s.includes('db.transaction("tracks",mode)'));
 assert.ok(s.includes('input id="pf-companion-files"'));
});
test("Eventos alteram estado e duração sem inventar passos",()=>{
 const s=source["pulsofit-live-companion.js"];
 const inject=s.replace(/\}\)\(\);\s*$/,'window.__test={current:()=>workout};})();');
 assert.notEqual(inject,s,"Test injection");
 const handlers={},storage={getItem:()=>null,setItem(){},removeItem(){}};
 class FakeAudio{constructor(){this.volume=1;this.listeners={}} addEventListener(name,fn){this.listeners[name]=fn}
  pause(){} play(){return Promise.resolve()} }
 const win={__PULSO_LIVE_COMPANION__:false,addEventListener:(name,fn)=>handlers[name]=fn};
 const ctx={window:win,
  document:{readyState:"loading",addEventListener(){},getElementById(){return null}},
  Audio:FakeAudio,localStorage:storage,sessionStorage:storage,navigator:{},console,
  setInterval(){},URL,Date,JSON,Math,Promise};
 runInNewContext(inject,ctx);
 const send=detail=>handlers["pulso-live-activity"]({detail});
 send({action:"start",sessionKey:"workout-abc123",kind:"workout",title:"Treino Vivo",detail:"Flexão"});
 assert.equal(win.__test.current().state,"running");
 send({action:"pause",sessionKey:"workout-abc123"});
 assert.equal(win.__test.current().state,"paused");
 send({action:"resume",sessionKey:"workout-abc123"});
 assert.equal(win.__test.current().state,"running");
 send({action:"finish",sessionKey:"workout-abc123"});
 assert.equal(win.__test.current(),null);
});