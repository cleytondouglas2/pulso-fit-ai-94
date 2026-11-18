/* PulsoFit AI web push: never cache authenticated pages or API requests. */
"use strict";
self.addEventListener("install",event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener("activate",event=>{event.waitUntil(self.clients.claim());});
self.addEventListener("push",event=>{
 let data={};
 try{if(event.data)data=event.data.json()||{}}catch{data={title:"PulsoFit AI",body:"Seu lembrete de treino chegou."}}
 const title=String(data.title||"PulsoFit AI").slice(0,90);
 const body=String(data.body||"Seu próximo passo começa hoje.").slice(0,240);
 const url=(typeof data.url==="string"&&data.url.startsWith("/?")&&!data.url.startsWith("//"))?data.url:"/?source=push#/home";
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:"/pulsofit-icon-192.png",badge:"/pulsofit-icon-192.png",
  tag:String(data.tag||"pulsofit-daily").slice(0,64),renotify:false,
  timestamp:Date.now(),data:{url,live:!!data.live},silent:!!data.live,
  requireInteraction:!!data.live&&!!data.requireInteraction
 }).then(()=>{if(typeof self.navigator!=="undefined"&&self.navigator.setAppBadge){return self.navigator.setAppBadge(1).catch(()=>{});}})
 );
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const u=new URL(event.notification.data?.url||"/?source=push#/home",self.registration.scope);
 if(u.origin!==self.location.origin)return;
 event.waitUntil((async()=>{
  const clientsList=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of clientsList){
   if(new URL(client.url).origin===u.origin){await client.focus();if(client.navigate)await client.navigate(u.href);return;}
  }
  if(self.clients.openWindow)await self.clients.openWindow(u.href);
 })());
});
