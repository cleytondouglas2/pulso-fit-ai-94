<?php
declare(strict_types=1);
/**
 * BRL typing mask for Super Admin treasury payout ONLY (not reseller payout).
 * Retains exact integer-cent payload and protected OTP/fee/idempotency path.
 * All checks are build-time; not one real payout/QR call.
 */
$dir='/var/www/html/public/static/';
$html=file_get_contents($dir.'admin.html');
$js=file_get_contents($dir.'admin.js');
if(!is_string($html)||!is_string($js))throw new RuntimeException('ARGUS admin payout UI missing');
if(substr_count($html,'id="payout-form"')!==1)throw new RuntimeException('Super Admin payout form changed');
$formStart=strpos($html,'id="payout-form"');
$formEnd=strpos($html,'</form>',$formStart);
if($formEnd===false||($formEnd-$formStart)>6500)throw new RuntimeException('Cannot locate admin payout form');
$form=substr($html,$formStart,$formEnd-$formStart);
$matches=[];
$count=preg_match_all('~<input\b[^>]*\bname=["\']amount["\'][^>]*>~i',$form,$matches);
if($count!==1)throw new RuntimeException('Cannot identify one admin payout amount input: '.(string)$count);
$old=$matches[0][0];
$new=$old;
$new=preg_replace('~\s+type=["\'][^"\']*["\']~i','',$new);
$new=preg_replace('~\s+inputmode=["\'][^"\']*["\']~i','',$new);
$new=preg_replace('~\s+placeholder=["\'][^"\']*["\']~i','',$new);
$new=preg_replace('~\s+(?:min|max|step|pattern)=["\'][^"\']*["\']~i','',$new);
$new=preg_replace('~\s+value=["\'][^"\']*["\']~i','',$new);
$new=preg_replace('~\s+maxlength=["\'][^"\']*["\']~i','',$new);
if(!is_string($new))throw new RuntimeException('Failed to normalize admin payout input');
$new=preg_replace('~\s*/?>$~',' type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="13" placeholder="0,00" data-admin-payout-money required>',$new,1);
if(!is_string($new)||!str_contains($new,'data-admin-payout-money')||
   !str_contains($new,'name="amount"'))
 throw new RuntimeException('Admin payout input conversion failed');
$html=substr_replace($html,str_replace($old,$new,$form),$formStart,strlen($form));
if(substr_count($html,'data-admin-payout-money')!==1)
 throw new RuntimeException('Admin payout currency input duplicated');
$oldSrc=<<<'JS'
 const form=event.target,raw=formValues(form),numeric=Number(String(raw.amount||'').replace(',','.'));
 const amount=Math.round(numeric*100);
 if(!Number.isFinite(numeric)||Math.abs(amount/100-numeric)>0.000001||amount<100||amount>10000){toast('Valor permitido: R$ 1,00 a R$ 100,00',true);return;}
JS;
$newSrc=<<<'JS'
 const form=event.target,raw=formValues(form);
 // Authoritative user-entered BRL text -> exact integer cents.
 // Never reinterpret "100,00" as 100 cents or send float-derived payouts.
 const amount=window.ArgusAdminWithdrawMask?.parseCents(raw.amount);
 if(!Number.isSafeInteger(amount)||amount<100||amount>10000){toast('Valor permitido: R$ 1,00 a R$ 100,00',true);return;}
JS;
if(substr_count($js,$oldSrc)!==1)
 throw new RuntimeException('Admin protected payout amount parser changed: manual review required');
$js=str_replace($oldSrc,$newSrc,$js);
if(!str_contains($js,"await window.ArgusAdminPixStepUp.request({")||
   !str_contains($js,"await post('/api/admin/payouts'")||
   !str_contains($js,"fee_version:feeQuote.policy_version")||
   !str_contains($js,"otp:otp,confirm:true"))
 throw new RuntimeException('Admin MFA, fee version or payout confirmation missing');
if(substr_count($html,'</head>')!==1||substr_count($html,'</body>')!==1)
 throw new RuntimeException('Cannot load new payout currency assets');
$html=str_replace('</head>','<link rel="stylesheet" href="/static/admin-withdraw-money.css?v=20261123-1"></head>',$html);
$html=str_replace('</body>','<script defer src="/static/admin-withdraw-money.js?v=20261123-1"></script></body>',$html);
$count=0;
$html=preg_replace_callback('~(/static/admin\.js\?v=)[A-Za-z0-9._-]+~',
 static fn($m)=>$m[1].'withdraw-admin-money-20261123-1',$html,1,$count);
if($count!==1||!is_string($html))throw new RuntimeException('Cannot invalidate stale admin.js on Safari');
if(file_put_contents($dir.'admin.html',$html)===false||
   file_put_contents($dir.'admin.js',$js)===false)
 throw new RuntimeException('Cannot save admin money fix');
echo "PASS: Admin Pix withdrawal cents mask and exact cents submission; existing OTP modal, admin policy quote and idempotency unchanged.\n";
