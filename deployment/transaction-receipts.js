/* ArgusPay receipts: authenticated read-only data, no payment or payout mutation. */
(()=>{
'use strict';
if(window.ArgusReceipts)return;
const E=id=>document.getElementById(id);
const valid=id=>/^[a-zA-Z0-9_-]{1,80}$/.test(String(id||''));
const money=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)/100):'Não informado';
const dt=v=>{if(!v)return null;const s=String(v),d=new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s)?s.replace(' ','T')+'Z':s);return isNaN(d)?null:new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Sao_Paulo'}).format(d)+' (Brasília)'};
const logo='/static/assets/argus-payments-logo-transparent.webp';
const add=(p,tag,t,cl)=>{const x=document.createElement(tag);if(t!==undefined)x.textContent=t;if(cl)x.className=cl;p.append(x);return x};
const button=(p,t,fn)=>{const b=add(p,'button',t,'argus-tx-receipt-button');b.type='button';b.onclick=fn;return b};
const allowed=r=>r&&r.issuer==='ArgusPay'&&valid(r.id)&&typeof r.confirmed==='boolean'&&['deposit','withdrawal'].includes(r.kind);
let currentDialog=null;
function close(){if(currentDialog?.open)currentDialog.close();currentDialog?.remove();currentDialog=null}
function fields(r){
 const x=[['Identificador ArgusPay',r.id],['Operação',r.kind==='withdrawal'?'Saque via Pix':'Recebimento via Pix'],
 ['Valor da operação',money(r.amount_cents)]];
 if(r.fee_cents!==null&&r.fee_cents!==undefined)x.push(['Taxa registrada',money(r.fee_cents)]);
 if(r.net_cents!==null&&r.net_cents!==undefined)x.push([r.kind==='withdrawal'?'Valor líquido previsto ao destino':'Valor líquido registrado',money(r.net_cents)]);
 if(r.account_name)x.push(['Titular da conta',r.account_name]);
 if(r.document_masked)x.push(['Documento do titular',r.document_masked]);
 if(r.pix_key_masked)x.push(['Chave Pix de destino (mascarada)',r.pix_key_masked]);
 if(r.description)x.push(['Descrição',r.description]);
 if(dt(r.created_at))x.push(['Data da solicitação',dt(r.created_at)]);
 if(dt(r.settled_at))x.push(['Registro da confirmação',dt(r.settled_at)]);
 if(dt(r.checked_at))x.push(['Última consulta registrada',dt(r.checked_at)]);
 if(r.end_to_end_id)x.push(['Identificador Pix End-to-End',r.end_to_end_id]);
 x.push(['Emitido em',dt(r.issued_at)||'Não informado']);
 return x;
}
function render(r,scope='public'){
 if(!allowed(r))throw Error('Registro não disponível.');
 close();const d=document.createElement('dialog');d.id='argus-tx-receipt-dialog';d.className='argus-tx-receipt-dialog';
 const head=add(d,'div',undefined,'argus-tx-receipt-toolbar');
 add(head,'strong','ArgusPay · Comprovantes');
 button(head,'Fechar',close);
 const paper=add(d,'article',undefined,'argus-tx-receipt-paper');
 const brand=add(paper,'div',undefined,'argus-tx-receipt-brand');const img=add(brand,'img');img.src=logo;img.alt='ArgusPay';
 add(paper,'small','DOCUMENTO DA PLATAFORMA','argus-tx-receipt-kicker');
 add(paper,'h2',r.title);add(paper,'div',r.status_label,'argus-tx-receipt-status'+(r.confirmed?' is-confirmed':''));
 add(paper,'div',money(r.amount_cents),'argus-tx-receipt-amount');
 const dl=add(paper,'dl');
 fields(r).forEach(([k,v])=>{add(dl,'dt',k);add(dl,'dd',String(v))});
 add(paper,'p',r.notice,'argus-tx-receipt-note');
 add(paper,'small','Referência de consulta: '+r.id);
 const controls=add(d,'div',undefined,'argus-tx-receipt-controls');
 const status=add(d,'p','','argus-tx-receipt-feedback');status.setAttribute('role','status');
 const fileName='ArgusPay.pdf';
 const registerUrl='https://app.arguspay.com.br/conta#cadastro';
 // Prepare one real PDF before the user taps Share. iOS requires the native
 // share call to start within user activation, not after asynchronous canvas work.
 let prepared=null,verification=null,pdfGeneration=0;
 const download=button(controls,'Baixar PDF',()=>{if(!prepared)return;const url=URL.createObjectURL(prepared);const a=document.createElement('a');a.href=url;a.download=fileName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent='ArgusPay.pdf pronto para salvar.'});
 button(controls,'Imprimir / salvar PDF',()=>{
  const previous=document.title;
  const restore=()=>{document.title=previous;window.removeEventListener('afterprint',restore)};
  window.addEventListener('afterprint',restore,{once:true});
  document.title='ArgusPay';window.print();
 });
 const share=button(controls,'Compartilhar',async()=>{
  if(!prepared)return;
  try{
   const f=new File([prepared],fileName,{type:'application/pdf'});
   const payload={files:[f],title:'ArgusPay',url:registerUrl};
   if(navigator.share&&navigator.canShare?.(payload)){
    await navigator.share(payload);
   }else if(navigator.share&&navigator.canShare?.({files:[f],text:registerUrl})){
    await navigator.share({files:[f],text:registerUrl});
   }else{
    status.textContent='Baixe ArgusPay.pdf e use Copiar link de cadastro para enviar junto ao arquivo.';
   }
  }catch(e){if(e.name!=='AbortError')status.textContent='Baixe ArgusPay.pdf e use Copiar link de cadastro para enviar junto ao arquivo.'}
 });
 button(controls,'Copiar link de cadastro',async()=>{
  try{await navigator.clipboard.writeText(registerUrl);status.textContent='Link de cadastro copiado.'}
  catch(e){status.textContent=registerUrl}
 });
 if(r.confirmed&&['admin','seller'].includes(scope)){
  const prefix=scope==='admin'?'/api/admin/growth':'/api/portal/growth';
  const invoke=(path,body)=>scope==='admin'?post(prefix+path,body):request(prefix+path,{method:'POST',body});
  const make=button(controls,'Criar link de verificação',async()=>{
   if(!confirm('O link permite consultar valor e status por 30 dias. Criar link público?'))return;
   make.disabled=true;revoke.disabled=true;
   try{
    const v=await invoke('/verify',{kind:r.kind,id:r.id});
    if(!/^\/verify#[a-f0-9]{64}$/.test(v.path||''))throw Error('Link indisponível');
    const url=location.origin+v.path;
    let qr=paper.querySelector('.argus-verify-qr');if(!qr)qr=add(paper,'div',undefined,'argus-verify-qr');
    qr.replaceChildren();add(qr,'small','Verificação pública · válida por 30 dias');
    const link=add(qr,'a','Abrir verificação');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    let qrImage=null;
    if(typeof QRCode==='function'){
     const q=add(qr,'div');try{new QRCode(q,{text:url,width:240,height:240,correctLevel:QRCode.CorrectLevel.M});qrImage=q.querySelector('canvas')||q.querySelector('img')}catch{q.remove()}
    }
    verification={url,image:qrImage};prepare();
    try{await navigator.clipboard.writeText(url);status.textContent='Link copiado. Preparando PDF com verificação.'}catch{status.textContent=url}
   }catch(e){status.textContent=e.message}finally{make.disabled=false;revoke.disabled=false}
  });
  const revoke=button(controls,'Revogar links de verificação',async()=>{
   if(!confirm('Revogar todos os links de verificação deste registro?'))return;
   make.disabled=true;revoke.disabled=true;
   try{await invoke('/revoke-verification',{id:r.id});verification=null;paper.querySelector('.argus-verify-qr')?.remove();prepare()}catch(e){status.textContent=e.message}finally{make.disabled=false;revoke.disabled=false}
  });
 }
 function prepare(){
  const generation=++pdfGeneration;prepared=null;download.disabled=true;share.disabled=true;status.textContent='Preparando ArgusPay.pdf…';
  pdf(r,verification).then(b=>{if(generation!==pdfGeneration)return;prepared=b;download.disabled=false;share.disabled=false;status.textContent=verification?'PDF com verificação pronto.':'PDF pronto.'}).catch(()=>{if(generation===pdfGeneration)status.textContent='Não foi possível preparar o PDF. Use Imprimir / salvar PDF.'});
 }
 prepare();
 d.addEventListener('close',()=>{if(currentDialog===d){currentDialog=null;d.remove()}});
 document.body.append(d);currentDialog=d;d.showModal();
}
// A single-page PDF generated from the same server-issued record, with brand
// image and full values. Browser canvas keeps accented Portuguese text intact.
async function pdf(r,verification=null){
 const canvas=document.createElement('canvas');canvas.width=1240;
 const c=canvas.getContext('2d');if(!c)throw Error('PDF unavailable');
 function lines(text,font,limit){
  c.font=font;const out=[];let line='';
  for(const word of String(text??'').split(/\s+/)){
   if(!word)continue;
   if(c.measureText((line?line+' ':'')+word).width<=limit){line+=(line?' ':'')+word;continue;}
   if(line){out.push(line);line=''}
   for(const ch of Array.from(word)){if(line&&c.measureText(line+ch).width>limit){out.push(line);line=''}line+=ch}
  }
  if(line)out.push(line);return out.length?out:[''];
 }
 const rows=fields(r).map(([key,value])=>({key,lines:lines(value,'29px sans-serif',1090)}));
 const notice=lines(r.notice,'24px sans-serif',1090);
 const verifyLines=verification?lines(verification.url,'20px sans-serif',780):[];
 const required=493+rows.reduce((n,row)=>n+54+34*row.lines.length,0)+35+notice.length*30+(verification?Math.max(320,80+verifyLines.length*26):0)+100;
 canvas.height=Math.max(1754,required);
 c.fillStyle='#fff';c.fillRect(0,0,1240,canvas.height);
 c.fillStyle='#111b29';c.fillRect(0,0,1240,178);
 const im=new Image();im.src=logo;try{await im.decode();const scale=Math.min(280/im.width,132/im.height,1),w=im.width*scale,h=im.height*scale;c.drawImage(im,72,(178-h)/2,w,h)}catch{c.fillStyle='#ecc785';c.font='bold 48px sans-serif';c.fillText('ARGUS PAY',72,108)}
 c.fillStyle='#c39d62';c.font='bold 23px sans-serif';c.fillText('DOCUMENTO DA PLATAFORMA',74,228);
 c.fillStyle='#172336';c.font='bold 47px sans-serif';c.fillText(r.title,74,291);
 c.fillStyle=r.confirmed?'#16704a':'#946019';c.font='bold 30px sans-serif';c.fillText(r.status_label,74,349);
 c.fillStyle='#152135';c.font='bold 65px sans-serif';c.fillText(money(r.amount_cents),74,433);
 let y=493;
 for(const row of rows){
  c.strokeStyle='#e1e5ea';c.beginPath();c.moveTo(74,y-19);c.lineTo(1166,y-19);c.stroke();
  c.font='bold 22px sans-serif';c.fillStyle='#56657a';c.fillText(row.key,74,y+8);
  c.font='29px sans-serif';c.fillStyle='#172336';row.lines.forEach((line,i)=>c.fillText(line,74,y+43+34*i));
  y+=54+34*row.lines.length;
 }
 y+=20;c.font='24px sans-serif';c.fillStyle='#536174';notice.forEach((line,i)=>c.fillText(line,74,y+30*i));y+=30*notice.length+20;
 if(verification){
  c.fillStyle='#172336';c.font='bold 24px sans-serif';c.fillText('VERIFICAÇÃO PÚBLICA · VÁLIDA POR 30 DIAS',74,y+20);
  c.font='20px sans-serif';verifyLines.forEach((line,i)=>c.fillText(line,74,y+60+26*i));
  if(verification.image){try{if(verification.image instanceof HTMLImageElement&&!verification.image.complete)await verification.image.decode();c.imageSmoothingEnabled=false;c.fillStyle='#fff';c.fillRect(896,y+38,268,268);c.drawImage(verification.image,926,y+68,208,208);c.imageSmoothingEnabled=true}catch{}}
 }
 const footer=canvas.height-77;c.fillStyle='#e0b76f';c.fillRect(74,footer,1092,3);
 c.fillStyle='#516074';c.font='20px sans-serif';c.fillText('ARGUS PAY  •  Consulte o registro atualizado no painel',74,footer+38);
 const jpg=new Uint8Array(await (await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(Error('PDF unavailable')),'image/jpeg',0.94))).arrayBuffer());
 const en=new TextEncoder(),parts=[],offsets=[0];let size=0;
 const push=v=>{const b=typeof v==='string'?en.encode(v):v;parts.push(b);size+=b.length};
 const obj=(n,s)=>{offsets[n]=size;push(n+' 0 obj\n'+s+'\nendobj\n')};
 push('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
 offsets[4]=size;push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height '+canvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n');push(jpg);push('\nendstream\nendobj\n');
 const scale=Math.min(595/1240,842/canvas.height),w=(1240*scale).toFixed(3),h=(canvas.height*scale).toFixed(3),x=((595-Number(w))/2).toFixed(3),yOffset=(842-Number(h)).toFixed(3);
 const commands='q '+w+' 0 0 '+h+' '+x+' '+yOffset+' cm /Im0 Do Q\n';obj(5,'<< /Length '+en.encode(commands).length+' >>\nstream\n'+commands+'endstream');
 const xref=size;push('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');push('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return new Blob(parts,{type:'application/pdf'});
}
async function fetchJson(path){if(path.startsWith('/api/admin/')&&typeof api==='function')return api(path);const res=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!res.ok)throw Error('Registro indisponível ou sessão expirada.');return res.json()}
async function open(scope,kind,id){
 if(!valid(id))return;
 try{const path=scope==='admin'?'/api/admin/receipts/'+kind+'/'+encodeURIComponent(id):'/api/portal/receipts/'+encodeURIComponent(id);
 const data=await fetchJson(path);if(data.receipt?.id!==id)throw Error('Registro indisponível.');render(data.receipt,scope)}
 catch(e){alert(e.message)}
}
function attach(host,scope,kind,id,label='Ver comprovante'){
 if(!host||!valid(id))return;
 let b=Array.from(host.querySelectorAll('[data-argus-receipt]')).find(x=>x.dataset.argusReceipt===id);
 if(!b){b=button(host,label,()=>open(scope,kind,id));b.dataset.argusReceipt=id}return b;
}
function publicButton(host,charge,reload){
 if(!host)return;
 let b=host.querySelector('[data-argus-public-receipt]');
 const paid=charge?.receipt_is_provider_settled===true&&allowed(charge.receipt)&&charge.receipt.confirmed===true;
 if(!paid){if(b)b.hidden=true;return}
 if(!b){b=button(host,'Ver comprovante',()=>{});b.dataset.argusPublicReceipt='1'}
 b.hidden=false;b.onclick=async()=>{try{const latest=await reload();if(!latest?.receipt?.confirmed||latest.id!==charge.id)throw Error('Pagamento não confirmado neste momento.');render(latest.receipt)}catch(e){alert(e.message)}};
}
function listPanel(host,scope){
 if(!host||host.querySelector('[data-argus-receipts-panel]'))return;
 const box=add(host,'section',undefined,'argus-tx-receipt-list');box.dataset.argusReceiptsPanel=scope;
 add(box,'h3','Comprovantes e extrato');
 add(box,'p','Consulte recebimentos e saques registrados no período. Operações pendentes não comprovam liquidação.');
 const filters=add(box,'div',undefined,'argus-tx-receipt-filters');
 const formId=scope==='admin'?'argus-operations-export':'argus-seller-csv-form';
 const list=add(box,'div',undefined,'argus-tx-receipt-list-body');
 const load=async()=>{const form=E(formId);const q=new URLSearchParams();if(form?.elements?.from?.value)q.set('from',form.elements.from.value);if(form?.elements?.to?.value)q.set('to',form.elements.to.value);
 list.textContent='Consultando movimentações…';try{const data=await fetchJson((scope==='admin'?'/api/admin/receipts':'/api/portal/receipts')+'?'+q);list.replaceChildren();if(!Array.isArray(data.items)||!data.items.length){add(list,'p','Nenhuma operação encontrada.');return}
 for(const r of data.items){if(!valid(r.id))continue;const line=add(list,'div',undefined,'argus-tx-receipt-row');const a=add(line,'div');add(a,'strong',(r.kind==='withdrawal'?'Saque':'Recebimento')+' · '+money(r.amount_cents));add(a,'small',(dt(r.created_at)||'')+' · '+(r.status==='paid'?'Registrado como pago':r.status));attach(line,scope,r.kind,r.id,r.status==='paid'?'Ver comprovante':'Ver registro');}
 if(data.truncated)add(list,'p','Mostrando os 150 registros mais recentes. Reduza o intervalo para consultar os demais.')}catch(e){list.textContent=e.message}};
 button(filters,'Consultar comprovantes',load);
}
// Unlimited historical access with server-authorized, stable pagination.
function confirmedArchive(host){
 if(!host||host.querySelector('[data-argus-confirmed-archive]'))return;
 const box=add(host,'section',undefined,'argus-tx-receipt-list');box.dataset.argusConfirmedArchive='1';
 add(box,'h3','Comprovantes de todos os Pix confirmados');
 add(box,'p','Histórico completo de recebimentos da sua conta administrativa, inclusive Pix antigos e QR Codes vencidos. Os dados são consultados novamente ao abrir cada comprovante.');
 const actions=add(box,'div',undefined,'argus-tx-receipt-filters');
 const info=add(box,'p','');info.setAttribute('role','status');
 const list=add(box,'div',undefined,'argus-tx-receipt-list-body');
 let cursor=null,busy=false,loaded=false,count=0;
 const seen=new Set();
 const more=button(actions,'Carregar mais',()=>load(false));more.hidden=true;
 const refresh=button(actions,'Atualizar comprovantes',()=>load(true));
 async function load(reset){
  if(busy||(!reset&&!cursor))return;
  busy=true;more.disabled=true;refresh.disabled=true;info.textContent='Consultando Pix confirmados…';
  try{
   const path='/api/admin/receipts/confirmed-pix'+(!reset&&cursor?'?cursor='+encodeURIComponent(cursor):'');
   const data=await fetchJson(path);
   if(!Array.isArray(data.items))throw Error('Histórico indisponível.');
   if(reset){list.replaceChildren();seen.clear();count=0;}
   for(const r of data.items){
    if(!valid(r.id)||r.status!=='paid'||seen.has(r.id))continue;
    seen.add(r.id);count++;
    const line=add(list,'div',undefined,'argus-tx-receipt-row');const a=add(line,'div');
    add(a,'strong',money(r.amount_cents)+' · Confirmado');
    add(a,'small',(dt(r.created_at)||'Data não registrada')+' · '+r.id);
    attach(line,'admin','deposit',r.id);
   }
   cursor=valid(data.next_cursor)?data.next_cursor:null;
   more.hidden=!cursor;loaded=true;
   info.textContent=count?count+' comprovante(s) carregado(s)'+(cursor?' · Mais registros disponíveis.':' · Fim do histórico.'):'Nenhum Pix confirmado encontrado.';
  }catch(e){info.textContent=e.message||'Não foi possível consultar os comprovantes.'}
  finally{busy=false;more.disabled=false;refresh.disabled=false;}
 }
 const auto=()=>{if(!loaded&&!busy&&!box.closest('[hidden]')&&box.getClientRects().length){load(true);return true}return false};
 if(!auto()){
  const observer=new MutationObserver(()=>{if(auto())observer.disconnect()});
  observer.observe(host,{attributes:true,attributeFilter:['hidden','class','style']});
 }
}
function init(){
 const seller=E('argus-reseller-page-statement');if(seller)listPanel(seller,'seller');
 const admin=E('argus-operations-export')?.parentElement;if(admin)listPanel(admin,'admin');
 const adminPayout=E('payout-form')?.closest('section.page');if(adminPayout)listPanel(adminPayout,'admin');
 const adminPayments=E('page-payments');if(adminPayments){confirmedArchive(adminPayments);listPanel(adminPayments,'admin');}
 const adminCharge=E('page-charge-create');if(adminCharge)confirmedArchive(adminCharge);
}
window.ArgusReceipts=Object.freeze({open,attach,publicButton});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
setInterval(init,1800);
})();