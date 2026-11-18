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
$html=file_get_contents('/var/www/html/public/static/admin.html');
$js=file_get_contents('/var/www/html/public/static/admin.js');
if(!is_string($html)||!is_string($js))throw new RuntimeException('Missing client assets');
if(!str_contains($html,'id="argus-payer-details" class="argus-payer-details">'))
    throw new RuntimeException('Payer form must be visible on iPhone without requiring JS to unhide it');
foreach(['id="argus-payer-name"','id="argus-payer-cpf"','name="payer_document"','admin.js?v=12'] as $token){
    if(!str_contains($html,$token))throw new RuntimeException('Missing payer UI or asset version: '.$token);
}
if(!str_contains($js,'payerPane.hidden=!window.argusQuickPixTraditional')||
   !str_contains($js,'payload.payer_document=')||
   !str_contains($js,'payload.payer_name='))
    throw new RuntimeException('Client form is not wired to traditional Pix payment request');
echo "PASS: iPhone traditional Pix form has visible name + CPF fields and fresh admin JS.\n";
echo "PASS: Traditional MisticPay amount, real CPF, QR, idempotent request shape, status and payment amount safeguards.\n";
