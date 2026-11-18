<?php
declare(strict_types=1);
require_once '/var/www/html/src/TraditionalQuickPix.php';
use ArgusPayments\TraditionalQuickPix as T;
if(!T::cpfValid('12345678909')||T::cpfValid('00000000000')||T::cpfValid('12345678900'))throw new RuntimeException('CPF check failed');
$id='qpx_'.str_repeat('a',32);
$b=T::createBody(350,' Maria  Silva ','123.456.789-09',$id,'Cobrança ARGUS');
if($b['amount']!==3.5||$b['payerDocument']!=='12345678909'||$b['payerName']!=='Maria Silva')throw new RuntimeException('Create payload incorrect');
try{T::createBody(350,'Pessoa Teste','11111111111',$id,'Cobrança');throw new RuntimeException('Fake CPF accepted');}catch(InvalidArgumentException){}
$r=T::readCreated(['data'=>['transactionId'=>31484480,'copyPaste'=>str_repeat('000201',9),'transactionState'=>'PENDENTE']]);
if($r['provider_id']!=='tr_31484480'||$r['status']!=='pending')throw new RuntimeException('Provider result incorrect');
$r=T::readChecked(['transaction'=>['transactionState'=>'COMPLETO','value'=>3.5]],350);
if($r['status']!=='paid')throw new RuntimeException('Provider paid not recognized');
try{T::readChecked(['transaction'=>['transactionState'=>'COMPLETO','value'=>8.5]],350);throw new RuntimeException('Amount mismatch ignored');}catch(RuntimeException){}
if(T::status('INDEFINIDO')==='paid')throw new RuntimeException('Unknown marked paid');
$verified=T::readChecked(['transaction'=>[
  'transactionId'=>'31484480','transactionState'=>'COMPLETO',
  'transactionType'=>'DEPOSITO','transactionMethod'=>'PIX','value'=>3.5
]],350,'31484480');
if($verified['status']!=='paid')throw new RuntimeException('Authentic checked payment not recognized');
$notPaid=[
 ['transactionId'=>'wrong','transactionState'=>'COMPLETO','value'=>3.5],
 ['transactionId'=>'31484480','transactionState'=>'COMPLETO','value'=>5.5],
 ['transactionId'=>'31484480','transactionState'=>'COMPLETO','transactionType'=>'RETIRADA','value'=>3.5],
 ['transactionId'=>'31484480','transactionState'=>'COMPLETO','transactionMethod'=>'TED','value'=>3.5],
 ['transactionId'=>'31484480','transactionState'=>'COMPLETO']
];
foreach($notPaid as $bad){
 try{
  T::readChecked(['transaction'=>$bad],350,'31484480');
  throw new RuntimeException('Unverified payment must not be settled');
 }catch(RuntimeException $e){
  if($e->getMessage()==='Unverified payment must not be settled')throw $e;
 }
}
$html=file_get_contents('/var/www/html/public/static/admin.html');
$js=file_get_contents('/var/www/html/public/static/admin.js');
if(!is_string($html)||!is_string($js))throw new RuntimeException('Missing client assets');
$accountBacked=str_contains($html,'account-profile.js?v=1');
if(!$accountBacked){
 if(!str_contains($html,'id="argus-payer-details" class="argus-payer-details">'))
     throw new RuntimeException('Payer form must be visible on iPhone without requiring JS to unhide it');
 foreach(['id="argus-payer-name"','id="argus-payer-cpf"','name="payer_document"','admin.js?v=13'] as $token){
     if(!str_contains($html,$token))throw new RuntimeException('Missing legacy payer UI or asset version: '.$token);
 }
}else{
 foreach(['id="argus-payer-summary"','account-profile.js?v=1','admin.js?v=14'] as $token){
     if(!str_contains($html,$token))throw new RuntimeException('Missing protected identity UI: '.$token);
 }
 if(str_contains($html,'id="argus-payer-cpf"')||str_contains($html,'id="argus-payer-name"'))
     throw new RuntimeException('Payer inputs must remain hidden after identity migration');
}
$auto=file_get_contents('/var/www/html/public/static/quick-pix-autostatus.js');
$worker=file_get_contents('/usr/local/share/argus/notify_worker.php');
if(!is_string($auto)||!is_string($worker))throw new RuntimeException('Missing auto-status assets');
foreach(['quick-pix-autostatus.js?v=1'] as $x){
 if(!str_contains($html,$x))throw new RuntimeException('Missing auto status or fields '.$x);
}
if(!str_contains($auto,"setInterval(check,20000)")||
   !str_contains($auto,"/reconcile")||
   !str_contains($auto,"visibilitychange"))
 throw new RuntimeException('Foreground automatic Pix status checks absent');
if(!str_contains($worker,"TraditionalQuickPix::worker") ||
   !str_contains($worker,"getenv('ARGUS_QUICK_PIX_PROVIDER')!=='traditional' && MisticPayFinance::configured()"))
 throw new RuntimeException('Background Pix reconciliation not wired or Finance worker still enabled for traditional charge');
if(!$accountBacked){
 if(!str_contains($js,'payerPane.hidden=!window.argusQuickPixTraditional')||
    !str_contains($js,'payload.payer_document=')||
    !str_contains($js,'payload.payer_name='))
     throw new RuntimeException('Old payer form not wired');
 echo "PASS: iPhone traditional Pix form with payer fields and fresh JS.\n";
}else{
 if(str_contains($js,'payload.payer_document=')||str_contains($js,'payload.payer_name=')||
    !str_contains($js,'window.argusProfileReady!==true'))
     throw new RuntimeException('Server-side legal identity must replace all Pix payer input fields');
 echo "PASS: iPhone registered PF/PJ automatically supplies payer data on the server.\n";
}
echo "PASS: Traditional MisticPay amount, real CPF, QR, idempotent request shape, status and payment amount safeguards.\n";
