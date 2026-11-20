<?php
declare(strict_types=1);
/** Applied only after all existing ARGUS financial patches and regression tests. */
$root='/var/www/html';
function hybridReplace(string $file,string $before,string $after,string $name):void {
    $s=file_get_contents($file);
    if(!is_string($s)||substr_count($s,$before)!==1)
        throw new RuntimeException('Hybrid payout install mismatch: '.$name);
    if(file_put_contents($file,str_replace($before,$after,$s))===false)
        throw new RuntimeException('Hybrid payout install failed: '.$name);
}
hybridReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/FinancialControl.php';",
    "require_once __DIR__ . '/FinancialControl.php';\nrequire_once __DIR__ . '/HybridPayout.php';",
    'load risk service');
$w=$root.'/src/MerchantWallet.php';
hybridReplace($w,<<<'OLD'
        $sealed=self::seal($key);
        self::wallet($db,$account);
OLD
,<<<'NEW'
        $sealed=self::seal($key);
        // Classify before reserving funds; on risk database failure, stop.
        $risk=HybridPayout::assess($db,$accountId,$amount,$type,$masked);
        self::wallet($db,$account);
NEW
,'classify tenant request');
hybridReplace($w,
    '$type,$masked,$sealed,$desc,$debit){',
    '$type,$masked,$sealed,$desc,$debit,$risk){',
    'carry risk into atomic escrow');
hybridReplace($w,<<<'OLD'
$masked,$sealed,$desc,null,null,'requested',self::now(),null
OLD
,<<<'NEW'
$masked,$sealed,$desc,null,null,$risk['decision']==='review'?'review':'requested',self::now(),null
NEW
,'review state stored before release of transaction lock');
hybridReplace($w,<<<'OLD'
            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,self::FEE);
OLD
,<<<'NEW'
            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,self::FEE);
            HybridPayout::record($db,$id,$accountId,$risk);
NEW
,'atomic hold and classification');
hybridReplace($w,<<<'OLD'
        if($row['status']!=='requested')return self::payoutPublic($row);
OLD
,<<<'NEW'
        if($row['status']!=='requested')return self::payoutPublic($row);
        if(!HybridPayout::canDispatch($db,$row))
            self::fail('Saque bloqueado até autorização do fluxo híbrido',409);
NEW
,'no bypass of risk review, even via legacy admin execute');
hybridReplace($w,<<<'OLD'
        if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){
OLD
,<<<'NEW'
        if($method==='GET'&&$path==='/api/admin/merchant-wallet/hybrid-reviews'){
            self::out(['reviews'=>HybridPayout::queue($db),
                'live_enabled'=>getenv('ARGUS_HYBRID_PAYOUT_LIVE')==='yes' && getenv('ARGUS_PAYOUTS_ENABLED')==='yes']);
        }
        if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){
NEW
,'superadmin-only review queue');
hybridReplace($w,
    '(execute|reconcile)$~D',
    '(execute|reconcile|reject)$~D',
    'reject action via existing wallet controller');
hybridReplace($w,<<<'OLD'
            if($m[2]==='reconcile'){
OLD
,<<<'NEW'
            if($m[2]==='reject'){
                HybridPayout::reject($db,$row,$actor);
                $fresh=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$row['id']]);
                self::out(['withdrawal'=>self::payoutPublic($fresh)]);
            }
            if($m[2]==='reconcile'){
NEW
,'reject and release only unsubmitted review');
hybridReplace($w,<<<'OLD'
            self::out(['withdrawal'=>self::sendWithdraw($db,(string)$row['id'],(string)$row['account_id'])]);
OLD
,<<<'NEW'
            if($row['status']==='review')HybridPayout::approve($db,$row,$actor);
            self::out(['withdrawal'=>self::sendWithdraw($db,(string)$row['id'],(string)$row['account_id'])]);
NEW
,'MFA approval before PSP dispatch');
hybridReplace($root.'/src/FinancialControl.php',
    "status IN ('requested','processing','queued','pending','unknown')",
    "status IN ('requested','review','processing','queued','pending','unknown')",
    'duplicate prevention includes review');
$anchor=<<<'OLD'
        if($method==='GET'&&$path==='/api/admin/fees/operations'){
OLD;
$insert=<<<'NEW'
        // Rejection releases held funds; apply the same Super Admin 2FA as execution.
        if($method==='POST'&&preg_match('~^/api/admin/merchant-wallet/withdrawals/mww_[a-f0-9]{32}/reject$~D',$path)){
            self::writeAllowed($actor,true);
            $body=self::input();
            self::verifyMfaCode($db,$actor,self::str($body,'otp',6,6));
            MerchantWallet::admin($db,$method,$path,$actor,$body);
        }
NEW;
hybridReplace($root.'/src/Admin.php',$anchor,$insert."\n".$anchor,'admin MFA on rejection');
hybridReplace($root.'/public/static/admin.html','</head>',
    '<link rel="stylesheet" href="/static/hybrid-payout.css?v=20261120-1"></head>',
    'review CSS');
hybridReplace($root.'/public/static/admin.html','</body>',
    '<script src="/static/hybrid-payout.js?v=20261120-1" defer></script></body>',
    'review UI');
echo "ARGUS hybrid payout: local risk review, 2FA, idempotent escrow and dual live gate installed.\n";

$adminJs=$root.'/public/static/merchant-admin.js';
hybridReplace($adminJs,<<<'OLD'
    (r.status==='requested'?'<small>Aguardando processamento do próprio revendedor</small>':'')+
OLD
,<<<'NEW'
    (r.status==='requested'?'<small>Aguardando processamento do próprio revendedor</small>':'')+
    (r.status==='review'?'<button type="button" data-seller-execute="'+esc(r.id)+'">Aprovar e enviar Pix</button><button type="button" data-seller-reject="'+esc(r.id)+'">Rejeitar saque</button>':'')+
NEW
,'admin review action buttons');
hybridReplace($adminJs,
    "button[data-seller-execute],button[data-seller-reconcile]",
    "button[data-seller-execute],button[data-seller-reconcile],button[data-seller-reject]",
    'include rejection in event delegation');
hybridReplace($adminJs,<<<'OLD'
 const execute=!!button.dataset.sellerExecute;
 const id=button.dataset.sellerExecute||button.dataset.sellerReconcile;
OLD
,<<<'NEW'
 const execute=!!button.dataset.sellerExecute;
 const reject=!!button.dataset.sellerReject;
 const id=button.dataset.sellerExecute||button.dataset.sellerReconcile||button.dataset.sellerReject;
NEW
,'select action and withdrawal id');
hybridReplace($adminJs,<<<'OLD'
 if(execute){
  if(!confirm('Transferência real para a chave Pix registrada pelo vendedor. O saldo já está reservado. Confirma o processamento?'))return;
OLD
,<<<'NEW'
 if(execute||reject){
  if(!confirm(reject?'Rejeitar e devolver exclusivamente ao saldo reservado do revendedor?':'Transferência Pix real para a chave registrada: confirma a aprovação?'))return;
NEW
,'safe confirmation before admin action');

hybridReplace($adminJs,<<<'OLD'
  await post('/api/admin/merchant-wallet/withdrawals/'+encodeURIComponent(id)+'/'+(execute?'execute':'reconcile'),body);
OLD
,<<<'NEW'
  await post('/api/admin/merchant-wallet/withdrawals/'+encodeURIComponent(id)+'/'+(execute?'execute':(reject?'reject':'reconcile')),body);
NEW
,'post the signed decision');
hybridReplace($adminJs,<<<'OLD'
  toast(execute?'Transferência enviada. Consulte o status financeiro antes de repetir.':'Conciliação concluída.');
OLD
,<<<'NEW'
  toast(execute?'Processamento solicitado; confira a liquidação antes de repetir.':(reject?'Saque rejeitado e valor reservado liberado.':'Conciliação concluída.'));
NEW
,'action feedback');
echo "ARGUS hybrid payout: local risk review, 2FA, idempotent escrow and dual live gate installed.\n";
