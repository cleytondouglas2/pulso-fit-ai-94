<?php
declare(strict_types=1);
/**
 * Self-service API keys for authenticated seller accounts. Install after
 * merchant_wallet_patch and admin key patches. No Super Admin session or
 * OTP is needed per key. Original portal CSRF + seller session remain required.
 */
$path='/var/www/html/src/Portal.php';
$source=file_get_contents($path);
if(!is_string($source))throw new RuntimeException('Seller API key patch: portal source absent');
function sellerKeysReplace(string &$s,string $a,string $b,string $label):void{
    if(substr_count($s,$a)!==1)throw new RuntimeException('Seller API keys anchor: '.$label);
    $s=str_replace($a,$b,$s);
}
$old=<<<'PHP'
        if($method==='GET'&&$path==='/api/portal/keys'){
            $v=$db->all('SELECT id,public_key,created_at,revoked_at FROM argus_portal_keys WHERE account_id=? ORDER BY created_at DESC',[$account['id']]);
            self::out(['keys'=>$v,'can_issue'=>$account['status']==='approved'&&!empty($account['merchant_id'])]);
        }
PHP;
$new=<<<'PHP'
        if($method==='GET'&&$path==='/api/portal/keys'){
            $v=$db->all('SELECT id,public_key,created_at,revoked_at FROM argus_portal_keys
                WHERE account_id=? ORDER BY created_at DESC LIMIT 100',[$account['id']]);
            $durable=in_array($db->driver(),['pgsql','mysql'],true);
            $approved=$account['status']==='approved'&&!empty($account['merchant_id']);
            $merchant=$approved?$db->one("SELECT id FROM b2b_merchants
                WHERE id=? AND status='approved_live'",[$account['merchant_id']]):null;
            $verified=$approved&&KycStudio::identityApproved($db,(string)$account['id']);
            $count=$db->one('SELECT COUNT(*) AS total FROM argus_portal_keys WHERE account_id=? AND revoked_at IS NULL',[$account['id']]);
            $active=(int)($count['total']??0);
            $reason=!$durable?'Banco financeiro persistente indisponível para armazenar as chaves':
                (!$approved?'Finalize a análise inicial do cadastro e a autorização do recebedor':
                (!$verified?'Sua identidade ainda está em validação documental':
                (!$merchant?'O recebedor ainda não foi habilitado para pagamentos':
                ($active>=10?'Limite de 10 chaves ativas atingido. Revogue uma chave antiga para gerar outra':
                'Você pode gerar suas próprias chaves agora, sem autorização do administrador'))));
            self::out([
                'keys'=>$v,'can_issue'=>$durable&&$verified&&!!$merchant&&$active<10,
                'reason'=>$reason,'active_count'=>$active,'max_active'=>10,
                'self_service'=>true,'documentation_url'=>'/documentacao-api'
            ]);
        }
PHP;
sellerKeysReplace($source,$old,$new,'GET own seller credentials');
$old=<<<'PHP'
            if(!KycStudio::identityApproved($db,(string)$account['id']))self::fail('Aguarde aprovação da identidade na Central KYC',403);
            $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[$account['merchant_id']]);
            if(!$merchant)self::fail('Aguardando aprovação do recebedor no sistema de pagamentos',403);
            $key='agp_live_'.bin2hex(random_bytes(12));
PHP;
$new=<<<'PHP'
            if(!KycStudio::identityApproved($db,(string)$account['id']))self::fail('Aguarde aprovação da identidade na Central KYC',403);
            $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[$account['merchant_id']]);
            if(!$merchant)self::fail('Aguardando aprovação do recebedor no sistema de pagamentos',403);
            if(!in_array($db->driver(),['pgsql','mysql'],true))
                self::fail('Banco financeiro persistente obrigatório para emitir chaves',503);
            $active=$db->one('SELECT COUNT(*) AS total FROM argus_portal_keys
                WHERE account_id=? AND revoked_at IS NULL',[$account['id']]);
            if((int)($active['total']??0)>=10)
                self::fail('Limite de 10 chaves ativas. Revogue uma antes de gerar outra.',409);
            // This inserts under the logged-in account; clients cannot choose
            // another account_id or merchant_id in their request body.
            $key='agp_live_'.bin2hex(random_bytes(12));
PHP;
sellerKeysReplace($source,$old,$new,'POST authenticated self issuance');
if(file_put_contents($path,$source)===false)throw new RuntimeException('Seller API key patch write failed');
echo "PASS: individual revendedor API keys self-issued after initial KYC and merchant approval; no admin OTP per key.\n";
