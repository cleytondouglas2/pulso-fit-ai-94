/* ARGUS Pay service worker — no cache or interception of sensitive API traffic. */
self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={title:'ARGUS Payments',body:'Você tem uma nova atualização.'}}
  const category=['pix.received','pix.sent','announcement'].includes(data.category)?data.category:'announcement';
  const title=String(data.title||'ARGUS Payments').slice(0,130);
  const body=String(data.body||'Abra o ARGUS Pay para conferir.').slice(0,290);
  const url=typeof data.url==='string'&&/^\/(?:conta|admin)(?:[?#]|$)/.test(data.url)?data.url:'/admin';
  const options={body,icon:'/static/assets/argus-icon-192.png',badge:'/static/assets/argus-icon-192.png',
    tag:String(data.tag||Date.now()).slice(0,80),renotify:category==='pix.received',
    data:{url},vibrate:[180,70,180],timestamp:Date.now()};
  if(category==='pix.received')options.image='/static/assets/pix-cachorro.png';
  // All Apple push messages must produce a visible notification immediately.
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const path=event.notification.data?.url||'/admin';
  event.waitUntil((async()=>{
    const absolute=new URL(path,self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const found=windows.find(w=>w.url.startsWith(self.location.origin)&&w.url.includes(path.split('?')[0]));
    if(found){await found.focus();if('navigate' in found)await found.navigate(absolute);return;}
    await self.clients.openWindow(absolute);
  })());
});
self.addEventListener('pushsubscriptionchange',event=>{
  // Never automatically resubscribe without a user gesture/known account identity.
  event.waitUntil(Promise.resolve());
});
