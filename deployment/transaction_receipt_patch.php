<?php
declare(strict_types=1);
$base='/var/www/html';
function receiptPatch(string $path,string $old,string $new):void{
 $s=file_get_contents($path);
 if(!is_string($s)||substr_count($s,$old)!==1)throw new RuntimeException('Receipt patch anchor missing: '.basename($path).' '.substr($old,0,100));
 if(file_put_contents($path,str_replace($old,$new,$s))===false)throw new RuntimeException('Receipt patch write failed');
}
receiptPatch($base.'/src/Gateway.php',"require_once __DIR__ . '/CommerceBrand.php';",
 "require_once __DIR__ . '/CommerceBrand.php';\nrequire_once __DIR__ . '/TransactionReceipt.php';");
receiptPatch($base.'/src/Portal.php',"        if(\$method!=='GET')self::csrf(\$account);",
 "        if(\$method!=='GET')self::csrf(\$account);\n        if(\$method==='GET'&&(\$path==='/api/portal/receipts'||str_starts_with(\$path,'/api/portal/receipts/')))TransactionReceipt::portal(\$db,\$path,\$account);");
receiptPatch($base.'/src/Admin.php',"        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 "        if(\$method==='GET'&&(\$path==='/api/admin/receipts'||str_starts_with(\$path,'/api/admin/receipts/')))TransactionReceipt::adminRoute(\$db,\$path,\$actor);\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){");
receiptPatch($base.'/src/PublicAdminPix.php',"'receipt_is_provider_settled'=>\$status==='paid'",
 "'receipt_is_provider_settled'=>\$status==='paid',\n            'receipt'=>TransactionReceipt::publicDeposit(\$row,(int)\$row['total_amount_cents'],(int)\$row['provider_fee_cents'],(int)\$row['base_amount_cents'])");
receiptPatch($base.'/src/ResellerPublicPix.php',"'receipt_is_provider_settled'=>\$status==='paid'",
 "'receipt_is_provider_settled'=>\$status==='paid',\n            'receipt'=>TransactionReceipt::publicDeposit(\$charge,(int)\$charge['amount_cents'],(int)\$charge['service_fee_cents'],(int)\$charge['net_cents'])");
$d=$base.'/public/static/';
foreach(['admin.html','client.html','public-pix.html','reseller-public-pix.html'] as $f){
 receiptPatch($d.$f,'</head>','<link rel="stylesheet" href="/static/transaction-receipts.css?v=confirmed-history-20261123-2"></head>');
 $html=file_get_contents($d.$f);
 $qr=str_contains($html,'/static/qrcode.min.js')?'':'<script defer src="/static/qrcode.min.js?v=1"></script>';
 receiptPatch($d.$f,'</body>',$qr.'<script defer src="/static/transaction-receipts.js?v=verified-fit-20261123-4"></script></body>');
}
$publicHook=<<<'JS'
function showStatus(charge){
 const receiptHost=document.getElementById('pix-success');
 if(window.ArgusReceipts&&receiptHost){
  window.ArgusReceipts.publicButton(receiptHost,charge,async()=>{
   const ref=active;if(!ref||ref.id!==charge.id)throw Error('Cobrança indisponível.');
   const m=location.pathname.match(/^\/e\/[a-f0-9]{32}\/?$/);
   const path=m?m[0].replace(/\/$/,'')+'/status':'/pix/status';
   const res=await api(path,{method:'POST',body:JSON.stringify({id:ref.id,receipt_token:ref.token})});
   return res.charge;
  });
 }
JS;
foreach(['public-pix.js','reseller-public-pix.js'] as $f)receiptPatch($d.$f,'function showStatus(charge){',$publicHook);
$merchant=$d.'merchant-portal.js';
receiptPatch($merchant," host.append(details);"," host.append(details);\n if(displayStatus(charge)==='paid')window.ArgusReceipts?.attach(host,'seller','deposit',charge.id);");
receiptPatch($merchant," box.replaceChildren(info);"," box.replaceChildren(info);\n if(status==='paid')window.ArgusReceipts?.attach(box,'seller','deposit',charge.id);");
receiptPatch($merchant,"escapeText(r.pix_key_masked)+'</small></div>'","escapeText(r.pix_key_masked)+'</small><button type=\"button\" data-argus-withdraw-receipt=\"'+escapeText(r.id)+'\">'+(r.status==='paid'?'Ver comprovante':'Ver registro')+'</button></div>'");
receiptPatch($merchant,"    (canShowCode(r)?'Ver QR Code':'Ver cobrança')+'</button>'+",
"    (canShowCode(r)?'Ver QR Code':'Ver cobrança')+'</button>'+(r.status==='paid'?'<button type=\"button\" data-argus-deposit-receipt=\"'+escapeText(r.id)+'\">Ver comprovante</button>':'')+");
$js=file_get_contents($merchant);
$js.="\n".<<<'JS'
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-argus-withdraw-receipt],[data-argus-deposit-receipt]');
 if(!b)return;
 const id=b.dataset.argusWithdrawReceipt||b.dataset.argusDepositReceipt;
 window.ArgusReceipts?.open('seller',b.dataset.argusWithdrawReceipt?'withdrawal':'deposit',id);
});
JS;
if(file_put_contents($merchant,$js)===false)throw new RuntimeException('Receipt seller event failed');
$popup=$d.'quick-pix-popup.js';
receiptPatch($popup,"   success.hidden=false;","   success.hidden=false;\n   const card=success.querySelector('.argus-pix-success-card');\n   card?.querySelectorAll('[data-argus-receipt]').forEach(b=>b.remove());\n   window.ArgusReceipts?.attach(card,'admin','deposit',chargeId);");
$history=$d.'quick-pix-history.js';
receiptPatch($history,"       (canCheck?'<button type=\"button\" data-argus-check=\"'+safe(row.id)+'\">Conciliar</button>':'')+",
"       (status==='paid'?'<button type=\"button\" data-argus-admin-deposit=\"'+safe(row.id)+'\">Ver comprovante</button>':'')+\n       (canCheck?'<button type=\"button\" data-argus-check=\"'+safe(row.id)+'\">Conciliar</button>':'')+");
$js=file_get_contents($history);
$js.="\n".<<<'JS'
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-argus-admin-deposit]');
 if(b)window.ArgusReceipts?.open('admin','deposit',b.dataset.argusAdminDeposit);
});
JS;
if(file_put_contents($history,$js)===false)throw new RuntimeException('Receipt admin event failed');
$admin=$d.'admin.js';
$raw=file_get_contents($admin);
$marker="const response=await post('/api/admin/payouts',";
$start=strpos($raw,$marker);
if($start===false||strpos($raw,$marker,$start+1)!==false)throw new RuntimeException('Admin payout response anchor unavailable');
$end=strpos($raw,';', $start);
if($end===false||$end-$start>2000)throw new RuntimeException('Admin payout response boundary unavailable');
$hook=<<<'JS'

if(response?.id){
 const host=document.getElementById('payout-form')?.parentElement;
 if(host){
  host.querySelectorAll('[data-argus-receipt]').forEach(b=>b.remove());
  window.ArgusReceipts?.attach(host,'admin','withdrawal',response.id,response.status==='paid'?'Ver comprovante':'Ver registro do saque');
 }
}
JS;
$raw=substr($raw,0,$end+1).$hook.substr($raw,$end+1);
if(file_put_contents($admin,$raw)===false)throw new RuntimeException('Receipt payout UI failed');
$raw=file_get_contents($merchant);
$marker="await request('/api/portal/wallet/withdrawals',{";
$start=strpos($raw,$marker);
if($start===false||strpos($raw,$marker,$start+1)!==false)throw new RuntimeException('Seller payout response unavailable');
$end=strpos($raw,';', $start);
if($end===false||$end-$start>2000)throw new RuntimeException('Seller payout response boundary unavailable');
$hook=<<<'JS'

if(receiptResponse?.withdrawal?.id){
 const host=document.getElementById('seller-withdraw-form')?.parentElement;
 if(host){
  host.querySelectorAll('[data-argus-receipt]').forEach(b=>b.remove());
  window.ArgusReceipts?.attach(host,'seller','withdrawal',receiptResponse.withdrawal.id,receiptResponse.withdrawal.status==='paid'?'Ver comprovante':'Ver registro do saque');
 }
}
JS;
$raw=substr($raw,0,$start).'const receiptResponse='.substr($raw,$start,$end-$start+1).$hook.substr($raw,$end+1);
if(file_put_contents($merchant,$raw)===false)throw new RuntimeException('Receipt seller payout UI failed');
// Avoid stale PWA assets after adding the new confirmation actions.
foreach(['admin.html','client.html','public-pix.html','reseller-public-pix.html'] as $f){
 $s=file_get_contents($d.$f);
 $s=preg_replace('~(/static/(?:admin|merchant-portal|quick-pix-popup|quick-pix-history|public-pix|reseller-public-pix)\.js\?v=)[A-Za-z0-9._-]+~','$1receipt-20261123-2',$s);
 if(!is_string($s)||file_put_contents($d.$f,$s)===false)throw new RuntimeException('Receipt cache refresh failed');
}
echo "PASS: authenticated transaction receipt routes, public token receipt, seller and admin actions, statement panel installed.\n";
