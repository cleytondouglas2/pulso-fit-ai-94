<?php
declare(strict_types=1);
/** Final ARGUS identity-profile wiring, after all previous Docker patches and billing routes. */
$root='/var/www/html';
function identityReplace(string $path,string $find,string $replace,string $label):void{
    $text=file_get_contents($path);
    if(!is_string($text)||substr_count($text,$find)!==1)throw new RuntimeException('Identity patch: '.$label);
    file_put_contents($path,str_replace($find,$replace,$text));
}
identityReplace("$root/src/Gateway.php",
    "require_once __DIR__ . '/TraditionalQuickPix.php';",
    "require_once __DIR__ . '/TraditionalQuickPix.php';\nrequire_once __DIR__ . '/IdentityProfile.php';",
    'identity module');
identityReplace("$root/src/Admin.php",
    "if(getenv('ARGUS_QUICK_PIX_PROVIDER')==='traditional' && str_starts_with(\$path,'/api/admin/quick-pix'))TraditionalQuickPix::handle(\$db,\$method,\$path,\$actor);",
    "if(getenv('ARGUS_QUICK_PIX_PROVIDER')==='traditional' && str_starts_with(\$path,'/api/admin/quick-pix'))TraditionalQuickPix::handle(\$db,\$method,\$path,\$actor);\n        if(\$path==='/api/admin/account-profile')IdentityProfile::admin(\$db,\$method,\$path,\$actor);",
    'authenticated admin identity routes');
$admin="$root/public/static/admin.html";
$html=file_get_contents($admin);
if(!is_string($html))throw new RuntimeException('Admin HTML missing');
$pattern='~<div id="argus-payer-details" class="argus-payer-details">.*?</div><div id="pix-config-alert"~s';
if(preg_match_all($pattern,$html)!==1)throw new RuntimeException('Expected original payer fields exactly once');
$new='<div id="argus-payer-details" class="argus-payer-details" hidden>'.
 '<h4>Dados utilizados automaticamente</h4><p id="argus-payer-summary" class="muted">Conferindo seu cadastro PF/PJ...</p>'.
 '<button id="argus-edit-profile" type="button" class="btn secondary">Conferir meu cadastro</button>'.
 '<p class="muted">Nome e CPF/CNPJ são obtidos com segurança no servidor. Você informa somente o valor.</p></div>'.
 '<div id="pix-config-alert"';
$html=preg_replace_callback($pattern,static fn()=> $new,$html,1);
$old='Informe o valor e preencha os dados reais do pagador para emitir a cobrança pela MisticPay.';
if(substr_count($html,$old)!==1)throw new RuntimeException('Pix introduction missing');
$html=str_replace($old,'Digite somente o valor. A ARGUS usa os dados PF/PJ que você confirmou no cadastro.',$html);
$old='Digite o valor e informe nome completo e CPF do pagador.';
if(substr_count($html,$old)!==1)throw new RuntimeException('Pix helper missing');
$html=str_replace($old,'Valor da cobrança: nome e documento vêm automaticamente do cadastro.',$html);
if(substr_count($html,'<script src="/static/admin.js?v=13" defer></script>')!==1)throw new RuntimeException('Admin JS version mismatch');
$html=str_replace('<script src="/static/admin.js?v=13" defer></script>',
    '<script src="/static/admin.js?v=14" defer></script>',$html);
if(substr_count($html,'</body>')!==1)throw new RuntimeException('Admin body end missing');
$html=str_replace('</body>','<script src="/static/account-profile.js?v=1" defer></script></body>',$html);
file_put_contents($admin,$html);
// Eliminate browser payer inputs entirely, including the shadowed two-stage submit handler.
$jsPath="$root/public/static/admin.js";$js=file_get_contents($jsPath);
if(!is_string($js))throw new RuntimeException('Admin JS missing');
$start="$('#charge-create-form').onsubmit=async event=>{\n  event.preventDefault();\n  if(window.argusQuickPixTraditional){";
$original="  event.preventDefault();if(!canWrite())return;";
$st=strpos($js,$start);
$finish=$st===false?false:strpos($js,$original,$st+strlen($start));
if($st===false||$finish===false)throw new RuntimeException('Two-stage Pix handler not found');
$js=substr($js,0,$st)."$('#charge-create-form').onsubmit=async event=>{\n".substr($js,$finish);
$amount='const payload={amount_cents:amount,idempotency_key:key};';
$index=strpos($js,$amount);
if($index===false)throw new RuntimeException('Pix amount payload missing');
$originalProvider="   if(window.argusQuickPixTraditional){\n    payload.payer_name=document.getElementById('argus-payer-name').value.trim();\n    payload.payer_document=document.getElementById('argus-payer-cpf').value.replace(/\\D/g,'');\n   }\n";
if(substr_count($js,$originalProvider)!==1)throw new RuntimeException('Legacy payer payload is still present in unknown form');
$js=str_replace($originalProvider,'',$js);
$disabled="submit.disabled=!!submit.dataset.busy||cents<100||cents>10000||financePixAccess!=='verified';";
if(substr_count($js,$disabled)!==1)throw new RuntimeException('Pix button guard not found');
$js=str_replace($disabled,
    "submit.disabled=!!submit.dataset.busy||cents<100||cents>10000||financePixAccess!=='verified'||(window.argusQuickPixTraditional&&window.argusProfileReady!==true);",
    $js);
$cfg="const cfg=await api('/api/admin/quick-pix/config');";
if(substr_count($js,$cfg)!==1)throw new RuntimeException('Pix config hook missing');
$js=str_replace($cfg,$cfg."\n   window.argusProfileRefresh?.();",$js);
$reset="   if(payerPane){payerPane.hidden=true;payerPane.querySelectorAll('input').forEach(el=>el.required=false);}";
if(substr_count($js,$reset)!==1)throw new RuntimeException('Pix form cleanup mismatch');
$js=str_replace($reset,"   if(payerPane)payerPane.hidden=false;",$js);
file_put_contents($jsPath,$js);
// Existing customer registration already uses PF/PJ; require active selection.
$client="$root/public/static/client.html";$ch=file_get_contents($client);
if(!is_string($ch))throw new RuntimeException('Portal HTML absent');
$old='<select name="account_type" id="account-type" required><option value="PF">';
if(substr_count($ch,$old)!==1)throw new RuntimeException('Portal account-type dropdown missing');
$ch=str_replace($old,
    '<select name="account_type" id="account-type" required><option value="" disabled selected>Selecione o tipo de pessoa</option><option value="PF">',$ch);
$profileHtml=<<<'HTML'
<article id="portal-identity-prompt" class="panel" hidden>
  <h2>Confirme seus dados cadastrais</h2>
  <p>Seu cadastro foi criado antes da atualização. Para proteger seus dados e continuar utilizando os recursos da ARGUS, confirme sua identificação. Os documentos ficam criptografados.</p>
  <form id="portal-identity-form" class="form" method="post">
    <label>Tipo de pessoa
      <select id="portal-identity-type" disabled>
        <option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option>
      </select>
      <input name="account_type" id="portal-identity-type-hidden" type="hidden">
    </label>
    <label id="portal-identity-name-label">Nome completo / Razão social
      <input name="legal_name" id="portal-identity-name" minlength="3" maxlength="180" required autocomplete="name">
    </label>
    <label id="portal-identity-doc-label">CPF / CNPJ
      <input name="document_number" id="portal-identity-document" required autocomplete="off" inputmode="numeric" maxlength="22" placeholder="Confirme o documento original">
    </label>
    <p class="muted">Por segurança, o CPF/CNPJ deve corresponder ao documento informado na abertura da conta. Para mudar o tipo de pessoa, solicite uma revisão cadastral.</p>
    <button class="primary" type="submit">Confirmar cadastro</button>
  </form>
</article>
HTML;
$old='<section id="dashboard" hidden><div class="dash-top">';
if(substr_count($ch,$old)!==1)throw new RuntimeException('Portal dashboard anchor missing');
$ch=str_replace($old,'<section id="dashboard" hidden>'.$profileHtml.'<div class="dash-top"',$ch);
if(substr_count($ch,'/static/portal.js?v=1')!==1)throw new RuntimeException('Portal JS cache anchor missing');
$ch=str_replace('/static/portal.js?v=1','/static/portal.js?v=5',$ch);
file_put_contents($client,$ch);
$portalJs="$root/public/static/portal.js";$pj=file_get_contents($portalJs);
if(!is_string($pj))throw new RuntimeException('Portal JS absent');
$needle=" const dv=account.document_validation||{};";
if(substr_count($pj,$needle)!==1)throw new RuntimeException('Portal render hook missing');
$script=<<<'JS'
 const profile=account.identity_profile||{complete:false};
 const prompt=$('#portal-identity-prompt');
 if(prompt){
   prompt.hidden=!!profile.complete;
   if(!profile.complete){
     $('#portal-identity-type').value=account.account_type;
     $('#portal-identity-type-hidden').value=account.account_type;
     $('#portal-identity-name').value=account.display_name;
     $('#portal-identity-name-label').firstChild.textContent=account.account_type==='PJ'?'Razão social':'Nome completo';
     $('#portal-identity-doc-label').firstChild.textContent=account.account_type==='PJ'?'CNPJ':'CPF';
     $('#portal-identity-document').value='';
   }
 }
JS;
$pj=str_replace($needle,$script."\n".$needle,$pj);
$needle="$('#document-recheck').onsubmit=e=>{";
if(substr_count($pj,$needle)!==1)throw new RuntimeException('Portal form hook missing');
$submit=<<<'JS'
$('#portal-identity-form').onsubmit=e=>{e.preventDefault();action(e.target,async()=>{
 const data=formData(e.target);
 const result=await request('/api/portal/account-profile',{method:'POST',body:data});
 e.target.reset();
 const current=await request('/api/portal/session');render(current.account);
 notice(result.message||'Cadastro confirmado com segurança');
})};
JS;
$pj=str_replace($needle,$submit."\n".$needle,$pj);
file_put_contents($portalJs,$pj);
$css="$root/public/static/polish.css";
file_put_contents($css,<<<'CSS'

/* Identity profile: mobile-safe payer summary, without editable CPF/CNPJ on QR generation. */
#argus-payer-details{display:block;max-width:100%;overflow-wrap:anywhere}
#argus-payer-details[hidden],#portal-identity-prompt[hidden]{display:none!important}
#argus-payer-summary{line-height:1.6;overflow-wrap:anywhere}
#portal-identity-prompt{border:1px solid rgba(205,161,79,.55);margin-bottom:18px;position:relative;z-index:3}
#portal-identity-prompt input,#portal-identity-prompt select{width:100%;box-sizing:border-box}
@media(max-width:640px){#argus-payer-details{padding:12px}#portal-identity-prompt{margin:12px 0}}
CSS,FILE_APPEND);
echo "ARGUS PF/PJ profile: admin protected endpoint, conditional next-login prompt, masked Pix data and portal registration wired.\n";
