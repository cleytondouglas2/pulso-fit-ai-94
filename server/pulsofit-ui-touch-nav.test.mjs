import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";

const read=n=>readFileSync(new URL(n,import.meta.url),"utf8");
const coach=read("./pulsofit-coach-consent-ui.js");
const guard=read("./pulsofit-navigation-guard.js");
const touch=read("./pulsofit-touch-feedback.js");
const companion=read("./pulsofit-live-companion.js");
const build=read("./pulsofit-plans-patch.mjs");

test("Os componentes JS de navegação, Coach e botões não possuem erros de sintaxe",()=>{
 for(const [name,src] of Object.entries({coach,guard,touch,companion})){
  assert.doesNotThrow(()=>new Script(src,{filename:name+".js"}));
 }
});

test("Coach preserva o formulário antigo e mantém consentimento antes do envio",()=>{
 assert.match(coach,/pfaiChatInput/);
 assert.match(coach,/stopIfNoConsent/);
 assert.match(coach,/document\.addEventListener\("submit",stopIfNoConsent,true\)/);
 assert.match(coach,/pf-coach-consent-v2-/);
 assert.match(coach,/localStorage\.setItem\(consentKey\(\),"1"\)/);
 assert.match(coach,/removeAttribute\("data-pf-legacy-chat"\)/);
 assert.match(coach,/hero\.insertAdjacentElement\("afterend",section\)/);
 assert.ok(!coach.includes('id="pf-coach-form"'));
 assert.ok(!coach.includes('id="pf-coach-input"'));
});

test("Formatação segura das respostas converte marcação simples sem injetar HTML",()=>{
 const patched=coach.replace(/\}\)\(\);\s*$/,"window.__formatFunctions={formattedText,inlineText};\n})();");
 assert.notEqual(patched,coach);
 function element(tag){
  const node={tagName:tag,children:[],textContent:"",appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children}};
  return node;
 }
 const dom={
  readyState:"loading",addEventListener(){},
  createElement:element,createDocumentFragment:()=>element("fragment"),
  createTextNode:s=>({tagName:"#text",textContent:s,children:[]})
 };
 const env=createContext({window:{},document:dom});
 new Script(patched).runInContext(env);
 const output=element("reply");
 env.window.__formatFunctions.formattedText(output,"## Plano hoje\n- **Aquecimento**: 5 min\n1. Exercício leve\n<script>alert('x')</script>");
 assert.equal(output.children[0].tagName,"fragment");
 const nodes=output.children[0].children;
 assert.equal(nodes[0].tagName,"h4");
 assert.equal(nodes[1].tagName,"ul");
 assert.equal(nodes[2].tagName,"ol");
 // Any HTML-looking AI response remains text rather than rendered script.
 assert.equal(nodes[3].children[0].textContent,"<script>alert('x')</script>");
});

test("O escudo de navegação é visual e termina sem bloquear indefinidamente",()=>{
 assert.match(guard,/pf-screen-curtain/);
 assert.match(guard,/body\.pf-screen-changing #app\{visibility:hidden!important\}/);
 assert.match(guard,/requestAnimationFrame/);
 assert.match(guard,/if\(age>950\)/);
 assert.match(guard,/window\.addEventListener\("hashchange"/);
 assert.match(guard,/document\.addEventListener\("click",navigationalClick,true\)/);
 assert.match(guard,/if\(section===current\(\)\)return/);
});

test("Todos os botões recebem confirmação visual; playlist tem seleção persistente",()=>{
 assert.match(touch,/pointerdown/);
 assert.match(touch,/pf-ui-pressed/);
 assert.match(touch,/pf-ui-tap-confirmed/);
 assert.match(touch,/focus-visible/);
 assert.match(touch,/aria-pressed=true/);
 assert.match(companion,/originalChoice===button\.dataset\.pfOriginal/);
 assert.match(companion,/button\.setAttribute\("aria-pressed",String\(selected\)\)/);
 assert.match(companion,/data-pf-original="energia"/);
});

test("Os recursos são carregados no HTML de produção com verificação de sintaxe",()=>{
 assert.match(build,/pf-navigation-guard-20261118/);
 assert.match(build,/pf-touch-feedback-20261118/);
 assert.match(build,/new JavaScriptSyntax\(navigationGuardJS/);
 assert.match(build,/new JavaScriptSyntax\(touchFeedbackJS/);
 assert.match(build,/pf-coach-visible-consent-js/);
});
