<?php
declare(strict_types=1);
namespace ArgusPayments;
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

/**
 * ARGUS notification center. Never marks transactions paid, performs transfers,
 * or exposes one customer's events to another.
 * Web Push is opt-in; the database inbox works even when Push is unsupported.
 */
final class Notifications
{
    private static function out(array $value,int $status=200):never {
        http_response_code($status);
        header('Cache-Control: private, no-store');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    private static function fail(string $message,int $status=400):never {throw new ApiError($message,$status);}
    private static function input():array {
        $raw=file_get_contents('php://input');
        if(!is_string($raw)||strlen($raw)>12288)self::fail('Solicitação excessiva',413);
        try{$data=json_decode($raw,true,24,JSON_THROW_ON_ERROR);}catch(\JsonException){self::fail('JSON inválido');}
        if(!is_array($data)||array_is_list($data))self::fail('Objeto obrigatório');return $data;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_notice_settings (
            audience_type VARCHAR(12) NOT NULL, audience_id VARCHAR(64) NOT NULL,
            pix_received INTEGER NOT NULL DEFAULT 1, pix_sent INTEGER NOT NULL DEFAULT 1,
            announcements INTEGER NOT NULL DEFAULT 1, show_amount INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(audience_type,audience_id))");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_notice_subscriptions (
            endpoint_hash VARCHAR(64) PRIMARY KEY, audience_type VARCHAR(12) NOT NULL,
            audience_id VARCHAR(64) NOT NULL, endpoint TEXT NOT NULL,
            p256dh VARCHAR(256) NOT NULL, auth VARCHAR(128) NOT NULL,
            created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_notice_events (
            id VARCHAR(64) PRIMARY KEY, unique_key VARCHAR(64) NOT NULL UNIQUE,
            audience_type VARCHAR(12) NOT NULL, audience_id VARCHAR(64) NOT NULL,
            category VARCHAR(32) NOT NULL, title VARCHAR(160) NOT NULL,
            body VARCHAR(350) NOT NULL, amount_cents BIGINT,
            link VARCHAR(120) NOT NULL, created_at VARCHAR(32) NOT NULL,
            read_at VARCHAR(32))");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_notice_deliveries (
            event_id VARCHAR(64) NOT NULL, endpoint_hash VARCHAR(64) NOT NULL,
            delivered_at VARCHAR(32), attempt_at VARCHAR(32),
            PRIMARY KEY(event_id,endpoint_hash))");
    }
    private static function defaults(array $prefs):array {
        return [
            'pix_received'=>(bool)($prefs['pix_received']??1),
            'pix_sent'=>(bool)($prefs['pix_sent']??1),
            'announcements'=>(bool)($prefs['announcements']??1),
            'show_amount'=>(bool)($prefs['show_amount']??0),
        ];
    }
    private static function settings(Database $db,string $type,string $id):array {
        return self::defaults($db->one('SELECT * FROM argus_notice_settings WHERE audience_type=? AND audience_id=?',[$type,$id])??[]);
    }
    private static function enabled(array $settings,string $category):bool {
        $pref=match($category){'pix.received'=>'pix_received','pix.sent'=>'pix_sent',default=>'announcements'};
        return $settings[$pref]??false;
    }
    private static function vapidPublic():string {
        $pub=trim((string)getenv('ARGUS_PUSH_VAPID_PUBLIC'));
        return preg_match('/^[A-Za-z0-9_-]{86,90}$/D',$pub)?$pub:'';
    }
    private static function pushConfigured():bool {
        return self::vapidPublic()!=='' &&
            preg_match('/^[A-Za-z0-9_-]{40,48}$/D',(string)getenv('ARGUS_PUSH_VAPID_PRIVATE'))===1 &&
            class_exists(WebPush::class) && class_exists(\GuzzleHttp\Client::class);
    }
    private static function validEndpoint(string $url):bool {
        if(strlen($url)<30||strlen($url)>2048) return false;
        $parts=parse_url($url);
        if(!$parts||strtolower((string)($parts['scheme']??''))!=='https'||isset($parts['user'])||isset($parts['pass'])||isset($parts['port']))return false;
        $host=strtolower((string)($parts['host']??''));
        // Push servers are a strict allowlist; never perform arbitrary server-side HTTP.
        return $host==='fcm.googleapis.com'||$host==='updates.push.services.mozilla.com'||
            $host==='push.services.mozilla.com'||$host==='web.push.apple.com'||
            str_ends_with($host,'.push.apple.com')||$host==='updates.push.services.mozilla.com';
    }
    private static function validSub(array $data):array {
        $endpoint=$data['endpoint']??null;$keys=$data['keys']??null;
        if(!is_string($endpoint)||!self::validEndpoint($endpoint)||!is_array($keys)) self::fail('Endpoint de notificações inválido',422);
        $p=$keys['p256dh']??null;$a=$keys['auth']??null;
        if(!is_string($p)||!preg_match('/^[A-Za-z0-9_-]{80,120}={0,2}$/D',$p)||!is_string($a)||!preg_match('/^[A-Za-z0-9_-]{20,40}={0,2}$/D',$a))self::fail('Chaves de notificação inválidas',422);
        return [$endpoint,$p,$a];
    }
    public static function handle(Database $db,string $method,string $path,string $type,string $id,bool $super=false):never {
        if(!in_array($db->driver(),['pgsql','mysql'],true))self::fail('Notificações exigem banco persistente',503);
        self::install($db);
        $prefix=$type==='admin'?'/api/admin/notifications':'/api/portal/notifications';
        if($method==='GET'&&$path===$prefix){
            $rows=$db->all('SELECT id,category,title,body,amount_cents,link,created_at,read_at FROM argus_notice_events WHERE audience_type=? AND audience_id=? ORDER BY created_at DESC LIMIT 60',[$type,$id]);
            $unread=$db->one('SELECT COUNT(*) AS n FROM argus_notice_events WHERE audience_type=? AND audience_id=? AND read_at IS NULL',[$type,$id]);
            $subs=$db->one('SELECT COUNT(*) AS n FROM argus_notice_subscriptions WHERE audience_type=? AND audience_id=?',[$type,$id]);
            self::out(['notifications'=>$rows,'unread'=>(int)$unread['n'],'subscriptions'=>(int)$subs['n'],'preferences'=>self::settings($db,$type,$id),
                'push_available'=>self::pushConfigured(),'vapid_public'=>self::vapidPublic()]);
        }
        if($method==='POST'&&$path===$prefix.'/subscribe'){
            if(!self::pushConfigured())self::fail('Push indisponível até configurar as credenciais do serviço',503);
            [$endpoint,$p,$a]=self::validSub(self::input()['subscription']??[]);
            $hash=hash('sha256',$endpoint);
            $db->transaction(function(Database $db)use($type,$id,$endpoint,$p,$a,$hash){
                $db->run('DELETE FROM argus_notice_subscriptions WHERE endpoint_hash=?',[$hash]);
                $db->run('INSERT INTO argus_notice_subscriptions(endpoint_hash,audience_type,audience_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?,?)',
                    [$hash,$type,$id,$endpoint,$p,$a,Database::stamp()]);
            });
            self::out(['ok'=>true,'message'=>'Notificações ativadas neste aparelho']);
        }
        // Verify an exact local device subscription belongs to this signed-in
        // admin/reseller. Do not expose endpoints, secrets or other devices.
        if($method==='POST'&&$path===$prefix.'/status'){
            $data=self::input();
            $endpoint=$data['endpoint']??null;
            if(!is_string($endpoint)||!self::validEndpoint($endpoint))
                self::fail('Inscrição do dispositivo inválida',422);
            $linked=$db->one(
                'SELECT endpoint_hash FROM argus_notice_subscriptions WHERE endpoint_hash=? AND audience_type=? AND audience_id=?',
                [hash('sha256',$endpoint),$type,$id]);
            self::out(['active'=>$linked!==null,'push_available'=>self::pushConfigured()]);
        }
        if($method==='POST'&&$path===$prefix.'/unsubscribe'){
            $data=self::input();$url=$data['endpoint']??'';
            if(!is_string($url)||!self::validEndpoint($url))self::fail('Inscrição inválida',422);
            $db->run('DELETE FROM argus_notice_subscriptions WHERE endpoint_hash=? AND audience_type=? AND audience_id=?',[hash('sha256',$url),$type,$id]);
            self::out(['ok'=>true]);
        }
        if($method==='POST'&&$path===$prefix.'/preferences'){
            $body=self::input();$pref=[];
            foreach(['pix_received','pix_sent','announcements','show_amount'] as $name){
                if(!isset($body[$name])||!is_bool($body[$name]))self::fail('Preferência inválida: '.$name,422);
                $pref[$name]=(int)$body[$name];
            }
            $db->transaction(function(Database $db)use($type,$id,$pref){
                $db->run('DELETE FROM argus_notice_settings WHERE audience_type=? AND audience_id=?',[$type,$id]);
                $db->run('INSERT INTO argus_notice_settings(audience_type,audience_id,pix_received,pix_sent,announcements,show_amount) VALUES (?,?,?,?,?,?)',
                    [$type,$id,$pref['pix_received'],$pref['pix_sent'],$pref['announcements'],$pref['show_amount']]);
            });self::out(['ok'=>true,'preferences'=>self::settings($db,$type,$id)]);
        }
        if($method==='POST'&&$path===$prefix.'/test'){
            // An inbox event is NOT proof of delivery to Apple/Google. The old
            // endpoint always returned "enviada", even with no HTTP client.
            if(!self::pushConfigured())
                self::fail('Envio Push indisponível no servidor. Tente novamente mais tarde.',503);
            $subCount=$db->one('SELECT COUNT(*) AS n FROM argus_notice_subscriptions WHERE audience_type=? AND audience_id=?',[$type,$id]);
            if((int)($subCount['n']??0)<1)
                self::fail('Nenhum dispositivo habilitado neste painel. Toque em Ativar notificações primeiro.',409);
            $n=self::record($db,$type,$id,'announcement','argus-push-test-'.$id.'-'.bin2hex(random_bytes(5)),
                '🔔 ARGUS Pay conectado','Seu dispositivo recebeu um teste de notificações ARGUS Pay.',null,$type==='admin'?'/admin':'/conta');
            if(!$n)self::fail('Ative Avisos e novidades em Preferências antes de testar.',409);
            $report=self::dispatch($db,$n);
            if($report['deferred'])self::queueRecorded($db,$n);
            if($report['accepted']===0){
                self::out(['ok'=>false,'delivery'=>'failed','accepted'=>0,'failed'=>$report['failed'],
                    'message'=>'Teste registrado nos Avisos, mas o serviço Push não aceitou o envio. Reative as notificações no aparelho e tente novamente.'],502);
            }
            self::out(['ok'=>true,'delivery'=>($report['failed']>0||$report['deferred'])?'partial':'accepted',
                'accepted'=>$report['accepted'],'failed'=>$report['failed'],
                'message'=>($report['failed']>0||$report['deferred'])?
                    'O serviço Push aceitou alguns dispositivos, mas outros falharam. Confira as permissões e reative os dispositivos afetados.':
                    'Serviço Push aceitou o aviso para '.(int)$report['accepted'].' dispositivo(s). O recebimento na tela depende das permissões do sistema.']);
        }
        if($method==='POST'&&preg_match('~^'.preg_quote($prefix,'~').'/([a-zA-Z0-9_-]+)/read$~D',$path,$m)){
            $db->run('UPDATE argus_notice_events SET read_at=? WHERE id=? AND audience_type=? AND audience_id=? AND read_at IS NULL',
                [Database::stamp(),$m[1],$type,$id]);self::out(['ok'=>true]);
        }
        if($method==='POST'&&$path===$prefix.'/announce'&&$super){
            $b=self::input();
            $title=trim((string)($b['title']??''));$message=trim((string)($b['message']??''));
            if(strlen($title)<4||strlen($title)>100||strlen($message)<8||strlen($message)>280)self::fail('Título ou mensagem fora dos limites',422);
            $audience=$b['audience']??'clients';
            if(!in_array($audience,['clients','team','all'],true))self::fail('Público inválido',422);
            SecurityShield::rate($db,'notice_broadcast',$id,6,3600);
            self::out(ArgusGrowth::enqueueBroadcast($db,$id,$audience,$title,$message),202);
        }
        self::fail('Rota de notificações inexistente',404);
    }
    public static function record(Database $db,string $type,string $id,string $category,string $eventKey,string $title,string $body,?int $amount=null,string $link='/conta'): ?string {
        self::install($db);
        if(!self::enabled(self::settings($db,$type,$id),$category))return null;
        $eid='ntf_'.bin2hex(random_bytes(12));
        try{$db->run('INSERT INTO argus_notice_events(id,unique_key,audience_type,audience_id,category,title,body,amount_cents,link,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$eid,hash('sha256',$eventKey.'|'.$type.'|'.$id),$type,$id,$category,mb_substr($title,0,150),mb_substr($body,0,320),$amount,$link,Database::stamp()]);
        }catch(\PDOException $e){if(in_array((string)$e->getCode(),['23000','23505'],true))return null;throw $e;}
        return $eid;
    }
    public static function pixReceived(Database $db,string $merchantId,string $chargeId,int $amount):void {
        self::install($db);
        $targets=[];
        // An early provider confirmation may predate the first portal/admin registration.
        // Missing optional audience tables must not affect payment reconciliation.
        try{foreach($db->all("SELECT id FROM argus_portal_accounts WHERE merchant_id=? AND status='approved'",[$merchantId]) as $x)$targets[]=['portal',$x['id']];}
        catch(\PDOException $ignore){}
        try{foreach($db->all("SELECT id FROM admin_users WHERE role='superadmin' AND status='active'") as $x)$targets[]=['admin',$x['id']];}
        catch(\PDOException $ignore){}
        foreach($targets as [$type,$id]){
            $event=self::record($db,$type,$id,'pix.received','pix.received:'.$chargeId,
                'Olha o Pix aí, cachorro! 🐶💸','Pix recebido e confirmado. Abra o ARGUS Pay para consultar.', $amount,$type==='admin'?'/admin':'/conta');
            if($event)self::queueRecorded($db,$event);
        }
    }
    public static function adminPixReceived(Database $db,string $chargeId,int $amount):void {
        self::install($db);
        foreach($db->all("SELECT id FROM admin_users WHERE role='superadmin' AND status='active'") as $x){
            $event=self::record($db,'admin',$x['id'],'pix.received','quick-pix.received:'.$chargeId,
                'Olha o Pix aí, cachorro! 🐶💸','Um Pix foi recebido e confirmado na conta ARGUS.',$amount,'/admin');
            if($event)self::queueRecorded($db,$event);
        }
    }
    public static function adminPixSent(Database $db,string $actorId,string $payoutId,int $amount):void {
        $event=self::record($db,'admin',$actorId,'pix.sent','payout.paid:'.$payoutId,
            '💸 Pix enviado com sucesso','Transferência Pix concluída e confirmada.',$amount,'/admin');
        if($event)self::queueRecorded($db,$event);
    }
    public static function accountUpdate(Database $db,string $accountId,string $status):void {
        $titles=['approved'=>'✅ Conta ARGUS aprovada','identity_verified'=>'📋 Identidade verificada',
            'rejected'=>'Atenção ao cadastro ARGUS','suspended'=>'Conta ARGUS temporariamente suspensa'];
        $event=self::record($db,'portal',$accountId,'announcement','account-status:'.$accountId.':'.$status,
            $titles[$status]??'Atualização da sua conta ARGUS','Seu cadastro foi atualizado. Consulte os detalhes na sua conta.',null,'/conta');
        if($event)self::queueRecorded($db,$event);
    }
    private static function queueRecorded(Database $db,string $event):void{
        try{
            ArgusGrowth::ready($db);
            ArgusGrowth::queueAdvisory($db,'','','',$event);
        }catch(\Throwable $e){error_log('ARGUS notification queue unavailable; inbox retained: '.get_class($e));}
    }
    public static function audienceActive(Database $db,string $type,string $id,string $category):bool{
        try{
            if($type==='admin')return (bool)$db->one("SELECT id FROM admin_users WHERE id=? AND status='active'",[$id]);
            if($type==='portal'){
                $sql=$category==='announcement'?"SELECT id FROM argus_portal_accounts WHERE id=? AND status NOT IN ('rejected','suspended')":"SELECT id FROM argus_portal_accounts WHERE id=? AND status='approved'";
                return (bool)$db->one($sql,[$id]);
            }
        }catch(\Throwable $e){error_log('ARGUS push audience validation unavailable: '.get_class($e));throw $e;}
        return false;
    }
    /** Gateway acceptance is not proof of display. A generic push cannot leak a prior account's transaction. */
    public static function dispatch(Database $db,string $eventId,?callable $fixtureTransport=null,int $limit=8):array {
        if($fixtureTransport!==null&&PHP_SAPI!=='cli')throw new \LogicException('Fixture only');
        $limit=max(1,min(16,$limit));if($fixtureTransport===null)$limit=min(8,$limit);
        $result=['attempted'=>0,'accepted'=>0,'failed'=>0,'expired'=>0,'skipped'=>0,'previously_accepted'=>0,'deferred'=>false,'status'=>'not_attempted'];
        $event=$db->one('SELECT * FROM argus_notice_events WHERE id=?',[$eventId]);
        if(!$event){$result['status']='missing_event';return $result;}
        $type=$event['audience_type'];$id=$event['audience_id'];$category=$event['category'];
        try{$active=self::audienceActive($db,$type,$id,$category);}catch(\Throwable $e){$result['deferred']=true;$result['status']='validation_unavailable';return $result;}
        if(!$active){$result['status']='inactive_account';return $result;}
        if(!self::enabled(self::settings($db,$type,$id),$category)){$result['status']='disabled';return $result;}
        $total=(int)$db->one('SELECT COUNT(*) AS n FROM argus_notice_subscriptions WHERE audience_type=? AND audience_id=?',[$type,$id])['n'];
        if(!$total){$result['status']='no_devices';return $result;}
        $result['previously_accepted']=(int)$db->one('SELECT COUNT(*) AS n FROM argus_notice_subscriptions s JOIN argus_notice_deliveries d ON d.endpoint_hash=s.endpoint_hash AND d.event_id=? WHERE s.audience_type=? AND s.audience_id=? AND d.delivered_at IS NOT NULL',[$eventId,$type,$id])['n'];
        $list=$db->all('SELECT s.* FROM argus_notice_subscriptions s LEFT JOIN argus_notice_deliveries d ON d.endpoint_hash=s.endpoint_hash AND d.event_id=? WHERE s.audience_type=? AND s.audience_id=? AND d.delivered_at IS NULL ORDER BY CASE WHEN d.attempt_at IS NULL THEN 0 ELSE 1 END,d.attempt_at,s.endpoint_hash LIMIT '.$limit,[$eventId,$type,$id]);
        if(!$list){$result['status']='processed';return $result;}
        if(!$fixtureTransport&&!self::pushConfigured()){$result['deferred']=true;$result['status']='transport_unavailable';return $result;}
        // Browser push may arrive AFTER logout or device reassignment. Never include amounts,
        // financial status, merchant identity, arbitrary announcement text or account-specific links.
        // Full original message remains in the authenticated notification center.
        $payload=json_encode(['title'=>'ARGUS Pay','body'=>'Você tem um novo aviso. Entre na sua conta para consultar.','url'=>'/','tag'=>'argus-notice-'.substr(hash('sha256',$eventId),0,32),'image'=>null,'category'=>'notice'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        if(!$fixtureTransport){
            try{
                $sender=new WebPush(['VAPID'=>[
                    'subject'=>'https://app.arguspay.com.br','publicKey'=>self::vapidPublic(),'privateKey'=>(string)getenv('ARGUS_PUSH_VAPID_PRIVATE')
                ]],['TTL'=>60,'urgency'=>'normal','contentType'=>'application/json'],4,['connect_timeout'=>2,'timeout'=>4,'allow_redirects'=>false]);
                $fixtureTransport=static function(array $sub,string $payload)use($sender):array{
                    $report=$sender->sendOneNotification(Subscription::create(['endpoint'=>$sub['endpoint'],'keys'=>['p256dh'=>$sub['p256dh'],'auth'=>$sub['auth']]]),$payload);
                    return ['accepted'=>$report->isSuccess(),'expired'=>$report->isSubscriptionExpired()];
                };
            }catch(\Throwable $ex){
                error_log('ARGUS push service init failed: '.get_class($ex));
                $result['failed']=count($list);$result['deferred']=true;$result['status']='transport_unavailable';return $result;
            }
        }
        foreach($list as $sub){
            // Revalidate account, consent and exact subscription binding immediately before transport.
            try{$active=self::audienceActive($db,$type,$id,$category);}catch(\Throwable $e){$result['deferred']=true;$result['status']='validation_unavailable';return $result;}
            if(!$active||!self::enabled(self::settings($db,$type,$id),$category)){$result['skipped']++;continue;}
            $current=$db->one('SELECT * FROM argus_notice_subscriptions WHERE endpoint_hash=? AND audience_type=? AND audience_id=?',[$sub['endpoint_hash'],$type,$id]);
            if(!$current||!hash_equals($sub['p256dh'],$current['p256dh'])||!hash_equals($sub['auth'],$current['auth'])||!hash_equals($sub['endpoint'],$current['endpoint'])||$sub['created_at']!==$current['created_at']){$result['skipped']++;continue;}
            if(!self::validEndpoint($current['endpoint'])){$result['expired']++;$db->run('DELETE FROM argus_notice_subscriptions WHERE endpoint_hash=? AND audience_type=? AND audience_id=? AND p256dh=? AND auth=? AND created_at=?',[$current['endpoint_hash'],$type,$id,$current['p256dh'],$current['auth'],$current['created_at']]);continue;}
            $existing=$db->one('SELECT delivered_at FROM argus_notice_deliveries WHERE event_id=? AND endpoint_hash=?',[$eventId,$current['endpoint_hash']]);
            if($existing&&$existing['delivered_at'])continue;
            $result['attempted']++;
            try{
                $report=$fixtureTransport($current,$payload);
                $accepted=($report['accepted']??false)===true;$expired=($report['expired']??false)===true;
                if($accepted)$result['accepted']++;elseif(!$expired)$result['failed']++;
                // An expired old subscription must never delete a newly linked subscription.
                if($expired){
                    $result['expired']++;
                    $db->run('DELETE FROM argus_notice_subscriptions WHERE endpoint_hash=? AND audience_type=? AND audience_id=? AND p256dh=? AND auth=? AND created_at=?',[$current['endpoint_hash'],$type,$id,$current['p256dh'],$current['auth'],$current['created_at']]);
                }
                $args=[$eventId,$current['endpoint_hash'],Database::stamp(),$accepted?Database::stamp():null];
                // Do not overwrite a prior accepted result with a failed concurrent result.
                if($db->driver()==='mysql')$db->run('INSERT INTO argus_notice_deliveries(event_id,endpoint_hash,attempt_at,delivered_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE attempt_at=VALUES(attempt_at),delivered_at=COALESCE(argus_notice_deliveries.delivered_at,VALUES(delivered_at))',$args);
                else $db->run('INSERT INTO argus_notice_deliveries(event_id,endpoint_hash,attempt_at,delivered_at) VALUES (?,?,?,?) ON CONFLICT(event_id,endpoint_hash) DO UPDATE SET attempt_at=excluded.attempt_at,delivered_at=COALESCE(argus_notice_deliveries.delivered_at,excluded.delivered_at)',$args);
            }catch(\Throwable $ex){$result['failed']++;error_log('ARGUS push delivery exception: '.get_class($ex));}
        }
        // First pass through all devices is continuation, not a failed retry.
        $unseen=(int)$db->one('SELECT COUNT(*) AS n FROM argus_notice_subscriptions s LEFT JOIN argus_notice_deliveries d ON d.endpoint_hash=s.endpoint_hash AND d.event_id=? WHERE s.audience_type=? AND s.audience_id=? AND d.event_id IS NULL',[$eventId,$type,$id])['n'];
        if($unseen>0&&$result['attempted']+$result['expired']>0){
            $result['deferred']=true;$result['status']='continuation';return $result;
        }
        $result['deferred']=$result['failed']>0;
        $result['status']=$result['deferred']?'partial_or_failed':(($result['accepted']+$result['previously_accepted'])>0?'processed':'no_delivery');
        return $result;
    }
}
