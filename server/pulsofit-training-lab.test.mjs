import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext,Script} from "node:vm";

const original=readFileSync(new URL("./pulsofit-training-lab-ui.js",import.meta.url),"utf8");
const end=original.lastIndexOf("})();");
assert.ok(end>0,"Expected outer IIFE");
const code=original.slice(0,end)+"window.__test={build,opts,styles,items,validExercise};\n"+original.slice(end);
const window={};
runInNewContext(code,{
 window,document:{readyState:"loading",addEventListener(){}},location:{hash:"#/home"},
 sessionStorage:{getItem(){return null}},setTimeout(){},clearTimeout(){},
 setInterval(){},clearInterval(){},requestAnimationFrame(){},
 MutationObserver:class{},console
});
const {build,opts,styles,items,validExercise}=window.__test;
const byId=new Map(items.map(x=>[x[0],x]));
test("Exercícios e modalidades têm identificadores únicos",()=>{
 assert.equal(styles.length,10);
 assert.ok(items.length>=60);
 assert.equal(byId.size,items.length);
 for(const move of items){assert.ok(move[6].length>=20);assert.ok(move[7].length>=8)}
});
test("840 variações não repetem exercícios e respeitam filtros de equipamento, silêncio e impacto",()=>{
 let n=0;
 for(const style of styles.map(x=>x[0]))
 for(const gear of ["none","band","dumbbell","mat","step","gym","outdoors"])
 for(const energy of ["low","medium","high"])
 for(const minutes of [5,15,30,60]){
  Object.assign(opts,{style,gear,energy,minutes,level:"beginner",place:gear==="outdoors"?"outdoor":"home",quiet:true,lowImpact:true});
  const session=build();n++;
  assert.ok(session.selected.length>=2);
  assert.equal(new Set(session.selected).size,session.selected.length);
  assert.equal(session.minutePlan,minutes);
  for(const id of session.selected){assert.ok(byId.has(id));assert.equal(validExercise(byId.get(id)),true);assert.equal(byId.get(id)[4],0);assert.equal(byId.get(id)[5],0)}
 }
 assert.equal(n,840);
});
test("Backend e integração não sobrescrevem rotas de assinatura ou avaliação",()=>{
 const server=readFileSync(new URL("./pulsofit-training-lab.mjs",import.meta.url),"utf8");
 assert.ok(server.includes("/api/fitness/training-lab"));
 assert.ok(server.includes('"/api/me"'));
 assert.ok(server.includes("WHERE user_id=$1::uuid"));
 assert.ok(server.includes("UNIQUE(user_id,session_key)"));
 assert.ok(!server.includes("DELETE FROM pf_users"));
 new Script(original,{filename:"pulsofit-training-lab-ui.js"});
});
