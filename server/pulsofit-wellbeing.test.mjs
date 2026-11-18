import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";
const file=n=>readFileSync(new URL(n,import.meta.url),"utf8");
const catalogJS=file("./pulsofit-wellbeing-lessons.js");
const uiJS=file("./pulsofit-wellbeing-ui.js");
const menuJS=file("./pulsofit-mais-menu.js");
const bootJS=file("./pulsofit-plans-patch.mjs");
const context=createContext({window:{}});
new Script(catalogJS).runInContext(context);
const catalog=context.window.PulsoWellbeingLessons;
test("Catálogo de aulas e interface sintaticamente válidos",()=>{
 for(const src of [catalogJS,uiJS,menuJS])assert.doesNotThrow(()=>new Script(src));
});
test("Cada aula está vinculada ao vídeo na página pública oficial NHS",()=>{
 assert.ok(catalog.list.length>=12);
 const ids=new Set();
 for(const lesson of catalog.list){
  assert.ok(!ids.has(lesson.id),lesson.id);
  ids.add(lesson.id);
  assert.ok(lesson.title&&lesson.focus&&lesson.minutes>0,lesson.id);
  assert.match(lesson.url,/^https:\/\/www\.nhs\.uk\//,lesson.id);
  assert.match(lesson.source,/NHS/);
  if(lesson.video)assert.match(lesson.video,/^[A-Za-z0-9_-]{11}$/,lesson.id);
 }
});
test("Categorias incluem Pilates, dança, yoga, cardio, mobilidade e bem-estar",()=>{
 for(const id of ["pilates","dance","yoga","cardio","mobility","mindfulness","strength"]){
  assert.ok(catalog.list.some(x=>x.category===id),id);
  assert.ok(catalog.categories.some(x=>x.id===id),id);
 }
 assert.ok(catalog.list.filter(x=>x.category==="pilates").length>=3);
 assert.ok(catalog.list.filter(x=>x.category==="dance").length>=2);
});
test("Vídeo é incorporado apenas por ID oficial verificado e link abre fonte confiável",()=>{
 assert.match(uiJS,/youtube-nocookie\.com\/embed/);
 assert.match(uiJS,/item\.video&&\/\^\[A-Za-z0-9_-\]\{11\}\$\//);
 assert.match(uiJS,/www\.nhs\.uk/);
 assert.match(uiJS,/openExternal\(item\.url\)/);
 assert.ok(!uiJS.includes("canvas.toDataURL"));
 assert.ok(!uiJS.includes("youtube-dl"));
});
test("Conclusão é voluntária e local à conta autenticada, sem inventar resultado",()=>{
 assert.match(uiJS,/\/api\/me/);
 assert.match(uiJS,/pf-classes-/);
 assert.match(uiJS,/Concluí esta aula/);
 assert.match(uiJS,/aria-pressed/);
 assert.match(uiJS,/pulso-auth-ready/);
});
test("Aulas estão acessíveis em Mais e injetadas no build de produção",()=>{
 assert.match(menuJS,/Aulas de Pilates e Dança/);
 assert.match(menuJS,/pulso-open-wellbeing-classes/);
 assert.match(uiJS,/pulso-open-wellbeing-classes/);
 const catalogPos=bootJS.indexOf("pf-wellbeing-catalog");
 const uiPos=bootJS.indexOf("pf-wellbeing-classes");
 assert.ok(catalogPos>=0&&uiPos>catalogPos);
 assert.match(bootJS,/new JavaScriptSyntax\(wellbeingCatalogJS/);
 assert.match(bootJS,/new JavaScriptSyntax\(wellbeingUIJS/);
});
