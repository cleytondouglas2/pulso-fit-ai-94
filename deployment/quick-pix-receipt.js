/* ARGUS QR receipt facelift — presentation only.
   No payment API, credentials, merchant registration, reconciliation or other page is modified. */
(()=>{
  'use strict';
  const qr=(id)=>document.getElementById(id);
  const originalHeader={};
  const copyIcon='<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const downloadIcon='<svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v3h16v-3"/></svg>';
  const newIcon='<svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.4 5.6"/><path d="M20 4v7h-7"/></svg>';
  let lastCharge='';
  const notify=(text,isError=false)=>{
    if(typeof window.toast==='function')window.toast(text,isError);
    else if(typeof toast==='function')toast(text,isError);
  };
  async function downloadImage(){
    const host=qr('charge-qr'),code=qr('charge-code')?.value||'';
    if(!host||!code){notify('Gere um Pix para baixar seu QR Code.',true);return;}
    try{
      const canvas=host.querySelector('canvas');
      const image=host.querySelector('img');
      const url=canvas&&canvas.width?canvas.toDataURL('image/png'):(image?.src||'');
      if(!url||!url.startsWith('data:image/png'))throw new Error('A imagem do QR Code ainda não está pronta');
      const a=document.createElement('a');
      a.href=url;
      a.download='ARGUS-Pix-'+(lastCharge.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,54)||'cobranca')+'.png';
      // On iPhone/iPad, the native share sheet lets the user select "Salvar imagem".
      if(/iPhone|iPad|iPod/.test(navigator.userAgent) &&
         typeof File==='function' && typeof navigator.share==='function' && typeof navigator.canShare==='function'){
        try{
          const blob=await(await fetch(url)).blob();
          const file=new File([blob],a.download,{type:'image/png'});
          if(navigator.canShare({files:[file]})){
            await navigator.share({files:[file],title:'QR Code Pix ARGUS'});
            return;
          }
        }catch(error){
          if(error?.name==='AbortError')return; // User cancelled the native share sheet.
        }
      }
      document.body.appendChild(a);a.click();a.remove();
      notify('QR Code disponível para salvar. No iPhone, use Compartilhar → Salvar imagem, se necessário.');
    }catch(error){notify('Não foi possível baixar o QR Code. Verifique a imagem e tente novamente.',true);}
  }
  function newCharge(){
    const receipt=qr('charge-receipt'),placeholder=qr('charge-placeholder');
    if(!receipt)return;
    receipt.hidden=true;
    if(placeholder)placeholder.hidden=false;
    qr('charge-code').value='';
    const amount=qr('simple-pix-value');
    if(amount){amount.value='0,00';amount.dispatchEvent(new Event('input',{bubbles:true}));}
    if(typeof window.refreshPixButton==='function')window.refreshPixButton();
    const title=qr('page-charge-create')?.querySelector('.charge-result .panel-head h3');
    const hint=qr('page-charge-create')?.querySelector('.charge-result .panel-head p');
    if(title&&originalHeader.title)title.textContent=originalHeader.title;
    if(hint&&originalHeader.hint)hint.textContent=originalHeader.hint;
    qr('charge-create-form')?.scrollIntoView({behavior:'smooth',block:'start'});
    amount?.focus({preventScroll:true});
    // The previous charge is retained in history and continues to be reconciled;
    // this button never creates a new charge by itself.
  }
  function decorate(data){
    const receipt=qr('charge-receipt'),code=qr('charge-code'),copy=qr('charge-copy'),host=qr('charge-qr');
    if(!receipt||!code||!copy)return;
    const hasCode=typeof data?.pix_copy_paste==='string'&&data.pix_copy_paste.length>0;
    if(!hasCode)return;
    lastCharge=data.id||'';
    const panel=receipt.closest('.charge-result');
    const title=panel?.querySelector('.panel-head h3');
    const hint=panel?.querySelector('.panel-head p');
    if(title){if(!originalHeader.title)originalHeader.title=title.textContent;title.textContent='QR Code PIX';}
    if(hint){if(!originalHeader.hint)originalHeader.hint=hint.textContent;hint.textContent='Compartilhe este QR Code para receber o pagamento.';}
    receipt.classList.add('argus-pix-receipt');
    const label=code.closest('label');
    if(label){
      label.classList.add('argus-pix-code-label');
      // Preserve original textarea and its ID; the existing Copy action and auto-status keep working.
      label.firstChild.textContent='Chave PIX / Pix Copia e Cola';
      code.setAttribute('aria-label','Código Pix completo para copiar e colar');
      code.readOnly=true;
      code.wrap='soft';
      code.rows=7;
      if(!qr('argus-pix-code-row')){
        const row=document.createElement('div');
        row.id='argus-pix-code-row';
        row.className='argus-pix-code-row';
        label.before(row);
        row.append(label,copy);
      }
    }
    copy.classList.remove('full');
    copy.classList.add('argus-pix-copy-icon');
    copy.type='button';
    copy.setAttribute('aria-label','Copiar código Pix completo');
    copy.title='Copiar código Pix';
    copy.innerHTML=copyIcon;
    // Display the complete Pix string instead of clipping it inside a 1-line strip.
    code.style.height='auto';
    code.style.height=Math.max(144,code.scrollHeight+10)+'px';
    if(host){
      host.classList.add('argus-pix-qr-host');
      host.replaceChildren();
      host.hidden=false;
      if(typeof QRCode==='function'){
        try{new QRCode(host,{text:code.value,width:320,height:320,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}
        catch(error){host.textContent='Não foi possível desenhar o QR Code. Use o Pix Copia e Cola.';}
      }
    }
    let actions=qr('argus-pix-receipt-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.id='argus-pix-receipt-actions';
      actions.className='argus-pix-receipt-actions';
      actions.innerHTML='<button type="button" id="argus-pix-download" class="btn secondary full">'+downloadIcon+'<span>Baixar QR Code</span></button>'+
        '<button type="button" id="argus-pix-new" class="btn secondary full">'+newIcon+'<span>Novo QR Code</span></button>';
      const reconcile=qr('charge-reconcile');
      if(reconcile)reconcile.before(actions);
      else receipt.appendChild(actions);
      qr('argus-pix-download').addEventListener('click',downloadImage);
      qr('argus-pix-new').addEventListener('click',newCharge);
    }
    actions.hidden=false;
    qr('argus-pix-download').disabled=false;
  }
  function attach(){
    const original=window.showChargeReceipt;
    if(typeof original!=='function'||original.__argusReceiptFormat)return;
    const formatted=function(data){const result=original.apply(this,arguments);decorate(data);return result;};
    formatted.__argusReceiptFormat=true;
    window.showChargeReceipt=formatted;
  }
  // Defer scripts can register their listeners in either order; all wrappers call through.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);
  else attach();
})();