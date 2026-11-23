/* ARGUS IA: authenticated, read-only assistant. Never stores credentials in the browser. */
(() => {
 'use strict';
 const portal=!!document.getElementById('argus-portal-ai');
 const admin=!!document.getElementById('page-argus-ai');
 // Clean legacy payment/OTP query strings from browser history before further navigation.
 if(admin && /(?:[?&])(?:otp|pix_key|password|api_secret|token)=/i.test(location.search)){
   try{history.replaceState(history.state,'',location.pathname+location.hash)}catch{}
 }
 if(!portal&&!admin)return;
 const root=document.getElementById(portal?'argus-portal-ai':'page-argus-ai');
 const prefix=portal?'/api/portal/ai':'/api/admin/ai';
 const $=(selector)=>root.querySelector(selector);
 const real=(c)=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 let busy=false;
 async function call(path,body){
   if(portal)return request(prefix+path,body?{method:'POST',body}:{method:'GET'});
   if(body)return post(prefix+path,body);
   return api(prefix+path);
 }
 function message(content,role='assistant',from=''){
   const pane=$('.ai-conversation');
   const line=document.createElement('div');line.className='ai-message '+(role==='user'?'ai-user':'ai-assistant');
   const title=document.createElement('small');title.textContent=role==='user'?'Você':from||'Argus IA';
   const text=document.createElement('p');text.textContent=content;line.append(title,text);
   pane.append(line);pane.scrollTop=pane.scrollHeight;
 }
 async function refresh(){
   if(root.hidden|| (portal && !document.querySelector('#dashboard:not([hidden])')))return;
   const status=$('.ai-status'),grid=$('.ai-metrics'),alerts=$('.ai-alerts');
   try{
     const [info,response]=await Promise.all([call('/status'),call('/insights')]);
     const s=response.insights||{};
     status.textContent=info.groq_configured?'Groq configurada · orientações públicas assistidas':'Análises e orientações locais · dados financeiros não enviados à IA externa';
     const metrics=[
       ['Recebidos confirmados (30 dias)',real(s.received_cents)],
       ['Enviados confirmados (30 dias)',real(s.sent_cents)],
       ['Recebidos hoje',real(s.today_received_cents)],
       ['Pendentes / revisão',String(s.pending_count||0)]
     ];
     grid.replaceChildren();
     for(const [label,value] of metrics){
       const card=document.createElement('div');card.className='ai-metric';
       const name=document.createElement('small');name.textContent=label;
       const number=document.createElement('strong');number.textContent=value;
       card.append(name,number);grid.append(card);
     }
     alerts.replaceChildren();
     const list=s.alerts||[];
     if(!list.length){const p=document.createElement('p');p.textContent='Nenhum alerta pelas regras atuais. Isso não garante ausência de fraude.';alerts.append(p);}
     for(const a of list){const item=document.createElement('p');const heading=document.createElement('strong');heading.textContent=a.title+' · ';item.append(heading,document.createTextNode(a.message));alerts.append(item);}
     $('.ai-foot').textContent=s.note||'Registros financeiros apenas para consulta.';
   }catch(err){status.textContent='Não foi possível consultar as análises: '+(err.message||'erro');}
 }
 async function send(ev){
   ev.preventDefault();if(busy)return;
   const field=$('.ai-question'),btn=$('.ai-send');
   const q=field.value.trim();if(q.length<2||q.length>850)return;
   busy=true;btn.disabled=true;field.value='';message(q,'user');
   try{const res=await call('/chat',{message:q});message(res.reply,'assistant',res.source==='groq'?'Argus IA · Groq':'Argus IA · orientações locais');}
   catch(err){message('Não foi possível responder: '+(err.message||'erro')+'. Seus pagamentos não foram alterados.','assistant','Argus IA');}
   finally{busy=false;btn.disabled=false;field.focus();}
 }
 $('.ai-form').addEventListener('submit',send);
 $('.ai-refresh').addEventListener('click',refresh);
 root.querySelectorAll('[data-ai-question]').forEach(b=>b.addEventListener('click',()=>{$('.ai-question').value=b.dataset.aiQuestion;$('.ai-question').focus()}));
 if(portal){
   const oldRender=render;
   render=function(account){oldRender(account);refresh();};
 }else{
   const oldLoad=loadPage;
   loadPage=async function(page){if(page==='argus-ai'){await refresh();return;}return oldLoad(page);};
 }
})();
