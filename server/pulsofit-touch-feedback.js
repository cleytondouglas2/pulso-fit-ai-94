/* Immediate tactile response for every app action, including playlists.
   A pressed outline means the tap was received, not that a remote action succeeded.
 */
(function(){
"use strict";
if(window.__PF_TOUCH_FEEDBACK__)return;window.__PF_TOUCH_FEEDBACK__=true;
const selector="button,[role='button'],.pf-companion-file";
const timers=new WeakMap();
function target(e){
 const node=e.target?.closest?.(selector);
 return node&&!node.disabled&&!node.matches("[aria-disabled='true']")?node:null;
}
function press(node){
 node.classList.add("pf-ui-pressed");
 clearTimeout(timers.get(node));
 timers.set(node,setTimeout(()=>node.classList.remove("pf-ui-pressed"),250));
}
function tapped(node){
 node.classList.add("pf-ui-tap-confirmed");
 clearTimeout(timers.get(node));
 timers.set(node,setTimeout(()=>{node.classList.remove("pf-ui-pressed");node.classList.remove("pf-ui-tap-confirmed")},560));
}
function boot(){
 const css=document.createElement("style");css.id="pf-touch-feedback-style";
 css.textContent=
 "body button:not([disabled]),body [role=button]:not([aria-disabled=true]),body .pf-companion-file{transition:transform .10s ease,box-shadow .12s ease,border-color .12s ease,filter .12s ease!important;-webkit-tap-highlight-color:transparent;touch-action:manipulation}"+
 "body button.pf-ui-pressed,body [role=button].pf-ui-pressed,body .pf-companion-file.pf-ui-pressed{transform:scale(.967)!important;filter:brightness(1.17)!important;box-shadow:0 0 0 2px #96ffda,0 0 22px #9d7dff8c!important;border-color:#a8ffe2!important}"+
 "body button.pf-ui-tap-confirmed,body [role=button].pf-ui-tap-confirmed{box-shadow:0 0 0 2px #a4ffe3,0 0 18px #7eeed364!important;filter:brightness(1.10)!important}"+
 "body button:focus-visible,body [role=button]:focus-visible{outline:3px solid #aaffdf!important;outline-offset:3px!important}"+
 "#pf-companion-modal [data-pf-original][aria-pressed=true]{background:linear-gradient(135deg,#1f654e,#305c68)!important;box-shadow:0 0 0 2px #a6ffcb,0 8px 25px #3be7b859!important;border-color:#a4f5d2!important;color:white!important}"+
 "#pf-companion-modal [data-pf-original][aria-pressed=true]::after{content:' ✓ Tocando';color:#aaffd8;font:750 11px system-ui;white-space:nowrap}"+
 "#pf-companion-modal [data-pf-original-stop]:not([disabled]){border-color:#8c89b7!important}"+
 "@media(prefers-reduced-motion:reduce){body button,body [role=button],body .pf-companion-file{transition:none!important}}";
 document.head.appendChild(css);
 document.addEventListener("pointerdown",e=>{const node=target(e);if(node)press(node)},true);
 document.addEventListener("click",e=>{const node=target(e);if(node)tapped(node)},true);
 document.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const node=target(e);if(node)press(node)},true);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();