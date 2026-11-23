<?php
declare(strict_types=1);
/**
 * Admin treasury payout is an OWN-account operation, not a reseller payout.
 * Keep reseller Argus rates and all previous immutable fee snapshots unchanged.
 * Super Admin's only cost is the versioned, configured MisticPay fee,
 * accounted as provider cost, never subtracted twice by ARGUS.
 *
 * Build-time patch after all previous integrations. NO PSP network calls.
 */
$root='/var/www/html';
function adminOwnFeeReplace(string $file,string $from,string $to,string $label):void {
    $src=file_get_contents($file);
    if(!is_string($src)||substr_count($src,$from)!==1)
        throw new RuntimeException('ARGUS admin fee patch anchor changed: '.$label);
    if(file_put_contents($file,str_replace($from,$to,$src))===false)
        throw new RuntimeException('ARGUS admin fee patch write failed: '.$label);
}
$finance=$root.'/src/FeeExecution.php';
adminOwnFeeReplace($finance,
    ' * Withdraw: recipient receives requested gross MINUS ARGUS fee, after explicit',
    ' * Super Admin withdraw: recipient receives the FULL requested gross; no ARGUS',
    'own account documentation');
adminOwnFeeReplace($finance,
    ' * user approval of this quote. MisticPay provider cost is informational; the',
    ' * commercial fee applies. MisticPay provider cost is informational; the',
    'own account documentation continuation');
$before=<<<'PHP'
        $calc=FeePolicy::quote($policy,$gross,$kind);
        $net=$gross-(int)$calc['argus_total_fee_cents'];
        if($net<100)
            throw new ApiError('O valor líquido após a taxa ARGUS precisa ser no mínimo R$ 1,00',422);
PHP;
$after=<<<'PHP'
        $calc=FeePolicy::quote($policy,$gross,$kind);
        // This ledger belongs to the Super Admin's own treasury. Reseller
        // commercial rates remain untouched in SellerFeeSplit / MerchantWallet.
        // MisticPay's configured withdrawal cost is tracked separately and
        // is NOT a deduction from the Pix sent to the recipient.
        $ownTreasury=$kind==='withdraw';
        $argusFee=$ownTreasury?0:(int)$calc['argus_total_fee_cents'];
        $argusFixed=$ownTreasury?0:(int)$calc['argus_fixed_cents'];
        $argusPercent=$ownTreasury?0:(int)$calc['argus_percent_cents'];
        $net=$gross-$argusFee;
        if($net<100)
            throw new ApiError('O Pix enviado deve ser de pelo menos R$ 1,00',422);
PHP;
adminOwnFeeReplace($finance,$before,$after,'separate admin payout from seller Argus commercial fees');
adminOwnFeeReplace($finance,
    "'argus_fee_cents'=>(int)\$calc['argus_total_fee_cents'],",
    "'argus_fee_cents'=>\$argusFee,",
    'no ARGUS revenue on own payout');
adminOwnFeeReplace($finance,
    "'argus_fixed_cents'=>(int)\$calc['argus_fixed_cents'],",
    "'argus_fixed_cents'=>\$argusFixed,",
    'no ARGUS fixed fee on own payout');
adminOwnFeeReplace($finance,
    "'argus_percent_cents'=>(int)\$calc['argus_percent_cents'],",
    "'argus_percent_cents'=>\$argusPercent,",
    'no ARGUS percentage on own payout');

$admin=$root.'/src/Admin.php';
$old=<<<'PHP'
            // Reject stale quotes and invisible commercial fees before consuming OTP.
            if($feeQuote['argus_fee_cents']>0){
                if(($data['fee_acknowledged']??null)!==true ||
                   !isset($data['fee_version'])||!is_int($data['fee_version'])||
                   $data['fee_version']!==$feeQuote['policy_version'])
                    self::fail('Taxa ARGUS alterada ou não confirmada. Atualize a prévia e confirme o valor líquido.',409);
            }
PHP;
$new=<<<'PHP'
            // Even without an ARGUS commercial fee, ensure the operator
            // explicitly accepted the current MisticPay-cost quote. Keep
            // OTP, balance checks, PSP limits and idempotency unchanged.
            if(($data['fee_acknowledged']??null)!==true ||
               !isset($data['fee_version'])||!is_int($data['fee_version'])||
               $data['fee_version']!==$feeQuote['policy_version'])
                self::fail('O custo da MisticPay foi atualizado. Consulte novamente o saque antes de confirmar.',409);
PHP;
adminOwnFeeReplace($admin,$old,$new,'always verify current provider fee version on own treasury withdrawal');

$otp=$root.'/public/static/admin-pix-stepup.js';
adminOwnFeeReplace($otp,
    "  '<div><span>Taxa ARGUS</span><strong data-argus-fee></strong></div>',\n",
    '',
    'remove meaningless ARGUS commercial fee row from Super Admin OTP');
adminOwnFeeReplace($otp,
    "  put('[data-argus-fee]',cash(feeQuote.argus_fee_cents));\n",
    '',
    'remove hidden commercial fee from modal');
adminOwnFeeReplace($otp,
    "  '<div><span>Custo MisticPay (referência)</span><strong data-argus-cost></strong></div>',",
    "  '<div><span>Taxa MisticPay (adquirente)</span><strong data-argus-cost></strong></div>',",
    'name provider-only fee in confirmation');
adminOwnFeeReplace($otp,
    "  '<p class=\"argus-admin-otp-note\">O custo MisticPay informado é de referência e não será descontado novamente pela ARGUS. A transferência pode entrar em processamento.</p>',",
    "  '<p class=\"argus-admin-otp-note\">O Super Admin não paga taxa comercial ARGUS. A taxa MisticPay informada segue o contrato e a configuração do painel; não é abatida uma segunda vez do Pix pela ARGUS.</p>',",
    'own account tax explanation');
adminOwnFeeReplace($otp,
    "     feeQuote.recipient_cents+feeQuote.argus_fee_cents!==amountCents||",
    "     feeQuote.argus_fee_cents!==0||feeQuote.recipient_cents!==amountCents||",
    'OTP refuses payout with any ARGUS commercial fee');
$operations=$root.'/public/static/fee-operations.js';
adminOwnFeeReplace($operations,
    "     ['Taxa ARGUS descontada',fee.argus_fee_cents],\n",
    '',
    'remove ARGUS fee from admin withdrawal preview');
adminOwnFeeReplace($operations,
    "     ['Custo MisticPay (separado)',fee.mistic_cost_estimate_cents],",
    "     ['Taxa MisticPay (custo da adquirente)',fee.mistic_cost_estimate_cents],",
    'show provider fee in preview');
adminOwnFeeReplace($operations,
    "     'A taxa ARGUS é abatida do valor enviado ao destino. O custo MisticPay é considerado separadamente pelo provedor, sem segundo desconto pelo ARGUS. Confirmação 2FA obrigatória.':",
    "     'Saque do Super Admin sem taxa comercial ARGUS: o valor solicitado é o Pix destinado ao recebedor. A taxa MisticPay fica como custo separado, conforme o provedor, sem novo débito pelo ARGUS. Confirmação 2FA obrigatória.':",
    'provider-only admin fee preview explanation');
$ui=$root.'/public/static/admin.js';
if(!str_contains((string)file_get_contents($ui),'fee_version:feeQuote.policy_version')||
   !str_contains((string)file_get_contents($ui),"otp=await window.ArgusAdminPixStepUp.request({"))
    throw new RuntimeException('Protected Admin Pix confirmation changed');
$html=$root.'/public/static/admin.html';
adminOwnFeeReplace($html,
    '/static/admin-pix-stepup.js?v=20261122-1',
    '/static/admin-pix-stepup.js?v=20261123-ownadmin-1',
    'invalidate Super Admin OTP modal on Safari');
adminOwnFeeReplace($html,
    '/static/fee-operations.js?v=1',
    '/static/fee-operations.js?v=20261123-ownadmin-1',
    'invalidate fee preview Safari cache');
echo "PASS: Super Admin own Pix withdraw has ZERO ARGUS commercial fee, full recipient gross, separate current MisticPay cost and version-locked OTP; seller fees untouched.\n";
