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
echo "PASS: Traditional MisticPay amount, real CPF, QR, idempotent request shape, status and payment amount safeguards.\n";
