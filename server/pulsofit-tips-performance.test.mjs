import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const push=readFileSync(new URL("./pulsofit-push-server.mjs",import.meta.url),"utf8");
const pushUI=readFileSync(new URL("./pulsofit-push-ui.js",import.meta.url),"utf8");
const performance=readFileSync(new URL("./pulsofit-private-features.mjs",import.meta.url),"utf8");
const performanceUI=readFileSync(new URL("./pulsofit-performance-ui.js",import.meta.url),"utf8");

const compact=source=>source.replace(/^import .*;\s*$/gm,"").replace(/import\.meta\.url/g,'"file:///mock.mjs"');

test("Módulos de notificações e análise de foto mantêm sintaxe válida",()=>{
 new Script(compact(push));
 new Script(compact(performance));
 new Script(pushUI);
 new Script(performanceUI);
});

test("Até 3 avisos seguros ao longo do dia, sem madrugada",()=>{
 const part=push.slice(push.indexOf(" function slotsFor("),push.indexOf(" async function dispatchReminders()"));
 const logic=new Function(part+"return {slotsFor,messageFor};")();
 const sub={reminder_hour:9,tips_per_day:3,first_name:"Ana",training:true,wellness:true,performance:true};
 const slots=logic.slotsFor(sub);
 assert.deepEqual(slots.map(s=>s.hour),[9,13,17]);
 const out=slots.map(slot=>logic.messageFor(3,"2026-11-18",sub,slot));
 assert.match(out[0].title,/Bom dia, Ana/);
 assert.match(out[1].title,/Boa tarde, Ana/);
 assert.ok(out[0].body.includes("Que tal hoje"));
 assert.match(out[2].body,/3 atividades/);
 for(const message of out){
  assert.ok(message.body.length>35);
  assert.ok(!/porcentagem de gordura|perca 10 kg amanhã/i.test(message.body));
 }
 const late=logic.slotsFor({...sub,reminder_hour:21,tips_per_day:3});
 assert.deepEqual(late.map(s=>s.hour),[21]);
 const once=logic.slotsFor({...sub,tips_per_day:1});
 assert.deepEqual(once.map(s=>s.hour),[9]);
});
test("Usuários existentes mantêm uma notificação diária até mudarem as preferências",()=>{
 assert.ok(push.includes("ADD COLUMN IF NOT EXISTS tips_per_day smallint NOT NULL DEFAULT 1"));
 assert.ok(push.includes("ADD COLUMN IF NOT EXISTS wellness boolean NOT NULL DEFAULT false"));
 assert.ok(push.includes("verifiedFirstName(req)"));
 assert.ok(push.includes("first_name=EXCLUDED.first_name"));
 assert.ok(pushUI.includes('id="pf-push-frequency"'));
 assert.ok(pushUI.includes('id="pf-push-wellness"'));
 assert.ok(pushUI.includes("tipsPerDay:selectedFrequency"));
});
test("Gemini recebe as próprias fotos, não fotos fictícias nem descrições de vestuário",()=>{
 assert.ok(performance.includes("photos.map(p=>({inline_data:{mime_type:p.mime,data:p.base64}}))"));
 assert.ok(performance.includes("Array.isArray(data?.images)?data.images:data?.image"));
 assert.ok(performance.includes("raw.length>3"));
 assert.ok(performance.includes("Não comente se a pessoa está vestida"));
 assert.ok(performance.includes("REGIÕES MUSCULARES VISÍVEIS"));
 assert.ok(performance.includes("SIMETRIA E ALINHAMENTO APARENTES"));
 assert.ok(performance.includes("não avaliável nas imagens"));
 assert.ok(!performance.includes("INSERT INTO pf_performance_photos"));
});
test("Performance aceita uma a três fotos, sem HTML arbitrário renderizado pela IA",()=>{
 assert.ok(performanceUI.includes('accept="image/*" multiple'));
 assert.ok(performanceUI.includes("selectedImages.length>1?{images:selectedImages}:{image:selectedImage}"));
 assert.ok(performanceUI.includes("renderPerformanceReport(report,d.analysis)"));
 assert.ok(performanceUI.includes("item.textContent="));
 assert.ok(performanceUI.includes("p.textContent="));
 assert.ok(!performanceUI.includes("report.innerHTML=d.analysis"));
});
