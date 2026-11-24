<?php
declare(strict_types=1);
namespace ArgusPayments;
/** Operational management only. No provider dispatch, wallet writes or settlement. */
final class ArgusGrowth {
    private const SHARED=['subscription','invoice','product','coupon','flow','support','dispute','integration','team'];
    private const ADMIN=['limit_request','fee_request','contract','incident','approval','routing','marketplace'];
    private static function fail(string $s,int $status=422):never{throw new ApiError($s,$status);}
    private static function out(array $v):never{
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        echo json_encode($v,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;
    }
    private static array $installed=[];
    private static function index(Database $db,string $table,string $name,string $columns):void{
        if($db->driver()==='mysql'){
            try{$db->pdo()->exec("CREATE INDEX $name ON $table ($columns)");}catch(\PDOException $e){if((int)($e->errorInfo[1]??0)!==1061)throw $e;}
        }else $db->pdo()->exec("CREATE INDEX IF NOT EXISTS $name ON $table ($columns)");
    }
    public static function install(Database $db):void{
        $key=spl_object_id($db->pdo());if(isset(self::$installed[$key]))return;
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_records(
            id VARCHAR(80) PRIMARY KEY, audience VARCHAR(12) NOT NULL, owner_id VARCHAR(80) NOT NULL,
            kind VARCHAR(30) NOT NULL, payload TEXT NOT NULL, state VARCHAR(24) NOT NULL,
            created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_events(
            id VARCHAR(80) PRIMARY KEY, record_id VARCHAR(80) NOT NULL, audience VARCHAR(12) NOT NULL,
            owner_id VARCHAR(80) NOT NULL, actor_id VARCHAR(80) NOT NULL, action VARCHAR(40) NOT NULL,
            created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_messages(
            id VARCHAR(80) PRIMARY KEY, record_id VARCHAR(80) NOT NULL,
            owner_id VARCHAR(80) NOT NULL, sender VARCHAR(12) NOT NULL,
            body TEXT NOT NULL, created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_invoice_matches(
            record_id VARCHAR(80) PRIMARY KEY, audience VARCHAR(12) NOT NULL, owner_id VARCHAR(80) NOT NULL,
            operation_id VARCHAR(80) NOT NULL UNIQUE, created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_verify(
            token_hash VARCHAR(64) PRIMARY KEY, audience VARCHAR(12) NOT NULL, owner_id VARCHAR(80) NOT NULL,
            operation_id VARCHAR(80) NOT NULL, kind VARCHAR(20) NOT NULL, expires_at VARCHAR(32) NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0, created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_idem(record_id VARCHAR(80) PRIMARY KEY,request_hash VARCHAR(64) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_cursor(job VARCHAR(40) PRIMARY KEY,position VARCHAR(160) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_mutex(lock_key VARCHAR(64) PRIMARY KEY)");
        self::index($db,'argus_growth_records','argus_growth_owner_kind_idx','audience,owner_id,kind,created_at,id');
        self::index($db,'argus_growth_records','argus_growth_inbox_created_idx','audience,created_at,id,kind');
        self::index($db,'argus_growth_records','argus_growth_flow_idx','kind,state,audience,owner_id');
        self::index($db,'argus_growth_messages','argus_growth_message_idx','record_id,owner_id,created_at,id');
        self::index($db,'argus_growth_verify','argus_growth_verify_owner_idx','audience,owner_id,operation_id');
        self::index($db,'argus_growth_verify','argus_growth_verify_exp_idx','expires_at');
        self::index($db,'argus_growth_events','argus_growth_event_idx','record_id,created_at');
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_metrics_cache(cache_key VARCHAR(64) PRIMARY KEY,payload TEXT NOT NULL,computed_at BIGINT NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_notice_retry(event_id VARCHAR(80) PRIMARY KEY,attempts INTEGER NOT NULL,next_at BIGINT NOT NULL,expires_at BIGINT NOT NULL)");
        self::index($db,'argus_growth_notice_retry','argus_growth_notice_due_idx','next_at,expires_at');
        self::index($db,'argus_growth_metrics_cache','argus_growth_cache_time_idx','computed_at');
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_scan_retry(job VARCHAR(24) NOT NULL,subject VARCHAR(160) NOT NULL,attempts INTEGER NOT NULL,next_at BIGINT NOT NULL,PRIMARY KEY(job,subject))");
        self::index($db,'argus_growth_scan_retry','argus_growth_scan_due_idx','job,next_at');
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_failed_jobs(id VARCHAR(64) PRIMARY KEY,kind VARCHAR(12) NOT NULL,job VARCHAR(24) NOT NULL,subject VARCHAR(160) NOT NULL,attempts INTEGER NOT NULL,reason VARCHAR(32) NOT NULL,failed_at BIGINT NOT NULL,state VARCHAR(16) NOT NULL,reviewed_by VARCHAR(80),reviewed_at BIGINT)");
        self::index($db,'argus_growth_failed_jobs','argus_growth_failed_state_idx','state,failed_at,id');
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_delivery_state(event_id VARCHAR(80) PRIMARY KEY,claim_token VARCHAR(64) NOT NULL,lease_until BIGINT NOT NULL,state VARCHAR(20) NOT NULL,updated_at BIGINT NOT NULL)");
        self::index($db,'argus_growth_delivery_state','argus_growth_delivery_lease_idx','state,lease_until');
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_growth_failure_history(id VARCHAR(64) PRIMARY KEY,failure_id VARCHAR(64) NOT NULL,action VARCHAR(24) NOT NULL,actor_id VARCHAR(80),reason VARCHAR(32) NOT NULL,attempts INTEGER NOT NULL,created_at BIGINT NOT NULL)");
        self::index($db,'argus_growth_failure_history','argus_growth_failure_history_idx','failure_id,created_at,id');
        self::index($db,'argus_growth_failed_jobs','argus_growth_failed_state_id_idx','state,id');
        self::saveCursor($db,'schema_version','8');
        self::$installed[$key]=$db->pdo();
    }
    /** Transactional mutex, independent of financial tables. */
    private static function mutex(Database $db,string $key):void{
        if(!$db->pdo()->inTransaction())throw new \LogicException('Growth mutex requires transaction');
        $key=hash('sha256',$key);
        // PostgreSQL releases the lock with the transaction; no permanent row per operation.
        if($db->driver()==='pgsql'){$db->one("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':growth:'||?,0))",[$key]);return;}
        // A fixed 4096-row namespace bounds storage for other engines. Collisions only serialize work.
        $key='v8:'.substr($key,0,3);
        if($db->driver()==='mysql')$db->run('INSERT INTO argus_growth_mutex(lock_key) VALUES (?) ON DUPLICATE KEY UPDATE lock_key=VALUES(lock_key)',[$key]);
        else $db->run('INSERT INTO argus_growth_mutex(lock_key) VALUES (?) ON CONFLICT(lock_key) DO UPDATE SET lock_key=excluded.lock_key',[$key]);
    }
    private static array $ready=[];
    public static function ready(Database $db):void{
        $key=spl_object_id($db->pdo());if(isset(self::$ready[$key]))return;
        try{$v=self::cursor($db,'schema_version');}catch(\Throwable $e){self::fail('Módulos de gestão aguardando migração.',503);}
        if($v!=='8')self::fail('Módulos de gestão aguardando migração.',503);
        self::$ready[$key]=$db->pdo();
    }
    public static function cursor(Database $db,string $job):string{
        $r=$db->one('SELECT position FROM argus_growth_cursor WHERE job=?',[$job]);return (string)($r['position']??'');
    }
    public static function saveCursor(Database $db,string $job,string $position):void{
        if($db->driver()==='mysql')$db->run('INSERT INTO argus_growth_cursor(job,position) VALUES (?,?) ON DUPLICATE KEY UPDATE position=VALUES(position)',[$job,$position]);
        else $db->run('INSERT INTO argus_growth_cursor(job,position) VALUES (?,?) ON CONFLICT(job) DO UPDATE SET position=excluded.position',[$job,$position]);
    }
    private static function revision(array $r):string{return hash('sha256',$r['state']."\n".$r['payload']);}
    public static function localDay(int $time):string{return (new \DateTimeImmutable('@'.$time))->setTimezone(new \DateTimeZone('America/Sao_Paulo'))->format('Y-m-d');}
    private static function timestamp(string $s):int{return strtotime(str_replace('T',' ',substr($s,0,19)).' UTC')?:0;}
    private static function str(array $b,string $k,int $max,bool $required=true):string{
        $v=$b[$k]??'';
        if(!is_string($v))self::fail('Campo inválido: '.$k);
        $v=trim($v);
        if(($required&&$v==='')||!mb_check_encoding($v,'UTF-8')||mb_strlen($v)>$max||preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/',$v))self::fail('Campo inválido: '.$k);
        if(in_array($k,['title','note','message'],true)&&preg_match('/(?:bearer\s+\S+|(?:senha|password|secret|token|api[_ ]?key|chave secreta|cvv|cvc|pin)\s*[:=]\s*\S+|(?:\d[\s.\-\/()+]*){11,19}|(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4})/iu',$v))self::fail('Não envie senhas, cartões, documentos, telefones ou credenciais.');
        // Store references, labels and notes, not credentials or full sensitive identifiers.
        if(preg_match('/(?:ag[ps]_live_[a-f0-9]{12,}|gsk_[A-Za-z0-9_-]{10,}|(?:pk|sk)_[A-Za-z0-9_-]{12,}|\b\d{11,}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i',$v))
            self::fail('Não inclua documentos completos, senhas ou chaves.');
        return $v;
    }
    private static function num(array $b,string $k,int $min,int $max):int{
        $v=$b[$k]??null;if(!is_int($v)||$v<$min||$v>$max)self::fail('Valor inválido: '.$k);return $v;
    }
    private static function choice(array $b,string $k,array $choices):string{
        $v=$b[$k]??null;if(!is_string($v)||!in_array($v,$choices,true))self::fail('Opção inválida: '.$k);return $v;
    }
    private static function date(array $b,string $key):string{
        $s=self::str($b,$key,10);
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$s)||!checkdate((int)substr($s,5,2),(int)substr($s,8,2),(int)substr($s,0,4)))self::fail('Data inválida.');
        return $s;
    }
    private static function allowed(string $scope,string $kind):bool{
        return in_array($kind,self::SHARED,true)||($scope==='admin'&&in_array($kind,self::ADMIN,true));
    }
    private static function validated(string $kind,array $b):array{
        $p=['title'=>self::str($b,'title',100),'note'=>self::str($b,'note',500,false)];
        $p=$p+match($kind){
            'subscription'=>['amount_cents'=>self::num($b,'amount_cents',100,100000000),'due'=>self::date($b,'due'),'cycle'=>self::choice($b,'cycle',['weekly','monthly','yearly'])],
            'invoice'=>['amount_cents'=>self::num($b,'amount_cents',100,100000000),'due'=>self::date($b,'due')],
            'product'=>['amount_cents'=>self::num($b,'amount_cents',100,100000000)],
            'coupon'=>['code'=>strtoupper(self::str($b,'code',32)),'discount_percent'=>self::num($b,'discount_percent',1,90),'due'=>self::date($b,'due')],
            'flow'=>['trigger'=>self::choice($b,'trigger',['pending','failed','due']),'threshold'=>self::num($b,'threshold',1,10000)],
            'support'=>['category'=>self::choice($b,'category',['payments','account','technical','other'])],
            'dispute'=>['reference'=>self::str($b,'reference',80),'category'=>self::choice($b,'category',['refund','partial_refund','med','other'])],
            'integration'=>['category'=>self::choice($b,'category',['woocommerce','shopify','telegram','api','other'])],
            'team'=>['role_requested'=>self::choice($b,'role_requested',['finance','support','developer','viewer'])],
            'limit_request'=>['amount_cents'=>self::num($b,'amount_cents',100,100000000)],
            'fee_request'=>['basis_points'=>self::num($b,'basis_points',0,10000)],
            'contract'=>['due'=>self::date($b,'due')],
            'incident'=>['severity'=>self::choice($b,'severity',['low','medium','high','critical'])],
            'approval'=>['reference'=>self::str($b,'reference',80)],
            'routing'=>['category'=>self::choice($b,'category',['pix','card','boleto','payout'])],
            'marketplace'=>['basis_points'=>self::num($b,'basis_points',0,10000)],
            default=>self::fail('Módulo inválido.')
        };
        if($kind==='subscription')$p['anchor_day']=(int)substr($p['due'],8,2);
        return $p;
    }
    private static function event(Database $db,string $id,string $scope,string $owner,string $actor,string $action):void{
        $db->run('INSERT INTO argus_growth_events(id,record_id,audience,owner_id,actor_id,action,created_at) VALUES (?,?,?,?,?,?,?)',
            ['age_'.bin2hex(random_bytes(16)),$id,$scope,$owner,$actor,$action,Database::stamp()]);
    }
    public static function create(Database $db,string $scope,string $owner,string $kind,array $b):array{
        if(!self::allowed($scope,$kind))self::fail('Módulo indisponível.',403);
        $p=self::validated($kind,$b);
        $nonce=$b['nonce']??null;
        if(!is_string($nonce)||!preg_match('/^[a-f0-9-]{32,36}$/Di',$nonce))self::fail('Identificador inválido.');
        $id='agr_'.substr(hash('sha256',$scope.':'.$owner.':'.$kind.':'.$nonce),0,32);
        $old=$db->one('SELECT id,payload FROM argus_growth_records WHERE id=? AND audience=? AND owner_id=?',[$id,$scope,$owner]);
        $payload=json_encode($p,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
        $hash=hash('sha256',$payload);
        if($old){$idem=$db->one('SELECT request_hash FROM argus_growth_idem WHERE record_id=?',[$id]);
            if(!hash_equals((string)($idem['request_hash']??hash('sha256',$old['payload'])),$hash))self::fail('Identificador já utilizado.',409);
            return ['id'=>$id,'created'=>false];}
        $n=$db->one('SELECT COUNT(*) AS n FROM argus_growth_records WHERE audience=? AND owner_id=? AND kind=?',[$scope,$owner,$kind]);
        if((int)$n['n']>=2000)self::fail('Limite de registros deste módulo atingido.',409);
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'record-limit:'.$scope.':'.$owner.':'.$kind);
            $again=$db->one('SELECT r.id,i.request_hash FROM argus_growth_records r LEFT JOIN argus_growth_idem i ON i.record_id=r.id WHERE r.id=? AND r.audience=? AND r.owner_id=?',[$id,$scope,$owner]);
            if($again){
                if(!$again['request_hash']||!hash_equals((string)$again['request_hash'],$hash))self::fail('Identificador já utilizado.',409);
                $pdo->commit();return ['id'=>$id,'created'=>false];
            }
            $count=$db->one('SELECT COUNT(*) AS n FROM argus_growth_records WHERE audience=? AND owner_id=? AND kind=?',[$scope,$owner,$kind]);
            if((int)$count['n']>=2000)self::fail('Limite de registros deste módulo atingido.',409);
            $now=Database::stamp();
            $db->run('INSERT INTO argus_growth_records(id,audience,owner_id,kind,payload,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',[$id,$scope,$owner,$kind,$payload,'open',$now,$now]);
            $db->run('INSERT INTO argus_growth_idem(record_id,request_hash) VALUES (?,?)',[$id,$hash]);
            self::event($db,$id,$scope,$owner,$owner,'created');$pdo->commit();
        }catch(\PDOException $e){
            if($pdo->inTransaction())$pdo->rollBack();
            if(in_array((string)$e->getCode(),['23000','23505'],true)){
                $old=$db->one('SELECT r.id,i.request_hash FROM argus_growth_records r JOIN argus_growth_idem i ON i.record_id=r.id WHERE r.id=? AND r.audience=? AND r.owner_id=?',[$id,$scope,$owner]);
                if($old&&hash_equals((string)$old['request_hash'],$hash))return ['id'=>$id,'created'=>false];
                self::fail('Identificador já utilizado.',409);
            }throw $e;
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['id'=>$id,'created'=>true];
    }
    public static function batch(Database $db,string $scope,string $owner,array $body):array{
        $nonce=$body['nonce']??null;$items=$body['items']??null;
        if(!is_string($nonce)||!preg_match('/^[a-f0-9-]{32,36}$/Di',$nonce)||!is_array($items)||!array_is_list($items)||count($items)<1||count($items)>50)self::fail('Lote inválido.');
        $validated=[];foreach($items as $item){if(!is_array($item))self::fail('Linha inválida.');$validated[]=self::validated('invoice',$item);}
        $batchId='agb_'.substr(hash('sha256',$scope.':'.$owner.':'.$nonce),0,32);
        $hash=hash('sha256',json_encode($validated,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'record-limit:'.$scope.':'.$owner.':invoice');
            $old=$db->one('SELECT request_hash FROM argus_growth_idem WHERE record_id=?',[$batchId]);
            if($old){if(!hash_equals((string)$old['request_hash'],$hash))self::fail('Lote já utilizado com outros dados.',409);$pdo->commit();return ['count'=>count($validated),'created'=>false];}
            $n=$db->one("SELECT COUNT(*) AS n FROM argus_growth_records WHERE audience=? AND owner_id=? AND kind='invoice'",[$scope,$owner]);
            if((int)$n['n']+count($validated)>2000)self::fail('Limite de cobranças atingido.',409);
            $now=Database::stamp();
            foreach($validated as $i=>$item){
                $id='agr_'.substr(hash('sha256',$batchId.':'.$i),0,32);
                $payload=json_encode($item,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
                $db->run('INSERT INTO argus_growth_records(id,audience,owner_id,kind,payload,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',[$id,$scope,$owner,'invoice',$payload,'open',$now,$now]);
                $db->run('INSERT INTO argus_growth_idem(record_id,request_hash) VALUES (?,?)',[$id,hash('sha256',$payload)]);
                self::event($db,$id,$scope,$owner,$owner,'batch_created');
            }
            $db->run('INSERT INTO argus_growth_idem(record_id,request_hash) VALUES (?,?)',[$batchId,$hash]);
            $pdo->commit();return ['count'=>count($validated),'created'=>true];
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function listing(Database $db,string $scope,string $owner,string $kind,?string $cursor=null):array{
        if(!self::allowed($scope,$kind))self::fail('Módulo indisponível.',403);
        $args=[$scope,$owner,$kind];$where='';
        if($cursor!==null&&$cursor!==''){
            if(!preg_match('/^agr_[a-f0-9]{32}$/D',$cursor))self::fail('Cursor inválido.');
            $r=$db->one('SELECT id,created_at FROM argus_growth_records WHERE id=? AND audience=? AND owner_id=? AND kind=?',[$cursor,$scope,$owner,$kind]);
            if(!$r)self::fail('Página não encontrada.',404);
            $where=' AND (created_at<? OR (created_at=? AND id<?))';array_push($args,$r['created_at'],$r['created_at'],$r['id']);
        }
        $rows=$db->all('SELECT id,kind,payload,state,created_at,updated_at FROM argus_growth_records WHERE audience=? AND owner_id=? AND kind=?'.$where.' ORDER BY created_at DESC,id DESC LIMIT 101',$args);
        $more=count($rows)>100;$rows=array_slice($rows,0,100);
        $matches=$kind==='invoice'?self::invoiceStates($db,$scope,$owner,array_column($rows,'id')):[];
        foreach($rows as &$r){
            $r['revision']=self::revision($r);$r['data']=json_decode($r['payload'],true,16,JSON_THROW_ON_ERROR);unset($r['payload']);
            if($kind==='invoice'){
                $match=$matches[$r['id']]??null;$r['matched_operation']=$match['operation_id']??null;
                $r['match_confirmed']=$match!==null&&$match['confirmed']&&$match['amount']===$r['data']['amount_cents'];
            }
        }unset($r);
        return ['items'=>$rows,'next_cursor'=>$more?$rows[count($rows)-1]['id']:null];
    }
    private static function invoiceStates(Database $db,string $scope,string $owner,?array $ids=null):array{
        if($ids===[])return [];
        $seller=$scope==='portal';$table=$seller?'argus_seller_charges':'admin_quick_pix';$field=$seller?'account_id':'actor_id';$amount=$seller?'net_cents':'amount_cents';
        $proof=$seller?" AND EXISTS(SELECT 1 FROM argus_seller_ledger l WHERE l.account_id=q.account_id AND l.operation_id=q.id AND l.operation_kind='deposit_paid')":"";
        $args=[$scope,$owner];$filter='';
        if($ids!==null){$filter=' AND m.record_id IN ('.implode(',',array_fill(0,count($ids),'?')).')';array_push($args,...$ids);}
        $rows=$db->all("SELECT m.record_id,m.operation_id,q.$amount AS amount,CASE WHEN q.status='paid' AND q.provider_id IS NOT NULL AND q.provider_id<>''".$proof." THEN 1 ELSE 0 END AS confirmed FROM argus_growth_invoice_matches m LEFT JOIN $table q ON q.id=m.operation_id AND q.$field=m.owner_id WHERE m.audience=? AND m.owner_id=?".$filter,$args);
        $out=[];foreach($rows as $r)$out[$r['record_id']]=['operation_id'=>$r['operation_id'],'amount'=>$r['amount']===null?null:(int)$r['amount'],'confirmed'=>(int)$r['confirmed']===1];return $out;
    }
    public static function edit(Database $db,string $scope,string $owner,string $id,array $body):array{
        $r=$db->one('SELECT * FROM argus_growth_records WHERE id=? AND audience=? AND owner_id=?',[$id,$scope,$owner]);
        if(!$r||!self::allowed($scope,$r['kind']))self::fail('Registro não encontrado.',404);
        if($r['state']!=='open'||!hash_equals(self::revision($r),self::str($body,'revision',64)))self::fail('Registro alterado ou arquivado. Atualize a página.',409);
        $p=self::validated($r['kind'],$body);$old=json_decode($r['payload'],true,16,JSON_THROW_ON_ERROR);
        if($r['kind']==='subscription'&&$p['due']===$old['due'])$p['anchor_day']=$old['anchor_day']??(int)substr($old['due'],8,2);
        $encoded=json_encode($p,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
        if($encoded===$r['payload'])return ['ok'=>true,'financial_effect'=>false];
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            if($r['kind']==='invoice'){
                $db->run('UPDATE argus_growth_records SET updated_at=updated_at WHERE id=? AND audience=? AND owner_id=?',[$id,$scope,$owner]);
                if($db->one('SELECT record_id FROM argus_growth_invoice_matches WHERE record_id=?',[$id]))self::fail('Cobrança vinculada: preserve o registro original.',409);
            }
            $changed=$db->run('UPDATE argus_growth_records SET payload=?,updated_at=? WHERE id=? AND audience=? AND owner_id=? AND state=? AND payload=?',[$encoded,Database::stamp(),$id,$scope,$owner,$r['state'],$r['payload']]);
            if($changed->rowCount()!==1)self::fail('Registro alterado. Atualize a página.',409);
            self::event($db,$id,$scope,$owner,$owner,'edited');$pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['ok'=>true,'financial_effect'=>false];
    }
    public static function transition(Database $db,string $scope,string $owner,string $id,string $action,?string $revision=null):array{
        $r=$db->one('SELECT * FROM argus_growth_records WHERE id=? AND audience=? AND owner_id=?',[$id,$scope,$owner]);
        if(!$r)self::fail('Registro não encontrado.',404);
        if($revision!==null&&!hash_equals(self::revision($r),$revision))self::fail('Registro alterado. Atualize a página.',409);
        if(!in_array($action,['archive','reopen','advance'],true))self::fail('Ação inválida.');
        $p=json_decode($r['payload'],true,16,JSON_THROW_ON_ERROR);
        $state=$action==='archive'?'archived':'open';
        if($action==='advance'){
            if($r['kind']!=='subscription'||$r['state']!=='open')self::fail('Ciclo indisponível.',409);
            $dt=new \DateTimeImmutable($p['due'],new \DateTimeZone('UTC'));
            $next=match($p['cycle']){'weekly'=>$dt->modify('+7 days'),'monthly'=>$dt->modify('first day of next month'),'yearly'=>$dt->modify('first day of this month')->modify('+1 year')};
            $p['anchor_day']=$p['anchor_day']??(int)$dt->format('d');
            if($p['cycle']!=='weekly')$next=$next->setDate((int)$next->format('Y'),(int)$next->format('m'),min((int)$p['anchor_day'],(int)$next->format('t')));
            $p['due']=$next->format('Y-m-d');
        }
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            $changed=$db->run('UPDATE argus_growth_records SET payload=?,state=?,updated_at=? WHERE id=? AND audience=? AND owner_id=? AND state=? AND payload=?',
                [json_encode($p,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$state,Database::stamp(),$id,$scope,$owner,$r['state'],$r['payload']]);
            if($changed->rowCount()!==1)self::fail('Registro alterado. Atualize a página.',409);
            self::event($db,$id,$scope,$owner,$owner,$action);$pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['ok'=>true,'financial_effect'=>false];
    }
    public static function invoiceMatch(Database $db,string $scope,string $owner,string $record,string $operation):array{
        if(!preg_match('/^agr_[a-f0-9]{32}$/D',$record)||!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$operation))self::fail('Identificador inválido.');
        $row=$db->one("SELECT payload FROM argus_growth_records WHERE id=? AND audience=? AND owner_id=? AND kind='invoice' AND state='open'",[$record,$scope,$owner]);
        if(!$row)self::fail('Rascunho não encontrado.',404);
        $p=json_decode($row['payload'],true,16,JSON_THROW_ON_ERROR);
        $receipt=$scope==='admin'?TransactionReceipt::admin($db,$owner,$operation,'deposit'):TransactionReceipt::seller($db,$owner,$operation);
        $amount=$scope==='admin'?$receipt['amount_cents']:$receipt['net_cents'];
        if(!$receipt['confirmed']||$receipt['kind']!=='deposit'||$amount!==$p['amount_cents'])self::fail('Pagamento não confirmado ou valor incompatível com a cobrança.',409);
        $old=$db->one('SELECT operation_id FROM argus_growth_invoice_matches WHERE record_id=? AND audience=? AND owner_id=?',[$record,$scope,$owner]);
        if($old){if($old['operation_id']!==$operation)self::fail('Já existe um Pix vinculado.',409);return ['ok'=>true];}
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            $db->run('UPDATE argus_growth_records SET updated_at=updated_at WHERE id=? AND audience=? AND owner_id=?',[$record,$scope,$owner]);
            $fresh=$db->one("SELECT payload,state FROM argus_growth_records WHERE id=? AND audience=? AND owner_id=?",[$record,$scope,$owner]);
            if(!$fresh||$fresh['state']!=='open'||!hash_equals((string)$row['payload'],(string)$fresh['payload']))self::fail('Rascunho alterado. Atualize e tente novamente.',409);
            $same=$db->one('SELECT operation_id FROM argus_growth_invoice_matches WHERE record_id=? AND audience=? AND owner_id=?',[$record,$scope,$owner]);
            if($same){if($same['operation_id']!==$operation)self::fail('Já existe um Pix vinculado.',409);$pdo->commit();return ['ok'=>true,'financial_effect'=>false];}
            $db->run('INSERT INTO argus_growth_invoice_matches(record_id,audience,owner_id,operation_id,created_at) VALUES (?,?,?,?,?)',[$record,$scope,$owner,$operation,Database::stamp()]);
            self::event($db,$record,$scope,$owner,$owner,'matched_existing_pix');$pdo->commit();
        }catch(\PDOException $e){if($pdo->inTransaction())$pdo->rollBack();if(in_array((string)$e->getCode(),['23000','23505'],true))self::fail('Pix já associado a outro registro.',409);throw $e;}
        catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['ok'=>true,'financial_effect'=>false];
    }
    public static function inbox(Database $db,?string $cursor=null):array{
        $args=[];$filter='';
        if($cursor!==null&&$cursor!==''){
            if(!preg_match('/^agr_[a-f0-9]{32}$/D',$cursor))self::fail('Cursor inválido.');
            $row=$db->one("SELECT created_at,id FROM argus_growth_records WHERE id=? AND audience='portal' AND kind IN ('support','dispute')",[$cursor]);
            if(!$row)self::fail('Página não encontrada.',404);
            $filter=' AND (created_at<? OR (created_at=? AND id<?))';$args=[$row['created_at'],$row['created_at'],$row['id']];
        }
        $rows=$db->all("SELECT id,owner_id,kind,payload,state,created_at,updated_at FROM argus_growth_records WHERE audience='portal' AND kind IN ('support','dispute')".$filter." ORDER BY created_at DESC,id DESC LIMIT 101",$args);
        $more=count($rows)>100;$rows=array_slice($rows,0,100);
        foreach($rows as &$r){$r['data']=json_decode($r['payload'],true,16,JSON_THROW_ON_ERROR);unset($r['payload'],$r['owner_id']);}unset($r);
        return ['items'=>$rows,'next_cursor'=>$more?$rows[count($rows)-1]['id']:null];
    }
    public static function thread(Database $db,string $scope,string $owner,string $id,?string $message=null,?string $nonce=null,?string $cursor=null):array{
        $args=[$id];$filter='';
        if($scope==='portal'){$filter=' AND owner_id=?';$args[]=$owner;}
        $row=$db->one("SELECT id,owner_id,state FROM argus_growth_records WHERE id=? AND audience='portal' AND kind IN ('support','dispute')".$filter,$args);
        if(!$row)self::fail('Chamado não encontrado.',404);
        $seller=(string)$row['owner_id'];
        if($message!==null){
            if($row['state']!=='open')self::fail('Chamado arquivado.',409);
            $message=self::str(['message'=>$message],'message',1000);
            if($nonce!==null&&!preg_match('/^[a-f0-9-]{32,36}$/Di',$nonce))self::fail('Identificador de mensagem inválido.');
            $messageId='agm_'.($nonce===null?bin2hex(random_bytes(16)):substr(hash('sha256',$scope.':'.$owner.':'.$id.':'.$nonce),0,32));
            $pdo=$db->pdo();$pdo->beginTransaction();
            try{
                $db->run('UPDATE argus_growth_records SET updated_at=updated_at WHERE id=? AND owner_id=?',[$id,$seller]);
                $fresh=$db->one("SELECT state FROM argus_growth_records WHERE id=? AND owner_id=? AND audience='portal'",[$id,$seller]);
                if(!$fresh||$fresh['state']!=='open')self::fail('Chamado arquivado.',409);
                $existing=$db->one('SELECT body FROM argus_growth_messages WHERE id=? AND record_id=? AND owner_id=?',[$messageId,$id,$seller]);
                if($existing){
                    if(!hash_equals((string)$existing['body'],$message))self::fail('Identificador de mensagem já utilizado.',409);
                    $pdo->commit();return self::thread($db,$scope,$owner,$id);
                }
                $count=$db->one('SELECT COUNT(*) AS n FROM argus_growth_messages WHERE record_id=? AND owner_id=?',[$id,$seller]);
                if((int)$count['n']>=10000)self::fail('Limite de segurança atingido. Abra um chamado de continuação referenciando este protocolo.',409);
                $db->run('INSERT INTO argus_growth_messages(id,record_id,owner_id,sender,body,created_at) VALUES (?,?,?,?,?,?)',
                    [$messageId,$id,$seller,$scope,$message,Database::stamp()]);
                $db->run("UPDATE argus_growth_records SET updated_at=? WHERE id=? AND audience='portal' AND owner_id=?",[Database::stamp(),$id,$seller]);
                self::event($db,$id,'portal',$seller,$owner,'message_'.$scope);$pdo->commit();
            }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        }
        $args=[$id,$seller];$filter='';
        if($cursor!==null&&$cursor!==''){
            if(!preg_match('/^agm_[a-f0-9]{32}$/D',$cursor))self::fail('Cursor inválido.');
            $anchor=$db->one('SELECT created_at,id FROM argus_growth_messages WHERE id=? AND record_id=? AND owner_id=?',[$cursor,$id,$seller]);
            if(!$anchor)self::fail('Mensagem não encontrada.',404);
            $filter=' AND (created_at<? OR (created_at=? AND id<?))';array_push($args,$anchor['created_at'],$anchor['created_at'],$anchor['id']);
        }
        $rows=$db->all('SELECT id,sender,body,created_at FROM argus_growth_messages WHERE record_id=? AND owner_id=?'.$filter.' ORDER BY created_at DESC,id DESC LIMIT 101',$args);
        $more=count($rows)>100;$rows=array_slice($rows,0,100);
        return ['messages'=>array_reverse($rows),'next_cursor'=>$more?$rows[count($rows)-1]['id']:null];
    }
    /** Optional existing notification worker; informational and consent-aware. */
    private static function failureId(string $kind,string $job,string $subject):string{return hash('sha256',$kind.'|'.$job.'|'.$subject);}
    private static function history(Database $db,string $id,string $action,?string $actor,string $reason,int $attempts,int $now):void{
        $db->run('INSERT INTO argus_growth_failure_history(id,failure_id,action,actor_id,reason,attempts,created_at) VALUES (?,?,?,?,?,?,?)',[bin2hex(random_bytes(32)),$id,$action,$actor,$reason,$attempts,$now]);
    }
    public static function failJob(Database $db,string $kind,string $job,string $subject,int $attempts,string $reason,int $now):void{
        $id=self::failureId($kind,$job,$subject);
        $args=[$id,$kind,$job,$subject,$attempts,$reason,$now,'pending'];
        self::history($db,$id,'failed',null,$reason,$attempts,$now);
        if($db->driver()==='mysql')$db->run('INSERT INTO argus_growth_failed_jobs(id,kind,job,subject,attempts,reason,failed_at,state) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attempts=VALUES(attempts),reason=VALUES(reason),failed_at=VALUES(failed_at),state=VALUES(state),reviewed_by=NULL,reviewed_at=NULL',$args);
        else $db->run('INSERT INTO argus_growth_failed_jobs(id,kind,job,subject,attempts,reason,failed_at,state) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,reason=excluded.reason,failed_at=excluded.failed_at,state=excluded.state,reviewed_by=NULL,reviewed_at=NULL',$args);
    }
    private static function resolveJob(Database $db,string $kind,string $job,string $subject,int $now,string $reason):void{
        $id=self::failureId($kind,$job,$subject);
        $states=$kind==='scan'?"('requeued','archived')":"('requeued')";
        $final=$kind==='notice'&&$reason!=='push_accepted'?'closed':'resolved';
        $row=$db->one('SELECT attempts FROM argus_growth_failed_jobs WHERE id=? AND state IN '.$states,[$id]);
        if(!$row)return;
        $updated=$db->run('UPDATE argus_growth_failed_jobs SET state=? WHERE id=? AND state IN '.$states,[$final,$id]);
        if($updated->rowCount()===1)self::history($db,$id,$final,null,$reason,(int)$row['attempts'],$now);
    }
    public static function failedJobs(Database $db,?string $cursor=null,string $state='pending'):array{
        if(!in_array($state,['pending','archived','requeued','resolved','closed'],true))self::fail('Estado inválido.');
        $where=' WHERE f.state=?';$args=[$state];
        if($cursor!==null&&$cursor!==''){if(!preg_match('/^[a-f0-9]{64}$/D',$cursor))self::fail('Cursor inválido.');$where.=" AND f.id>?";$args[]=$cursor;}
        // One bounded query: join metadata only; never return content, credentials or device endpoints.
        $rows=$db->all("SELECT f.id,f.kind,f.job,f.subject,f.attempts,f.reason,f.failed_at,f.state,f.reviewed_by,f.reviewed_at,e.category AS notice_category,e.created_at AS notice_created FROM argus_growth_failed_jobs f LEFT JOIN argus_notice_events e ON f.kind='notice' AND e.id=f.subject".$where.' ORDER BY f.id LIMIT 51',$args);
        $more=count($rows)>50;if($more)array_pop($rows);
        $now=time();
        foreach($rows as &$row){
            $row['retry_allowed']=$state==='pending'&&($row['kind']==='scan'||($row['kind']==='notice'&&$row['notice_category']==='announcement'&&$row['notice_created']!==null&&self::timestamp($row['notice_created'])>=$now-86400));
            unset($row['notice_category'],$row['notice_created']);
        }unset($row);
        return ['items'=>$rows,'next_cursor'=>$more?$rows[count($rows)-1]['id']:null];
    }
    public static function archiveJob(Database $db,string $id,string $actor,?int $clock=null):array{
        if(!preg_match('/^[a-f0-9]{64}$/D',$id))self::fail('Identificador inválido.');
        $now=$clock??time();$pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'failed-job:'.$id);
            $row=$db->one("SELECT * FROM argus_growth_failed_jobs WHERE id=? AND state='pending'",[$id]);
            if(!$row)self::fail('Falha já tratada ou inexistente.',409);
            // Archive the incident, not the account. Resume normal informational scans after cooldown.
            if($row['kind']==='scan')$db->run('UPDATE argus_growth_scan_retry SET attempts=0,next_at=? WHERE job=? AND subject=? AND attempts>=8',[$now+1800,$row['job'],$row['subject']]);
            self::history($db,$id,'archived',$actor,$row['reason'],(int)$row['attempts'],$now);
            $db->run("UPDATE argus_growth_failed_jobs SET state='archived',reviewed_by=?,reviewed_at=? WHERE id=?",[$actor,$now,$id]);
            $pdo->commit();return ['ok'=>true,'financial_effect'=>false];
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function failureHistory(Database $db,string $id,?string $cursor=null):array{
        if(!preg_match('/^[a-f0-9]{64}$/D',$id))self::fail('Identificador inválido.');
        $args=[$id];$filter='';
        if($cursor!==null){
            if(!preg_match('/^([0-9]{1,12}):([a-f0-9]{64})$/D',$cursor,$m))self::fail('Cursor inválido.');
            $filter=' AND (created_at>? OR (created_at=? AND id>?))';array_push($args,(int)$m[1],(int)$m[1],$m[2]);
        }
        $rows=$db->all('SELECT id,action,actor_id,reason,attempts,created_at FROM argus_growth_failure_history WHERE failure_id=?'.$filter.' ORDER BY created_at,id LIMIT 51',$args);
        $more=count($rows)>50;if($more)array_pop($rows);
        $last=$rows?end($rows):null;
        return ['items'=>$rows,'next_cursor'=>$more?$last['created_at'].':'.$last['id']:null];
    }
    public static function recoverJob(Database $db,string $id,string $actor,?int $clock=null):array{
        if(!preg_match('/^[a-f0-9]{64}$/D',$id))self::fail('Identificador inválido.');
        $now=$clock??time();$pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'failed-job:'.$id);
            $row=$db->one("SELECT * FROM argus_growth_failed_jobs WHERE id=? AND state='pending'",[$id]);
            if(!$row)self::fail('Falha já tratada ou inexistente.',409);
            if($row['kind']==='notice'){
                $event=$db->one("SELECT id,category,created_at FROM argus_notice_events WHERE id=?",[$row['subject']]);
                if(!$event||$event['category']!=='announcement'||self::timestamp($event['created_at'])<$now-86400)self::fail('Alerta antigo ou inválido. Não será reenviado.',409);
                $changed=$db->run('UPDATE argus_growth_notice_retry SET attempts=0,next_at=?,expires_at=? WHERE event_id=? AND attempts>=5',[$now,$now+3600,$row['subject']]);
                if($changed->rowCount()!==1)self::fail('Fila indisponível ou já em processamento.',409);
                $db->run('DELETE FROM argus_growth_delivery_state WHERE event_id=?',[$row['subject']]);
            }elseif($row['kind']==='scan'){
                if(!in_array($row['job'],['flow','ai_admin','ai_portal'],true))self::fail('Tipo de automação inválido.');
                $changed=$db->run('UPDATE argus_growth_scan_retry SET attempts=0,next_at=? WHERE job=? AND subject=? AND attempts>=8',[$now,$row['job'],$row['subject']]);
                if($changed->rowCount()!==1)self::fail('Conta já em processamento.',409);
            }else self::fail('Tipo de falha inválido.');
            self::history($db,$id,'requeued',$actor,$row['reason'],(int)$row['attempts'],$now);
            $db->run("UPDATE argus_growth_failed_jobs SET state='requeued',reviewed_by=?,reviewed_at=? WHERE id=?",[$actor,$now,$id]);
            $pdo->commit();return ['ok'=>true,'financial_effect'=>false];
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function deferScan(Database $db,string $job,string $subject,?int $clock=null):void{
        $now=$clock??time();$pdo=$db->pdo();$pdo->beginTransaction();
        try{
            $id=self::failureId('scan',$job,$subject);
            self::mutex($db,'failed-job:'.$id);
            $row=$db->one('SELECT attempts FROM argus_growth_scan_retry WHERE job=? AND subject=?',[$job,$subject]);
            if((int)($row['attempts']??0)>=8){
                if(!$db->one('SELECT id FROM argus_growth_failed_jobs WHERE id=?',[$id]))self::failJob($db,'scan',$job,$subject,8,'scan_exhausted',$now);
                $pdo->commit();return;
            }
            $attempt=min(8,1+(int)($row['attempts']??0));$next=$now+min(1800,30*(2**min(6,$attempt-1)));
            if($db->driver()==='mysql')$db->run('INSERT INTO argus_growth_scan_retry(job,subject,attempts,next_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE attempts=VALUES(attempts),next_at=VALUES(next_at)',[$job,$subject,$attempt,$next]);
            else $db->run('INSERT INTO argus_growth_scan_retry(job,subject,attempts,next_at) VALUES (?,?,?,?) ON CONFLICT(job,subject) DO UPDATE SET attempts=excluded.attempts,next_at=excluded.next_at',[$job,$subject,$attempt,$next]);
            if($attempt>=8)self::failJob($db,'scan',$job,$subject,$attempt,'scan_exhausted',$now);
            $pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function repairTerminalScans(Database $db,int $now):void{
        // Bounded keyset sweep includes legacy interrupted records, not just new failures.
        $job=self::cursor($db,'terminal_scan_repair_job');$subject=self::cursor($db,'terminal_scan_repair_subject');
        $rows=$db->all('SELECT job,subject FROM argus_growth_scan_retry WHERE attempts>=8 AND (job>? OR (job=? AND subject>?)) ORDER BY job,subject LIMIT 100',[$job,$job,$subject]);
        if(!$rows){self::saveCursor($db,'terminal_scan_repair_job','');self::saveCursor($db,'terminal_scan_repair_subject','');return;}
        foreach($rows as $row){
            $id=self::failureId('scan',$row['job'],$row['subject']);
            $incident=$db->one('SELECT state FROM argus_growth_failed_jobs WHERE id=?',[$id]);
            if(!$incident)self::deferScan($db,$row['job'],$row['subject'],$now);
            elseif($incident['state']==='archived'){
                // Repair legacy archived scans, rechecking under the same lock as administrative recovery.
                $pdo=$db->pdo();$pdo->beginTransaction();
                try{
                    self::mutex($db,'failed-job:'.$id);
                    if($db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='archived'",[$id])){
                        $changed=$db->run('UPDATE argus_growth_scan_retry SET attempts=0,next_at=? WHERE job=? AND subject=? AND attempts>=8',[$now+1800,$row['job'],$row['subject']]);
                        if($changed->rowCount()===1)self::history($db,$id,'resumed',null,'archive_cooldown',8,$now);
                    }
                    $pdo->commit();
                }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
            }
        }
        $last=end($rows);self::saveCursor($db,'terminal_scan_repair_job',$last['job']);self::saveCursor($db,'terminal_scan_repair_subject',$last['subject']);
    }
    public static function scanAccount(Database $db,string $job,string $subject,callable $process,?int $clock=null):bool{
        $pdo=$db->pdo();
        try{
            $process($subject);
            $pdo->beginTransaction();
            self::mutex($db,'failed-job:'.self::failureId('scan',$job,$subject));
            $db->run('DELETE FROM argus_growth_scan_retry WHERE job=? AND subject=?',[$job,$subject]);
            self::resolveJob($db,'scan',$job,$subject,$clock??time(),'scan_completed');
            $pdo->commit();return true;
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();self::deferScan($db,$job,$subject,$clock);error_log('ARGUS_GROWTH_SCAN deferred job='.$job.' class='.get_class($e));return false;}
    }
    public static function retryScans(Database $db,string $job,callable $process,?int $clock=null):void{
        $now=$clock??time();$start=microtime(true);
        $rows=$db->all('SELECT subject FROM argus_growth_scan_retry WHERE job=? AND attempts<8 AND next_at<=? ORDER BY next_at,subject LIMIT 10',[$job,$now]);
        foreach($rows as $row){if(microtime(true)-$start>3)break;self::scanAccount($db,$job,$row['subject'],$process,$now);}
    }
    public static function heartbeat(Database $db,string $phase,?int $clock=null):void{
        if(!in_array($phase,['start','complete','error'],true))throw new \InvalidArgumentException('Invalid heartbeat');
        self::saveCursor($db,'worker_'.$phase,(string)($clock??time()));
    }
    public static function workerHealth(Database $db,?int $clock=null):array{
        self::ready($db);$now=$clock??time();$start=(int)self::cursor($db,'worker_start');$complete=(int)self::cursor($db,'worker_complete');$error=(int)self::cursor($db,'worker_error');
        $enabled=in_array($db->driver(),['pgsql','mysql'],true);
        $state=!$enabled?'not_supported':($error>$complete?'error':($complete&&$now-$complete<=180?'healthy':($start&&$now-$start<=90?'running':'stale')));
        return ['status'=>$state,'last_started_at'=>$start?gmdate('c',$start):null,'last_completed_at'=>$complete?gmdate('c',$complete):null,'last_error_at'=>$error?gmdate('c',$error):null,
            'pending_advisories'=>(int)$db->one('SELECT COUNT(*) AS n FROM argus_growth_notice_retry WHERE attempts<5 AND expires_at>?',[$now])['n'],
            'deferred_accounts'=>(int)$db->one('SELECT COUNT(*) AS n FROM argus_growth_scan_retry WHERE attempts<8')['n'],
            'failed_jobs'=>(int)$db->one("SELECT COUNT(*) AS n FROM argus_growth_failed_jobs WHERE state='pending'")['n'],
            'notice_last_completed_at'=>($n=(int)self::cursor($db,'notice_complete'))?gmdate('c',$n):null,
            'notice_last_accepted_at'=>($n=(int)self::cursor($db,'notice_accepted'))?gmdate('c',$n):null,
            'notice_outcome'=>self::cursor($db,'notice_outcome'),
            'notice_worker_status'=>!$enabled?'not_supported':((int)self::cursor($db,'notice_error')>(int)self::cursor($db,'notice_complete')?'error':((int)self::cursor($db,'notice_complete')>=$now-150?'healthy':'stale'))];
    }
    public static function worker(Database $db):void{
        if(getenv('ARGUS_GROWTH_ALERTS_ENABLED')!=='yes'||!in_array($db->driver(),['pgsql','mysql'],true))return;
        self::ready($db);
        $process=static function(string $subject)use($db):void{
            [$scope,$owner]=explode('|',$subject,2);
            if($scope==='portal'&&!$db->one("SELECT id FROM argus_portal_accounts WHERE id=? AND status='approved'",[$owner]))return;
            if($scope==='admin'&&!$db->one("SELECT id FROM admin_users WHERE id=? AND status='active' AND role='superadmin'",[$owner]))return;
            $m=self::cachedMetrics($db,$scope,$owner,true);
            foreach($m['flow_alerts'] as $f){
                $key='growth-flow:'.$f['id'].':'.self::localDay(time());
                $event=Notifications::record($db,$scope,$owner,'announcement',$key,'Argus Flow · alerta configurado',
                    'Sua regra de '.$f['trigger'].' atingiu '.$f['observed'].' ocorrências. Consulte a central.',null,$scope==='admin'?'/admin':'/conta');
                self::queueAdvisory($db,$scope,$owner,$key,$event);
            }
        };
        self::retryScans($db,'flow',$process);
        $cursor=self::cursor($db,'flow');$parts=explode('|',$cursor,2);$a=$parts[0]??'';$b=$parts[1]??'';
        $owners=$db->all("SELECT DISTINCT audience,owner_id FROM argus_growth_records WHERE kind='flow' AND state='open' AND (audience>? OR (audience=? AND owner_id>?)) ORDER BY audience,owner_id LIMIT 250",[$a,$a,$b]);
        if(!$owners){self::saveCursor($db,'flow','');return;}
        $start=microtime(true);
        foreach($owners as $o){
            if(microtime(true)-$start>12)break;
            $subject=$o['audience'].'|'.$o['owner_id'];
            $deferred=$db->one('SELECT subject FROM argus_growth_scan_retry WHERE job=? AND subject=?',['flow',$subject]);
            if(!$deferred)self::scanAccount($db,'flow',$subject,$process);
            self::saveCursor($db,'flow',$subject);
        }
    }
    private static array $financialIndexed=[];
    public static function financialIndexes(Database $db,bool $seller):void{
        $key=spl_object_id($db->pdo()).':'.($seller?'seller':'admin');
        if(isset(self::$financialIndexed[$key]))return;
        $tables=$seller?['argus_seller_charges','argus_seller_withdrawals']:['admin_quick_pix','admin_payouts'];
        $owner=$seller?'account_id':'actor_id';
        foreach($tables as $table)self::index($db,$table,$table.'_growth_owner_status_date_idx',$owner.',status,created_at');
        self::$financialIndexed[$key]=true;
    }
    /** Exact aggregates, 30 local calendar days, creation-date basis. */
    public static function cachedMetrics(Database $db,string $scope,string $owner,bool $background=false):array{
        self::ready($db);$key=hash('sha256',$scope.':'.$owner);$now=time();
        $read=static fn()=>$db->one('SELECT payload,computed_at FROM argus_growth_metrics_cache WHERE cache_key=?',[$key]);
        $row=$read();
        $fresh=static fn($r,int $age)=>$r&&(int)$r['computed_at']>=$now-$age&&self::localDay((int)$r['computed_at'])===self::localDay($now);
        if($fresh($row,20)){$v=json_decode($row['payload'],true,32,JSON_THROW_ON_ERROR);return $v+['as_of'=>gmdate('c',(int)$row['computed_at']),'cached'=>true];}
        $pdo=$db->pdo();$locked=false;$driver=$db->driver();$slot=null;
        try{
            if($driver==='pgsql')$locked=(int)$db->one("SELECT CASE WHEN pg_try_advisory_lock(hashtext(current_schema()||?)) THEN 1 ELSE 0 END AS locked",[':growth-metrics:'.$key])['locked']===1;
            elseif($driver==='mysql')$locked=(int)$db->one('SELECT GET_LOCK(?,0) AS locked',[$key])['locked']===1;
            else $locked=true;
            if(!$locked){if($fresh($row,120)){$v=json_decode($row['payload'],true,32,JSON_THROW_ON_ERROR);return $v+['as_of'=>gmdate('c',(int)$row['computed_at']),'cached'=>true];}self::fail('Relatório em processamento. Tente novamente em instantes.',429);}
            $row=$read();if($fresh($row,20)){$v=json_decode($row['payload'],true,32,JSON_THROW_ON_ERROR);return $v+['as_of'=>gmdate('c',(int)$row['computed_at']),'cached'=>true];}
            // Reserve a separate one-slot lane for background jobs; four for user requests.
            // No tenant can consume a shared minute-long quota. Stale reports are marked.
            if(in_array($driver,['pgsql','mysql'],true)){
                foreach($background?[4]:[0,1,2,3] as $i){
                    $candidate='argus-metrics-slot-'.$i;
                    $got=$driver==='pgsql'?(int)$db->one("SELECT CASE WHEN pg_try_advisory_lock(hashtext(current_schema()||?)) THEN 1 ELSE 0 END AS locked",[$candidate])['locked']:(int)$db->one('SELECT GET_LOCK(CONCAT(DATABASE(),?),0) AS locked',[$candidate])['locked'];
                    if($got===1){$slot=$candidate;break;}
                }
                if($slot===null){
                    if($fresh($row,120)){$v=json_decode($row['payload'],true,32,JSON_THROW_ON_ERROR);return $v+['as_of'=>gmdate('c',(int)$row['computed_at']),'cached'=>true];}
                    self::fail('Relatório em processamento. Tente novamente em instantes.',429);
                }
            }
            $v=self::metrics($db,$scope,$owner,$now);$encoded=json_encode($v,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
            if($driver==='mysql')$db->run('INSERT INTO argus_growth_metrics_cache(cache_key,payload,computed_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),computed_at=VALUES(computed_at)',[$key,$encoded,$now]);
            else $db->run('INSERT INTO argus_growth_metrics_cache(cache_key,payload,computed_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,computed_at=excluded.computed_at',[$key,$encoded,$now]);
            return $v+['as_of'=>gmdate('c',$now),'cached'=>false];
        }finally{
            try{if($slot!==null){if($driver==='pgsql')$db->one('SELECT pg_advisory_unlock(hashtext(current_schema()||?))',[$slot]);elseif($driver==='mysql')$db->one('SELECT RELEASE_LOCK(CONCAT(DATABASE(),?))',[$slot]);}}
            finally{if($locked){if($driver==='pgsql')$db->one('SELECT pg_advisory_unlock(hashtext(current_schema()||?))',[':growth-metrics:'.$key]);elseif($driver==='mysql')$db->one('SELECT RELEASE_LOCK(?)',[$key]);}}
        }
    }
    public static function queueAdvisory(Database $db,string $scope,string $owner,string $eventKey,?string $event):void{
        // Existing event may already have been recorded before a crash.
        if($event===null){$row=$db->one('SELECT id FROM argus_notice_events WHERE unique_key=? AND audience_type=? AND audience_id=?',[hash('sha256',$eventKey.'|'.$scope.'|'.$owner),$scope,$owner]);$event=$row['id']??null;}
        if(!$event)return;
        $now=time();
        if($db->driver()==='mysql')$db->run('INSERT IGNORE INTO argus_growth_notice_retry(event_id,attempts,next_at,expires_at) VALUES (?,?,?,?)',[$event,0,$now,$now+3600]);
        else $db->run('INSERT INTO argus_growth_notice_retry(event_id,attempts,next_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(event_id) DO NOTHING',[$event,0,$now,$now+3600]);
    }
    public static function deliveryComplete(array $result):bool{
        return ($result['deferred']??false)!==true&&(int)($result['failed']??1)===0&&($result['status']??'processed')!=='transport_unavailable';
    }
    public static function claimAdvisory(Database $db,string $id,int $now):?array{
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'notice-claim:'.$id);
            $row=$db->one('SELECT attempts,next_at,expires_at FROM argus_growth_notice_retry WHERE event_id=?',[$id]);
            $s=$db->one('SELECT state,lease_until FROM argus_growth_delivery_state WHERE event_id=?',[$id]);
            if(!$row||(int)$row['attempts']>=5||(int)$row['expires_at']<=$now||(int)$row['next_at']>$now||($s&&$s['state']==='sending'&&(int)$s['lease_until']>$now)){$pdo->commit();return null;}
            $attempt=(int)$row['attempts']+1;$token=bin2hex(random_bytes(32));$lease=$now+120;
            $db->run('UPDATE argus_growth_notice_retry SET attempts=?,next_at=? WHERE event_id=?',[$attempt,$now+min(900,60*(2**($attempt-1))),$id]);
            $db->run('DELETE FROM argus_growth_delivery_state WHERE event_id=?',[$id]);
            $db->run('INSERT INTO argus_growth_delivery_state(event_id,claim_token,lease_until,state,updated_at) VALUES (?,?,?,?,?)',[$id,$token,$lease,'sending',$now]);
            $pdo->commit();return ['attempt'=>$attempt,'token'=>$token];
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function finishAdvisory(Database $db,string $id,array $claim,array $result,int $now):bool{
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'notice-claim:'.$id);
            $s=$db->one('SELECT state,claim_token FROM argus_growth_delivery_state WHERE event_id=?',[$id]);
            if(!$s||$s['state']!=='sending'||!hash_equals($s['claim_token'],$claim['token'])){$pdo->commit();return false;}
            $complete=self::deliveryComplete($result);
            $state=$complete?'complete':($claim['attempt']>=5?'failed':'retry');
            $db->run('UPDATE argus_growth_delivery_state SET state=?,lease_until=0,updated_at=? WHERE event_id=?',[$state,$now,$id]);
            if($complete){
                $db->run('UPDATE argus_growth_notice_retry SET attempts=5 WHERE event_id=?',[$id]);
                $reason=((int)($result['accepted']??0)+(int)($result['previously_accepted']??0))>0?'push_accepted':match($result['status']??'processed'){
                    'disabled'=>'push_disabled','no_devices'=>'push_no_devices','missing_event'=>'push_missing_event','inactive_account'=>'push_inactive_account','no_delivery'=>'push_no_delivery',default=>'push_processed'};
                self::resolveJob($db,'notice','advisory',$id,$now,$reason);
            }
            elseif($claim['attempt']>=5)self::failJob($db,'notice','advisory',$id,$claim['attempt'],'delivery_exhausted',$now);
            if((int)($result['accepted']??0)>0)self::saveCursor($db,'notice_accepted',(string)$now);
            self::saveCursor($db,'notice_outcome',$complete?((int)($result['accepted']??0)>0?'accepted':($result['status']??'processed')):'deferred');
            $pdo->commit();return true;
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function reapAdvisories(Database $db,int $now):void{
        $rows=$db->all("SELECT q.event_id FROM argus_growth_notice_retry q LEFT JOIN argus_growth_delivery_state s ON s.event_id=q.event_id WHERE (q.attempts<5 AND q.expires_at<=? AND (s.state IS NULL OR s.state<>'sending' OR s.lease_until<=?)) OR (s.state='sending' AND s.lease_until<=? AND q.attempts>=5) ORDER BY q.expires_at,q.event_id LIMIT 100",[$now,$now,$now]);
        foreach($rows as $row){
            $id=$row['event_id'];$pdo=$db->pdo();$pdo->beginTransaction();
            try{
                self::mutex($db,'notice-claim:'.$id);
                $q=$db->one('SELECT attempts,expires_at FROM argus_growth_notice_retry WHERE event_id=?',[$id]);
                $s=$db->one('SELECT state,lease_until FROM argus_growth_delivery_state WHERE event_id=?',[$id]);
                $active=$s&&$s['state']==='sending'&&(int)$s['lease_until']>$now;
                $uncertain=$s&&$s['state']==='sending'&&!$active&&(int)($q['attempts']??0)>=5;
                if($q&&!$active&&($uncertain||((int)$q['attempts']<5&&(int)$q['expires_at']<=$now))){
                    self::failJob($db,'notice','advisory',$id,(int)$q['attempts'],$uncertain?'delivery_interrupted':'delivery_expired',$now);
                    $db->run('UPDATE argus_growth_notice_retry SET attempts=5 WHERE event_id=?',[$id]);
                    $db->run("UPDATE argus_growth_delivery_state SET state='failed',lease_until=0,updated_at=? WHERE event_id=?",[$now,$id]);
                }
                $pdo->commit();
            }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        }
    }
    public static function retryAdvisories(Database $db,?callable $transport=null,?int $clock=null):void{
        $now=$clock??time();self::reapAdvisories($db,$now);
        $rows=$db->all('SELECT event_id FROM argus_growth_notice_retry WHERE attempts<5 AND expires_at>? AND next_at<=? ORDER BY next_at,event_id LIMIT '.($transport?8:1),[$now,$now]);
        foreach($rows as $row){
            $id=$row['event_id'];$claim=self::claimAdvisory($db,$id,$now);if(!$claim)continue;
            try{$result=$transport?$transport($id):Notifications::dispatch($db,$id);}
            catch(\Throwable $e){$result=['failed'=>1,'deferred'=>true];error_log('ARGUS advisory delivery deferred');}
            self::finishAdvisory($db,$id,$claim,$result,$clock??time());
        }
    }
    public static function maintenance(Database $db,?int $clock=null):array{
        self::ready($db);$now=$clock??time();
        $expired=$db->all('SELECT token_hash FROM argus_growth_verify WHERE expires_at<? ORDER BY expires_at LIMIT 500',[gmdate('Y-m-d H:i:s',$now)]);
        if($expired){$hashes=array_column($expired,'token_hash');$db->run('DELETE FROM argus_growth_verify WHERE token_hash IN ('.implode(',',array_fill(0,count($hashes),'?')).') AND expires_at<?',[...$hashes,gmdate('Y-m-d H:i:s',$now)]);}
        $db->run('DELETE FROM argus_growth_metrics_cache WHERE computed_at<?',[$now-86400]);
        self::reapAdvisories($db,$now);
        self::repairTerminalScans($db,$now);
        $db->run("DELETE FROM argus_growth_notice_retry WHERE expires_at<? AND attempts>=5 AND event_id NOT IN (SELECT subject FROM argus_growth_failed_jobs WHERE kind='notice' AND state='pending') AND event_id NOT IN (SELECT event_id FROM argus_growth_delivery_state WHERE state='sending')",[$now-172800]);
        $db->run("DELETE FROM argus_growth_delivery_state WHERE updated_at<? AND state<>'sending' AND event_id NOT IN (SELECT event_id FROM argus_growth_notice_retry)",[$now-172800]);
        return ['expired_tokens'=>count($expired)];
    }
    public static function readSnapshot(Database $db,callable $read):mixed{
        $pdo=$db->pdo();
        if($pdo->inTransaction())return $read();
        if($db->driver()==='mysql')$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        $pdo->beginTransaction();
        try{
            if($db->driver()==='pgsql'){$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');$pdo->exec("SET LOCAL statement_timeout='8s'");}
            $value=$read();$pdo->commit();return $value;
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function metrics(Database $db,string $scope,string $owner,?int $clock=null):array{
        self::ready($db);
        return self::readSnapshot($db,static fn()=>self::metricsSnapshot($db,$scope,$owner,$clock));
    }
    private static function metricsSnapshot(Database $db,string $scope,string $owner,?int $clock=null):array{
        $now=$clock??time();$tz=new \DateTimeZone('America/Sao_Paulo');
        $today=(new \DateTimeImmutable('@'.$now))->setTimezone($tz)->setTime(0,0);
        $first=$today->modify('-29 days');$start=$first->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');$end=gmdate('Y-m-d H:i:s',$now+1);
        $seller=$scope==='portal';$table=$seller?'argus_seller_charges':'admin_quick_pix';$outTable=$seller?'argus_seller_withdrawals':'admin_payouts';$field=$seller?'account_id':'actor_id';
        $proof=$seller?" AND EXISTS(SELECT 1 FROM argus_seller_ledger l WHERE l.account_id=q.account_id AND l.operation_id=q.id AND l.operation_kind='deposit_paid')":"";
        $withdrawProof=$seller?" AND EXISTS(SELECT 1 FROM argus_seller_ledger l WHERE l.account_id=q.account_id AND l.operation_id=q.id AND l.operation_kind='withdraw_paid')":"";
        $ts="REPLACE(SUBSTR(q.created_at,1,19),'T',' ')";
        $range="((q.created_at>=? AND q.created_at<? AND SUBSTR(q.created_at,11,1)=' ') OR (q.created_at>=? AND q.created_at<? AND SUBSTR(q.created_at,11,1)='T'))";
        $bounds=static fn(string $a,string $b):array=>[$a,$b,str_replace(' ','T',$a),str_replace(' ','T',$b)];$valid="q.status='paid' AND q.provider_id IS NOT NULL AND q.provider_id<>''".$proof;
        $rows=$db->all("SELECT SUBSTR($ts,1,13) AS hour_key,COUNT(*) AS n,COALESCE(SUM(q.amount_cents),0) AS gross FROM $table q WHERE q.$field=? AND $valid AND $range GROUP BY SUBSTR($ts,1,13)",[$owner,...$bounds($start,$end)]);
        $by=[];foreach($rows as $r){$day=self::localDay(self::timestamp($r['hour_key'].':00:00'));if(!isset($by[$day]))$by[$day]=['day'=>$day,'count'=>0,'gross_cents'=>0];$by[$day]['count']+=(int)$r['n'];$by[$day]['gross_cents']+=(int)$r['gross'];}
        $daily=[];for($i=0;$i<30;$i++){$day=$first->modify("+$i days")->format('Y-m-d');$daily[]=$by[$day]??['day'=>$day,'count'=>0,'gross_cents'=>0];}
        $sum=array_sum(array_column($daily,'gross_cents'));$count=array_sum(array_column($daily,'count'));
        $out=$db->one("SELECT COUNT(*) AS n,COALESCE(SUM(q.amount_cents),0) AS amount FROM $outTable q WHERE q.$field=? AND q.status='paid' AND q.provider_tx_id IS NOT NULL AND q.provider_tx_id<>''".$withdrawProof." AND $range",[$owner,...$bounds($start,$end)]);
        $pending=0;$failed=0;$transactions=0;$recentCount=0;
        foreach([$table,$outTable] as $tableName){
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND q.status IN ('pending','unknown','creating','requested','queued','review','processing')",[$owner]);$pending+=(int)$n['n'];
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND q.status IN ('failed','cancelled','canceled','expired','refunded','partially_refunded','partial_review','rejected','refused') AND $range",[$owner,...$bounds($start,$end)]);$failed+=(int)$n['n'];
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND $range",[$owner,...$bounds($start,$end)]);$transactions+=(int)$n['n'];
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND $range",[$owner,...$bounds(gmdate('Y-m-d H:i:s',$now-600),$end)]);$recentCount+=(int)$n['n'];
        }
        $open=$db->all("SELECT id,kind,payload FROM argus_growth_records WHERE audience=? AND owner_id=? AND state='open' AND kind IN ('subscription','invoice','flow')",[$scope,$owner]);$matches=self::invoiceStates($db,$scope,$owner);
        $due=0;$flows=[];$todayKey=$today->format('Y-m-d');
        foreach($open as $row){$data=json_decode($row['payload'],true,16,JSON_THROW_ON_ERROR);if($row['kind']==='flow'){$data['id']=$row['id'];$flows[]=$data;continue;}
            $m=$matches[$row['id']]??null;if($row['kind']==='invoice'&&$m&&$m['confirmed']&&$m['amount']===($data['amount_cents']??null))continue;if(($data['due']??'9999')<=$todayKey)$due++;}
        $alerts=[];$signals=['pending'=>$pending,'failed'=>$failed,'due'=>$due];foreach($flows as $f){$trigger=$f['trigger']??'';if(isset($signals[$trigger])&&$signals[$trigger]>=($f['threshold']??PHP_INT_MAX))$alerts[]=['id'=>$f['id'],'title'=>$f['title'],'trigger'=>$trigger,'observed'=>$signals[$trigger]];}
        $previous=array_sum(array_column(array_slice($daily,16,7),'gross_cents'));$recent=array_sum(array_column(array_slice($daily,23,7),'gross_cents'));$recentPaid=array_sum(array_column(array_slice($daily,23,7),'count'));
        $risk=[];if($pending>=5)$risk[]='Cobranças ou saques pendentes, inclusive antigos, exigem revisão.';if($failed>=3)$risk[]='Falhas ou reversões recentes: conferir conciliação.';if($previous>0&&$recent>3*$previous)$risk[]='Volume semanal superior a três vezes a semana anterior.';if($recentCount>=8)$risk[]='Volume incomum nos últimos 10 minutos.';
        $history=$db->one("SELECT COUNT(*) AS n,COALESCE(AVG(q.amount_cents),0) AS avg_amount FROM $table q WHERE q.$field=? AND $valid AND $range",[$owner,...$bounds($start,gmdate('Y-m-d H:i:s',$now-600))]);
        $peak=$db->one("SELECT COALESCE(MAX(q.amount_cents),0) AS peak FROM $table q WHERE q.$field=? AND $valid AND $range",[$owner,...$bounds(gmdate('Y-m-d H:i:s',$now-600),$end)]);
        if((int)$history['n']>=5&&(int)$peak['peak']>=max(100,3*(float)$history['avg_amount']))$risk[]='Recebimento recente acima de três vezes a média histórica. Não comprova fraude.';
        return ['daily'=>$daily,'gross_cents'=>$sum,'confirmed_count'=>$count,'average_ticket_cents'=>$count?(int)round($sum/$count):null,'sent_cents'=>(int)$out['amount'],'sent_count'=>(int)$out['n'],'transaction_count'=>$transactions,
          'forecast_30d_cents'=>$recentPaid>=5?(int)round($recent/7*30):null,'prior_7d_cents'=>$previous,'last_7d_cents'=>$recent,
          'pending_count'=>$pending,'failed_count'=>$failed,'due_count'=>$due,'risk_signals'=>$risk,'flow_alerts'=>$alerts,
          'model'=>'Estimativa linear dos últimos sete dias de calendário, incluindo hoje, horário de Brasília. Recebimentos por data de criação e status confirmado atual; não é saldo nem garantia de receita.','financial_effect'=>false];
    }
    public static function verification(Database $db,string $scope,string $owner,string $kind,string $id):array{
        if(!in_array($kind,['deposit','withdrawal'],true)||!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$id))self::fail('Operação inválida.');
        $r=$scope==='admin'?TransactionReceipt::admin($db,$owner,$id,$kind):TransactionReceipt::seller($db,$owner,$id);
        if(!$r['confirmed']||$r['kind']!==$kind)self::fail('Somente comprovantes confirmados podem ser compartilhados.',409);
        $token=bin2hex(random_bytes(32));$now=Database::stamp();$expires=gmdate('Y-m-d H:i:s',time()+30*86400);
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'verify:'.$scope.':'.$owner.':'.$id);
            $db->run('DELETE FROM argus_growth_verify WHERE audience=? AND owner_id=? AND operation_id=? AND (revoked=1 OR expires_at<?)',[$scope,$owner,$id,gmdate('Y-m-d H:i:s')]);
            $active=$db->one('SELECT COUNT(*) AS n FROM argus_growth_verify WHERE audience=? AND owner_id=? AND operation_id=? AND revoked=0',[$scope,$owner,$id]);
            if((int)$active['n']>=10)self::fail('Revogue links antigos antes de criar novos.',409);
            $db->run('INSERT INTO argus_growth_verify(token_hash,audience,owner_id,operation_id,kind,expires_at,revoked,created_at) VALUES (?,?,?,?,?,?,?,?)',
              [hash('sha256',$token),$scope,$owner,$id,$kind,$expires,0,$now]);
            $pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['path'=>'/verify#'.$token,'expires_at'=>$expires,'financial_effect'=>false];
    }
    public static function revokeVerification(Database $db,string $scope,string $owner,string $id):array{
        if(!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$id))self::fail('Operação inválida.');
        $r=$db->one('SELECT token_hash FROM argus_growth_verify WHERE audience=? AND owner_id=? AND operation_id=? LIMIT 1',[$scope,$owner,$id]);
        if(!$r)return ['ok'=>true];
        $pdo=$db->pdo();$pdo->beginTransaction();
        try{
            self::mutex($db,'verify:'.$scope.':'.$owner.':'.$id);
            $db->run('UPDATE argus_growth_verify SET revoked=1 WHERE audience=? AND owner_id=? AND operation_id=?',[$scope,$owner,$id]);$pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['ok'=>true];
    }
    public static function verify(Database $db,string $token):array{
        if(!preg_match('/^[a-f0-9]{64}$/D',$token))self::fail('Verificação indisponível.',404);
        $row=$db->one('SELECT audience,owner_id,operation_id,kind,expires_at FROM argus_growth_verify WHERE token_hash=? AND revoked=0 AND expires_at>=?',[hash('sha256',$token),gmdate('Y-m-d H:i:s')]);
        if(!$row)self::fail('Verificação indisponível ou expirada.',404);
        if($row['audience']==='portal'&&!$db->one("SELECT id FROM argus_portal_accounts WHERE id=? AND status NOT IN ('suspended','rejected')",[$row['owner_id']]))self::fail('Verificação indisponível.',404);
        $r=$row['audience']==='admin'?TransactionReceipt::admin($db,$row['owner_id'],$row['operation_id'],$row['kind']):TransactionReceipt::seller($db,$row['owner_id'],$row['operation_id']);
        return ['issuer'=>'ArgusPay','kind'=>$r['kind'],'confirmed'=>$r['confirmed'],'status_label'=>$r['status_label'],'amount_cents'=>$r['amount_cents'],'checked_at'=>gmdate('c'),'expires_at'=>$row['expires_at'],'notice'=>'Consulta ao registro atual da plataforma, sem dados pessoais. Não é um comprovante bancário.'];
    }
    public static function publicRoute(Database $db):never{
        SecurityShield::rate($db,'growth_verify_network',SecurityShield::remoteTag(),300,60);
        $raw=file_get_contents('php://input',false,null,0,257);
        if(!is_string($raw)||strlen($raw)>256)self::fail('Solicitação inválida.',400);
        try{$data=json_decode($raw,true,8,JSON_THROW_ON_ERROR);}catch(\JsonException){self::fail('Solicitação inválida.',400);}
        $token=$data['token']??null;if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))self::fail('Verificação indisponível.',404);
        SecurityShield::rate($db,'growth_verify_token',hash('sha256',$token),60,60);
        self::ready($db);self::out(self::verify($db,$token));
    }
    public static function batchInput(?string $raw=null):array{
        $raw??=file_get_contents('php://input',false,null,0,65537);
        if(!is_string($raw)||strlen($raw)>65536)self::fail('Lote excede 64 KiB. Divida a importação.',413);
        try{$body=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}catch(\JsonException){self::fail('JSON inválido.',422);}
        if(!is_array($body)||array_is_list($body))self::fail('Objeto JSON obrigatório.',422);
        return $body;
    }
    public static function handle(Database $db,string $scope,string $method,string $path,array $actor,array $body=[]):never{
        if(empty($actor['id'])||($scope==='admin'&&($actor['role']??'')!=='superadmin'))self::fail('Acesso restrito.',403);
        $owner=(string)$actor['id'];self::ready($db);
        $base='/api/'.$scope.'/growth';
        if($method==='GET'&&$scope==='admin'&&$path===$base.'/worker-health'){SecurityShield::rate($db,'growth_health_owner',$owner,30,60);self::out(self::workerHealth($db));}
        if($method==='GET'&&$path===$base.'/metrics'){SecurityShield::rate($db,'growth_metrics_owner',$scope.':'.$owner,30,60);self::out(self::cachedMetrics($db,$scope,$owner));}
        if($method==='POST')SecurityShield::rate($db,'growth_write_'.$scope,$owner,90,3600);
        if($scope==='admin'&&$method==='GET'&&$path===$base.'/failed-jobs'){
            $cursor=$_GET['cursor']??null;if($cursor!==null&&(!is_string($cursor)||!preg_match('/^[a-f0-9]{64}$/D',$cursor)))self::fail('Cursor inválido.');
            $state=$_GET['state']??'pending';if(!is_string($state))self::fail('Estado inválido.');
            SecurityShield::rate($db,'growth_failures_owner',$owner,30,60);
            self::out(self::failedJobs($db,$cursor,$state));
        }
        if($scope==='admin'&&$method==='POST'&&$path===$base.'/retry-job'){
            $id=$body['id']??null;if(!is_string($id))self::fail('Identificador inválido.');self::out(self::recoverJob($db,$id,$owner));
        }
        if($scope==='admin'&&$method==='POST'&&$path===$base.'/archive-job'){
            $id=$body['id']??null;if(!is_string($id))self::fail('Identificador inválido.');self::out(self::archiveJob($db,$id,$owner));
        }
        if($scope==='admin'&&$method==='GET'&&$path===$base.'/failure-history'){
            $id=$_GET['id']??null;$cursor=$_GET['cursor']??null;if(!is_string($id)||($cursor!==null&&!is_string($cursor)))self::fail('Identificador inválido.');
            SecurityShield::rate($db,'growth_history_owner',$owner,30,60);self::out(self::failureHistory($db,$id,$cursor));
        }
        if($method==='GET'&&$scope==='admin'&&$path===$base.'/inbox'){
            $cursor=$_GET['cursor']??null;if($cursor!==null&&!is_string($cursor))self::fail('Cursor inválido.');self::out(self::inbox($db,$cursor));
        }
        if(preg_match('~^'.preg_quote($base,'~').'/thread/(agr_[a-f0-9]{32})$~D',$path,$m)){
            if($method==='GET'){$cursor=$_GET['cursor']??null;if($cursor!==null&&!is_string($cursor))self::fail('Cursor inválido.');self::out(self::thread($db,$scope,$owner,$m[1],null,null,$cursor));}
            if($method==='POST')self::out(self::thread($db,$scope,$owner,$m[1],self::str($body,'message',1000),self::str($body,'nonce',36)));
        }
        if($method==='POST'&&$path===$base.'/match-invoice')self::out(self::invoiceMatch($db,$scope,$owner,self::str($body,'id',80),self::str($body,'operation_id',80)));
        if($method==='POST'&&$path===$base.'/verify'){
            self::out(self::verification($db,$scope,$owner,self::str($body,'kind',20),self::str($body,'id',80)));
        }
        if($method==='POST'&&$path===$base.'/revoke-verification')self::out(self::revokeVerification($db,$scope,$owner,self::str($body,'id',80)));
        if(preg_match('~^'.preg_quote($base,'~').'/records/([a-z_]+)$~D',$path,$m)){
            if($method==='GET'){ $cursor=$_GET['cursor']??null;if($cursor!==null&&!is_string($cursor))self::fail('Cursor inválido.');self::out(self::listing($db,$scope,$owner,$m[1],$cursor));}
            if($method==='POST')self::out(self::create($db,$scope,$owner,$m[1],$body));
        }
        if($method==='POST'&&$path===$base.'/batch')self::out(self::batch($db,$scope,$owner,$body));
        if($method==='POST'&&$path===$base.'/edit')self::out(self::edit($db,$scope,$owner,self::str($body,'id',80),$body));
        if($method==='POST'&&$path===$base.'/action')self::out(self::transition($db,$scope,$owner,self::str($body,'id',80),self::str($body,'action',30),self::str($body,'revision',64)));
        self::fail('Rota não encontrada.',404);
    }
}
