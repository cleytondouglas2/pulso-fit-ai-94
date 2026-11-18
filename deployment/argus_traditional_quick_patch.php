<?php
declare(strict_types=1);
/** Attach traditional Pix with real payer fields AFTER the existing authenticated admin build. */
$root='/var/www/html';
function tradReplace(string $file,string $from,string $to,string $label):void{
    $src=file_get_contents($file);
    if(!is_string($src)||substr_count($src,$from)!==1)throw new RuntimeException('Traditional Pix anchor: '.$label);
    if(file_put_contents($file,str_replace($from,$to,$src))===false)throw new RuntimeException('Traditional Pix write: '.$label);
}
tradReplace("$root/src/Gateway.php",
    "require_once __DIR__ . '/PixDiagnostics.php';",
    "require_once __DIR__ . '/PixDiagnostics.php';\nrequire_once __DIR__ . '/TraditionalQuickPix.php';",
    'backend include');
tradReplace("$root/src/Admin.php",
    "if(\$path==='/api/admin/pix/diagnostics')PixDiagnostics::status(\$db,\$method,\$path,\$actor);",
    "if(\$path==='/api/admin/pix/diagnostics')PixDiagnostics::status(\$db,\$method,\$path,\$actor);\n        if(getenv('ARGUS_QUICK_PIX_PROVIDER')==='traditional' && str_starts_with(\$path,'/api/admin/quick-pix'))TraditionalQuickPix::handle(\$db,\$method,\$path,\$actor);",
    'MFA and CSRF protected traditional Pix route');
tradReplace("$root/public/static/admin.html",
    '<div id="pix-config-alert"',
    '<div id="argus-payer-details" class="argus-payer-details" hidden><h4>Dados do pagador</h4><p class="muted">Para emitir pela API tradicional da MisticPay, informe os dados reais de quem vai pagar. Não use CPF inventado.</p><label>Nome completo do pagador<input id="argus-payer-name" name="payer_name" type="text" autocomplete="name" minlength="3" maxlength="120" placeholder="Nome completo"></label><label>CPF do pagador<input id="argus-payer-cpf" name="payer_document" type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00"></label><p class="muted">Esses dados são enviados de forma protegida diretamente à MisticPay e não são exibidos no QR Code.</p></div><div id="pix-config-alert"',
    'payer details inline amount form');
$js="$root/public/static/admin.js";
tradReplace($js,
    "const cfg=await api('/api/admin/quick-pix/config');",
    "const cfg=await api('/api/admin/quick-pix/config');\n   window.argusQuickPixTraditional=cfg.provider==='traditional';\n   const payerPane=document.getElementById('argus-payer-details');\n   if(payerPane && !window.argusQuickPixTraditional){payerPane.hidden=true; payerPane.querySelectorAll('input').forEach(el=>el.required=false);}",
    'provider option in configuration');
tradReplace($js,
    "\$('#charge-create-form').onsubmit=async event=>{",
    "\$('#charge-create-form').onsubmit=async event=>{\n  event.preventDefault();\n  if(window.argusQuickPixTraditional){\n   const payerPane=document.getElementById('argus-payer-details');\n   if(payerPane.hidden){\n    payerPane.hidden=false;\n    payerPane.querySelectorAll('input').forEach(el=>el.required=true);\n    const submit=document.getElementById('charge-submit');\n    submit.textContent='Confirmar dados e gerar Pix';\n    payerPane.querySelector('input').focus();return;\n   }\n   const payerName=document.getElementById('argus-payer-name').value.trim();\n   const payerCpf=document.getElementById('argus-payer-cpf').value.replace(/\\D/g,'');\n   if(payerName.length<3||!/^\\d{11}$/.test(payerCpf)){toast('Preencha nome completo e CPF válido do pagador.',true);return;}\n  }",
    'two-stage form');
tradReplace($js,
    "const result=await post('/api/admin/quick-pix',{amount_cents:amount,idempotency_key:key});",
    "const payload={amount_cents:amount,idempotency_key:key};\n   if(window.argusQuickPixTraditional){\n    payload.payer_name=document.getElementById('argus-payer-name').value.trim();\n    payload.payer_document=document.getElementById('argus-payer-cpf').value.replace(/\\D/g,'');\n   }\n   const result=await post('/api/admin/quick-pix',payload);",
    'real payer fields sent to backend');
tradReplace($js,
    'form.reset();delete form.dataset.idempotencyKey;',
    "form.reset();delete form.dataset.idempotencyKey;\n   const payerPane=document.getElementById('argus-payer-details');\n   if(payerPane){payerPane.hidden=true;payerPane.querySelectorAll('input').forEach(el=>el.required=false);}\n   const submit=document.getElementById('charge-submit');submit.textContent='Gerar Pix →';",
    'form reset');
$css="$root/public/static/polish.css";
file_put_contents($css,<<<'CSS'

/* Traditional MisticPay Pix: responsive payer confirmation only after entering value */
.argus-payer-details{margin:14px 0;padding:15px;border:1px solid rgba(147,117,190,.4);border-radius:13px;background:rgba(90,61,130,.09)}
.argus-payer-details[hidden]{display:none!important}
.argus-payer-details h4{font-size:1rem;margin:0 0 6px}
.argus-payer-details label{display:block;margin-top:12px}
.argus-payer-details input{width:100%;max-width:100%;box-sizing:border-box}
CSS,FILE_APPEND);
echo "ARGUS traditional Pix payer confirmation and protected routes wired.\n";
