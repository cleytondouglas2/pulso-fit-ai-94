/* Super Admin only: credential change is staged and 2FA protected. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const note=(s)=>{E('argus-acq-feedback').textContent=s};
async function save(ev){
 ev.preventDefault();
 const code=E('argus-acq-otp').value.trim();
 if(!/^\d{6}$/.test(code)){note('Informe o código 2FA de 6 dígitos.');return}
 const b=E('argus-acq-save');b.disabled=true;
 try {
  const res=await post('/api/admin/acquirer/credentials',{
   slot:E('argus-acq-slot').value,provider:E('argus-acq-provider').value,
   provider_label:E('argus-acq-other-name').value.trim(),
   api_key:E('argus-acq-key').value.trim(),
   api_secret:E('argus-acq-secret').value.trim(),otp:code
  });
  E('argus-acq-key').value='';E('argus-acq-secret').value='';E('argus-acq-otp').value='';
  note(res.message||'Rascunho salvo. Teste antes de ativar.');
  E('argus-acq-activate').disabled=E('argus-acq-provider').value!=='misticpay';
 } catch(err){note('Não foi possível salvar: '+err.message)}
 finally {b.disabled=false}
}
async function probeDraft(){
 try{const r=await api('/api/admin/acquirer/probe?slot='+encodeURIComponent(E('argus-acq-slot').value)+'&stage=draft');
  note((r.status==='online'?'Rascunho autenticado: ':'Rascunho não validado: ')+r.message);
 }catch(err){note(err.message)}
}
async function activate(){
 const otp=E('argus-acq-otp').value.trim();
 if(!/^\d{6}$/.test(otp)){note('Informe um novo código 2FA para ativar.');return}
 if(!confirm('Ativar novas credenciais? O sistema impedirá a troca caso existam transações pendentes.'))return;
 const b=E('argus-acq-activate');b.disabled=true;
 try{
  const r=await post('/api/admin/acquirer/activate',{slot:E('argus-acq-slot').value,otp});
  E('argus-acq-otp').value='';note(r.message||'Credenciais ativadas.');
  E('argus-acq-refresh').click();
 }catch(err){note('Ativação bloqueada: '+err.message);b.disabled=false}
}
function ready(){
 const form=E('argus-acq-form');if(!form)return;
 form.addEventListener('submit',save);
 E('argus-acq-test-draft').addEventListener('click',probeDraft);
 E('argus-acq-activate').addEventListener('click',activate);
 E('argus-acq-provider').addEventListener('change',e=>{E('argus-acq-other').hidden=e.target.value!=='other';E('argus-acq-activate').disabled=e.target.value!=='misticpay'});
 E('argus-acq-close').addEventListener('click',()=>{form.reset();E('argus-acq-editor').hidden=true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();