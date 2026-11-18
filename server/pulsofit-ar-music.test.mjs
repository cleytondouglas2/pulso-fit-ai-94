import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";
import {SUPPORTED_AR_EXERCISES,validateARExercise} from "./pulsofit-ar-coach.mjs";

const file=s=>readFileSync(new URL(s,import.meta.url),"utf8");
const ar=file("./pulsofit-camera-ar.js");
const music=file("./pulsofit-provider-playlists.js");
const paid=file("./pulsofit-active-plan-cleanup.js");
const coach=file("./pulsofit-coach-consent-ui.js");
const menu=file("./pulsofit-mais-menu.js");
const patch=file("./pulsofit-plans-patch.mjs");
const runtime=file("./misticpay-runtime.mjs");
const trainer=file("./pulsofit-training-lab-ui.js");

test("Scripts de câmera, players e limpeza de plano são válidos",()=>{
 for(const [name,src] of Object.entries({ar,music,paid,coach,menu,trainer})){
  assert.doesNotThrow(()=>new Script(src,{filename:name+".js"}));
 }
});
function pureFromIIFE(src,fn){
 const modified=src.replace(/\}\)\(\);\s*$/, "window.__testMethod="+fn+";\n})();");
 assert.notEqual(src,modified);
 const context=createContext({window:{},document:{readyState:"loading",addEventListener(){}},URL});
 new Script(modified).runInContext(context);
 return context.window.__testMethod;
}
test("Spotify aceita apenas players oficiais e IDs válidos",()=>{
 const parse=pureFromIIFE(music,"parseProviderLink");
 const id="37i9dQZF1DXcBWIGoYBM5M";
 const data=parse("https://open.spotify.com/playlist/"+id+"?si=abcdef");
 assert.equal(data?.url,"https://open.spotify.com/embed/playlist/"+id);
 assert.equal(data?.provider,"spotify");
 assert.equal(parse("https://evil.spotify.com/playlist/"+id),null);
 assert.equal(parse("http://open.spotify.com/playlist/"+id),null);
 assert.equal(parse("javascript:alert(1)"),null);
});
test("YouTube aceita playlist e vídeo em iframe sem capturar mídia",()=>{
 const parse=pureFromIIFE(music,"parseProviderLink");
 assert.equal(parse("https://www.youtube.com/playlist?list=PLC77007E23FF423C6")?.url,
  "https://www.youtube-nocookie.com/embed/videoseries?list=PLC77007E23FF423C6&playsinline=1");
 assert.equal(parse("https://youtu.be/M7lc1UVf-VE")?.url,"https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?playsinline=1");
 assert.equal(parse("https://youtube.com.evil.example/watch?v=M7lc1UVf-VE"),null);
 assert.match(music,/allow-scripts allow-same-origin/);
 assert.ok(!music.includes("ytdl"));
});
test("Exercícios IA validados sem enviar vídeo/foto",()=>{
 assert.ok(SUPPORTED_AR_EXERCISES.includes("squat"));
 assert.ok(SUPPORTED_AR_EXERCISES.includes("pushup"));
 assert.equal(validateARExercise({exercise:"Agachamento",consent:true}),"Agachamento");
 assert.throws(()=>validateARExercise({exercise:"Agachamento",consent:false}),/Autorize/);
 assert.throws(()=>validateARExercise({exercise:"",consent:true}),/Descreva/);
 assert.match(ar,/getUserMedia/);
 assert.match(ar,/audio:false/);
 assert.match(ar,/three@0\.169\.0/);
 assert.match(ar,/new THREE\.WebGLRenderer/);
 assert.match(ar,/no (?:camera|photo)|nenhuma imagem|A câmera fica no aparelho/i);
 assert.match(ar,/\/api\/coach\/ar-exercise/);
 assert.match(runtime,/pulsofit-ar-coach\.mjs/);
});
test("Acompanhamento é prévia 3D transparente sobre câmera; não promete ARKit",()=>{
 assert.match(ar,/sem ancoragem espacial|não há ancoragem espacial/i);
 assert.match(ar,/ARKit/);
 assert.match(ar,/pf-ar-size/);
 assert.match(ar,/pf-ar-x/);
 assert.match(trainer,/pf-tv-ar-demo/);
 assert.match(menu,/pulso-open-camera-ar/);
});
test("Acesso ativo não mostra cartão nem atalho de teste grátis",()=>{
 assert.match(paid,/\/api\/subscription\/status/);
 assert.match(paid,/j\.planActive===true/);
 assert.match(paid,/j\.trialActive===true/);
 assert.match(paid,/data-pf-active-trial-offer/);
 assert.match(paid,/#pf-plans-shortcut/);
 assert.match(patch,/pf-active-plan-cleanup-js/);
});
test("Coach usa fonte 16px sem cortar mensagens",()=>{
 assert.match(coach,/font-size:16px!important/);
 assert.match(coach,/overflow-wrap:anywhere!important/);
 assert.match(coach,/word-break:normal!important/);
});
test("Boot de produção injeta player e câmera",()=>{
 assert.match(patch,/pf-provider-playlists-js/);
 assert.match(patch,/pf-camera-ar-js/);
 assert.match(patch,/new JavaScriptSyntax\(cameraARJS/);
});
