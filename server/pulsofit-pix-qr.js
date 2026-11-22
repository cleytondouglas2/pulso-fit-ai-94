/**
 * PulsoFit AI — render Pix QR on-device from the validated gateway copy/paste.
 * Never sends the payload to a third-party QR-image service.
 * Requires vendored, MIT-licensed QRCode.js, injected ahead of checkout code.
 */
(function(){
 "use strict";
 if(window.PULSO_PIX_QR?.version==="20261122-local")return;
 function render(host,payload,providerImage){
  if(!host||typeof payload!=="string"||!payload.trim()||payload.length>3500)return false;
  host.replaceChildren();
  host.hidden=false;
  host.style.cssText="display:flex;align-items:center;justify-content:center;" +
   "width:max-content;max-width:100%;margin:18px auto 20px;padding:12px;" +
   "border-radius:14px;background:#fff;box-sizing:border-box;min-width:0;";
  host.setAttribute("role","img");
  host.setAttribute("aria-label","QR Code Pix para pagamento");
  const raw=String(providerImage||"").trim();
  const base64=/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(raw)?raw:
    /^[a-zA-Z0-9+/=]{200,}$/.test(raw)?"data:image/png;base64,"+raw:"";
  function buildLocal(){
   if(typeof window.QRCode!=="function")return false;
   try{
    host.replaceChildren();
    const box=document.createElement("div");
    box.className="pf-pix-qr-generated";
    box.style.cssText="display:block;width:224px;height:224px;max-width:100%;";
    host.appendChild(box);
    new window.QRCode(box,{
     text:payload,width:224,height:224,
     colorDark:"#000000",colorLight:"#ffffff",
     correctLevel:window.QRCode.CorrectLevel.M
    });
    if(!box.querySelector("canvas,img,table"))throw Error("QR matrix missing");
    return true;
   }catch{
    host.replaceChildren();host.hidden=true;host.style.display="none";return false;
   }
  }
  // Prefer an already-authoritative image when present, fallback to local QR.
  if(base64){
   const image=document.createElement("img");
   image.width=224;image.height=224;
   image.alt="QR Code Pix";
   image.style.cssText="display:block;max-width:100%;width:224px;height:224px;object-fit:contain;image-rendering:pixelated;";
   image.onerror=function(){buildLocal()};
   image.src=base64;host.appendChild(image);
   return true;
  }
  return buildLocal();
 }
 window.PULSO_PIX_QR={version:"20261122-local",render:render};
})();
