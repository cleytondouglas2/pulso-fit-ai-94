import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";
const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");
const real=read("./pulsofit-ar-real-person.js");
const camera=read("./pulsofit-camera-ar.js");
const boot=read("./pulsofit-plans-patch.mjs");
const menu=read("./pulsofit-mais-menu.js");
const training=read("./pulsofit-training-lab-ui.js");
test("Real human camera module passes JS syntax checks",()=>{
 for(const [name,script] of Object.entries({real,camera,menu,training})){
  assert.doesNotThrow(()=>new Script(script,{filename:name+".js"}));
 }
});
test("Real human is now the default rather than a cartoon avatar",()=>{
 assert.match(real,/let host=null,clip=null,sourceId="",userFileUrl="",kind="real"/);
 assert.match(real,/pf-real-person-selected/);
 assert.match(real,/Pessoa real \(vídeo\)/);
 assert.match(real,/Avatar 3D ilustrado/);
 assert.match(real,/Treinador de verdade gravado em vídeo, não boneco/);
 assert.match(menu,/Pessoa real no ambiente/);
 assert.match(training,/Ver pessoa real no ambiente/);
});
test("Licensed human demonstrator videos are exact exercises with source credits",()=>{
 const fixed=real.replace(/\}\)\(\);\s*$/,"window.__licensedHumanFootage=footage;\n})();");
 assert.notEqual(fixed,real);
 const context=createContext({window:{},document:{readyState:"loading",addEventListener(){}},URL});
 new Script(fixed).runInContext(context);
 const data=context.window.__licensedHumanFootage;
 assert.equal(Object.keys(data).length,5);
 for(const k of ["squat","lunge","pushup","jumping_jack","curl"]){
  assert.ok(data[k]?.file.endsWith(".webm"),k);
  assert.ok(data[k]?.creator,k);
  assert.ok(data[k]?.licenseUrl.startsWith("https://"),k);
 }
 for(const k of ["squat","jumping_jack"]){
  assert.match(data[k].license,/CC BY-SA/);
  assert.match(data[k].licenseUrl,/creativecommons\.org\/licenses/);
 }
 assert.equal(data.squat.file,"Squats Wikipedia.webm");
 assert.equal(data.lunge.file,"Strength Training Circuit- Forward Lunge.webm");
 assert.equal(data.pushup.file,"Muscle Strengthening at Home - Push-ups.webm");
 assert.equal(data.curl.file,"Muscle Strengthening at Home - Bicep Curls.webm");
 assert.match(real,/Wikimedia Commons/);
 assert.match(real,/Fonte: Wikimedia Commons/);
});
test("Segmentation is real MediaPipe on recorded human, never camera uploads",()=>{
 assert.match(real,/@mediapipe\/tasks-vision@1\.2\.3/);
 assert.match(real,/ImageSegmenter\.createFromOptions/);
 assert.match(real,/segmentForVideo\(clip,now\)/);
 assert.match(real,/selfie_segmenter\.tflite/);
 assert.match(real,/outputCategoryMask:true/);
 assert.match(real,/getAsUint8Array\(\)/);
 assert.match(real,/destination-in/);
 assert.match(real,/recortad[oa] por IA/i);
 assert.ok(!real.includes("fetch("));
 assert.ok(!real.includes("mediaRecorder"));
 assert.ok(!real.includes("canvas.toDataURL"));
});
test("User-owned exercise videos have strict local-only size and type checks",()=>{
 assert.match(real,/URL\.createObjectURL\(file\)/);
 assert.match(real,/URL\.revokeObjectURL\(userFileUrl\)/);
 assert.match(real,/160\*1024\*1024/);
 assert.match(real,/video\/(?:mp4|webm|quicktime/);
 assert.match(real,/Nenhuma mídia pessoal é enviada ao servidor/);
 assert.match(real,/sem ancoragem espacial|não fixa a pessoa no chão/i);
});
test("All AR scripts loaded in correct order and syntax-checked on production build",()=>{
 const pose=boot.indexOf("'<script id=\"pf-ar-vision-ui-js\">");
 const human=boot.indexOf("'<script id=\"pf-ar-real-person-20261118\">");
 assert.ok(pose>0&&human>pose);
 assert.match(boot,/new JavaScriptSyntax\(realPersonJS/);
 assert.match(boot,/pulsofit-ar-real-person\.js/);
});
test("Exercise without licensed video is not misrepresented as a filmed human",()=>{
 assert.match(real,/const source=footage\[exercise\]\|\|null/);
 assert.match(real,/Nenhuma gravação disponível para este exercício/);
 assert.match(real,/Use um vídeo de treinador com autorização/);
});
