/* Diagnostic-only button. Does not initiate or confirm payment. */
(() => {
 'use strict';
 const button=document.getElementById('pix-diagnostics-check');
 const message=document.getElementById('pix-diagnostics-message');
 if(!button||!message)return;
 button.addEventListener('click',async()=>{
   button.disabled=true;message.textContent='Consultando a autenticação da API Pix, sem criar cobrança...';
   try{
     const result=await api('/api/admin/pix/diagnostics');
     message.textContent=result.message+(result.ready_to_attempt?' Você pode tentar emitir o QR Code pelo menu Gerar Pix.':' A geração real permanece bloqueada até corrigir os requisitos indicados.');
     message.style.color=result.ready_to_attempt?'#b8e5ae':'#ffcf9b';
   }catch(e){
     message.textContent='Não foi possível concluir o diagnóstico: '+(e.message||'falha')+'. Nenhuma cobrança foi criada.';
     message.style.color='#ffcf9b';
   }finally{button.disabled=false}
 });
})();
