/* PulsoFit - photo meal evaluation, separate from body Performance AI. */
(function(){
 "use strict";
 if(window.__PULSO_MEAL_UI__)return;
 window.__PULSO_MEAL_UI__=true;
 const id=x=>document.getElementById(x),safe=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
 let overlay=null,photo=null,busy=false;
 const css=[
 '#pf-meal-overlay{position:fixed!important;inset:0!important;z-index:2147483550!important;background:#05091de8!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:12px!important;box-sizing:border-box!important;overflow:auto!important;font:14px/1.5 system-ui,sans-serif;color:#fff!important}',
 '#pf-meal-overlay *{box-sizing:border-box}',
 '#pf-meal-overlay .pf-meal-box{position:relative;background:linear-gradient(145deg,#2c2447,#13223b);border:1px solid #8968c7;border-radius:22px;padding:clamp(16px,4vw,26px);width:min(100%,560px);max-height:95dvh;overflow:auto;box-shadow:0 15px 60px #0009}',
 '#pf-meal-overlay h2{font:900 clamp(21px,5vw,28px) system-ui;color:#fff;margin:5px 0}',
 '#pf-meal-overlay h3{color:#e5fff2;font:850 16px system-ui;margin:10px 0}',
 '#pf-meal-overlay p,#pf-meal-overlay label{color:#ddd6eb;font-size:13px;line-height:1.5}',
 '#pf-meal-overlay button,#pf-meal-overlay select{border-radius:11px;border:1px solid #8f75c6;padding:11px 12px;background:#37294f;color:#fff;font:800 13px system-ui;cursor:pointer}',
 '#pf-meal-overlay button:disabled{opacity:.5;cursor:not-allowed}',
 '#pf-meal-overlay .pf-meal-primary{background:#8a4de0;color:#fff;width:100%;margin:12px 0;font-size:15px}',
 '#pf-meal-overlay .pf-meal-file{position:relative;display:block;border:2px dashed #b48cec;background:#503f72;border-radius:13px;text-align:center;padding:16px;cursor:pointer;font-weight:850;color:#fff}',
 '#pf-meal-overlay input[type=file]{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}',
 '#pf-meal-overlay .pf-meal-top{display:flex;justify-content:space-between;gap:10px;align-items:start}',
 '#pf-meal-overlay .pf-meal-top button{flex:none;padding:3px 11px;font-size:24px}',
 '#pf-meal-overlay .pf-meal-preview{display:none;width:100%;max-height:260px;object-fit:contain;margin:10px auto;border-radius:12px}',
 '#pf-meal-overlay .pf-meal-total{border:1px solid #75a9ab;background:#123d47;padding:12px;border-radius:15px;margin:12px 0;font-weight:800;font-size:14px}',
 '#pf-meal-overlay table{width:100%;border-collapse:collapse;font-size:12px;color:#fff}',
 '#pf-meal-overlay td,#pf-meal-overlay th{border-bottom:1px solid #ffffff2b;padding:8px 4px;text-align:left}',
 '#pf-meal-overlay ul{padding-left:20px;margin:10px 0}',
 '#pf-meal-overlay .pf-meal-note{font-size:11px;color:#ecdcba}',
 '#pf-meal-overlay #pf-meal-status{color:#baffde;font-weight:700;min-height:20px}',
 '#pf-meal-fab{position:fixed;z-index:2147482000;right:12px;bottom:calc(92px + env(safe-area-inset-bottom,0px));border:1px solid #9ceabf;border-radius:14px;background:#1c594b;color:#fff;font:850 13px system-ui;padding:12px;cursor:pointer;box-shadow:0 10px 30px #0007}',
 '#pf-meal-fab[hidden]{display:none!important}'
 ].join("\n");
 function setMessage(t){const el=id("pf-meal-status");if(el)el.textContent=t}
 function close(){if(overlay)overlay.remove();overlay=null;photo=null}
 function open(){
  if(overlay?.isConnected)return;
  if(!sessionStorage.getItem("pulso-fit-token")){location.hash="#/account";return}
  overlay=document.createElement("div");overlay.id="pf-meal-overlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Avaliação de refeição por foto");
  overlay.innerHTML='<section class="pf-meal-box"><div class="pf-meal-top"><div><small>🥗 PULSOFIT • NUTRIÇÃO</small><h2>Avaliação do meu prato</h2></div><button type="button" id="pf-meal-close" aria-label="Fechar">×</button></div>'+
   '<p>Tire uma foto do prato ou escolha uma imagem. A IA identifica os alimentos, estima calorias, proteínas, carboidratos e gorduras e sugere ajustes.</p>'+
   '<label class="pf-meal-file">📷 Tirar foto ou escolher do celular<input id="pf-meal-file" type="file" accept="image/jpeg,image/png,image/webp,image/*"></label>'+
   '<img id="pf-meal-preview" class="pf-meal-preview" alt="Pré-visualização da refeição">'+
   '<label for="pf-meal-goal">Seu objetivo</label> <select id="pf-meal-goal"><option value="equilíbrio geral">Alimentação equilibrada</option>'+
   '<option value="reduzir gordura">Reduzir gordura corporal</option><option value="ganhar massa muscular">Ganhar massa muscular</option>'+
   '<option value="melhorar condicionamento">Melhorar condicionamento</option></select>'+
   '<button type="button" id="pf-meal-submit" class="pf-meal-primary" disabled>✨ Avaliar minha refeição com IA</button>'+
   '<p id="pf-meal-status" role="status" aria-live="polite"></p><div id="pf-meal-result" aria-live="polite"></div>'+
   '<p class="pf-meal-note">Valores aproximados. A foto não permite determinar óleo, ingredientes ocultos ou tamanho exato das porções. Não substitui um nutricionista.</p></section>';
  document.body.appendChild(overlay);
  id("pf-meal-close").onclick=close;
  overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
  id("pf-meal-file").addEventListener("change",async e=>{
   const file=e.target.files?.[0];if(!file)return;
   if(!file.type.startsWith("image/")){setMessage("Selecione uma foto válida.");return}
   try{
    setMessage("Preparando imagem...");
    const url=URL.createObjectURL(file),img=new Image();img.src=url;
    await img.decode();URL.revokeObjectURL(url);
    const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    photo=canvas.toDataURL("image/jpeg",0.79);
    if(photo.length>2800000){photo=null;throw Error("Imagem grande demais. Escolha outra foto.")}
    const preview=id("pf-meal-preview");preview.src=photo;preview.style.display="block";
    id("pf-meal-result").replaceChildren();id("pf-meal-submit").disabled=false;setMessage("Foto pronta para análise.");
   }catch(error){photo=null;setMessage(String(error.message||"Falha ao ler imagem."));}
  });
  id("pf-meal-submit").onclick=async ()=>{
   if(busy||!photo)return;
   busy=true;id("pf-meal-submit").disabled=true;setMessage("Identificando alimentos e estimando nutrientes...");
   try{
    const token=sessionStorage.getItem("pulso-fit-token");
    const response=await fetch("/api/ai/meal/assess",{method:"POST",cache:"no-store",
     headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
     body:JSON.stringify({imageDataUrl:photo,goal:id("pf-meal-goal").value})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Não foi possível analisar essa refeição.");
    renderResult(data);setMessage("Avaliação concluída! Os números são estimativas.");
   }catch(error){setMessage(String(error.message||"Erro ao analisar prato."))}
   finally{busy=false;if(id("pf-meal-submit"))id("pf-meal-submit").disabled=!photo}
  };
  id("pf-meal-close").focus();
 }
 function renderResult(data){
  const root=id("pf-meal-result");if(!root)return;
  const total=data.totals||{},number=v=>Number.isFinite(Number(v))?Number(v).toLocaleString("pt-BR",{maximumFractionDigits:1}):"—";
  root.innerHTML='<h3>Resultado estimado</h3>'+
   '<div class="pf-meal-total">🔥 '+number(total.calories)+' kcal &nbsp; | &nbsp; 💪 '+number(total.proteinG)+' g proteína'+
   '<div style="margin-top:8px">Carboidratos '+number(total.carbsG)+' g · Gorduras '+number(total.fatG)+' g</div></div>'+
   '<h3>Alimentos identificados</h3>'+
   '<table><thead><tr><th>Alimento</th><th>Porção</th><th>kcal</th><th>Prot.</th></tr></thead><tbody>'+
   (Array.isArray(data.foods)?data.foods:[]).map(f=>'<tr><td>'+safe(f.name)+'</td><td>'+number(f.grams)+' g</td><td>'+number(f.calories)+'</td><td>'+number(f.proteinG)+' g</td></tr>').join("")+
   '</tbody></table><h3>Avaliação</h3><p>'+safe(data.opinion||"Sem avaliação adicional.")+'</p>'+
   '<h3>O que melhorar</h3><ul>'+(Array.isArray(data.improvements)?data.improvements:[]).map(x=>'<li>'+safe(x)+'</li>').join("")+'</ul>'+
   '<p class="pf-meal-note">'+safe(data.uncertainty||"As porções foram estimadas por foto.")+'</p>';
 }
 function boot(){
  const style=document.createElement("style");style.textContent=css;style.id="pf-meal-style";document.head.appendChild(style);
  window.addEventListener("pulso-open-meal",open);
  window.addEventListener("hashchange",()=>{const fab=id("pf-meal-fab");if(fab)fab.hidden=!/(nutrition|meal|food)/.test(location.hash)});
  if(!id("pf-meal-fab")){
   const fab=document.createElement("button");fab.id="pf-meal-fab";fab.type="button";
   fab.textContent="🥗 Avaliar meu prato";fab.hidden=!/(nutrition|meal|food)/.test(location.hash);
   fab.onclick=open;document.body.appendChild(fab);
  }
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();