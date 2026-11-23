<?php
declare(strict_types=1);
/** Offline brand-only leak regression; no MisticPay calls, QRs or payouts. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\PublicAdminPix;
use ArgusPayments\FeeExecution;
use ArgusPayments\SellerFeeSplit;
use ArgusPayments\FeePolicy;
use ArgusPayments\Database;
$root='/var/www/html';
$pix=(string)file_get_contents($root.'/public/static/public-pix.html');
$script=(string)file_get_contents($root.'/public/static/public-pix.js');
$docs=(string)file_get_contents($root.'/public/static/merchant-docs.js');
$chat=(string)file_get_contents($root.'/public/static/chat-payout.js');
$wallet=(string)file_get_contents($root.'/src/MerchantWallet.php');
$api=(string)file_get_contents($root.'/src/PublicAdminPix.php');
$admin=(string)file_get_contents($root.'/public/static/admin.html');
foreach([
 'Taxa de serviço ARGUS Pay','Dados necessários para o Pix',
 'Recebimento confirmado no sistema ARGUS Pay',
 'public-pix.js?v=argus-white-label-20261123-1',
 'Pagamento confirmado pela ARGUS Pay'
] as $needle)if(!str_contains($pix,$needle))
 throw new RuntimeException('Public checkout Argus branding is missing: '.$needle);
if(!str_contains($script,"paid:'Pagamento confirmado pela ARGUS Pay'")||
   !str_contains($script,'Limite de R$ 100,00 incluindo a taxa de serviço.'))
 throw new RuntimeException('Public JS still displays private processor');
if(!str_contains($docs,'A taxa de serviço de cada depósito é definida pela tabela da ARGUS Pay')||
   !str_contains($docs,'Recebimentos') && !str_contains($docs,'recebimento'))
 throw new RuntimeException('Reseller API docs still reveal provider cost split or are incomplete');
if(!str_contains($docs,'ARGUS Pay')||!str_contains($chat,'ARGUS Pay'))
 throw new RuntimeException('Merchant docs or chat have not been white-labeled');
if(!str_contains($wallet,'Taxa de serviço ARGUS Pay calculada conforme a tabela vigente.'))
 throw new RuntimeException('Merchant fee disclosure incomplete');
if(!str_contains($api,"'payment_platform'=>'ARGUS Pay'")||
    str_contains($api,"'provider'=>'MisticPay'"))
 throw new RuntimeException('Anonymous Pix quote still contains private acquirer');
foreach([$pix,$script,$docs,$chat,$wallet] as $text)
 if(preg_match('/Mistic[\s_-]*Pay/ui',$text) && $text!==$wallet)
    throw new RuntimeException('External-facing UI contains previous acquiring brand');
 // Wallet source keeps PHP MisticPayPayout integration; those are not public.
if(!str_contains($wallet,"private const API_ROOT='https://api.misticpay.com/api'")||
   !str_contains($wallet,"MisticPayPayout"))
 throw new RuntimeException('PSP backend connector must not be rebranded or removed');
if(!str_contains($admin,'admin-pix-stepup.js')||
   !str_contains((string)file_get_contents($root.'/src/FeePolicy.php'),'mistic_withdraw_cents'))
 throw new RuntimeException('Admin PSP integration was disrupted');
$db=new Database(require '/var/www/html/config.php');$db->installAndSeed();
$fee=FeePolicy::current($db);
if(!array_key_exists('mistic_deposit_cents',$fee)||
   !array_key_exists('argus_withdraw_fixed_cents',$fee))
 throw new RuntimeException('Financial fee separation missing');
$adminQuote=FeeExecution::quote($db,'withdraw',1000);
if($adminQuote['argus_fee_cents']!==0||
   $adminQuote['recipient_cents']!==1000)
 throw new RuntimeException('Commercial fees incorrectly applied to admin payout');
echo "PASS: ARGUS white-label public and reseller, no acquiring name in visible texts, administrative processor and PSP operations intact; no real Pix.\n";
