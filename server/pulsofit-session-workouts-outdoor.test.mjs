import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,runInNewContext} from "node:vm";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const auth=read("./pulsofit-auth-ui.js");
const mais=read("./pulsofit-mais-menu.js");
const outdoorUI=read("./pulsofit-outdoor-ui.js");
const outdoorAPI=read("./pulsofit-outdoor-api.mjs");
const workouts=read("./pulsofit-training-lab-ui.js");
const training=read("./pulsofit-training-lab.mjs");

test("Sem erros de sintaxe JS e modules",()=>{
 for(const src of [auth,mais,outdoorUI,workouts])new Script(src);
 for(const src of [outdoorAPI,training])new Script(src.replace(/^import .*;\s*$/gm,""));
});
test("Token persiste por até 30 dias sem guardar senha; logout limpa armazenamento",()=>{
 const begin=auth.indexOf("const PULSO_REMEMBER_KEY=");
 const end=auth.indexOf("function overlay()",begin);
 assert.ok(begin>=0&&end>begin);
 const data={};
 const localStorage={getItem:k=>data[k]||null,setItem:(k,v)=>{data[k]=String(v)},removeItem:k=>{delete data[k]}};
 const sess={};const sessionStorage={getItem:k=>sess[k]||null,setItem:(k,v)=>{sess[k]=String(v)},removeItem:k=>{delete sess[k]}};
 const c={localStorage,sessionStorage,Date,atob};
 const fn=new Function("localStorage","sessionStorage","Date","atob",auth.slice(begin,end)+"return {token,saveRemember,clearRemember};");
 const x=fn(localStorage,sessionStorage,Date,atob);
 x.saveRemember("opaque-token-abc");
 assert.equal(x.token(),"opaque-token-abc");
 delete sess["pulso-fit-token"];
 assert.equal(x.token(),"opaque-token-abc");
 const row=JSON.parse(data["pulsofit-session-remember-v1"]);
 assert.ok(row.expiresAt-row.createdAt<=30*86400000);
 x.clearRemember();
 assert.equal(x.token(),"");
 assert.equal(data["pulsofit-session-remember-v1"],undefined);
 assert.ok(mais.includes('localStorage.removeItem("pulsofit-session-remember-v1")'));
 assert.ok(auth.includes("err.invalidAuth"));
 assert.ok(auth.includes("O servidor está temporariamente indisponível. Sua conta continuará salva no aparelho."));
});
test("Treinos exibem seis exercícios com filtros de nível e equipamento",()=>{
 const idx=workouts.lastIndexOf("})();");assert.ok(idx>0);
 const x={};
 runInNewContext(workouts.slice(0,idx)+"window.__check={items,opts,validExercise,byId};\n"+workouts.slice(idx),{
  window:x,document:{readyState:"loading",addEventListener(){}},
  sessionStorage:{getItem(){return null}},location:{hash:"#/home"},
  setInterval(){},clearInterval(){},setTimeout(){},requestAnimationFrame(){},console
 });
 const {items,opts,validExercise,byId}=x.__check;
 const added=["decline_pushup","diamond_pushup","pseudo_planche","bulgarian_squat","nordic_curl","chinup_supinated"];
 assert.ok(items.length>=73);
 for(const id of added)assert.ok(byId.has(id),"Missing "+id);
 Object.assign(opts,{level:"beginner",gear:"gym",quiet:false,lowImpact:false,energy:"medium"});
 for(const id of added)assert.equal(validExercise(byId.get(id)),false,id+" must be gated for beginners");
 Object.assign(opts,{level:"advanced",gear:"gym"});
 for(const id of added)assert.equal(validExercise(byId.get(id)),true,id+" should be available to advanced users");
 assert.ok(workouts.includes("function removeMovement("));
 assert.ok(workouts.includes("function showExercisePicker("));
 assert.ok(workouts.includes('data-pf-tv-remove'));
 assert.ok(workouts.includes('data-pf-tv-pick'));
});
test("GPS distinguishes approximate steps from actual stair counting",()=>{
 const idx=outdoorUI.lastIndexOf("})();");assert.ok(idx>0);
 const x={};
 runInNewContext(outdoorUI.slice(0,idx)+"window.__check={stepsEstimated,floorsEstimated,set:v=>activity=v};\n"+outdoorUI.slice(idx),{
  window:x,document:{readyState:"loading",addEventListener(){}},
  navigator:{},sessionStorage:{getItem(){return null}},location:{hash:"#/home"},
  setInterval(){},clearInterval(){},setTimeout(){},requestAnimationFrame(){},console
 });
 const u=x.__check;
 const sample={kind:"walk",distance:1500,strideM:.75,motionActive:false,motionSamples:0,motionSteps:0,ascent:15};
 u.set(sample);
 assert.equal(u.stepsEstimated().value,2000);
 assert.equal(u.floorsEstimated(),5);
 u.set({...sample,kind:"bike"});
 assert.equal(u.stepsEstimated(),null);
 assert.ok(outdoorUI.includes("DeviceMotionEvent.requestPermission()"));
 assert.ok(outdoorUI.includes("reg.showNotification("));
 assert.ok(outdoorUI.includes("pf-outdoor-live-widget"));
 assert.ok(outdoorUI.includes("a cada 5 minutos"));
});
test("Dados de passos e andares são validados e armazenados somente por conta",()=>{
 assert.ok(outdoorAPI.includes("ADD COLUMN IF NOT EXISTS estimated_steps integer"));
 assert.ok(outdoorAPI.includes("ADD COLUMN IF NOT EXISTS floors_equivalent smallint"));
 assert.ok(outdoorAPI.includes("step_source"));
 assert.ok(outdoorAPI.includes("WHERE id=$1::uuid AND user_id=$2::uuid"));
 assert.ok(outdoorAPI.includes("Passos estimados")||outdoorAPI.includes("passos"));
 assert.ok(!outdoorAPI.includes("A PWA mediu escadas reais"));
});
