import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const file=name=>readFileSync(new URL(name,import.meta.url),"utf8");
const auth=file("./pulsofit-auth-ui.js");
const social=file("./pulsofit-social-ui.js");
const patch=file("./pulsofit-plans-patch.mjs");

test("Login and registration UI renders without Google or Apple choices",()=>{
 assert.doesNotThrow(()=>new Script(auth,{filename:"pulsofit-auth-ui.js"}));
 assert.ok(!auth.includes("pf-auth-social"));
 assert.ok(!auth.includes("Outras formas de entrar"));
 assert.ok(!auth.includes("Google"));
 assert.ok(!auth.includes("Apple"));
 assert.match(auth,/Acesso por e-mail e senha/);
 assert.match(auth,/Entre na sua conta/);
 assert.match(auth,/Crie sua conta grátis/);
});
test("E-mail login and account creation remain enabled",()=>{
 assert.match(auth,/\/api\/auth\//);
 assert.match(auth,/register/);
 assert.match(auth,/login/);
 assert.match(auth,/name="email"/);
 assert.match(auth,/name="password"/);
 assert.match(auth,/pulso-fit-token/);
 assert.match(auth,/Cadastrar e começar/);
 assert.match(auth,/Entrar no PulsoFit/);
 assert.match(auth,/pf-auth-switch/);
});
test("Social auth integration is preserved for future manual reactivation without rendering UI",()=>{
 assert.match(social,/google\.accounts\.id\.renderButton/);
 assert.match(social,/AppleID\.auth\.signIn/);
 assert.match(social,/if\(buttons\.length!==2\|\|!note\|\|!status\)return/);
 assert.match(patch,/pulsofit-auth-ui\.js/);
 assert.match(patch,/pulsofit-social-ui\.js/);
});
