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
        self::index($db,'argus_growth_records','argus_growth_owner_kind_idx','audience,owner_id,kind,created_at,id');
        self::index($db,'argus_growth_records','argus_growth_inbox_idx','audience,kind,updated_at,id');
        self::index($db,'argus_growth_records','argus_growth_flow_idx','kind,state,audience,owner_id');
        self::index($db,'argus_growth_messages','argus_growth_message_idx','record_id,owner_id,created_at,id');
        self::index($db,'argus_growth_verify','argus_growth_verify_owner_idx','audience,owner_id,operation_id');
        self::index($db,'argus_growth_verify','argus_growth_verify_exp_idx','expires_at');
        self::index($db,'argus_growth_events','argus_growth_event_idx','record_id,created_at');
        self::$installed[$key]=$db->pdo();
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
        if(($required&&$v==='')||mb_strlen($v)>$max)self::fail('Campo inválido: '.$k);
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
            $row=$db->one("SELECT updated_at,id FROM argus_growth_records WHERE id=? AND audience='portal' AND kind IN ('support','dispute')",[$cursor]);
            if(!$row)self::fail('Página não encontrada.',404);
            $filter=' AND (updated_at<? OR (updated_at=? AND id<?))';$args=[$row['updated_at'],$row['updated_at'],$row['id']];
        }
        $rows=$db->all("SELECT id,owner_id,kind,payload,state,updated_at FROM argus_growth_records WHERE audience='portal' AND kind IN ('support','dispute')".$filter." ORDER BY updated_at DESC,id DESC LIMIT 101",$args);
        $more=count($rows)>100;$rows=array_slice($rows,0,100);
        foreach($rows as &$r){$r['data']=json_decode($r['payload'],true,16,JSON_THROW_ON_ERROR);unset($r['payload'],$r['owner_id']);}unset($r);
        return ['items'=>$rows,'next_cursor'=>$more?$rows[count($rows)-1]['id']:null];
    }
    public static function thread(Database $db,string $scope,string $owner,string $id,?string $message=null):array{
        $args=[$id];$filter='';
        if($scope==='portal'){$filter=' AND owner_id=?';$args[]=$owner;}
        $row=$db->one("SELECT id,owner_id,state FROM argus_growth_records WHERE id=? AND audience='portal' AND kind IN ('support','dispute')".$filter,$args);
        if(!$row)self::fail('Chamado não encontrado.',404);
        $seller=(string)$row['owner_id'];
        if($message!==null){
            if($row['state']!=='open')self::fail('Chamado arquivado.',409);
            $message=self::str(['message'=>$message],'message',1000);
            $n=$db->one('SELECT COUNT(*) AS n FROM argus_growth_messages WHERE record_id=? AND owner_id=?',[$id,$seller]);
            if((int)$n['n']>=200)self::fail('Limite de mensagens atingido.',409);
            $pdo=$db->pdo();$pdo->beginTransaction();
            try{
                $db->run('UPDATE argus_growth_records SET updated_at=updated_at WHERE id=? AND owner_id=?',[$id,$seller]);
                $fresh=$db->one("SELECT state FROM argus_growth_records WHERE id=? AND owner_id=? AND audience='portal'",[$id,$seller]);
                if(!$fresh||$fresh['state']!=='open')self::fail('Chamado arquivado.',409);
                $count=$db->one('SELECT COUNT(*) AS n FROM argus_growth_messages WHERE record_id=? AND owner_id=?',[$id,$seller]);
                if((int)$count['n']>=200)self::fail('Limite de mensagens atingido.',409);
                $db->run('INSERT INTO argus_growth_messages(id,record_id,owner_id,sender,body,created_at) VALUES (?,?,?,?,?,?)',
                    ['agm_'.bin2hex(random_bytes(16)),$id,$seller,$scope,$message,Database::stamp()]);
                $db->run("UPDATE argus_growth_records SET updated_at=? WHERE id=? AND audience='portal' AND owner_id=?",[Database::stamp(),$id,$seller]);
                self::event($db,$id,'portal',$seller,$owner,'message_'.$scope);$pdo->commit();
            }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        }
        return ['messages'=>$db->all('SELECT sender,body,created_at FROM argus_growth_messages WHERE record_id=? AND owner_id=? ORDER BY created_at ASC,id ASC LIMIT 200',[$id,$seller])];
    }
    /** Optional existing notification worker; informational and consent-aware. */
    public static function worker(Database $db):void{
        if(getenv('ARGUS_GROWTH_ALERTS_ENABLED')!=='yes'||!in_array($db->driver(),['pgsql','mysql'],true))return;
        self::install($db);
        $cursor=self::cursor($db,'flow');$parts=explode('|',$cursor,2);$a=$parts[0]??'';$b=$parts[1]??'';
        $owners=$db->all("SELECT DISTINCT audience,owner_id FROM argus_growth_records WHERE kind='flow' AND state='open' AND (audience>? OR (audience=? AND owner_id>?)) ORDER BY audience,owner_id LIMIT 100",[$a,$a,$b]);
        if(!$owners){self::saveCursor($db,'flow','');return;}
        $start=microtime(true);
        foreach($owners as $o){
            if(microtime(true)-$start>8)break;
            self::saveCursor($db,'flow',$o['audience'].'|'.$o['owner_id']);
            try{
                $scope=$o['audience'];$owner=$o['owner_id'];
                if($scope==='portal'&&!$db->one("SELECT id FROM argus_portal_accounts WHERE id=? AND status='approved'",[$owner]))continue;
                if($scope==='admin'&&!$db->one("SELECT id FROM admin_users WHERE id=? AND status='active' AND role='superadmin'",[$owner]))continue;
                $m=self::metrics($db,$scope,$owner);
                foreach($m['flow_alerts'] as $f){
                    $key='growth-flow:'.$f['id'].':'.self::localDay(time());
                    $event=Notifications::record($db,$scope,$owner,'announcement',$key,'Argus Flow · alerta configurado',
                        'Sua regra de '.$f['trigger'].' atingiu '.$f['observed'].' ocorrências. Consulte a central.',null,$scope==='admin'?'/admin':'/conta');
                    if($event)Notifications::dispatch($db,$event);
                }
            }catch(\Throwable $e){error_log('ARGUS_GROWTH_ALERT unavailable class='.get_class($e));}
        }
    }
    private static array $financialIndexed=[];
    private static function financialIndexes(Database $db,bool $seller):void{
        $key=spl_object_id($db->pdo()).':'.($seller?'seller':'admin');
        if(isset(self::$financialIndexed[$key]))return;
        $tables=$seller?['argus_seller_charges','argus_seller_withdrawals']:['admin_quick_pix','admin_payouts'];
        $owner=$seller?'account_id':'actor_id';
        foreach($tables as $table)self::index($db,$table,$table.'_growth_owner_status_date_idx',$owner.',status,created_at');
        self::$financialIndexed[$key]=true;
    }
    /** Exact aggregates, 30 local calendar days, creation-date basis. */
    public static function metrics(Database $db,string $scope,string $owner,?int $clock=null):array{
        self::install($db);
        $now=$clock??time();$tz=new \DateTimeZone('America/Sao_Paulo');
        $today=(new \DateTimeImmutable('@'.$now))->setTimezone($tz)->setTime(0,0);
        $first=$today->modify('-29 days');$start=$first->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');$end=gmdate('Y-m-d H:i:s',$now+1);
        $seller=$scope==='portal';self::financialIndexes($db,$seller);$table=$seller?'argus_seller_charges':'admin_quick_pix';$outTable=$seller?'argus_seller_withdrawals':'admin_payouts';$field=$seller?'account_id':'actor_id';
        $proof=$seller?" AND EXISTS(SELECT 1 FROM argus_seller_ledger l WHERE l.account_id=q.account_id AND l.operation_id=q.id AND l.operation_kind='deposit_paid')":"";
        $withdrawProof=$seller?" AND EXISTS(SELECT 1 FROM argus_seller_ledger l WHERE l.account_id=q.account_id AND l.operation_id=q.id AND l.operation_kind='withdraw_paid')":"";
        $ts="REPLACE(SUBSTR(q.created_at,1,19),'T',' ')";$valid="q.status='paid' AND q.provider_id IS NOT NULL AND q.provider_id<>''".$proof;
        $rows=$db->all("SELECT SUBSTR($ts,1,13) AS hour_key,COUNT(*) AS n,COALESCE(SUM(q.amount_cents),0) AS gross FROM $table q WHERE q.$field=? AND $valid AND $ts>=? AND $ts<? GROUP BY SUBSTR($ts,1,13)",[$owner,$start,$end]);
        $by=[];foreach($rows as $r){$day=self::localDay(self::timestamp($r['hour_key'].':00:00'));if(!isset($by[$day]))$by[$day]=['day'=>$day,'count'=>0,'gross_cents'=>0];$by[$day]['count']+=(int)$r['n'];$by[$day]['gross_cents']+=(int)$r['gross'];}
        $daily=[];for($i=0;$i<30;$i++){$day=$first->modify("+$i days")->format('Y-m-d');$daily[]=$by[$day]??['day'=>$day,'count'=>0,'gross_cents'=>0];}
        $sum=array_sum(array_column($daily,'gross_cents'));$count=array_sum(array_column($daily,'count'));
        $out=$db->one("SELECT COUNT(*) AS n,COALESCE(SUM(q.amount_cents),0) AS amount FROM $outTable q WHERE q.$field=? AND q.status='paid' AND q.provider_tx_id IS NOT NULL AND q.provider_tx_id<>''".$withdrawProof." AND $ts>=? AND $ts<?",[$owner,$start,$end]);
        $pending=0;$failed=0;$transactions=0;$recentCount=0;
        foreach([$table,$outTable] as $tableName){
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND q.status IN ('pending','unknown','creating','requested','queued','review','processing')",[$owner]);$pending+=(int)$n['n'];
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND q.status IN ('failed','cancelled','canceled','expired','refunded','partially_refunded','partial_review','rejected','refused') AND $ts>=? AND $ts<?",[$owner,$start,$end]);$failed+=(int)$n['n'];
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND $ts>=? AND $ts<?",[$owner,$start,$end]);$transactions+=(int)$n['n'];
            $n=$db->one("SELECT COUNT(*) AS n FROM $tableName q WHERE q.$field=? AND $ts>=? AND $ts<?",[$owner,gmdate('Y-m-d H:i:s',$now-600),$end]);$recentCount+=(int)$n['n'];
        }
        $open=$db->all("SELECT id,kind,payload FROM argus_growth_records WHERE audience=? AND owner_id=? AND state='open' AND kind IN ('subscription','invoice','flow')",[$scope,$owner]);$matches=self::invoiceStates($db,$scope,$owner);
        $due=0;$flows=[];$todayKey=$today->format('Y-m-d');
        foreach($open as $row){$data=json_decode($row['payload'],true,16,JSON_THROW_ON_ERROR);if($row['kind']==='flow'){$data['id']=$row['id'];$flows[]=$data;continue;}
            $m=$matches[$row['id']]??null;if($row['kind']==='invoice'&&$m&&$m['confirmed']&&$m['amount']===($data['amount_cents']??null))continue;if(($data['due']??'9999')<=$todayKey)$due++;}
        $alerts=[];$signals=['pending'=>$pending,'failed'=>$failed,'due'=>$due];foreach($flows as $f){$trigger=$f['trigger']??'';if(isset($signals[$trigger])&&$signals[$trigger]>=($f['threshold']??PHP_INT_MAX))$alerts[]=['id'=>$f['id'],'title'=>$f['title'],'trigger'=>$trigger,'observed'=>$signals[$trigger]];}
        $previous=array_sum(array_column(array_slice($daily,16,7),'gross_cents'));$recent=array_sum(array_column(array_slice($daily,23,7),'gross_cents'));$recentPaid=array_sum(array_column(array_slice($daily,23,7),'count'));
        $risk=[];if($pending>=5)$risk[]='Cobranças ou saques pendentes, inclusive antigos, exigem revisão.';if($failed>=3)$risk[]='Falhas ou reversões recentes: conferir conciliação.';if($previous>0&&$recent>3*$previous)$risk[]='Volume semanal superior a três vezes a semana anterior.';if($recentCount>=8)$risk[]='Volume incomum nos últimos 10 minutos.';
        $history=$db->one("SELECT COUNT(*) AS n,COALESCE(AVG(q.amount_cents),0) AS avg_amount FROM $table q WHERE q.$field=? AND $valid AND $ts>=? AND $ts<?",[$owner,$start,gmdate('Y-m-d H:i:s',$now-600)]);
        $peak=$db->one("SELECT COALESCE(MAX(q.amount_cents),0) AS peak FROM $table q WHERE q.$field=? AND $valid AND $ts>=? AND $ts<?",[$owner,gmdate('Y-m-d H:i:s',$now-600),$end]);
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
        // Bound each operation's active public tokens and prune old tokens for this owner.
        $db->run('DELETE FROM argus_growth_verify WHERE audience=? AND owner_id=? AND (revoked=1 OR expires_at<?)',[$scope,$owner,gmdate('Y-m-d H:i:s')]);
        $active=$db->one('SELECT COUNT(*) AS n FROM argus_growth_verify WHERE audience=? AND owner_id=? AND operation_id=? AND revoked=0',[$scope,$owner,$id]);
        if((int)$active['n']>=10)self::fail('Revogue links antigos antes de criar novos.',409);
        $db->run('INSERT INTO argus_growth_verify(token_hash,audience,owner_id,operation_id,kind,expires_at,revoked,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [hash('sha256',$token),$scope,$owner,$id,$kind,$expires,0,$now]);
        return ['path'=>'/verify#'.$token,'expires_at'=>$expires,'financial_effect'=>false];
    }
    public static function revokeVerification(Database $db,string $scope,string $owner,string $id):array{
        $db->run('UPDATE argus_growth_verify SET revoked=1 WHERE audience=? AND owner_id=? AND operation_id=?',[$scope,$owner,$id]);
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
        self::install($db);$result=self::verify($db,$token);
        SecurityShield::rate($db,'growth_verify_token',hash('sha256',$token),60,60);self::out($result);
    }
    public static function handle(Database $db,string $scope,string $method,string $path,array $actor,array $body=[]):never{
        if(empty($actor['id'])||($scope==='admin'&&($actor['role']??'')!=='superadmin'))self::fail('Acesso restrito.',403);
        $owner=(string)$actor['id'];self::install($db);
        $base='/api/'.$scope.'/growth';
        if($method==='GET'&&$path===$base.'/metrics')self::out(self::metrics($db,$scope,$owner));
        if($method==='POST')SecurityShield::rate($db,'growth_write_'.$scope,$owner,90,3600);
        if($method==='GET'&&$scope==='admin'&&$path===$base.'/inbox'){
            $cursor=$_GET['cursor']??null;if($cursor!==null&&!is_string($cursor))self::fail('Cursor inválido.');self::out(self::inbox($db,$cursor));
        }
        if(preg_match('~^'.preg_quote($base,'~').'/thread/(agr_[a-f0-9]{32})$~D',$path,$m)){
            if($method==='GET')self::out(self::thread($db,$scope,$owner,$m[1]));
            if($method==='POST')self::out(self::thread($db,$scope,$owner,$m[1],self::str($body,'message',1000)));
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
        if($method==='POST'&&$path===$base.'/edit')self::out(self::edit($db,$scope,$owner,self::str($body,'id',80),$body));
        if($method==='POST'&&$path===$base.'/action')self::out(self::transition($db,$scope,$owner,self::str($body,'id',80),self::str($body,'action',30),self::str($body,'revision',64)));
        self::fail('Rota não encontrada.',404);
    }
}
