/* ARGUS installation guide — presentation only, independent from payments. */
(()=>{
'use strict';
const root=document.getElementById('argus-install-root');
if(!root)return;
root.classList.add('has-js');
const role=document.documentElement.dataset.role==='admin'?'admin':'revenda';
const tabs={ios:document.getElementById('tab-ios'),android:document.getElementById('tab-android')};
const guides={ios:document.getElementById('guide-ios'),android:document.getElementById('guide-android')};
const call=document.getElementById('install-cta');
const label=document.getElementById('install-cta-label');
const target=document.getElementById('install-guide');
const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||
 navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const isAndroid=/Android/i.test(navigator.userAgent);
let selected=isAndroid?'android':'ios',deferredPrompt=null;
function switchDevice(device,focus=false){
 if(!tabs[device])return;
 selected=device;
 for(const kind of ['ios','android']){
  tabs[kind].setAttribute('aria-selected',String(kind===device));
  tabs[kind].tabIndex=kind===device?0:-1;
  guides[kind].hidden=kind!==device;
 }
 if(focus)tabs[device].focus();
}
Object.values(tabs).forEach(tab=>{
 tab.addEventListener('click',()=>switchDevice(tab.dataset.device));
 tab.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const current=tab.dataset.device;
  const next=event.key==='Home'?'ios':event.key==='End'?'android':current==='ios'?'android':'ios';
  switchDevice(next,true);
 });
});
function showGuide(){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
call.addEventListener('click',async()=>{
 if(deferredPrompt){
  const prompt=deferredPrompt;
  deferredPrompt=null;
  try{await prompt.prompt();await prompt.userChoice;}
  catch(_){showGuide();}
  label.textContent='Ver como instalar';
  return;
 }
 showGuide();
});
window.addEventListener('beforeinstallprompt',event=>{
 // This event is provided by browsers with an installable PWA prompt (mostly Android).
 // Do not promise or simulate installation on iOS.
 event.preventDefault();
 deferredPrompt=event;
 label.textContent='Instalar aplicativo';
 if(isAndroid)switchDevice('android');
});
window.addEventListener('appinstalled',()=>{
 deferredPrompt=null;
 label.textContent='Aplicativo instalado';
 call.disabled=true;
 call.setAttribute('aria-disabled','true');
});
switchDevice(selected);
const worker=document.documentElement.dataset.worker;
const scope=document.documentElement.dataset.workerScope;
if('serviceWorker' in navigator&&isSecureContext&&worker&&scope){
 navigator.serviceWorker.register('/'+worker,{scope:scope}).catch(()=>{});
}
})();
