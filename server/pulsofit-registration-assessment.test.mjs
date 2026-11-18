import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,runInNewContext} from "node:vm";

const auth=readFileSync(new URL("./pulsofit-auth-ui.js",import.meta.url),"utf8");
const assessment=readFileSync(new URL("./pulsofit-assessment-ui.js",import.meta.url),"utf8");
function inject(source,exportCode){
 const i=source.lastIndexOf("})();");
 assert.ok(i>=0);
 return source.slice(0,i)+exportCode+"\n"+source.slice(i);
}
function storage(){
 const values=new Map();
 return {values,getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,v)=>values.set(key,String(v)),removeItem:key=>values.delete(key)};
}
function assessmentContext(s=storage()){
 const w={};
 const js=inject(assessment,"window.__tests={setAccount:v=>account=v,saveDraft,readDraft,clearDraft};");
 runInNewContext(js,{window:w,document:{readyState:"loading",addEventListener(){}},
  sessionStorage:s,console,location:{hash:"#/home"}});
 return w.__tests;
}
test("Scripts da conta e avaliação são JavaScript válido",()=>{
 new Script(auth);new Script(assessment);
});
test("Rascunho por conta preserva preenchimento e consentimento após recarregar a tela",()=>{
 const store=storage(),t=assessmentContext(store);
 t.setAccount({id:"account-A"});
 const form={elements:{
  weightKg:{value:"74.5"},heightCm:{value:"175"},ageYears:{value:"35"},
  goal:{value:"massa_muscular"},place:{value:"academia"},level:{value:"intermediario"},
  daysPerWeek:{value:"4"},sessionMinutes:{value:"50"},
  limitations:{value:"Evitar saltos"},consent:{checked:true}
 }};
 t.saveDraft(form);
 assert.equal(t.readDraft().weightKg,"74.5");
 assert.equal(t.readDraft().limitations,"Evitar saltos");
 assert.equal(t.readDraft().consent,true);
 const reload=assessmentContext(store);reload.setAccount({id:"account-A"});
 assert.equal(reload.readDraft().goal,"massa_muscular");
 reload.setAccount({id:"account-B"});
 assert.deepEqual({...reload.readDraft()},{});
 reload.setAccount({id:"account-A"});reload.clearDraft();
 assert.equal(store.getItem("pf-eval-draft-v1-account-A"),null);
 assert.ok(assessment.includes('form.addEventListener("input",function(){saveDraft(form)})'));
 assert.ok(assessment.includes('switchTab("plan",false)'));
});
function authContext(registerReply){
 const w={};const local=storage(),sess=storage(),feedback={textContent:""};
 let submit=null,refresh=0;
 const button={disabled:false};
 const form={elements:{email:{value:"teste@example.com"},password:{value:"SenhaForte123!"},name:{value:"Pessoa Teste"}},
  addEventListener:(event,fn)=>{if(event==="submit")submit=fn},
  querySelector:()=>button};
 const surface={classList:{add(){},remove(){}},innerHTML:"",
  setAttribute(){},querySelector(sel){
   if(sel===".pf-auth-feedback")return feedback;
   if(sel===".pf-auth-switch")return {addEventListener(){}};
   if(sel==="form")return form;
   return null;
  }};
 const body={classList:{add(){},remove(){}},appendChild(){}};
 const document={readyState:"loading",body,addEventListener(){},
  getElementById:(id)=>id==="pf-account-lock"?surface:null,createElement:()=>surface};
 const calls=[];
 async function fetch(url,options){
  calls.push({url,options});
  if(url==="/api/auth/register")return {ok:true,json:async()=>registerReply};
  if(url==="/api/auth/login")return {ok:true,json:async()=>({token:"secret-session-token"})};
  if(url==="/api/me")return {ok:true,json:async()=>({user:{id:"account-A"}})};
  throw Error("Unrecognized "+url);
 }
 runInNewContext(inject(auth,"window.__tests={show};"),{
  window:w,document,location:{reload(){refresh++}},fetch,sessionStorage:sess,localStorage:local,
  Event:class{},atob,sET:undefined,console
 });
 w.__tests.show("register");
 return {perform:()=>submit({preventDefault(){}}),calls,sess,local,feedback,refreshed:()=>refresh};
}
test("Após cadastro sem token o app autentica, valida conta e abre aplicativo",async()=>{
 const x=authContext({success:true,user:{id:"account-A"}});
 await x.perform();
 assert.deepEqual(x.calls.map(c=>c.url),["/api/auth/register","/api/auth/login","/api/me"]);
 assert.equal(x.sess.getItem("pulso-fit-token"),"secret-session-token");
 assert.equal(x.refreshed(),1);
 assert.ok(x.local.getItem("pulsofit-session-remember-v1"));
 assert.equal(x.local.getItem("teste@example.com"),null);
});
test("Se o cadastro já fornece token, não faz login duplicado",async()=>{
 const x=authContext({token:"direct-token"});
 await x.perform();
 assert.deepEqual(x.calls.map(c=>c.url),["/api/auth/register","/api/me"]);
 assert.equal(x.refreshed(),1);
});
test("Google e Apple aparecem como não configurados, sem autenticação simulada",()=>{
 assert.ok(auth.includes("Google e Apple aguardam configuração OAuth"));
 assert.ok(auth.includes('disabled aria-label="Google: aguardando configuração OAuth"'));
 assert.ok(auth.includes('disabled aria-label="Apple: aguardando configuração OAuth"'));
});