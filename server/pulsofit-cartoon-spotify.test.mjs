import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script,createContext} from "node:vm";
import {webcrypto} from "node:crypto";
import {publicSpotifyConfig,SPOTIFY_REDIRECT_URI} from "./pulsofit-spotify-config.mjs";
const file=n=>readFileSync(new URL(n,import.meta.url),"utf8");
const cartoon=file("./pulsofit-cartoon-ar.js"),camera=file("./pulsofit-camera-ar.js");
const spotify=file("./pulsofit-spotify-oauth.js"),legacy=file("./pulsofit-ar-real-person.js");
const builder=file("./pulsofit-plans-patch.mjs"),server=file("./misticpay-runtime.mjs");
const menu=file("./pulsofit-mais-menu.js"),provider=file("./pulsofit-provider-playlists.js");

test("Cartoon and Spotify scripts parse cleanly",()=>{
 for(const [name,src] of Object.entries({cartoon,camera,spotify,legacy,menu,provider})){
  assert.doesNotThrow(()=>new Script(src,{filename:name+".js"}));
 }
});
test("Original animated cartoon avatars replace filmed humans as primary AR mode",()=>{
 for(const id of ["pipo","lila","tico","nino","zigi"])assert.match(cartoon,new RegExp(id+":\\{"));
 assert.match(cartoon,/pf-ar-character/);
 assert.match(cartoon,/createCharacter\(selected\)/);
 assert.match(cartoon,/function pose\(ms\)/);
 assert.match(cartoon,/pf-ar-video|pf-ar-canvas/);
 assert.match(cartoon,/#pf-ar-canvas/);
 assert.match(camera,/window\.__PULSO_CARTOON_PREFERRED__=true/);
 assert.match(camera,/if\(window\.__PULSO_CARTOON_AR__\)return/);
 assert.match(legacy,/if\(window\.__PULSO_CARTOON_PREFERRED__\)return/);
 for(const protectedBrand of ["Mickey","Minnie","Tom & Jerry","Disney"])assert.ok(!cartoon.includes('<option>'+protectedBrand));
});
test("Model supports full body exercises and user-driven scaling",()=>{
 for(const kind of ["squat","lunge","jumping_jack","curl","arm_raise","march","pushup","plank","bridge"]){
  assert.match(cartoon,new RegExp('exercise==="'+kind+'"'));
 }
 assert.match(cartoon,/hip\.add\(knee\)/);
 assert.match(cartoon,/pf-ar-size/);
 assert.match(cartoon,/pf-ar-x/);
 assert.match(cartoon,/pf-ar-cartoon-y/);
 assert.match(cartoon,/new THREE\.WebGLRenderer/);
});
test("Spotify config is disabled until admin supplies a valid Client ID",()=>{
 assert.deepEqual(publicSpotifyConfig(""),{enabled:false,clientId:null,redirectUri:SPOTIFY_REDIRECT_URI,scope:"playlist-read-private playlist-read-collaborative",flow:"authorization_code_pkce"});
 const id="a".repeat(32),cfg=publicSpotifyConfig(id);
 assert.equal(cfg.enabled,true);assert.equal(cfg.clientId,id);
 assert.equal(cfg.redirectUri,"https://pulso-fit-ai-95-online.onrender.com/");
 assert.ok(!cfg.scope.includes("playlist-modify"));
});
test("Spotify login uses official PKCE and state, not password or client secret",async()=>{
 assert.match(spotify,/accounts\.spotify\.com\/authorize/);
 assert.match(spotify,/response_type","code"/);
 assert.match(spotify,/code_challenge_method","S256"/);
 assert.match(spotify,/crypto\.subtle\.digest/);
 assert.match(spotify,/getRandomValues/);
 assert.match(spotify,/state!==state/);
 assert.match(spotify,/history\.replaceState/);
 assert.match(spotify,/accounts\.spotify\.com\/api\/token/);
 assert.match(spotify,/code_verifier/);
 assert.match(spotify,/client_id/);
 assert.ok(!spotify.includes("client_secret"));
 const patched=spotify.replace(/\}\)\(\);\s*$/,"window.__spotifyPure={challenge};\n})();");
 assert.notEqual(patched,spotify);
 const fake={window:{},crypto:webcrypto,TextEncoder,Uint8Array,btoa,document:{readyState:"loading",addEventListener(){}},URL,URLSearchParams};
 new Script(patched).runInContext(createContext(fake));
 const hash=await fake.window.__spotifyPure.challenge("test-verifier");
 assert.match(hash,/^[A-Za-z0-9_-]{43}$/);
});
test("Spotify can list own playlists and search public playlists without URL inputs",()=>{
 assert.match(spotify,/spotifyFetch\("\/me\/playlists"/);
 assert.match(spotify,/spotifyFetch\("\/search"/);
 assert.match(spotify,/Conectar minha conta Spotify/);
 assert.match(spotify,/Minhas playlists/);
 assert.match(spotify,/Buscar playlists no Spotify/);
 assert.match(spotify,/open\.spotify\.com\/embed\/playlist/);
 assert.match(spotify,/spotify\.com\/playlist/);
 assert.ok(!spotify.includes('type="url"'));
 assert.match(spotify,/#pf-provider-section\{display:none!important\}/);
 assert.match(spotify,/playlist-read/);
 assert.match(builder,/pf-spotify-oauth-js/);
 assert.match(builder,/pf-cartoon-ar-js/);
 assert.match(server,/pulsofit-spotify-config\.mjs/);
});
