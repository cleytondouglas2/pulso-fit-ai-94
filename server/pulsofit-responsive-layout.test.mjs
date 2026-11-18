import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=file=>readFileSync(new URL(file,import.meta.url),"utf8");
const css=read("./pulsofit-html5-responsive.css");
const build=read("./pulsofit-plans-patch.mjs");
const navigation=read("../pulsofit-navigation.css");

function assertBalancedStylesheet(source){
 let depth=0,inComment=false,quote="",escape=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i],next=source[i+1];
  if(inComment){if(ch==="*"&&next==="/"){inComment=false;i++}continue}
  if(quote){if(escape){escape=false;continue}if(ch==="\\"){escape=true;continue}if(ch===quote)quote="";continue}
  if(ch==="/"&&next==="*"){inComment=true;i++;continue}
  if(ch==='"'||ch==="'"){quote=ch;continue}
  if(ch==="{")depth++;
  if(ch==="}"){depth--;assert.ok(depth>=0,"Chave extra em "+i)}
 }
 assert.equal(depth,0,"CSS com chaves não fechadas");
 assert.equal(quote,"","String CSS não fechada");
 assert.equal(inComment,false,"Comentário CSS não fechado");
}

test("Camadas originais e responsivas usam CSS com blocos válidos",()=>{
 assertBalancedStylesheet(css);
 assertBalancedStylesheet(navigation);
});
test("O CSS responsivo é lido e incorporado ao HTML real no build",()=>{
 assert.match(build,/readFileSync\(new URL\("\.\/pulsofit-html5-responsive\.css"/);
 assert.match(build,/html5ResponsiveCSS\.replace/);
 assert.match(build,/pf-html5-responsive-20261118/);
});
test("A navegação inferior tem cinco colunas e fica dentro da tela",()=>{
 assert.match(css,/#app \.mobile-nav\{left:0!important;right:0!important;bottom:0!important/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
 assert.match(css,/button\[data-route="coach"\]/);
 assert.match(css,/button\[data-route="coach"\]::after\{content:none!important;display:none!important\}/);
 assert.match(css,/var\(--pf-layout-safe-bottom\)/);
 assert.match(css,/padding-bottom:calc\(112px/);
});
test("Cards, formulários e jornadas cabem em telefones estreitos",()=>{
 for(const key of [".pro-grid",".pro-price-grid",".pf2026-price-grid",".pf2026-journeys",".pf-gateway-form"]){
  assert.ok(css.includes(key),"Ausente: "+key);
 }
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/font-size:16px!important/);
 assert.match(css,/min-width:0;max-width:100%/);
});
test("Modais de vídeos e treinos usam largura de tela e altura dinâmica",()=>{
 for(const key of ["#pf-classes-modal","#pf-tv-overlay","#pf-outdoor-overlay","#pf-more-drawer","#pf-account-lock",".pf-plans-dialog",".pf-checkout-box"]){
  assert.ok(css.includes(key),"Modal não suportado: "+key);
 }
 assert.match(css,/100dvh/);
 assert.match(css,/env\(safe-area-inset-top/);
 assert.match(css,/iframe\{width:100%!important;aspect-ratio:16\/9/);
});
test("CSS não usa regras globais que desabilitem interação",()=>{
 assert.ok(!/body\s*\{\s*pointer-events\s*:\s*none/.test(css));
 assert.ok(!/#app\s*\{\s*display\s*:\s*none/.test(css));
 assert.ok(!/visibility\s*:\s*hidden\s*!important/.test(css));
});
