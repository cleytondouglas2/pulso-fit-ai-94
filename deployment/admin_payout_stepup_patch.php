<?php
declare(strict_types=1);
/** Move the Super Admin treasury payout TOTP to a branded top-layer modal.
 * Reuses existing fee-quote, signed policy version, CSRF, superadmin scope,
 * server-side OTP validation, idempotency and provider payout route.
 */
$root='/var/www/html/public/static/';
function adminStepReplace(string &$contents,string $before,string $after,string $label):void{
 if(substr_count($contents,$before)!==1)
   throw new RuntimeException('ARGUS admin step-up source mismatch at '.$label);
 $contents=str_replace($before,$after,$contents);
}
$page=$root.'admin.html';
$html=file_get_contents($page);
if(!is_string($html))throw new RuntimeException('ARGUS admin page unavailable');
adminStepReplace($html,
 '<label>Confirme com NOVO código do autenticador<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000"></label>',
 '',
 'remove inline OTP from treasury form');
adminStepReplace($html,
 '</head>',
 '<link rel="stylesheet" href="/static/admin-pix-stepup.css?v=20261122-1"></head>',
 'stepup CSS');
adminStepReplace($html,
 '</body>',
 '<script defer src="/static/admin-pix-stepup.js?v=20261122-1"></script></body>',
 'stepup JavaScript');
$changed=0;
$html=preg_replace_callback(
 '~(/static/admin\.js\?v=)[A-Za-z0-9._-]+~',
 static fn($match)=>$match[1].'pix-stepup-20261122-1',
 $html,1,$changed
);
if(!is_string($html)||$changed!==1)
 throw new RuntimeException('ARGUS admin JS entry point missing; refuse stale deployment');
if(file_put_contents($page,$html)===false)
 throw new RuntimeException('ARGUS admin page save failed');
$path=$root.'admin.js';
$js=file_get_contents($path);
if(!is_string($js))throw new RuntimeException('ARGUS admin script unavailable');
adminStepReplace($js,
 "if(!raw.confirm||!raw.otp){toast('Confirme e informe um novo código do autenticador',true);return}",
 "if(!raw.confirm){toast('Confirme o valor, a chave Pix e a autorização da transferência',true);return}",
 'form authorization guard');
$start=strpos($js,"  const feeText='Valor solicitado: '");
$finish=($start===false)?false:strpos($js,"  const idempotency_key=form.dataset.idem", $start);
if($start===false||$finish===false||$finish<=$start||($finish-$start)>2000)
 throw new RuntimeException('ARGUS admin fee quote and submit boundaries have changed');
$original=substr($js,$start,$finish-$start);
if(!str_contains($original,"feeQuote.argus_fee_cents")||
   !str_contains($original,"feeQuote.recipient_cents")||
   !str_contains($original,"feeQuote.mistic_cost_estimate_cents")||
   !str_contains($original,"if(!confirm(feeText+")||
   !str_contains($original,"submit.disabled=true"))
 throw new RuntimeException('ARGUS admin original confirmation logic changed; manual review required');
$next=<<<'JS'
  if(typeof window.ArgusAdminPixStepUp?.request!=='function'){
    toast('Confirmação de segurança indisponível. Atualize a página e tente novamente.',true);
    return;
  }
  const submit=form.querySelector('button[type="submit"]');
  if(submit.disabled)return;
  submit.disabled=true;
  let otp=null;
  try{
    otp=await window.ArgusAdminPixStepUp.request({
      amountCents:amount,feeQuote,
      pixKeyType:raw.pix_key_type,pixKey:raw.pix_key,description:raw.description
    });
  }catch(error){
    toast('Não foi possível abrir a confirmação. Nenhuma transferência foi solicitada.',true);
  }
  if(!otp){submit.disabled=false;return;}
JS;
$js=substr($js,0,$start).$next."\n".substr($js,$finish);
adminStepReplace($js,"otp:raw.otp,confirm:true","otp:otp,confirm:true",
 'send confirmed fresh OTP to existing protected payout API');
if(file_put_contents($path,$js)===false)
 throw new RuntimeException('ARGUS admin script save failed');
echo "PASS: admin payout OTP moved from inline form to branded confirmation after fee quote; server MFA, fees and idempotency unchanged\n";
