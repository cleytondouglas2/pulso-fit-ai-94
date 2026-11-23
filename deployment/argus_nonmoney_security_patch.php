<?php
declare(strict_types=1);
/** Non-financial remediations: merchant webhook dead replay, public branding.
 * Neither creates, reconciles, approves, or transfers any money.
 */
function agNonMoneyReplace(string $file,string $old,string $new,string $label):void{
 $s=file_get_contents($file);
 if(!is_string($s)||substr_count($s,$old)!==1)
  throw new RuntimeException('ARGUS nonmoney patch anchor '.$label);
 if(file_put_contents($file,str_replace($old,$new,$s))===false)
  throw new RuntimeException('ARGUS nonmoney write '.$label);
}
$root='/var/www/html/';
$hooks=$root.'src/MerchantWebhooks.php';
$old="    public static function portal(Database \$db,string \$method,string \$path,array \$account):never{";
$new=<<<'CODE'
    /**
     * Explicit seller replay of a DEAD notification only. Not a money action.
     * Uses original immutable signed event ID so receiver can deduplicate.
     * Delivered, pending and other tenants' records cannot be replayed.
     */
    public static function retryDead(Database $db,string $accountId,string $deliveryId):bool{
        self::install($db);
        SecurityShield::rate($db,'webhook_retry',$accountId,6,600);
        $changed=$db->run("UPDATE argus_merchant_webhook_deliveries
            SET status='pending',attempts=0,next_attempt_at=?,last_http_code=NULL
            WHERE id=? AND account_id=? AND status='dead'
              AND webhook_id IN (SELECT id FROM argus_merchant_webhook_endpoints
                WHERE account_id=? AND status='active')",
            [time(),$deliveryId,$accountId,$accountId]);
        return $changed->rowCount()===1;
    }
    public static function portal(Database $db,string $method,string $path,array $account):never{
CODE;
agNonMoneyReplace($hooks,$old,$new,'tenant-scoped dead webhook retry');
$old="        if(\$method==='POST'&&preg_match('~^/api/portal/webhooks/(wh_[a-f0-9]{32})/disable\$~D',\$path,\$m)){";
$new=<<<'CODE'
        if($method==='POST'&&preg_match('~^/api/portal/webhooks/deliveries/(whd_[a-f0-9]{32})/retry$~D',$path,$m)){
            if(!self::retryDead($db,$id,$m[1]))
                self::fail('Entrega não encontrada, pertence a outra conta ou não está definitivamente falha.',409);
            self::out(['queued'=>true,'message'=>'Reentrega agendada. O destinatário deve tratar IDs duplicados.']);
        }
        if($method==='POST'&&preg_match('~^/api/portal/webhooks/(wh_[a-f0-9]{32})/disable$~D',$path,$m)){
CODE;
agNonMoneyReplace($hooks,$old,$new,'authenticated portal replay endpoint');
$js=$root.'public/static/merchant-webhooks.js';
$old=" E('argus-webhook-endpoints').addEventListener('click',async event=>{";
$new=<<<'JS'
 E('argus-webhook-deliveries').addEventListener('click',async event=>{
   const button=event.target.closest('button[data-webhook-retry]');if(!button)return;
   if(!confirm('Reagendar esta entrega falha? O destinatário deve ignorar eventos com ID já processado.'))return;
   button.disabled=true;
   try{
      await request('/api/portal/webhooks/deliveries/'+encodeURIComponent(button.dataset.webhookRetry)+'/retry',{method:'POST',body:{}});
      await load();setStatus('Reentrega agendada; acompanhe o resultado.');
   }catch(error){setStatus(error.message,true);}
   finally{button.disabled=false;}
 });
 E('argus-webhook-endpoints').addEventListener('click',async event=>{
JS;
agNonMoneyReplace($js,$old,$new,'seller dead delivery retry button');
$old="    ' · '+esc(d.created_at)+'</small></div></article>').join(''):";
$new=<<<'JS'
    ' · '+esc(d.created_at)+'</small></div>'+
    (d.status==='dead'?'<button type="button" data-webhook-retry="'+esc(d.id)+'">Reagendar</button>':'')+
    '</article>').join(''):
JS;
agNonMoneyReplace($js,$old,$new,'show retry on dead only');
$client=$root.'public/static/client.html';
$old='merchant-webhooks.js?v=20261119-1';
$new='merchant-webhooks.js?v=retry-safe-20261123-v1';
agNonMoneyReplace($client,$old,$new,'invalidate seller webhook JS cache');

$adminPix=$root.'src/PublicAdminPix.php';
agNonMoneyReplace($adminPix,"'provider'=>'MisticPay',","'provider'=>'ARGUS Pay',",'public quote never advertises acquiring PSP');
$public=$root.'public/static/public-pix.html';
$pjs=$root.'public/static/public-pix.js';
foreach([$public,$pjs] as $file){
 $s=file_get_contents($file);
 if(!is_string($s)||!str_contains($s,'MisticPay'))
     throw new RuntimeException('ARGUS public brand anchor changed');
 $s=str_replace('MisticPay','ARGUS Pay',$s);
 if(file_put_contents($file,$s)===false)throw new RuntimeException('ARGUS public branding write');
}
agNonMoneyReplace($public,'public-pix.js?v=pix-premium-20261123-1',
 'public-pix.js?v=argus-only-20261123-v1','invalidate public Pix JS cache');
echo "PASS: seller dead webhook requeue guarded by ownership, status, rate limit and CSRF; public Pix does not disclose acquiring PSP.\n";
