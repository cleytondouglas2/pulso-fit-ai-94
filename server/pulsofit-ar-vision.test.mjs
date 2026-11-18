import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";

const source=n=>readFileSync(new URL(n,import.meta.url),"utf8");
const engine=source("./pulsofit-ar-pose-engine.js");
const vision=source("./pulsofit-ar-vision-ui.js");
const avatar=source("./pulsofit-camera-ar.js");
const builder=source("./pulsofit-plans-patch.mjs");

function getEngine(){
 const sandbox=createContext({window:{}});
 new Script(engine).runInContext(sandbox);
 return sandbox.window.PulsoPoseMetrics;
}
function mockPose(){
 return Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
}
function squatPose(down=false){
 const p=mockPose();
 for(const [h,k,a,x] of [[23,25,27,.43],[24,26,28,.59]]){
  p[k]={x,y:.65,visibility:1,presence:1};
  p[a]={x,y:.87,visibility:1,presence:1};
  p[h]={x:down?x-.15:x,y:down?.62:.41,visibility:1,presence:1};
 }
 return p;
}
test("MediaPipe and movement scripts parse correctly in Node",()=>{
 for(const [file,s] of Object.entries({engine,vision,avatar}))
  assert.doesNotThrow(()=>new Script(s,{filename:file+".js"}));
});
test("Real landmark angles recognize squat phases",()=>{
 const m=getEngine();
 const stand=m.analyze("squat",squatPose(false));
 const crouch=m.analyze("squat",squatPose(true));
 assert.equal(stand.state,"up");
 assert.equal(crouch.state,"down");
 assert.ok(stand.metric>=158);
 assert.ok(crouch.metric<125);
 let count=m.advance(null,stand,500);
 count=m.advance(count,crouch,1500);
 assert.equal(count.reps,0);
 count=m.advance(count,stand,2200);
 assert.equal(count.reps,1);
 count=m.advance(count,stand,2800);
 assert.equal(count.reps,1,"holding the upright pose must not double-count");
});
test("Inference refuses low-confidence body landmarks and never invents counts",()=>{
 const m=getEngine();
 const p=squatPose(false);
 for(const id of [23,24,25,26,27,28])p[id].visibility=.2;
 const result=m.analyze("squat",p);
 assert.equal(result.state,"missing");
 assert.equal(result.eligible,false);
 const after=m.advance({reps:2,phase:"up",last:1000,holdMs:0,holdAt:0},result,2000);
 assert.equal(after.reps,2);
});
test("Unvalidated movements are tracked visually without artificial repetitions",()=>{
 const m=getEngine(),pose=squatPose(false);
 for(const name of ["bridge","march"]){
  const result=m.analyze(name,pose);
  assert.equal(result.state,"unsupported");
  assert.equal(result.eligible,false);
 }
});
test("Pose engine is true ML inference with local video, opt-in and lazy model loading",()=>{
 assert.match(vision,/@mediapipe\/tasks-vision@1\.2\.3/);
 assert.match(vision,/pose_landmarker_lite\.task/);
 assert.match(vision,/PoseLandmarker\.createFromOptions/);
 assert.match(vision,/detectForVideo\(video,now\)/);
 assert.match(vision,/getContext\("2d"\)/);
 assert.match(vision,/pf-ar-vision-optin/);
 assert.match(vision,/\.checked/);
 assert.match(vision,/if\(document\.hidden&&active\)/);
 assert.match(vision,/detector\.close\(\)/);
 assert.ok(!vision.includes("canvas.toDataURL"));
 assert.ok(!vision.includes("formData.append"));
 assert.ok(!vision.includes("fetch('/api/"));
});
test("Improved 3D trainer has articulated knee joints",()=>{
 assert.match(avatar,/const knee=new THREE\.Group/);
 assert.match(avatar,/knees\[0\]\.rotation/);
 assert.match(avatar,/knee\.add\(shin\)/);
 assert.match(builder,/pf-ar-pose-engine-js/);
 assert.match(builder,/pf-ar-vision-ui-js/);
 assert.match(builder,/new JavaScriptSyntax\(poseVisionJS/);
});
