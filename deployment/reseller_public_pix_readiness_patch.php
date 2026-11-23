<?php
declare(strict_types=1);
/**
 * Seller public Pix exact readiness contract:
 * - Supports both audited PF and PJ wallets via PfFinancialApproval::authorized.
 * - Keeps merchant PSP credentials isolated from administrative Finance QR,
 *   and uses the same custody gating as the seller wallet.
 * - The UI displays an actionable ARGUS-only availability status rather than
 *   a permanently disabled unexplained button.
 * - Does NOT turn on unhomologated custody, modify money or perform real Pix.
 */
$dir='/var/www/html/public/static/';
// Keep MerchantWallet PSP keys unchanged and explicitly separate from Finance QR/admin.
$jsPath=$dir.'reseller-public-pix.js';
$js=file_get_contents($jsPath);
if(!is_string($js))throw new RuntimeException('Missing generated reseller checkout JS');
$old=<<<'JS'
  resellerReady=result.can_generate===true;
  $('reseller-public-availability').textContent=resellerReady?
   'Pix público disponível • ARGUS Pay':
   'O recebimento ficará disponível após aprovação financeira da conta.';
JS;
$new=<<<'JS'
  resellerReady=result.can_generate===true;
  $('reseller-public-availability').textContent=
   typeof result.availability_message==='string'&&result.availability_message.length<220?
    result.availability_message:
    (resellerReady?'Pix público disponível • ARGUS Pay':'Recebimento Pix ainda indisponível nesta conta.');
JS;
if(substr_count($js,$old)!==1)
 throw new RuntimeException('Seller config status hint anchor changed');
$js=str_replace($old,$new,$js);
$old=<<<'JS'
  canGenerate=data.can_generate===true;
  $('summary-fee').textContent=money(q.service_fee_cents);
JS;
$new=<<<'JS'
  canGenerate=data.can_generate===true;
  // The latest quote is the authoritative readiness snapshot; a config
  // fetch cannot keep a formerly unavailable account stuck disabled.
  resellerReady=canGenerate;
  $('summary-fee').textContent=money(q.service_fee_cents);
JS;
if(substr_count($js,$old)!==1)
 throw new RuntimeException('Seller quote canGenerate anchor changed');
$js=str_replace($old,$new,$js);
$old=<<<'JS'
  hint.textContent=canGenerate?INITIAL_HINT:
    'Recebimento Pix indisponível no momento. Confira mais tarde ou entre em contato com o suporte.';
JS;
$new=<<<'JS'
  hint.textContent=canGenerate?INITIAL_HINT:
    (typeof data.availability_message==='string'&&data.availability_message.length<220?
      data.availability_message:
      'Recebimento Pix ainda não liberado nesta conta ARGUS Pay.');
  $('reseller-public-availability').textContent=canGenerate?
    'Recebimento Pix disponível nesta página da ARGUS Pay.':
    hint.textContent;
JS;
if(substr_count($js,$old)!==1)
 throw new RuntimeException('Seller quote unavailable message anchor changed');
$js=str_replace($old,$new,$js);
if(preg_match('/Mistic[\s_-]*Pay/iu',$js))
 throw new RuntimeException('Private acquirer name must not appear in customer checkout');
if(file_put_contents($jsPath,$js)===false)
 throw new RuntimeException('Failed to persist seller checkout readiness UI');
$htmlPath=$dir.'reseller-public-pix.html';
$html=file_get_contents($htmlPath);
if(!is_string($html)||substr_count($html,'reseller-public-pix.js?v=20261123-1')!==1)
 throw new RuntimeException('Seller checkout script cache anchor changed');
$html=str_replace('reseller-public-pix.js?v=20261123-1',
 'reseller-public-pix.js?v=20261123-ready-pf-2',$html);
if(file_put_contents($htmlPath,$html)===false)
 throw new RuntimeException('Failed to invalidate seller checkout JS cache');
echo "PASS: seller public Pix reuses approved CPF and CNPJ wallet authorization, isolated custody/PSP guards, current quote availability and fresh Safari JS. No Pix created.\n";
