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
test("Catálogo e interface válidos",()=>{
 for(const src of [catalogJS,uiJS,menuJS])assert.doesNotThrow(()=>new Script(src));
});
test("As 13 aulas têm um ID único de vídeo real para o player interno",()=>{
 assert.equal(catalog.list.length,13);
 const ids=new Set(),videos=new Set();
 for(const lesson of catalog.list){
  assert.ok(!ids.has(lesson.id),lesson.id);ids.add(lesson.id);
  assert.ok(lesson.title&&lesson.minutes>0&&lesson.source&&lesson.focus,lesson.id);
  assert.match(lesson.url,/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  assert.match(lesson.video,/^[A-Za-z0-9_-]{11}$/);
  assert.ok(!videos.has(lesson.video),"Cada aula deve ter instrutor e gravação próprios: "+lesson.id);
  videos.add(lesson.video);
  assert.match(lesson.url,new RegExp(lesson.video+"$"));
 }
});
test("Cada categoria tem pelo menos uma aula com vídeo",()=>{
 for(const id of ["pilates","dance","yoga","cardio","mobility","mindfulness","strength"]){
  assert.ok(catalog.list.some(x=>x.category===id),id);
  assert.ok(catalog.categories.some(x=>x.id===id),id);
 }
 assert.ok(catalog.list.filter(x=>x.category==="pilates").length>=3);
 assert.ok(catalog.list.filter(x=>x.category==="dance").length>=2);
});
test("O player é incorporado ao PulsoFit, nunca abre janela externa",()=>{
 assert.ok(!uiJS.includes("window.open("));
 assert.ok(!uiJS.includes('target="_blank"'));
 assert.ok(!uiJS.includes("classLink("));
 assert.match(uiJS,/https:\/\/www\.youtube\.com/);
 assert.match(uiJS,/https:\/\/www\.youtube-nocookie\.com/);
 assert.match(uiJS,/frame\.allowFullscreen=true|player\.allowFullscreen=true/);
 assert.match(uiJS,/searchParams\.set\("playsinline","1"\)/);
 assert.match(uiJS,/searchParams\.set\("origin",location\.origin\)/);
 assert.match(uiJS,/referrerPolicy="strict-origin-when-cross-origin"/);
 assert.match(uiJS,/enablejsapi/);
 assert.match(uiJS,/stage\.appendChild\(player\)/);
 assert.match(uiJS,/Assistir aqui no PulsoFit/);
 assert.match(uiJS,/Reiniciar vídeo nesta tela/);
 assert.match(uiJS,/Testar outro player nesta tela/);
 assert.match(uiJS,/showInAppVideo\(item,stage,playerHost===0\?1:0\)/);
});
test("Safari/iPhone: exige origem HTTPS, toque explícito e retorno dentro do app",()=>{
 assert.match(uiJS,/referrerPolicy="strict-origin-when-cross-origin"/);
 assert.match(uiJS,/url\.searchParams\.set\("autoplay","0"\)/);
 assert.match(uiJS,/url\.searchParams\.set\("playsinline","1"\)/);
 assert.match(uiJS,/url\.searchParams\.set\("widget_referrer",location\.origin\+"\/"\)/);
 assert.match(uiJS,/event\.source!==activeFrame\.contentWindow/);
 assert.match(uiJS,/onReady/);
 assert.match(uiJS,/onStateChange/);
 assert.match(uiJS,/onAutoplayBlocked/);
 assert.match(uiJS,/playerHost===0/);
 assert.match(uiJS,/showInAppVideo\(item,stage,1\)/);
 assert.match(uiJS,/unavailableVideos\.add\(item\.id\)/);
 assert.match(uiJS,/frameErrorTimer=setTimeout/);
 assert.ok(!uiJS.includes("window.open("));
});
test("Não tenta contornar restrições: erro sugere outra aula no próprio app",()=>{
 assert.match(uiJS,/function videoPlayerMessage/);
 assert.match(uiJS,/onError/);
 assert.match(uiJS,/101,150,153/);
 assert.match(uiJS,/Tentar outra aula/);
 assert.match(uiJS,/function nextLesson\(item\)/);
 assert.match(uiJS,/function stopVideo/);
 assert.match(uiJS,/frameErrorTimer/);
 assert.ok(!uiJS.includes("youtube-dl"));
});
test("Conclusão e favoritos são vinculados à conta",()=>{
 assert.match(uiJS,/\/api\/me/);
 assert.match(uiJS,/pf-classes-/);
 assert.match(uiJS,/Concluí esta aula/);
 assert.match(uiJS,/aria-pressed/);
 assert.match(uiJS,/pulso-auth-ready/);
});
test("Menu Mais e build servem os módulos na ordem correta",()=>{
 assert.match(menuJS,/Aulas de Pilates e Dança/);
 assert.match(menuJS,/pulso-open-wellbeing-classes/);
 assert.match(uiJS,/pulso-open-wellbeing-classes/);
 const catalogPos=bootJS.indexOf("pf-wellbeing-catalog");
 const uiPos=bootJS.indexOf("pf-wellbeing-classes");
 assert.ok(catalogPos>=0&&uiPos>catalogPos);
 assert.match(bootJS,/new JavaScriptSyntax\(wellbeingCatalogJS/);
 assert.match(bootJS,/new JavaScriptSyntax\(wellbeingUIJS/);
});
