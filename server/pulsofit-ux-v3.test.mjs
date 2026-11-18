import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {validateCoachRequest} from "./pulsofit-coach-chat.mjs";
const read=n=>readFileSync(new URL(n,import.meta.url),"utf8");
const s={
 billing:read("./pulsofit-plans-stable.js"),profile:read("./pulsofit-profile-rescue.js"),
 menu:read("./pulsofit-mais-menu.js"),coach:read("./pulsofit-coach-consent-ui.js"),
 chat:read("./pulsofit-coach-chat.mjs"),playlist:read("./pulsofit-live-companion.js"),
 feedback:read("./pulsofit-workout-feedback.js"),smooth:read("../pulsofit-upgrade-2026.js"),
 patch:read("./pulsofit-plans-patch.mjs"),runtime:read("./misticpay-runtime.mjs")
};
test("JavaScript inline válido e servidor Coach parseável",()=>{
 for(const name of ["billing","profile","menu","coach","playlist","feedback","smooth"])new Script(s[name],{filename:name+".js"});
});
test("Assinatura ativa remove promoções sem remover upgrade do perfil",()=>{
 assert.match(s.billing,/pf-paid-subscriber/);
 assert.match(s.billing,/b\.hidden=Boolean\(token\(\)\)/);
 assert.match(s.billing,/pulso-open-plan-manager/);
 assert.match(s.billing,/Renovar ou mudar meu plano/);
 assert.match(s.profile,/data-pfrr-plan/);
 assert.match(s.profile,/pulso-open-plan-manager/);
 assert.match(s.profile,/dias comprados/);
 assert.match(s.menu,/Renovação e upgrade/);
});
test("IA exige consentimento explícito e sem URL do usuário",()=>{
 assert.throws(()=>validateCoachRequest({message:"oi",consent:false}),/Autorize/);
 assert.throws(()=>validateCoachRequest({message:"",consent:true}),/pergunta/);
 assert.deepEqual(validateCoachRequest({message:"Oi",consent:true,history:[{role:"user",text:"anterior"}]}),
  {message:"Oi",history:[{role:"user",text:"anterior"}]});
 assert.match(s.coach,/pf-coach-consent/);
 // Legacy chat layout is preserved; sending is gated by the same explicit consent.
 assert.match(s.coach,/pfaiChatInput/);
 assert.match(s.coach,/stopIfNoConsent/);
 assert.match(s.coach,/document\.addEventListener\("submit",stopIfNoConsent,true\)/);
 assert.ok(!s.coach.includes('id="pf-coach-input"'));
 assert.ok(!s.coach.includes('id="pf-coach-form"'));
 assert.match(s.coach,/seu-servidor/);
 assert.match(s.chat,/\/api\/me/);
 assert.match(s.chat,/gemini-2\.5-flash:generateContent/);
 assert.match(s.chat,/consent!==true/);
 assert.match(s.coach,/localStorage\.setItem\(consentKey\(\),"1"\)/);
 assert.match(s.coach,/addEventListener\("change"/);
 assert.match(s.runtime,/import "\.\/pulsofit-coach-chat\.mjs"/);
});
test("Playlist acessível e contém somente sintetizador original e arquivos locais",()=>{
 assert.match(s.menu,/Playlist de treino/);
 assert.match(s.menu,/pulso-open-playlist/);
 assert.match(s.playlist,/window\.addEventListener\("pulso-open-playlist"/);
 assert.match(s.playlist,/originalPresets/);
 assert.match(s.playlist,/createOscillator/);
 assert.match(s.playlist,/indexedDB\.open/);
 assert.match(s.playlist,/data-pf-original="foco"/);
 assert.ok(!s.playlist.includes("spotify.com"));
 assert.ok(!s.playlist.includes("youtube.com"));
});
test("Recomendação de parabéns depende de exercícios realmente confirmados",()=>{
 assert.match(s.feedback,/function classify/);
 assert.match(s.feedback,/return done>total\/2/);
 assert.match(s.feedback,/Quantos exercícios você realmente realizou/);
 assert.match(s.feedback,/Poxa/);
 assert.match(s.feedback,/Mandou bem|MANDOU BEM/);
 assert.match(s.feedback,/0 minutos e 0 séries/);
});
test("Navegação sem snapshot da página anterior e com carregamento",()=>{
 assert.ok(!s.smooth.includes("document.startViewTransition("));
 assert.match(s.smooth,/pf-route-loading/);
 assert.match(s.smooth,/Carregando…/);
});
test("Script do portal de produção injeta conversa real e feedback",()=>{
 assert.match(s.patch,/pf-coach-visible-consent-js/);
 assert.match(s.patch,/pf-workout-feedback-js/);
 assert.match(s.patch,/new JavaScriptSyntax\(coachConsentJS/);
 assert.match(s.patch,/new JavaScriptSyntax\(finishFeedbackJS/);
});
