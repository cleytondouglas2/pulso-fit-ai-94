<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\IdentityProfile as I;
use ArgusPayments\TraditionalQuickPix as T;

$cpf='12345678909';$cnpj='19131243000197';
[$type,$legal,$doc]=I::validate('PF','Maria Silva',$cpf);
if($type!=='PF'||$legal!=='Maria Silva'||$doc!==$cpf)throw new RuntimeException('PF validator failed');
[$type,$legal,$doc]=I::validate('PJ','EMPRESA EXEMPLO LTDA',$cnpj);
if($type!=='PJ'||$legal!=='EMPRESA EXEMPLO LTDA'||$doc!==$cnpj)throw new RuntimeException('PJ validator failed');
$invalid=[
    ['PF','Maria Silva','00000000000'],['PF','Maria','12345678909'],
    ['PJ','EMPRESA EXEMPLO LTDA','00000000000000'],
    ['XX','Maria Silva',$cpf]
];
foreach($invalid as [$t,$n,$d]){
    try{I::validate($t,$n,$d);throw new RuntimeException('Invalid profile accepted');}
    catch(\ArgusPayments\ApiError $e){/* expected */}
}
if(T::createBody(135,'EMPRESA EXEMPLO LTDA',$cnpj,'qpx_'.str_repeat('a',32),'Cobrança')['payerDocument']!==$cnpj)
    throw new RuntimeException('Valid CNPJ was rejected by local Pix integrity checks');
if(T::createBody(135,'Maria Silva',$cpf,'qpx_'.str_repeat('a',32),'Cobrança')['payerDocument']!==$cpf)
    throw new RuntimeException('Valid CPF was rejected by Pix integrity checks');

$html=file_get_contents('/var/www/html/public/static/admin.html');
$client=file_get_contents('/var/www/html/public/static/client.html');
$adminJs=file_get_contents('/var/www/html/public/static/admin.js');
$portalJs=file_get_contents('/var/www/html/public/static/portal.js');
$profileJs=file_get_contents('/var/www/html/public/static/account-profile.js');
$serverPhp=file_get_contents('/var/www/html/src/TraditionalQuickPix.php');
foreach(['argus-payer-summary','account-profile.js?v=1','admin.js?v=14'] as $needle)
    if(!str_contains((string)$html,$needle))throw new RuntimeException('Missing protected admin UI '.$needle);
if(str_contains((string)$html,'id="argus-payer-name"')||str_contains((string)$html,'id="argus-payer-cpf"'))
    throw new RuntimeException('Payer CPF must not be typed on Pix creation form');
foreach(['portal-identity-form','portal-identity-type','portal.js?v=5','value="" disabled selected'] as $needle)
    if(!str_contains((string)$client,$needle))throw new RuntimeException('Portal selection/legacy onboarding missing: '.$needle);
foreach(['portal-identity-form','/api/portal/account-profile','identity_profile'] as $needle)
    if(!str_contains((string)$portalJs,$needle))throw new RuntimeException('Portal legacy profile save not wired: '.$needle);
foreach(['signin=function','/api/admin/account-profile','window.argusProfileReady','argus-profile-type'] as $needle)
    if(!str_contains((string)$profileJs,$needle))throw new RuntimeException('Admin next-login profile flow missing: '.$needle);
if(str_contains((string)$adminJs,"payload.payer_name=")||str_contains((string)$adminJs,"payload.payer_document="))
    throw new RuntimeException('Legacy browser-provided payer fields still sent on Pix creation');
if(!str_contains((string)$adminJs,'window.argusProfileReady!==true'))
    throw new RuntimeException('Pix must be disabled until the server confirms complete identity');
if(!str_contains((string)$serverPhp,'IdentityProfile::forPayment($db,(string)$actor['))
    throw new RuntimeException('Pix server must fetch payer identity directly from the profile');
if(str_contains((string)$serverPhp,"\$data['payer_name']")||str_contains((string)$serverPhp,"\$data['payer_document']"))
    throw new RuntimeException('Pix server still trusts browser-provided payer name or document');
if(!str_contains((string)file_get_contents('/var/www/html/src/Portal.php'),"IdentityProfile::store(\$db,'portal'"))
    throw new RuntimeException('New portal registrations do not encrypt their profile');

putenv('ARGUS_DOC_HMAC_KEY='.str_repeat('Q',64)); // test-only key; not deployed as a production env value
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$db->installAndSeed();I::install($db);
$id='argus-test-'.bin2hex(random_bytes(8));
$created=I::store($db,'admin',$id,'PF','Maria Silva',$cpf);
if(!$created['complete']||$created['document_last4']!=='8909')throw new RuntimeException('Profile storage failed');
if(array_key_exists('document_number',$created)||array_key_exists('document_sealed',$created))
    throw new RuntimeException('Private identity data leaked through public response');
$pay=I::forPayment($db,$id);
if($pay['document_number']!==$cpf||$pay['legal_name']!=='Maria Silva')
    throw new RuntimeException('Identity encryption round trip failed');
$sealed=$db->one('SELECT document_sealed FROM argus_account_identities WHERE owner_id=?',[$id]);
if(str_contains((string)$sealed['document_sealed'],$cpf)||$sealed['document_sealed']===$cpf)
    throw new RuntimeException('Document was stored in plaintext');
try{
    I::store($db,'admin',$id,'PJ','Empresa Teste Ltda',$cnpj);
    throw new RuntimeException('Profile identity switch accepted');
}catch(\ArgusPayments\ApiError $e){/* expected */}
$db->run('DELETE FROM argus_account_identities WHERE owner_id=?',[$id]);
echo "PASS: PF/PJ registration, encrypted profile, existing account prompt, hidden payment fields, server-sourced identity and document mismatch safeguards.\n";
