import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext,Script} from "node:vm";
import {createECDH,createPrivateKey,createPublicKey,createDecipheriv,hkdfSync,randomBytes,verify,createCipheriv,sign} from "node:crypto";
import {pulsoIcon,pulsoManifest} from "./pulsofit-pwa-asset.mjs";

const source=readFileSync(new URL("./pulsofit-push-server.mjs",import.meta.url),"utf8");
const sw=readFileSync(new URL("./pulsofit-push-sw.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("./pulsofit-push-ui.js",import.meta.url),"utf8");
const stripped=source.replace(/^import .*;\s*$/gm,"").replace(" const oldEmit=Server.prototype.emit;"," globalThis.__pushTest={validEndpoint,verifySub,encryptedPayload,vapidJWT,parseOptions,localParts,setVapid:v=>vapid=v};\n const oldEmit=Server.prototype.emit;");
function server(){
 const ctx={};
 const fakeServer=class{emit(){return false}};
 const context={process:{argv:["node","server.mjs"],env:{}},globalThis:ctx,
  Server:fakeServer,basename:s=>s.split("/").at(-1),
  readFileSync:()=>sw,pulsoIcon,pulsoManifest,Buffer,
  createECDH,createPrivateKey,createCipheriv,hkdfSync,randomBytes,sign,fetch:async()=>({ok:false}),
  setTimeout:()=>({unref(){}}),setInterval:()=>({unref(){}}),console:{log(){},warn(){}},URL,Intl,Date,Number};
 runInNewContext(stripped,context);
 return ctx.__pushTest;
}
test("PWA asset manifest & branded icons",()=>{
 const manifest=pulsoManifest();
 assert.equal(manifest.display,"standalone");assert.equal(manifest.scope,"/");
 assert.equal(manifest.icons.length,2);
 for(const size of [192,512]){
  const png=pulsoIcon(size);
  assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(png.readUInt32BE(16),size);
 }
 new Script(sw);new Script(ui);
});
test("Server validates push domains and uncompressed P256 subscriber key",()=>{
 const t=server();const e=createECDH("prime256v1");e.generateKeys();
 assert.equal(t.validEndpoint("https://fcm.googleapis.com/fcm/send/abc"),true);
 assert.equal(t.validEndpoint("https://web.push.apple.com/abc"),true);
 assert.equal(t.validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"),true);
 assert.equal(t.validEndpoint("http://127.0.0.1/"),false);
 assert.equal(t.validEndpoint("https://web.push.apple.com.evil.org/abc"),false);
 const subscription={endpoint:"https://web.push.apple.com/abc",keys:{p256dh:e.getPublicKey().toString("base64url"),auth:randomBytes(16).toString("base64url")}};
 assert.equal(t.verifySub(subscription).endpoint,subscription.endpoint);
 assert.throws(()=>t.verifySub({...subscription,endpoint:"http://localhost/"}),{status:422});
});
test("RFC8291 body decrypts with receiver P256 secret and auth secret",()=>{
 const t=server(),receiver=createECDH("prime256v1");receiver.generateKeys();
 const auth=randomBytes(16),u=receiver.getPublicKey(),sub={p256dh:u.toString("base64url"),auth_key:auth.toString("base64url")};
 const payload={title:"Treino PulsoFit",body:"Hora de se movimentar."};
 const data=t.encryptedPayload(sub,payload);
 const salt=data.subarray(0,16),rs=data.readUInt32BE(16),idlen=data[20],sender=data.subarray(21,21+idlen);
 assert.equal(rs,4096);assert.equal(idlen,65);
 const encrypted=data.subarray(21+idlen);
 const ikm=Buffer.from(hkdfSync("sha256",receiver.computeSecret(sender),auth,
  Buffer.concat([Buffer.from("WebPush: info\0"),u,sender]),32));
 const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16));
 const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
 const decipher=createDecipheriv("aes-128-gcm",cek,nonce);decipher.setAuthTag(encrypted.subarray(-16));
 const plain=Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);
 assert.equal(plain.at(-1),2);
 assert.deepEqual(JSON.parse(plain.subarray(0,-1).toString("utf8")),payload);
});
test("VAPID token signature binds audience to endpoint origin",()=>{
 const t=server(),key=createECDH("prime256v1");key.generateKeys();
 t.setVapid({public:key.getPublicKey().toString("base64url"),private:key.getPrivateKey().toString("base64url")});
 const jwt=t.vapidJWT("https://web.push.apple.com/endpoint");
 const [header,body,sig]=jwt.split(".");
 const fields=JSON.parse(Buffer.from(body,"base64url").toString());
 assert.equal(fields.aud,"https://web.push.apple.com");
 const publicBytes=key.getPublicKey();
 const jwk={kty:"EC",crv:"P-256",x:publicBytes.subarray(1,33).toString("base64url"),y:publicBytes.subarray(33,65).toString("base64url")};
 const p=createPublicKey({key:jwk,format:"jwk"});
 assert.equal(verify("sha256",Buffer.from(header+"."+body),{key:p,dsaEncoding:"ieee-p1363"},Buffer.from(sig,"base64url")),true);
});
