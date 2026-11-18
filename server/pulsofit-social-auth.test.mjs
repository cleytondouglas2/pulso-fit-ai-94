import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateKeyPairSync,createSign,randomBytes} from "node:crypto";
import {Script} from "node:vm";

process.env.PULSO_SOCIAL_AUTH_SECRET="secure-test-only-secret".repeat(4);
process.env.PULSO_GOOGLE_OAUTH_CLIENT_ID="integration-test.apps.googleusercontent.com";
const {socialOptions,providerAlias,checkJWTClaims,verifyIdentity}=await import("./pulsofit-social-auth.mjs");
const now=Math.floor(Date.now()/1000);
const nonce="the-random-callback-challenge-value";

test("Google only enables with an actual web client ID and server secret",()=>{
 const valid=socialOptions({PULSO_SOCIAL_AUTH_SECRET:"x".repeat(40),PULSO_GOOGLE_OAUTH_CLIENT_ID:"abc.apps.googleusercontent.com"});
 assert.equal(valid.googleEnabled,true);assert.equal(valid.appleEnabled,false);
 assert.equal(socialOptions({PULSO_GOOGLE_OAUTH_CLIENT_ID:"abc.apps.googleusercontent.com"}).googleEnabled,false);
 assert.equal(socialOptions({PULSO_SOCIAL_AUTH_SECRET:"x".repeat(40),PULSO_GOOGLE_OAUTH_CLIENT_ID:"abcdef"}).googleEnabled,false);
});
test("Apple requires client, team, key and private credentials",()=>{
 const base={PULSO_SOCIAL_AUTH_SECRET:"x".repeat(40),PULSO_APPLE_SERVICES_ID:"com.example.pulsofit",
  PULSO_APPLE_TEAM_ID:"ABCDE12345",PULSO_APPLE_KEY_ID:"ABCDE12345",PULSO_APPLE_PRIVATE_KEY:"-----BEGIN PRIVATE KEY-----\nplaceholder"};
 assert.equal(socialOptions(base).appleEnabled,true);
 assert.equal(socialOptions({...base,PULSO_APPLE_KEY_ID:""}).appleEnabled,false);
 assert.equal(socialOptions({...base,PULSO_APPLE_PRIVATE_KEY:""}).appleEnabled,false);
});
test("Subjects generate stable isolated native app accounts; no email auto-linking",()=>{
 const a=providerAlias("google","account-123"),b=providerAlias("google","account-123");
 const c=providerAlias("apple","account-123"),d=providerAlias("google","account-234");
 assert.deepEqual(a,b);assert.notEqual(a.email,c.email);assert.notEqual(a.email,d.email);
 assert.ok(a.email.endsWith("@users.pulsofit.invalid"));assert.ok(a.password.length>65);
 assert.throws(()=>providerAlias("google",""));assert.throws(()=>providerAlias("unknown","test"));
});
test("Google claim verifier enforces audience, issuer, expiration and anti-replay nonce",()=>{
 const good={iss:"https://accounts.google.com",aud:process.env.PULSO_GOOGLE_OAUTH_CLIENT_ID,
  sub:"google-user-id",exp:now+400,iat:now-1,nonce,email:"user@gmail.com",email_verified:true};
 assert.equal(checkJWTClaims(good,"google",good.aud,nonce,now).sub,good.sub);
 for(const change of [{aud:"other-app"},{iss:"https://evil.example"},{exp:now-1},
  {iat:now+1000},{nonce:"different"},{email_verified:false},{sub:""}]){
  assert.throws(()=>checkJWTClaims({...good,...change},"google",good.aud,nonce,now));
 }
});
test("Apple claim verifier checks issuer/audience and nonce, even for relay users",()=>{
 const good={iss:"https://appleid.apple.com",aud:"com.example.pulsofit",sub:"unique-apple-sub",
  exp:now+400,iat:now-1,nonce};
 assert.equal(checkJWTClaims(good,"apple",good.aud,nonce,now).sub,good.sub);
 assert.throws(()=>checkJWTClaims({...good,iss:"accounts.google.com"},"apple",good.aud,nonce,now));
});
test("JWT verification rejects forged tokens and validates genuine RSA signatures against provider JWKS",async()=>{
 const keys=generateKeyPairSync("rsa",{modulusLength:2048});
 const kid="test-kid-"+randomBytes(4).toString("hex");
 const jwk=keys.publicKey.export({format:"jwk"});jwk.kid=kid;jwk.use="sig";
 const nativeFetch=global.fetch;
 global.fetch=async url=>{if(String(url)!=="https://www.googleapis.com/oauth2/v3/certs")throw Error("Unexpected fetch "+url);
   return {ok:true,json:async()=>({keys:[jwk]})};
 };
 const header=Buffer.from(JSON.stringify({alg:"RS256",kid})).toString("base64url");
 const body=Buffer.from(JSON.stringify({iss:"https://accounts.google.com",
  aud:process.env.PULSO_GOOGLE_OAUTH_CLIENT_ID,sub:"signed-sub",iat:now,exp:now+300,nonce})).toString("base64url");
 const data=header+"."+body;
 const sig=createSign("RSA-SHA256").update(data).end().sign(keys.privateKey).toString("base64url");
 try{
  const result=await verifyIdentity(data+"."+sig,"google",nonce);
  assert.equal(result.sub,"signed-sub");
  await assert.rejects(()=>verifyIdentity(data+"."+Buffer.from("forged").toString("base64url"),"google",nonce));
  await assert.rejects(()=>verifyIdentity(data+"."+sig,"google","wrong-nonce"));
 }finally{global.fetch=nativeFetch}
});
test("Google/Apple browser login UI is valid script and is conditional on provider config",()=>{
 const src=readFileSync(new URL("./pulsofit-social-ui.js",import.meta.url),"utf8");
 new Script(src);
 assert.match(src,/google\.accounts\.id\.renderButton/);
 assert.match(src,/AppleID\.auth\.signIn/);
 assert.match(src,/if\(cfg\.googleEnabled/);
 assert.match(src,/if\(cfg\.appleEnabled/);
});
test("Social authentication routes are mounted in the already used Render server startup",()=>{
 const server=readFileSync(new URL("./misticpay-runtime.mjs",import.meta.url),"utf8");
 const patch=readFileSync(new URL("./pulsofit-plans-patch.mjs",import.meta.url),"utf8");
 assert.ok(server.includes('import "./pulsofit-social-auth.mjs"'));
 assert.ok(patch.includes("pulsofit-social-ui.js"));
 assert.ok(patch.includes("pf-social-ui-20261118"));
});