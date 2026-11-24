(()=>{'use strict';
const root=document.getElementById('argus-aml');if(!root)return;
const $=id=>document.getElementById(id),out=$('aml-output'),status=$('aml-status');
const E=(tag,text)=>{const n=document.createElement(tag);n.textContent=String(text??'');return n;};

let busy=false,cursor='';
async function req(path,body){
 const url='/api/admin/aml/'+path;
 // Reuse the existing authenticated Super Admin transport and CSRF handling.
 if(body){
   const otp=$('aml-otp').value.trim();if(!/^\d{6}$/.test(otp))throw Error('Informe o código 2FA atual.');
   $('aml-otp').value='';return post(url,{...body,otp});
 }
 return api(url);
}
async function task(fn){if(busy)return;busy=true;status.textContent='Processando…';try{await fn();status.textContent='Concluído.'}catch(e){status.textContent=e.message;}finally{busy=false}}
function render(v){out.replaceChildren();out.append(E('p',v.scope));for(const s of v.states)out.append(E('p',s.state+': '+s.n));for(const p of v.profile_counts)out.append(E('p','Perfis '+p.risk+': '+p.n));for(const c of v.cases){const article=E('article','');article.className='aml-case';article.append(E('strong',c.rule_code+' · '+c.severity),E('p',c.account_id+' · '+c.period_key+' · '+c.state));const b=E('button','Abrir caso');b.type='button';b.addEventListener('click',()=>task(async()=>{const d=await req('detail?id='+encodeURIComponent(c.id));$('aml-case-id').value=c.id;$('aml-from').value=d.case.state;const details=$('aml-detail');details.replaceChildren(E('h3','Dossiê interno'),E('pre',JSON.stringify(d,null,2)));}));article.append(b);out.append(article);}}
$('aml-load').addEventListener('click',()=>task(async()=>render(await req('overview'))));
$('aml-day').value=new Date().toISOString().slice(0,10);
$('aml-day').addEventListener('change',()=>{cursor='';});$('aml-scope').addEventListener('change',()=>{cursor='';});
$('aml-scan').addEventListener('click',()=>task(async()=>{const v=await req('scan',{day:$('aml-day').value,scope:$('aml-scope').value,cursor});cursor=v.next_cursor||'';$('aml-progress').textContent=v.scanned+' contas verificadas · '+v.created+' novos alertas · '+(v.next_cursor?'há outra página; use novo código 2FA':'fim do lote');render(await req('overview'));}));
let loadedAccount='';
$('aml-profile-account').addEventListener('input',()=>{loadedAccount='';$('aml-profile-revision').value='';$('aml-profile-state').textContent='Carregue a conta antes de editar.';});
async function loadProfile(){
 const id=$('aml-profile-account').value.trim(),v=await req('profile?id='+encodeURIComponent(id));
 if($('aml-profile-account').value.trim()!==id)return;
 loadedAccount=id;$('aml-profile-revision').value=v.revision;
 const form=$('aml-profile');
 const defaults={expected_monthly_cents:0,risk:'unknown',pep:'pending',sanctions:'pending',beneficial_owner:'pending',evidence_ref:''};
 for(const [k,value] of Object.entries(defaults))form.elements.namedItem(k).value=v.profile?.[k]??value;
 $('aml-profile-state').textContent=v.profile?'Perfil carregado.':'Novo perfil.';
}
$('aml-profile-load').addEventListener('click',()=>task(loadProfile));
$('aml-profile').addEventListener('submit',e=>{e.preventDefault();task(async()=>{const v=Object.fromEntries(new FormData(e.target));if(v.account_id.trim()!==loadedAccount||!v.expected_revision)throw Error('Carregue o perfil atual antes de salvar.');v.account_id=loadedAccount;v.expected_monthly_cents=Number(v.expected_monthly_cents);await req('profile',v);await loadProfile();render(await req('overview'));});});
$('aml-decision').addEventListener('submit',e=>{e.preventDefault();task(async()=>{await req('decision',Object.fromEntries(new FormData(e.target)));render(await req('overview'));$('aml-detail').replaceChildren();});});
})();