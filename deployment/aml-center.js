(()=>{'use strict';
const root=document.getElementById('argus-aml');if(!root)return;
const $=id=>document.getElementById(id),out=$('aml-output'),status=$('aml-status');
const E=(tag,text)=>{const n=document.createElement(tag);n.textContent=String(text??'');return n;};
const csrf=()=>{try{return decodeURIComponent((document.cookie.match(/(?:^|;\s*)arg_admin_csrf=([^;]*)/)||[])[1]||'')}catch{return ''}};
let busy=false,cursor='';
async function req(path,body){
 const options={credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}};
 if(body){const otp=$('aml-otp').value.trim();if(!/^\d{6}$/.test(otp))throw Error('Informe o código 2FA atual.');$('aml-otp').value='';options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=csrf();options.body=JSON.stringify({...body,otp});}
 const r=await fetch('/api/admin/aml/'+path,options);if(!r.ok)throw Error(r.status===503?'Central aguarda migração e habilitação.':'Consulta ou ação recusada. Confira os dados e a autorização.');
 return r.json();
}
async function task(fn){if(busy)return;busy=true;status.textContent='Processando…';try{await fn();status.textContent='Concluído.'}catch(e){status.textContent=e.message;}finally{busy=false}}
function render(v){out.replaceChildren();out.append(E('p',v.scope));for(const s of v.states)out.append(E('p',s.state+': '+s.n));for(const p of v.profile_counts)out.append(E('p','Perfis '+p.risk+': '+p.n));for(const c of v.cases){const article=E('article','');article.className='aml-case';article.append(E('strong',c.rule_code+' · '+c.severity),E('p',c.account_id+' · '+c.period_key+' · '+c.state));const b=E('button','Abrir caso');b.type='button';b.addEventListener('click',()=>task(async()=>{const d=await req('detail?id='+encodeURIComponent(c.id));$('aml-case-id').value=c.id;$('aml-from').value=c.state;const details=$('aml-detail');details.replaceChildren(E('h3','Dossiê interno'),E('pre',JSON.stringify(d,null,2)));}));article.append(b);out.append(article);}}
$('aml-load').addEventListener('click',()=>task(async()=>render(await req('overview'))));
$('aml-day').value=new Date().toISOString().slice(0,10);
$('aml-day').addEventListener('change',()=>{cursor='';});
$('aml-scan').addEventListener('click',()=>task(async()=>{const v=await req('scan',{day:$('aml-day').value,cursor});cursor=v.next_cursor||'';$('aml-progress').textContent=v.scanned+' contas verificadas · '+v.created+' novos alertas · '+(v.next_cursor?'há outra página; use novo código 2FA':'fim do lote');render(await req('overview'));}));
$('aml-profile').addEventListener('submit',e=>{e.preventDefault();task(async()=>{const v=Object.fromEntries(new FormData(e.target));v.expected_monthly_cents=Number(v.expected_monthly_cents);await req('profile',v);render(await req('overview'));});});
$('aml-decision').addEventListener('submit',e=>{e.preventDefault();task(async()=>{await req('decision',Object.fromEntries(new FormData(e.target)));render(await req('overview'));$('aml-detail').replaceChildren();});});
})();