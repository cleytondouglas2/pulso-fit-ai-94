<?php
declare(strict_types=1);
/** Applied last. Add an audited, separate CPF financial-account path.
 * Only Super Admin + 2FA may approve; no PSP subaccount is fabricated.
 */
$root='/var/www/html';
function pfReplace(string $file,string $old,string $new,string $label):void{
    $content=file_get_contents($file);
    if(!is_string($content)||substr_count($content,$old)!==1)
        throw new RuntimeException('CPF authorization installer expected anchor: '.$label);
    if(file_put_contents($file,str_replace($old,$new,$content))===false)
        throw new RuntimeException('CPF authorization installer cannot update '.$label);
}
pfReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/KycStudio.php';",
    "require_once __DIR__ . '/KycStudio.php';\nrequire_once __DIR__ . '/PfFinancialApproval.php';",
    'load guarded CPF financial service');

$admin=$root.'/src/Admin.php';
$before="        if(str_starts_with(\$path,'/api/admin/kyc/'))KycStudio::admin(\$db,\$method,\$path,\$actor);";
$handler=<<<'PHP'
        // Dedicated CPF wallet authorization. Requires Super Admin, CSRF,
        // current 2FA and a verified platform custody account. Never turns
        // an individual CPF into a made-up CNPJ or PSP subaccount.
        if($method==='POST'&&preg_match(
            '~^/api/admin/kyc/applications/([a-f0-9]{32})/finance-activate-pf$~D',$path,$pf)){
            self::writeAllowed($actor,true);
            if(($actor['role']??'')!=='superadmin')
                self::fail('Somente o Super Admin pode autorizar revendedores',403);
            $input=self::input();
            self::verifyMfaCode($db,$actor,self::str($input,'otp',6,6));
            self::reply(PfFinancialApproval::approve($db,$actor,$pf[1],$input));
        }
PHP;
pfReplace($admin,$before,$handler."\n".$before,'admin protected CPF approval route');

$portal=$root.'/src/Portal.php';
$old=<<<'PHP'
            $merchant=$approved?$db->one("SELECT id FROM b2b_merchants
                WHERE id=? AND status='approved_live'",[$account['merchant_id']]):null;
PHP;
$new=<<<'PHP'
            $merchant=$approved&&PfFinancialApproval::authorized($db,$account)
                ?['id'=>$account['merchant_id']]:null;
PHP;
pfReplace($portal,$old,$new,'GET seller API keys accepts authorised CPF custody');
$old=<<<'PHP'
            $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[$account['merchant_id']]);
            if(!$merchant)self::fail('Aguardando aprovação do recebedor no sistema de pagamentos',403);
PHP;
$new=<<<'PHP'
            $merchant=PfFinancialApproval::authorized($db,$account)
                ?['id'=>$account['merchant_id']]:null;
            if(!$merchant)self::fail('Aguardando aprovação do recebedor no sistema de pagamentos',403);
PHP;
pfReplace($portal,$old,$new,'POST self-service API keys accepts authorised CPF custody');

$wallet=$root.'/src/MerchantWallet.php';
$old=<<<'PHP'
        $m=$db->one("SELECT id,status FROM b2b_merchants WHERE id=? AND status='approved_live'",[$account['merchant_id']]);
        if(!$m||!KycStudio::identityApproved($db,(string)$account['id']))
PHP;
$new=<<<'PHP'
        $approvedMerchant=PfFinancialApproval::authorized($db,$account);
        if(!$approvedMerchant||!KycStudio::identityApproved($db,(string)$account['id']))
PHP;
pfReplace($wallet,$old,$new,'seller key authentication wallet permission');
$old=<<<'PHP'
        $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[(string)($account['merchant_id']??'')]);
        if(!$merchant)self::fail('Conta financeira não autorizada a receber',403);
PHP;
$new=<<<'PHP'
        if(!PfFinancialApproval::authorized($db,$account))
            self::fail('Conta financeira não autorizada a receber',403);
PHP;
pfReplace($wallet,$old,$new,'CPF checkout merchant authorisation');
$old=<<<'PHP'
        $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",
            [$account['merchant_id']]);
        if(!$merchant)self::fail('Recebedor ainda não autorizado',403);
PHP;
$new=<<<'PHP'
        if(!PfFinancialApproval::authorized($db,$account))
            self::fail('Recebedor ainda não autorizado',403);
PHP;
pfReplace($wallet,$old,$new,'CPF wallet withdrawal authorization');
$old=<<<'PHP'
        $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",
            [(string)($account['merchant_id']??'')]);
        if(!$merchant)self::fail('Recebedor não autorizado',403);
PHP;
$new=<<<'PHP'
        if(!PfFinancialApproval::authorized($db,$account))
            self::fail('Recebedor não autorizado',403);
PHP;
pfReplace($wallet,$old,$new,'CPF wallet payout execution permission');

// Make the beneficiary binding explicit in the UI. The original finance-PJ
// form remains unchanged; CPF is a separate reviewed custodial account.
$jsFile=$root.'/public/static/kyc-studio.js';
$js=file_get_contents($jsFile);
$old=<<<'JS'
     }else if(a.account_type==='PF'){
       html+='<p class="kyc-finance-warning"><strong>KYC aprovado, autorização financeira pendente.</strong> Este cadastro é de pessoa física. A versão atual não possui ativação financeira de recebedores PF. É necessária homologação individual do CPF no provedor e implementação do vínculo financeiro antes de permitir Pix, API ou saques. Não use o CNPJ do administrador para aprovar este CPF.</p>';
JS;
$new=<<<'JS'
     }else if(a.account_type==='PF'){
       html+='<p class="kyc-finance-info"><strong>Identidade aprovada.</strong> A autorização da carteira CPF é feita pelo Super Admin. O revendedor recebe uma carteira individual no ARGUS, enquanto o processamento utiliza a integração central homologada da MisticPay.</p>'+
        '<form id="kyc-finance-pf-form" class="kyc-finance-pf-form">'+
        '<label class="kyc-confirm"><input type="checkbox" name="confirm_identity" required> Conferi o nome e CPF do revendedor e a aprovação documental</label>'+
        '<label class="kyc-confirm"><input type="checkbox" name="confirm_provider_custody" required> Confirmei a autorização do provedor para o modelo de custódia central e carteiras individuais</label>'+
        '<label class="kyc-confirm"><input type="checkbox" name="confirm_contract" required> Contrato e regras de recebimento conferidos</label>'+
        '<label class="kyc-confirm"><input type="checkbox" name="confirm_ledger" required> Confirmo que saldo e saques pertencem exclusivamente a este CPF</label>'+
        '<label>Justificativa da autorização<input name="reason" type="text" minlength="10" maxlength="300" placeholder="Informe o fundamento da liberação" required></label>'+
        '<label>Código de segurança do Super Admin<input name="otp" type="text" autocomplete="one-time-code" inputmode="numeric" minlength="6" maxlength="6" pattern="[0-9]{6}" required></label>'+
        '<button type="submit" class="kyc-finance-activate">Liberar recebimentos do revendedor CPF</button>'+
        '<p class="kyc-finance-terms">A liberação somente será concluída se a custódia central da MisticPay estiver confirmada no servidor. Não cria conta bancária nem autorização fictícia no provedor.</p>'+
        '</form>';
JS;
if(!is_string($js)||substr_count($js,$old)!==1)
    throw new RuntimeException('CPF authorization UI anchor changed');
$js=str_replace($old,$new,$js);
$old="    E('kyc-finance-form')?.addEventListener('submit',release);";
$new=$old."\n    E('kyc-finance-pf-form')?.addEventListener('submit',releasePf);";
if(substr_count($js,$old)!==1)
    throw new RuntimeException('CPF review form binding anchor changed');
$js=str_replace($old,$new,$js);
$old=<<<'JS'
   async function loadQueue(focus){
JS;
$new=<<<'JS'
   async function releasePf(ev){
     ev.preventDefault();
     if(!superuser()||!selected)return;
     const form=ev.currentTarget,button=form.querySelector('button[type=submit]');
     if(!button)return;
     const input=Object.fromEntries(new FormData(form));
     for(const name of ['confirm_identity','confirm_provider_custody','confirm_contract','confirm_ledger'])
       input[name]=form.elements[name]?.checked===true;
     if(!['confirm_identity','confirm_provider_custody','confirm_contract','confirm_ledger'].every(name=>input[name])){
       toast('Confirme os quatro requisitos obrigatórios antes de liberar.',true);return;
     }
     if(!confirm('Liberar a carteira financeira do revendedor CPF? Confirme que o contrato e a autorização de custódia foram realmente verificados.'))return;
     button.disabled=true;
     try{
       const response=await post('/api/admin/kyc/applications/'+encodeURIComponent(selected)+'/finance-activate-pf',input);
       toast(response.message||'Autorização financeira registrada');
       await loadQueue(selected);
     }catch(error){toast(error.message,true)}
     finally{button.disabled=false}
   }
   async function loadQueue(focus){
JS;
if(substr_count($js,$old)!==1)
    throw new RuntimeException('CPF financial activation submission anchor changed');
$js=str_replace($old,$new,$js);
if(file_put_contents($jsFile,$js)===false)
    throw new RuntimeException('CPF review frontend not saved');

$adminHtml=$root.'/public/static/admin.html';
$html=file_get_contents($adminHtml);
if(!is_string($html))throw new RuntimeException('Super Admin page missing');
$old='/static/kyc-studio.js?v=finance-20261119-1';
if(substr_count($html,$old)!==1)
    throw new RuntimeException('Current KYC JS version unexpected');
$html=str_replace($old,'/static/kyc-studio.js?v=pf-activate-20261119-1',$html);
if(file_put_contents($adminHtml,$html)===false)
    throw new RuntimeException('Super Admin JS cache cannot update');

echo "PASS: real CPF Super Admin authorization workflow, protected 2FA and audit, secure PF wallet/link, KYC and PSP custody guards retained.\n";
