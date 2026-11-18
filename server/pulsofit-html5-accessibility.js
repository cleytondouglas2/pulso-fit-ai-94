/* PulsoFit HTML5 navigation/accessibility enhancement.
 * Presentation only — no route changes, no auth token access, no API requests.
 * Attribute-only enrichment avoids the re-render loops seen in prior builds.
 */
(function(){
 "use strict";
 if(window.__PULSO_HTML5_ACCESSIBILITY_20261118__)return;
 window.__PULSO_HTML5_ACCESSIBILITY_20261118__=true;
 var scheduled=false;
 function route(){
  return String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase();
 }
 function setIfChanged(el,key,value){
  if(!el||el.getAttribute(key)===value)return;
  el.setAttribute(key,value);
 }
 function hydrate(){
  var app=document.getElementById("app");
  if(!app)return;
  var nav=app.querySelector(".mobile-nav");
  if(nav){
   if(nav.tagName!=="NAV")setIfChanged(nav,"role","navigation");
   setIfChanged(nav,"aria-label","Navegação principal do PulsoFit");
   var buttons=nav.querySelectorAll("button,[data-route]");
   buttons.forEach(function(button){
    var target=String(button.dataset.route||"").toLowerCase();
    var isMore=button.dataset.pfMaisTab==="1";
    if(isMore){
     setIfChanged(button,"aria-label","Abrir menu Mais");
     setIfChanged(button,"aria-haspopup","dialog");
     setIfChanged(button,"aria-controls","pf-more-drawer");
    }else if(!button.hasAttribute("aria-label")&&button.textContent.trim()){
     var label=button.textContent.trim().replace(/\s+/g," ").slice(0,85);
     setIfChanged(button,"aria-label",label);
    }
    if(target){
     var selected=target===route()||(isMore&&["profile","account","subscription"].includes(route()));
     if(selected)setIfChanged(button,"aria-current","page");
     else if(button.hasAttribute("aria-current"))button.removeAttribute("aria-current");
    }
   });
  }
  var main=app.querySelector(".main")||app.querySelector("main");
  if(main){
   if(main.tagName!=="MAIN")setIfChanged(main,"role","main");
   if(!main.hasAttribute("id"))main.id="pf-primary-content";
  }
  var images=app.querySelectorAll("img:not([alt])");
  images.forEach(function(img){setIfChanged(img,"alt","")});
  // Add accessible names only to known generated close buttons with no text.
  document.querySelectorAll("#pf-more-drawer .pf-more-close, #pf-eval-overlay .pf-eval-close, #pf-stable-modal .pf-stable-close")
   .forEach(function(button){if(!button.hasAttribute("aria-label"))setIfChanged(button,"aria-label","Fechar janela")});
 }
 function schedule(){
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(function(){scheduled=false;try{hydrate()}catch(e){
    console.warn("[pulso-html5] Accessibility enhancement skipped for this view.");
  }});
 }
 function boot(){
  var app=document.getElementById("app");
  if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  window.addEventListener("hashchange",schedule);
  window.addEventListener("pageshow",schedule);
  window.addEventListener("pulso-auth-ready",schedule);
  schedule();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
 else boot();
})();
