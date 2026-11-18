import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {normalizeMeal} from "./pulsofit-meal-assess.mjs";

const api=readFileSync(new URL("./pulsofit-meal-assess.mjs",import.meta.url),"utf8");
const ui=readFileSync(new URL("./pulsofit-meal-ui.js",import.meta.url),"utf8");
const menu=readFileSync(new URL("./pulsofit-mais-menu.js",import.meta.url),"utf8");
const injector=readFileSync(new URL("./pulsofit-plans-patch.mjs",import.meta.url),"utf8");
const runtime=readFileSync(new URL("./misticpay-runtime.mjs",import.meta.url),"utf8");

test("interface de análise da refeição tem JavaScript válido",()=>{
 new Script(ui);new Script(menu);
});
test("avaliação retorna calorias e macronutrientes dos alimentos identificados",()=>{
 const meal=normalizeMeal({foods:[
  {name:"Arroz",grams:110,calories:145,proteinG:3,carbsG:31,fatG:0.3},
  {name:"Frango",grams:130,calories:216,proteinG:40,carbsG:0,fatG:5}],
  opinion:"Boa fonte de proteína.",improvements:["Acrescente vegetais."],uncertainty:"Peso estimado."});
 assert.equal(meal.foods.length,2);assert.equal(meal.totals.calories,361);
 assert.equal(meal.totals.proteinG,43);assert.equal(meal.totals.carbsG,31);
 assert.equal(meal.totals.fatG,5.3);assert.equal(meal.estimateOnly,true);
});
test("foto ilegível não pode produzir avaliação de calorias zeradas",()=>{
 assert.throws(()=>normalizeMeal({foods:[]}),/identificar alimentos/);
 assert.throws(()=>normalizeMeal({foods:[{name:"Arroz",calories:0}]}),/calorias/);
});
test("valores nutricionais inválidos são rejeitados",()=>{
 assert.throws(()=>normalizeMeal({foods:[{name:"Prato",calories:-1}]}));
 assert.throws(()=>normalizeMeal({foods:[{name:"Prato",calories:"x"}]}));
});
test("imagem é enviada à IA apenas pela conta autenticada sem persistência",()=>{
 assert.ok(api.includes('"/api/ai/meal/assess"'));
 assert.ok(api.includes('"/api/me"'));
 assert.ok(api.includes('new Map()'));
 assert.ok(api.includes("inlineData"));
 assert.ok(!api.includes("writeFileSync"));
 assert.ok(!api.includes("INSERT INTO"));
 assert.match(ui,/id="pf-meal-file"/);
 assert.match(ui,/capture|type="file"/);
 assert.match(ui,/id="pf-meal-result"/);
});
test("acesso ao prato está em Mais e frontend carregado no HTML",()=>{
 assert.ok(menu.includes('"meal","🥗","Avaliar meu prato"'));
 assert.ok(menu.includes("pulso-open-meal"));
 assert.ok(injector.includes('pf-meal-assessment-20261118'));
 assert.ok(injector.includes('new JavaScriptSyntax(mealJS'));
 assert.ok(runtime.includes('import "./pulsofit-meal-assess.mjs"'));
});
test("reinício de 7 dias grátis é único, específico da conta e não muda o Pix",()=>{
 assert.ok(runtime.includes('PULSO_TRIAL_RESET_EMAIL_ONCE'));
 assert.ok(runtime.includes('PULSO_TRIAL_RESET_ID_ONCE'));
 assert.ok(runtime.includes('lower(email)=lower($2)'));
 assert.ok(runtime.includes('ON CONFLICT(reset_id) DO NOTHING'));
 assert.ok(runtime.includes('pf_billing_trials(user_id,started_at)'));
 assert.ok(!runtime.includes('UPDATE pf_billing_orders SET status'));
});