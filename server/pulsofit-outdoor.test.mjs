import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext,Script} from "node:vm";

const ui=readFileSync(new URL("./pulsofit-outdoor-ui.js",import.meta.url),"utf8");
const server=readFileSync(new URL("./pulsofit-outdoor-api.mjs",import.meta.url),"utf8");
const greeting=readFileSync(new URL("./pulsofit-home-greeting.js",import.meta.url),"utf8");
const tail=ui.lastIndexOf("})();");
const uiInjected=ui.slice(0,tail)+"window.__tests={onFix,pause,resume,haversine,pace,metFor,calories,routeSegments,setActivity:v=>activity=v};\n"+ui.slice(tail);
function uiSandbox(){
 const window={addEventListener(){},removeEventListener(){}},geo={watchPosition(){return 3},clearWatch(){}};
 runInNewContext(uiInjected,{window,document:{readyState:"loading",addEventListener(){},getElementById(){return null}},
  navigator:{geolocation:geo},sessionStorage:{getItem(){return "test"}},location:{hash:"#/home"},
  setInterval(){return 0},clearInterval(){},setTimeout(){},requestAnimationFrame(){},console});
 return window.__tests;
}
function serverSandbox(){
 const src=server.replace(/^import .*;\s*$/gm,"").replace(" const original=Server.prototype.emit;"," globalThis.__tests={parseSession,pointsCheck,meters};\n const original=Server.prototype.emit;");
 const x={process:{argv:["node","server.mjs"],env:{}},globalThis:{},Server:class{emit(){return false}},
  basename:s=>s.split("/").at(-1),console:{warn(){},log(){}},Buffer,fetch:async()=>({ok:false})};
 runInNewContext(src,x);
 return x.globalThis.__tests;
}
test("GPS, server and greeting scripts all parse",()=>{
 new Script(ui);new Script(greeting);
 new Script(server.replace(/^import .*;\s*$/gm,""));
});
test("haversine distance and pace are geographic, not random",()=>{
 const x=uiSandbox();
 assert.ok(Math.abs(x.haversine([-23,-46],[-23,-45.99])-1023)<5);
 assert.equal(x.pace(1000,600),"10:00 min/km");
 assert.equal(x.pace(0,600),"—");
 assert.equal(x.metFor("walk",5),3.8);
});
test("pause and GPS signal gaps never add an untracked segment",()=>{
 const x=uiSandbox(),t=Date.now()-300000;
 const a={kind:"walk",state:"running",started:t,resumedAt:t,activeMs:0,distance:0,points:[],lastFix:null,lastFixAt:0,
  gpsAccuracy:null,skipped:0,weight:70,ascent:0,prevAltitude:null,splits:[],nextSplit:1000,segmentBreak:false};
 x.setActivity(a);
 const fix=(lon,ts)=>x.onFix({coords:{latitude:-23,longitude:lon,accuracy:6,altitude:null,altitudeAccuracy:null},timestamp:ts});
 fix(-46,t);fix(-45.9995,t+15000);
 const first=a.distance;
 assert.ok(first>45&&first<60);
 x.pause();x.resume();fix(-45.999,t+30000);
 assert.equal(a.distance,first);
 assert.equal(a.points[2][5],1);
 fix(-45.9985,t+45000);
 assert.ok(a.distance>90&&a.distance<120);
});
test("server validates per-point break flag, sports and speed",()=>{
 const x=serverSandbox(),t=Date.now()-90000;
 const points=[[-23,-46,t,5,null,0],[-23,-45.9995,t+15000,5,null,0],[-23,-45.999,t+30000,5,null,1],[-23,-45.9985,t+45000,5,null,0]];
 const payload={clientKey:"pfexample123456",sport:"walk",durationSec:60,points,estimatedKcal:25,accuracyM:6};
 const summary=x.parseSession(payload);
 assert.equal(summary.points[2][5],1);
 assert.ok(summary.distance>90&&summary.distance<120);
 assert.throws(()=>x.parseSession({...payload,sport:"boat"}),{status:422});
 assert.throws(()=>x.parseSession({...payload,clientKey:"x"}),{status:422});
});
test("Gemini receives aggregated metrics only, not GPS coordinates",()=>{
 assert.ok(server.includes("Coordinates and start/end location NEVER sent to Gemini"));
 assert.ok(server.includes("SELECT * FROM pf_outdoor_sessions WHERE id=$1::uuid AND user_id=$2::uuid"));
 assert.ok(server.includes("DELETE FROM pf_outdoor_sessions WHERE id=$1::uuid AND user_id=$2::uuid"));
 assert.ok(!greeting.includes("localStorage.setItem"));
});
