<?php
declare(strict_types=1);
/** Apply ARGUS customer release safely to the immutable PHP source.zip during build. */
$root='/var/www/html';
function argusReplace(string $file,string $from,string $to,string $label):void{
  $str=file_get_contents($file);
  if($str===false||!str_contains($str,$from))throw new RuntimeException('ARGUS release missing: '.$label);
  $count=substr_count($str,$from);
  if($count!==1)throw new RuntimeException('ARGUS release ambiguous: '.$label.': '.$count);
  if(file_put_contents($file,str_replace($from,$to,$str))===false)throw new RuntimeException('ARGUS release write failure '.$label);
}
$gateway="$root/src/Gateway.php";
argusReplace($gateway,"require_once __DIR__ . '/Admin.php';","require_once __DIR__ . '/Admin.php';\nrequire_once __DIR__ . '/Portal.php';",'include portal');
argusReplace($gateway,"// Real-operation console: legacy demo pages, test checkout and demo login are removed.",
"// ARGUS public client and API documentation pages; customer auth is separate from admin.\n            if (\$method === 'GET' && in_array(\$path, ['/cadastro','/conta','/cliente'],true)) {self::htmlFile('client.html');return;}\n            if (\$method === 'GET' && in_array(\$path, ['/documentacao-api','/docs'],true)) {self::htmlFile('docs.html');return;}\n            // Real-operation console: legacy demo pages, test checkout and demo login are removed.",'public routes');
argusReplace($gateway,"// Only authenticated administrator API and provider-backed Pix API remain exposed.",
"// Customer portal and merchant API are isolated from administrative sessions.\n            if (str_starts_with(\$path, '/api/portal/') || str_starts_with(\$path, '/api/v1/')) {\n                \$portalDb = new Database(self::\$config);\n                \$portalDb->installAndSeed();\n                Portal::handle(\$portalDb,\$method,\$path);\n            }\n            // Only authenticated administrator API and provider-backed Pix API remain exposed.",'portal routes');
$admin="$root/src/Admin.php";

argusReplace($admin,"if(!\$actor['mfa_secret_cipher']||(int)\$actor['mfa_verified_at']<=0)self::fail('Verifique o autenticador 2FA antes de continuar',403);",
"if(!\$actor['mfa_secret_cipher']||(int)\$actor['mfa_verified_at']<=0)self::fail('Verifique o autenticador 2FA antes de continuar',403);\n        if(str_starts_with(\$path,'/api/admin/portal/')){self::writeAllowed(\$actor,true);Portal::admin(\$db,\$method,\$path);}",'superadmin customer review endpoint');

argusReplace($admin,"'ready'=>LivePix::readiness(\$db)['ready'], 'min_cents'=>100,'max_cents'=>10000,",
"'ready'=>\$configured && \$access['status']==='verified' && in_array(\$db->driver(),['pgsql','mysql'],true) && (LivePix::readiness(\$db)['checks']['storage_policy'] ?? false), 'min_cents'=>100,'max_cents'=>10000,",'dedicated finance QR availability');
argusReplace($admin,"if(!LivePix::readiness(\$db)['ready'])self::fail('Pix temporariamente indisponível',503);",
"if(!\\ArgusPayments\\Integrations\\MisticPayFinance::configured() || !in_array(\$db->driver(),['pgsql','mysql'],true) || !(LivePix::readiness(\$db)['checks']['storage_policy'] ?? false))self::fail('Pix indisponível: banco persistente ou configuração financeira ausente',503);",'independent quick Pix readiness');
$html="$root/public/static/admin.html";
argusReplace($html,'<script src="/static/admin.js?v=7" defer></script>','<script src="/static/qrcode.min.js?v=1" defer></script><script src="/static/admin.js?v=8" defer></script>','QR library');
argusReplace($html,'<link rel="icon" type="image/png" href="/static/assets/favicon.png">',
'<link rel="icon" type="image/png" href="/static/assets/argus-icon-192.png"><link rel="apple-touch-icon" href="/static/assets/argus-icon-180.png"><link rel="manifest" href="/static/manifest.webmanifest">','app icons');
argusReplace($html,'<div class="workspace-switch"><div class="workspace-switch-icon">◈</div><div><strong>ARGUS Payments</strong><small>Meu espaço financeiro</small></div><span class="workspace-chev">⌄</span></div>',
'<button type="button" class="workspace-switch" data-shortcut="dashboard" aria-label="Ir para visão geral ARGUS"><div class="workspace-switch-icon">◈</div><div><strong>ARGUS Payments</strong><small>Meu espaço financeiro</small></div><span class="workspace-chev">⌄</span></button>','functional workspace switch');
argusReplace($html,'<div class="two-col"><div class="panel">','<div class="two-col super-only"><div class="panel">','superadmin internal panels');
argusReplace($html,str_replace('\\n',"\n",'</form>\n  <p class="auth-foot">'),
str_replace('\\n',"\n",'</form><p class="muted" style="margin-top:20px">Quer receber pagamentos com a ARGUS? <a href="/cadastro">Criar conta PF ou PJ</a> · <a href="/documentacao-api">Conhecer a API</a></p>\n  <p class="auth-foot">'),'registration link');

$src=file_get_contents($html);
$src=str_replace('<button class="menu-item super-only" data-nav="users">',
'<button class="menu-item super-only" data-nav="applications"><span>▤</span> Verificação de clientes</button><button class="menu-item super-only" data-nav="users">',$src);
$applicationHtml=<<<'HTML'
<section class="page" id="page-applications" hidden>
<div class="section-top"><div><p class="eyebrow">ANÁLISE RESTRITA</p><h1>Validação de clientes</h1><p>Área exclusiva do Super Admin. Revise documentos e autorizações antes da liberação financeira.</p></div><button id="reload-applications" type="button" class="btn secondary">Atualizar</button></div>
<div class="panel table-container"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Documento</th><th>Situação</th><th>Arquivos</th><th>Ação</th></tr></thead><tbody id="application-rows"></tbody></table></div>
</section>
HTML;
$src=str_replace('<section class="page" id="page-users" hidden>', $applicationHtml.'<section class="page" id="page-users" hidden>', $src);
file_put_contents($html,$src);

$src=file_get_contents($html);
$src=str_replace(['MisticPay','Sem dados demonstrativos','PIX REAL · PILOTO','Pix real · piloto','Pix real piloto','PILOTO PIX','Registros reais da ARGUS','Operações reais · ARGUS'],['processamento financeiro','','','Pix autorizado','Pix autorizado','', 'Registros financeiros','Transações registradas'],$src);
$src=str_replace(['Operação Pix real · 2FA obrigatório · ','Encerramento do piloto','As cobranças estão sujeitas às regras do piloto Pix temporário da ARGUS.','Piloto: limite de R$ 100 por envio e R$ 500 por dia.','O banco compartilhado é temporário. Faça backups externos e migre antes do vencimento.'],
['','Período operacional','Cobranças sujeitas aos limites operacionais e à confirmação do pagamento.','Limites de envio aplicáveis.',''], $src);
$src=str_replace('Pix real','Pix',$src);
$src=str_replace('MisticPay · Pix real','ARGUS Payments',$src);
$src=str_replace('class="live-label"','class="live-label" hidden',$src);
file_put_contents($html,$src);

/* Native form fallback must never leak passwords, OTP or Pix keys in query strings. */
$src=file_get_contents($html);
foreach(['login-form','password-form','mfa-form','payout-form','charge-create-form'] as $formId){
 $src=preg_replace('~<form id="'.preg_quote($formId,'~').'"(?![^>]*\bmethod=)~','<form method="post" id="'.$formId.'"',$src,1);
}
file_put_contents($html,$src);
$js="$root/public/static/admin.js";
$script=file_get_contents($js);
$script=str_replace([
    'Falta cadastrar as credenciais QRCODES da MisticPay Finance na Render.',
    'O piloto Pix não está disponível. Confirme a ativação no dashboard.',
    'A MisticPay recusou a autenticação QRCODES',
    'Confira Client ID e Client Secret da API Finance, o escopo QRCODES e a lista de IPs autorizados na MisticPay.',
    'A autenticação da MisticPay não pôde ser verificada agora.',
    'No piloto, o Pix deve ser entre',
    'Piloto Pix: máximo de R$ 100 por cobrança.',
    'MisticPay Finance',
    'MisticPay'
],[
    'A emissão Pix não está disponível. Consulte o suporte ARGUS.',
    'A emissão Pix está indisponível no momento.',
    'A conexão de pagamentos recusou a autenticação',
    'Entre em contato com o suporte ARGUS para validar o acesso.',
    'A conexão Pix ainda não pôde ser verificada.',
    'O valor da cobrança deve ficar entre',
    'Limite atual: R$ 100 por cobrança.',
    'ARGUS Payments',
    'ARGUS Payments'
],$script);
$script .= <<<'JS'

/* Super Admin client onboarding actions; no customer-facing administrative data. */
let clientApplications=[];
const previousLoadPage=loadPage;
loadPage=async function(page){if(page==='applications')return loadApplications();return previousLoadPage(page)};
const previousNavigate=navigate;
navigate=function(page){if(page==='applications'&&state.user?.role!=='superadmin')return;return previousNavigate(page)};
async function loadApplications(){
 if(state.user?.role!=='superadmin')return;
 const list=await api('/api/admin/portal/applications');clientApplications=list;
 const target=document.getElementById('application-rows');
 target.innerHTML=list.map(a=>{
  const docs=a.documents||[];
  return '<tr><td><b>'+esc(a.display_name)+'</b><small>'+esc(a.email)+'</small><small>Validação automática: '+esc(a.validation?.label||'pendente')+'</small></td><td>'+esc(a.account_type)+'</td><td>•••• '+esc(a.document_last4)+'</td><td>'+esc(a.status)+'</td><td>'+docs.map(d=>'<a class="mini" href="/api/admin/portal/applications/'+encodeURIComponent(a.id)+'/documents/'+encodeURIComponent(d.id)+'" target="_blank" rel="noopener">'+esc(d.document_type)+'</a>').join(' ')+'</td><td><button class="mini" type="button" data-review="'+esc(a.id)+'">Analisar</button></td></tr>';
 }).join('')||empty(6,'Nenhum pedido de cadastro');
}
document.getElementById('reload-applications').onclick=()=>loadApplications().catch(err=>toast(err.message,true));
document.getElementById('application-rows').onclick=e=>{
 const b=e.target.closest('button[data-review]');if(!b)return;
 const a=clientApplications.find(x=>x.id===b.dataset.review);if(!a)return;
 dialog('Analisar cadastro: '+a.display_name, '<p class="subtle-warning">Aprovação exige análise real dos arquivos, contrato e verificação do recebedor. Nunca marque sem confirmação.</p><form id="application-review-form" class="modal-form"><label>Decisão<select name="decision" id="review-decision"><option value="approve">Validar cadastro</option><option value="reject">Rejeitar</option><option value="suspend">Suspender</option></select></label>'+ (a.account_type==='PJ'?'<label>CNPJ original confirmado<input name="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00"></label><label>E-mail do recebedor habilitado<input name="recipient_email" type="email"></label>':'<p class="muted">Para PF, a identidade poderá ser verificada, mas pagamentos exigem homologação individual do recebedor.</p>') +[['kyc_verified','Documentos e identidade conferidos'],['provider_approved','Prestador aprovou o recebedor'],['contract_signed','Contrato assinado'],['split_direction_confirmed','Regras de recebimento verificadas']].map(([k,label])=>'<label class="checkline"><input name="'+k+'" type="checkbox"><span>'+label+'</span></label>').join('') + '<label>Motivo (rejeição ou suspensão)<input name="reason" placeholder="Justificativa"></label><div class="modal-actions"><button type="submit" class="btn primary">Registrar decisão</button></div></form>','ANÁLISE DOCUMENTAL');
 document.getElementById('application-review-form').onsubmit=async ev=>{
  ev.preventDefault();const form=ev.target,data=formValues(form),decision=data.decision;
  if(decision==='approve'){
   for(const k of ['kyc_verified','provider_approved','contract_signed','split_direction_confirmed'])if(data[k]!=='on'){toast('Confirme todas as verificações antes de liberar',true);return}
   for(const k of ['kyc_verified','provider_approved','contract_signed','split_direction_confirmed'])data[k]=true;
  }
  if(!confirm('Registrar esta decisão para '+a.display_name+'?'))return;
  try{const result=await post('/api/admin/portal/applications/'+encodeURIComponent(a.id)+'/decision',data);closeDialog();await loadApplications();toast(result.message||'Decisão registrada: '+result.status)}
  catch(err){toast(err.message,true)}
 };
};

/* ARGUS visual QR receipts; local QR renderer, no external API leaks payment payload. */
(function(){
 const previous=showChargeReceipt;
 showChargeReceipt=function(data){
  previous(data);
  let host=document.getElementById('charge-qr');
  if(!host){
   host=document.createElement('div');host.id='charge-qr';host.setAttribute('aria-label','QR Code de pagamento Pix');
   host.style.cssText='display:flex;align-items:center;justify-content:center;margin:20px auto;padding:16px;border-radius:13px;background:white;width:max-content;max-width:100%';
   document.getElementById('charge-code').closest('label').before(host);
  }
  host.replaceChildren();
  if(data.pix_copy_paste && typeof QRCode==='function'){
   try{new QRCode(host,{text:data.pix_copy_paste,width:210,height:210,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}
   catch(e){host.textContent='Use o Pix Copia e Cola abaixo para pagar';console.warn('QR render unavailable')}
  }else{host.hidden=true;}
  host.hidden=!data.pix_copy_paste;
 };
})();
JS;
/* Ensure every financial action uses fetch POST rather than the browser's default GET. */
$script .= <<<'JS'

async function loadWallet(){
 if(state.user?.role!=='superadmin')return;
 await Promise.allSettled([loadWalletBalance(),loadPayoutHistory()]);
}
async function loadWalletBalance(){
 try{const result=await api('/api/admin/wallet/balance');$('#wallet-balance').textContent=fmt(result.available_cents);$('#wallet-state').textContent='Saldo atualizado por consulta autenticada.'}
 catch(err){$('#wallet-balance').textContent='—';$('#wallet-state').textContent='Saldo indisponível: '+err.message;}
}
async function loadPayoutHistory(){
 try{
  const rows=await api('/api/admin/payouts');$('#payout-rows').innerHTML=rows.map(r=>'<tr><td>'+time(r.created_at)+'</td><td>'+esc(r.pix_key_type+' '+r.pix_key_masked)+'</td><td>'+fmt(r.amount_cents)+'</td><td>'+badge(r.status)+'</td><td>'+((r.provider_tx_id&&['queued','pending','unknown'].includes(r.status))?'<button type="button" class="mini" data-payout-reconcile="'+esc(r.id)+'">Conferir</button>':'—')+'</td></tr>').join('')||empty(5);
 }catch(err){$('#payout-rows').innerHTML=empty(5,'Não foi possível consultar o histórico');toast(err.message,true);}
}
$('#wallet-refresh').onclick=loadWalletBalance;
$('#payout-rows').onclick=async e=>{
 const button=e.target.closest('button[data-payout-reconcile]');if(!button)return;
 button.disabled=true;try{await post('/api/admin/payouts/'+encodeURIComponent(button.dataset.payoutReconcile)+'/reconcile');await loadPayoutHistory();toast('Situação consultada com segurança')}catch(err){toast(err.message,true)}finally{button.disabled=false}
};
$('#payout-form').setAttribute('method','post');$('#payout-form').setAttribute('action','/api/admin/payouts');
$('#payout-form').onsubmit=async event=>{
 event.preventDefault();if(state.user?.role!=='superadmin')return;
 const form=event.target,raw=formValues(form),numeric=Number(String(raw.amount||'').replace(',','.'));
 const amount=Math.round(numeric*100);
 if(!Number.isFinite(numeric)||Math.abs(amount/100-numeric)>0.000001||amount<100||amount>10000){toast('Valor permitido: R$ 1,00 a R$ 100,00',true);return;}
 if(!raw.confirm||!raw.otp){toast('Confirme e informe um novo código do autenticador',true);return}
 if(!confirm('Confirma a transferência de '+fmt(amount)+' para chave informada? Essa ação movimenta dinheiro real.'))return;
 const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
 const idempotency_key=form.dataset.idem||crypto.randomUUID();form.dataset.idem=idempotency_key;
 try{
  const response=await post('/api/admin/payouts',{amount_cents:amount,pix_key_type:raw.pix_key_type,pix_key:raw.pix_key,description:raw.description,otp:raw.otp,confirm:true,idempotency_key});
  delete form.dataset.idem;form.reset();await loadPayoutHistory();toast('Solicitação registrada: '+response.id+'. Confira o histórico.');
 }catch(err){toast('Não reenvie automaticamente: '+err.message,true)}
 finally{submit.disabled=false}
};
JS;
file_put_contents($js,$script);
$css="$root/public/static/polish.css";
file_put_contents($css,<<<'CSS'

/* Compact ARGUS top header; page headings remain only in page content. */
.topbar .breadcrumb,.topbar #page-heading,.topbar .live-label{display:none!important}
.topbar{min-height:64px;align-items:center}
.topbar-nav{display:flex;align-items:center;gap:12px}
.workspace-switch{width:100%;font:inherit;text-align:left;cursor:pointer;color:inherit;border:1px solid transparent}
.workspace-switch:hover,.workspace-switch:focus-visible{border-color:#967543!important;outline:0;background:#24201a}
.sidebar .menu-item{min-height:40px}
#charge-qr img,#charge-qr canvas{width:210px!important;height:210px!important;max-width:100%!important;image-rendering:auto}
@media(max-width:600px){.topbar{min-height:58px}.topbar-nav{min-width:0}.topbar .account-chip{max-width:50vw}}
CSS,FILE_APPEND);
file_put_contents("$root/public/static/manifest.webmanifest",json_encode(['name'=>'ARGUS Payments','short_name'=>'ARGUS Pay','start_url'=>'/conta','scope'=>'/','display'=>'standalone','background_color'=>'#0c1119','theme_color'=>'#0c1119','icons'=>[['src'=>'/static/assets/argus-icon-192.png','sizes'=>'192x192','type'=>'image/png','purpose'=>'any maskable'],['src'=>'/static/assets/argus-icon-512.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'any maskable']]],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE));
foreach(['client.html','portal.js','portal.css','docs.html'] as $file){
 if(!is_file("$root/public/static/$file"))throw new RuntimeException('ARGUS missing portal file '.$file);
}
echo "ARGUS Portal, QR separation, public documentation and interface patch applied\n";
