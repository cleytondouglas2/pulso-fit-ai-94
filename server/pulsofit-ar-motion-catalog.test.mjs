import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const catalogJS=read("./pulsofit-ar-exercise-catalog.js");
const motionJS=read("./pulsofit-ar-motion-engine.js");
const cameraJS=read("./pulsofit-camera-ar.js");
const cartoonJS=read("./pulsofit-cartoon-ar.js");
const trainingJS=read("./pulsofit-training-lab-ui.js");
const bootJS=read("./pulsofit-plans-patch.mjs");
const context=createContext({window:{},document:{readyState:"loading",addEventListener(){}}});
for(const s of [catalogJS,motionJS])new Script(s).runInContext(context);
const catalog=context.window.PulsoARExercises;
const motions=context.window.PulsoARMotions;
const live=trainingJS.slice(trainingJS.indexOf("var items=["),trainingJS.indexOf("\n];",trainingJS.indexOf("var items=[")));
const liveRecords=[...live.matchAll(/^\s*\["([^"]+)","([^"]+)"/gm)].map(m=>({id:m[1],label:m[2]}));

test("Scripts carregam sem erros e em ordem de dependência",()=>{
 for(const [name,script] of Object.entries({catalogJS,motionJS,cameraJS,cartoonJS}))assert.doesNotThrow(()=>new Script(script,{filename:name}));
 assert.ok(bootJS.indexOf("pf-ar-exercise-catalog-js")<bootJS.indexOf("pf-camera-ar-js"));
 assert.ok(bootJS.indexOf("pf-ar-motions-js")<bootJS.indexOf("pf-cartoon-ar-js"));
 assert.match(bootJS,/new JavaScriptSyntax\(exerciseCatalogJS/);
 assert.match(bootJS,/new JavaScriptSyntax\(motionAnimationsJS/);
});
test("Todos os 73 exercícios existentes têm nomes e IDs no catálogo",()=>{
 assert.equal(liveRecords.length,73);
 const ids=new Set();
 for(const r of liveRecords){
  assert.equal(catalog.byId(r.id)?.label,r.label,r.id);
  assert.equal(catalog.resolve(r.id)?.id,r.id,r.id+" id");
  assert.equal(catalog.resolve(r.label)?.id,r.id,r.label+" nome");
  assert.ok(!ids.has(r.id));ids.add(r.id);
 }
 assert.ok(catalog.list.length>=73);
});
test("Alguns nomes parecidos preservam o exercício correto, não viram polichinelo",()=>{
 const cases=[
  ["Agachamento búlgaro (pernas)","bulgarian_squat"],
  ["Flexão nórdica assistida (posterior de coxa)","nordic_curl"],
  ["Flexão diamante (peito e tríceps)","diamond_pushup"],
  ["Flexão declinada (peito)","decline_pushup"],
  ["Flexão pseudo planche (peito, ombros e core)","pseudo_planche"],
  ["Barra fixa supinada (bíceps e costas)","chinup_supinated"],
  ["Polichinelo sem salto","low_jack"],
  ["Rosca bíceps","curl"],
  ["Prancha lateral adaptada","side_plank"]
 ];
 for(const [name,id] of cases)assert.equal(catalog.resolve(name)?.id,id,name);
 assert.equal(catalog.resolve("Movimento desconhecido intergaláctico"),null);
 assert.ok(!cameraJS.includes('return "squat";'));
});
function motionRig(){
 const joint=()=>({rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}}});
 const body=()=>({
  ...joint(),
  position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}},
  scale:{x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z}}
 });
 return {body:body(),head:joint(),arms:[joint(),joint()],elbows:[joint(),joint()],legs:[joint(),joint()],knees:[joint(),joint()]};
}
function signature(rig){
 const b=rig.body;const arr=[b.position.x,b.position.y,b.position.z,b.rotation.x,b.rotation.y,b.rotation.z,b.scale.x,b.scale.y,b.scale.z,
 ...[rig.head,...rig.arms,...rig.elbows,...rig.legs,...rig.knees].flatMap(j=>[j.rotation.x,j.rotation.y,j.rotation.z])];
 return arr.map(x=>Number(x.toFixed(5)));
}
test("O motor cobre todos os 73 e apresenta movimento variável",()=>{
 const failures=[];
 for(const item of liveRecords){
  const rig=motionRig();
  if(!motions.supported(item.id)||!motions.apply(rig,item.id,200))failures.push(item.id+" unsupported");
  const before=signature(rig);
  motions.apply(rig,item.id,1025);
  if(JSON.stringify(before)===JSON.stringify(signature(rig)))failures.push(item.id+" static");
 }
 assert.deepEqual(failures,[],"Faltam poses visíveis para "+failures.join(", "));
 assert.equal(motions.apply(motionRig(),"unknown-id",500),false);
});
test("Movimentos diferentes usam articulações distintas",()=>{
 const a=motionRig(),b=motionRig(),c=motionRig(),d=motionRig();
 motions.apply(a,"jump_jack",635);motions.apply(b,"nordic_curl",1800);
 motions.apply(c,"chinup_supinated",1400);motions.apply(d,"body_squat",900);
 assert.notDeepEqual(signature(a),signature(b));
 assert.notDeepEqual(signature(b),signature(c));
 assert.ok(Math.abs(a.arms[0].rotation.z)>.4,"Polichinelo move braços lateralmente");
 assert.ok(Math.abs(c.arms[0].rotation.z)>2,"Barra levanta braços");
 assert.ok(Math.abs(d.knees[0].rotation.x)>.4,"Agachamento dobra joelho");
 const low=motionRig();motions.apply(low,"low_jack",790);
 assert.ok(Math.abs(low.body.position.y)<.005,"Polichinelo sem salto não pula");
});
test("A troca de exercício recalcula poses e equipamento no mesmo avatar",()=>{
 assert.match(cameraJS,/exerciseMenu\(\)/);
 assert.match(cameraJS,/catalog\?\.resolve\(value\)/);
 assert.match(cameraJS,/pulso-ar-exercise-selected/);
 assert.match(cartoonJS,/PulsoARMotions\?\.apply\(actor\.userData,activeExercise,ms\)/);
 assert.match(cartoonJS,/function selectMotion\(id,label\)/);
 assert.match(cartoonJS,/updateEquipment\(id\)/);
 assert.match(cartoonJS,/pulso-ar-exercise-selected/);
 assert.match(cartoonJS,/🎯 Executando:/);
 assert.match(motionJS,/equipmentById/);
});
test("Integração Treino Vivo envia a identidade correta do exercício",()=>{
 assert.match(trainingJS,/pulso-open-camera-ar/);
 assert.match(trainingJS,/id:e\[0\]/);
});
