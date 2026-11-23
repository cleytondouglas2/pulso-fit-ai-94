(()=>{'use strict';const E=x=>document.getElementById(x);async function check(){
 const button=E('argus-status-refresh');if(button)button.disabled=true;
 try{
  const r=await fetch('/readyz',{method:'GET',cache:'no-store',credentials:'omit',headers:{Accept:'text/plain'}});
  const raw=await r.text();
  const passed=r.ok&&raw.trim()==='ARGUS_READY';
  E('argus-status-value').textContent=passed?'Banco de dados acessível':'Prontidão do banco não confirmada';
  E('argus-status-value').style.color=passed?'#9de1bd':'#f3bf8c';
  E('argus-status-details').textContent=passed?
   'O servidor respondeu e consultou o banco de dados com sucesso. A condição dos meios de pagamento não foi testada.':
   'Não foi possível validar a consulta ao banco de dados neste momento. Isso não implica necessariamente indisponibilidade de toda a plataforma.';
 }catch(_){E('argus-status-value').textContent='Consulta indisponível';E('argus-status-details').textContent='Falha de rede ao consultar a rota técnica.';}
 finally{E('argus-status-time').textContent='Última consulta: '+new Date().toLocaleString('pt-BR');if(button)button.disabled=false;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{E('argus-status-refresh').addEventListener('click',check);check()},{once:true});
else{E('argus-status-refresh')?.addEventListener('click',check);check()}
})();