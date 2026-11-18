import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const file=relative=>readFileSync(new URL(relative,import.meta.url),"utf8");
const plans=file("./pulsofit-plans-stable.js");
const coach=file("./pulsofit-coach-avatar.js");
const greeting=file("./pulsofit-home-greeting.js");
const layout=file("./pulsofit-workout-editor-mobile.js");
const layoutCSS=file("./pulsofit-workout-editor-mobile.css");
const outdoor=file("./pulsofit-outdoor-ui.js");
const build=file("./pulsofit-plans-patch.mjs");

test("Todos os scripts alterados são JavaScript válido",()=>{
 for(const src of [plans,coach,greeting,layout,outdoor])
  new Script(src);
});
test("A confirmação de Pix usa um marcador persistente por transação e não reaparece ao reiniciar",()=>{
 assert.match(plans,/pf-pix-confirmed-notification-v1/);
 assert.match(plans,/function hasShownReceipt/);
 assert.match(plans,/function markReceiptShown/);
 assert.match(plans,/if\(!hasShownReceipt\(json\)\)/);
 assert.match(plans,/markReceiptShown\(data\)/);
 assert.match(plans,/localStorage\.getItem/);
 assert.match(plans,/localStorage\.setItem/);
});
test("Botão de planos fica fora dos exercícios de contas com teste ou plano ativo",()=>{
 assert.ok(plans.includes('["workouts","coach","training-lab","outdoor","goals","profile","account"]'));
 assert.match(plans,/activePaid\|\|activeTrial/);
 assert.match(plans,/#pf-stable-open\[hidden\]/);
});
test("Foto da conta é exibida no lugar exato do símbolo do Coach IA",()=>{
 assert.match(coach,/\.pf2026-coach-hero \.pf2026-coach-orb/);
 assert.match(coach,/\/api\/profile\/photo/);
 assert.match(coach,/object-fit:cover/);
 assert.match(coach,/pulso-avatar-changed/);
 assert.match(coach,/pf-coach-has-photo/);
 assert.match(greeting,/pf-home-greet-icon/);
 assert.match(greeting,/fetchPhoto/);
});
test("Correção de cards na sequência do treino não modifica o valor de séries nem o formulário",()=>{
 assert.match(layout,/crie seu treino/);
 assert.match(layout,/sequência de exercícios/);
 assert.match(layout,/pf-custom-workout-row/);
 assert.match(layoutCSS,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(layoutCSS,/input\[type="number"\]/);
 assert.ok(!layout.includes("setAttribute('value'"));
});
test("Somente app nativo usa GPS ao fundo; Safari não declara dados fictícios",()=>{
 assert.match(outdoor,/PulsoFitNative/);
 assert.match(outdoor,/pulso-native-location/);
 assert.match(outdoor,/nativeCommand\("start"\)/);
 assert.match(outdoor,/nativeCommand\("finish"\)/);
 assert.match(outdoor,/O Safari não mantém GPS contínuo em segundo plano/);
});
test("Boot de produção carrega correções responsivas e foto no Coach",()=>{
 assert.ok(build.includes("pulsofit-coach-avatar.js"));
 assert.ok(build.includes("pulsofit-workout-editor-mobile.js"));
 assert.ok(build.includes("pulsofit-workout-editor-mobile.css"));
 assert.ok(build.includes("pf-workout-mobile-fix-css"));
 assert.ok(build.includes("pf-coach-avatar-20261118"));
});
test("Código-fonte iOS inclui permissão Sempre, background mode e atualizações reais",()=>{
 const root=new URL("../ios-native/",import.meta.url);
 const app=readFileSync(new URL("PulsoFitNativeApp.swift",root),"utf8");
 const tracker=readFileSync(new URL("PulsoFitBackgroundTracker.swift",root),"utf8");
 const plist=readFileSync(new URL("Info.plist.template",root),"utf8");
 assert.match(app,/WKWebView/);
 assert.match(app,/pulsoLocation/);
 assert.match(tracker,/CLLocationManager/);
 assert.match(tracker,/authorizedAlways/);
 assert.match(tracker,/allowsBackgroundLocationUpdates = true/);
 assert.match(tracker,/UNMutableNotificationContent/);
 assert.match(plist,/NSLocationAlwaysAndWhenInUseUsageDescription/);
 assert.match(plist,/<string>location<\/string>/);
});
