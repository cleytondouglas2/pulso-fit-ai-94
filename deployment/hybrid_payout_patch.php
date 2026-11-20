<?php
declare(strict_types=1);
/**
 * Patch the already-hardened ARGUS build LAST. Fails the build if any money-path
 * anchor moved; no production payment or provider call is performed here.
 */
$root='/var/www/html';
function hybridReplace(string $path,string $before,string $after,string $name):void {
    $src=file_get_contents($path);
    if(!is_string($src) || substr_count($src,$before)!==1)
        throw new RuntimeException('Hybrid payout install mismatch: '.$name);
    if(file_put_contents($path,str_replace($before,$after,$src))===false)
        throw new RuntimeException('Hybrid payout write failed: '.$name);
}
hybridReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/FinancialControl.php';",
    "require_once __DIR__ . '/FinancialControl.php';\nrequire_once __DIR__ . '/HybridPayout.php';",
    'server risk engine inclusion');
$w=$root.'/src/MerchantWallet.php';
hybridReplace($w,
    "        $sealed=self::seal($key);\n        self::wallet($db,$account);",
    "        $sealed=self::seal($key);\n        // Risk assessment is scoped to THIS wallet. On error, fail closed.\n        $risk=HybridPayout::assess($db,$accountId,$amount,$type,$masked);\n        self::wallet($db,$account);",
    'risk before fund reservation');
hybridReplace($w,
    '$type,$masked,$sealed,$desc,$debit){',
    '$type,$masked,$sealed,$desc,$debit,$risk){',
    'carry the trusted decision into the reservation transaction');
hybridReplace($w,
    "$masked,$sealed,$desc,null,null,'requested',self::now(),null",
    "$masked,$sealed,$desc,null,null,$risk['decision']==='review'?'review':'requested',self::now(),null",
    'persist classification atomically with withdrawal');
hybridReplace($w,
    "            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,self::FEE);",
    "            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,self::FEE);\n            HybridPayout::record($db,$id,$accountId,$risk);",
    'atomic hold and risk evidence');
hybridReplace($w,
    "        if($row['status']!=='requested')return self::payoutPublic($row);",
    "        if($row['status']!=='requested')return self::payoutPublic($row);\n        if(!HybridPayout::canDispatch($db,$row))\n            self::fail('Saque bloqueado até liberação explícita do modo híbrido ou revisão administrativa',409);",
    'no unreviewed execution, including legacy admin endpoints');
hybridReplace($w,
    "        if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){",
    "        if($method==='GET'&&$path==='/api/admin/merchant-wallet/hybrid-reviews'){\n            self::out(['reviews'=>HybridPayout::queue($db),\n                'live_enabled'=>getenv('ARGUS_HYBRID_PAYOUT_LIVE')==='yes' && getenv('ARGUS_PAYOUTS_ENABLED')==='yes']);\n        }\n        if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){",
    'superadmin-only risk queue');
hybridReplace($w,
    '(execute|reconcile)$~D',
    '(execute|reconcile|reject)$~D',
    'allow explicit rejection on existing protected admin endpoint');
hybridReplace($w,
    "            if($m[2]==='reconcile'){",
    "            if($m[2]==='reject'){\n                HybridPayout::reject($db,$row,$actor);\n                $fresh=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$row['id']]);\n                self::out(['withdrawal'=>self::payoutPublic($fresh)]);\n            }\n            if($m[2]==='reconcile'){",
    'reject and return all held funds without PSP transfer');
hybridReplace($w,
    "            self::out(['withdrawal'=>self::sendWithdraw($db,(string)$row['id'],(string)$row['account_id'])]);",
    "            if($row['status']==='review')HybridPayout::approve($db,$row,$actor);\n            self::out(['withdrawal'=>self::sendWithdraw($db,(string)$row['id'],(string)$row['account_id'])]);",
    'MFA-protected approval before dispatch');
$f=$root.'/src/FinancialControl.php';
hybridReplace($f,
    "status IN ('requested','processing','queued','pending','unknown')",
    "status IN ('requested','review','processing','queued','pending','unknown')",
    'review reservations must block duplicate withdrawals');
$a=$root.'/src/Admin.php';
$anchor=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/fees/operations'){
PHP;
$insert=<<<'PHP'
        // Rejection is an irreversible financial reservation release: 2FA required.
        if($method==='POST'&&preg_match('~^/api/admin/merchant-wallet/withdrawals/mww_[a-f0-9]{32}/reject$~D',$path)){
            self::writeAllowed($actor,true);
            $body=self::input();
            self::verifyMfaCode($db,$actor,self::str($body,'otp',6,6));
            MerchantWallet::admin($db,$method,$path,$actor,$body);
        }
PHP;
hybridReplace($a,$anchor,$insert.$anchor,'MFA on manual rejection');
$admin=$root.'/public/static/admin.html';
hybridReplace($admin,'</head>',
    '<link rel="stylesheet" href="/static/hybrid-payout.css?v=20261120-1"></head>',
    'review queue stylesheet');
hybridReplace($admin,'</body>',
    '<script src="/static/hybrid-payout.js?v=20261120-1" defer></script></body>',
    'review queue UI');
echo "ARGUS hybrid payouts staged: tenant risk, review queue, MFA approval/rejection, immutable journal and safe double-gate.\n";
