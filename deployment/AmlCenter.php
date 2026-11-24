<?php
declare(strict_types=1);
namespace ArgusPayments;
/** Internal review only. No PSP calls, freezes, payout changes or regulatory submissions. */
final class AmlCenter {
    private const RULE_VERSION='pilot-1';
    public static function install(Database $db):void {
        $pdo=$db->pdo();
        $pdo->exec("CREATE TABLE IF NOT EXISTS argus_aml_profiles (
            account_id VARCHAR(80) PRIMARY KEY, expected_monthly_cents BIGINT NOT NULL,
            risk VARCHAR(12) NOT NULL, pep VARCHAR(24) NOT NULL, sanctions VARCHAR(24) NOT NULL,
            beneficial_owner VARCHAR(24) NOT NULL, evidence_ref VARCHAR(180) NOT NULL,
            reviewer_id VARCHAR(80) NOT NULL, reviewed_at VARCHAR(32) NOT NULL, revision VARCHAR(64) NOT NULL)");
        // Existing pilot databases can be upgraded only by the explicit migration.
        if($db->driver()==='pgsql'){
            $pdo->exec("ALTER TABLE argus_aml_profiles ADD COLUMN IF NOT EXISTS revision VARCHAR(64) NOT NULL DEFAULT ''");
        }elseif($db->driver()==='sqlite'){
            $cols=$pdo->query('PRAGMA table_info(argus_aml_profiles)')->fetchAll(\PDO::FETCH_ASSOC);
            if(!in_array('revision',array_column($cols,'name'),true))$pdo->exec("ALTER TABLE argus_aml_profiles ADD COLUMN revision VARCHAR(64) NOT NULL DEFAULT ''");
        }else throw new \RuntimeException('Unsupported AML database');
        foreach($db->all("SELECT account_id FROM argus_aml_profiles WHERE revision=''") as $row)
            $db->run("UPDATE argus_aml_profiles SET revision=? WHERE account_id=? AND revision='' ",[bin2hex(random_bytes(32)),$row['account_id']]);
        $pdo->exec("CREATE TABLE IF NOT EXISTS argus_aml_cases (
            id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(80) NOT NULL, rule_code VARCHAR(48) NOT NULL,
            rule_version VARCHAR(24) NOT NULL, period_key VARCHAR(10) NOT NULL, severity VARCHAR(12) NOT NULL,
            evidence_json TEXT NOT NULL, state VARCHAR(24) NOT NULL, created_at VARCHAR(32) NOT NULL,
            updated_at VARCHAR(32) NOT NULL)");
        $pdo->exec("CREATE TABLE IF NOT EXISTS argus_aml_events (
            id VARCHAR(64) PRIMARY KEY, subject_id VARCHAR(80) NOT NULL, subject_type VARCHAR(12) NOT NULL,
            actor_id VARCHAR(80) NOT NULL, action VARCHAR(32) NOT NULL, details_json TEXT NOT NULL,
            created_at VARCHAR(32) NOT NULL)");
        $pdo->exec('CREATE INDEX IF NOT EXISTS argus_aml_case_state_idx ON argus_aml_cases(state,created_at)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS argus_aml_event_subject_idx ON argus_aml_events(subject_type,subject_id,created_at)');
    }
    private static function fail(string $message,int $status=422):never {throw new ApiError($message,$status);}
    private static function ident(mixed $v):string {
        if(!is_string($v)||!preg_match('/^[A-Za-z0-9_-]{1,80}$/D',$v))self::fail('Identificador inválido.');
        return $v;
    }
    private static function choice(mixed $v,array $options):string {
        if(!is_string($v)||!in_array($v,$options,true))self::fail('Opção inválida.');
        return $v;
    }
    private static function evidence(mixed $v):string {
        // Reference to a restricted evidence repository, never raw names, CPF, credentials or uploads.
        if(!is_string($v)||!preg_match('/^[A-Za-z0-9_.:-]{3,180}$/D',$v))self::fail('Informe uma referência interna de evidência válida.');
        return $v;
    }
    private static function event(Database $db,string $id,string $type,string $actor,string $action,array $details):void {
        $db->run('INSERT INTO argus_aml_events(id,subject_id,subject_type,actor_id,action,details_json,created_at) VALUES (?,?,?,?,?,?,?)',
            [bin2hex(random_bytes(32)),$id,$type,$actor,$action,Compliance::encodeJson($details),gmdate('c')]);
    }
    public static function profile(Database $db,array $actor,array $body):array {
        Compliance::authorize($actor);
        $account=self::ident($body['account_id']??null);
        if(!$db->one('SELECT id FROM argus_portal_accounts WHERE id=?',[$account]))self::fail('Conta inexistente.',404);
        $monthly=$body['expected_monthly_cents']??null;
        if(!is_int($monthly)||$monthly<0||$monthly>100000000000)self::fail('Perfil financeiro inválido.');
        $risk=self::choice($body['risk']??null,['unknown','low','medium','high']);
        $pep=self::choice($body['pep']??null,['pending','no_match_reviewed','potential_match','confirmed']);
        $sanctions=self::choice($body['sanctions']??null,['pending','no_match_reviewed','potential_match','confirmed']);
        $beneficial=self::choice($body['beneficial_owner']??null,['pending','reviewed','not_applicable']);
        $ref=self::evidence($body['evidence_ref']??null);$who=self::ident($actor['id']??null);$at=gmdate('c');
        $expected=$body['expected_revision']??null;
        if(!is_string($expected)||($expected!=='new'&&!preg_match('/^[a-f0-9]{64}$/D',$expected)))self::fail('Carregue o perfil atual antes de editar.',409);
        $p=['account_id'=>$account,'expected_monthly_cents'=>$monthly,'risk'=>$risk,'pep'=>$pep,'sanctions'=>$sanctions,'beneficial_owner'=>$beneficial,'evidence_ref'=>$ref,'reviewer_id'=>$who,'reviewed_at'=>$at,'revision'=>bin2hex(random_bytes(32))];
        $db->transaction(function(Database $db)use($p,$account,$who,$expected){
            $previous=$db->one('SELECT * FROM argus_aml_profiles WHERE account_id=?',[$account]);
            if($expected==='new'){
                $statement=$db->pdo()->prepare('INSERT INTO argus_aml_profiles(account_id,expected_monthly_cents,risk,pep,sanctions,beneficial_owner,evidence_ref,reviewer_id,reviewed_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO NOTHING');
                $statement->execute(array_values($p));
            }else{
                if(!$previous||!hash_equals((string)$previous['revision'],$expected))self::fail('Perfil alterado por outro analista. Recarregue.',409);
                $statement=$db->pdo()->prepare('UPDATE argus_aml_profiles SET expected_monthly_cents=?,risk=?,pep=?,sanctions=?,beneficial_owner=?,evidence_ref=?,reviewer_id=?,reviewed_at=?,revision=? WHERE account_id=? AND revision=?');
                $statement->execute(array_merge(array_slice(array_values($p),1),[$account,$expected]));
            }
            if($statement->rowCount()!==1)self::fail('Perfil alterado por outro analista. Recarregue.',409);
            self::event($db,$account,'profile',$who,'profile_reviewed',['previous'=>$previous?:null,'current'=>$p]);
        });
        return $p;
    }
    public static function getProfile(Database $db,array $actor,string $account):array {
        Compliance::authorize($actor);self::ident($account);
        if(!$db->one('SELECT id FROM argus_portal_accounts WHERE id=?',[$account]))self::fail('Conta inexistente.',404);
        $row=$db->one('SELECT * FROM argus_aml_profiles WHERE account_id=?',[$account]);
        return ['account_id'=>$account,'profile'=>$row?:null,'revision'=>$row?(string)$row['revision']:'new'];
    }
    /** Pilot criteria are internal, not legal thresholds. Never a finding of crime. */
    public static function signals(array $metrics,?array $profile):array {
        $out=[];
        $count=(int)($metrics['deposit_count']??0);
        $total=(int)($metrics['deposit_cents']??0);
        $withdraw=(int)($metrics['withdraw_cents']??0);
        if($count>=10&&$total>=100000&&($metrics['similar_count']??0)>=8)$out['repeated_similar_credits']='medium';
        if($count>=5&&$total>=100000&&$withdraw>=($total*0.9))$out['high_in_out_ratio']='medium';
        if((int)($metrics['payout_review_count']??0)>=2)$out['repeated_payout_review']='high';
        if($profile){
            $monthly=(int)$profile['expected_monthly_cents'];
            if($monthly>0&&(int)($metrics['month_cents']??0)>$monthly*2)$out['profile_volume_deviation']='high';
            if($profile['sanctions']==='potential_match'||$profile['sanctions']==='confirmed')$out['sanctions_manual_review']='high';
            if($profile['pep']==='potential_match'||$profile['pep']==='confirmed')$out['pep_due_diligence']='medium';
            if($profile['risk']==='high')$out['high_risk_profile']='medium';
        }
        return $out;
    }
    private static function period(string $day):array {
        $d=\DateTimeImmutable::createFromFormat('!Y-m-d',$day,new \DateTimeZone('UTC'));
        if(!$d||$d->format('Y-m-d')!==$day||$day>gmdate('Y-m-d')||$day<gmdate('Y-m-d',time()-31*86400))self::fail('Período inválido.');
        return [$day.' 00:00:00',$d->modify('+1 day')->format('Y-m-d').' 00:00:00',$d->format('Y-m-01').' 00:00:00'];
    }
    public static function scanAccount(Database $db,string $id,string $day,string $scope='seller'):int {
        self::ident($id);[$start,$end,$month]=self::period($day);
        if(!in_array($scope,['seller','admin'],true))self::fail('Escopo inválido.');
        // Identifiers come exclusively from these constant pairs.
        [$creditTable,$withdrawTable,$ownerColumn]=$scope==='admin'?['admin_quick_pix','admin_payouts','actor_id']:['argus_seller_charges','argus_seller_withdrawals','account_id'];
        $credits=$db->one("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS total FROM $creditTable WHERE $ownerColumn=? AND status='paid' AND created_at>=? AND created_at<?",[$id,$start,$end]);
        $similar=$db->one("SELECT COUNT(*) AS n FROM $creditTable WHERE $ownerColumn=? AND status='paid' AND created_at>=? AND created_at<? GROUP BY amount_cents ORDER BY COUNT(*) DESC LIMIT 1",[$id,$start,$end]);
        $out=$db->one("SELECT COALESCE(SUM(amount_cents),0) AS total FROM $withdrawTable WHERE $ownerColumn=? AND status='paid' AND created_at>=? AND created_at<?",[$id,$start,$end]);
        $monthly=$db->one("SELECT COALESCE(SUM(amount_cents),0) AS total FROM $creditTable WHERE $ownerColumn=? AND status='paid' AND created_at>=? AND created_at<?",[$id,$month,$end]);
        $review=$scope==='seller'?$db->one("SELECT COUNT(*) AS n FROM argus_payout_risk_decisions WHERE account_id=? AND decision IN ('review','approved','rejected') AND created_at>=? AND created_at<?",[$id,$start,$end]):null;
        $profile=$scope==='seller'?$db->one('SELECT * FROM argus_aml_profiles WHERE account_id=?',[$id]):null;
        $subject=$scope==='admin'?'admin:'.$id:$id;
        if(strlen($subject)>80)self::fail('Identificador acima do limite.');
        $metrics=['deposit_count'=>(int)($credits['n']??0),'deposit_cents'=>(int)($credits['total']??0),
          'similar_count'=>(int)($similar['n']??0),'withdraw_cents'=>(int)($out['total']??0),
          'month_cents'=>(int)($monthly['total']??0),'payout_review_count'=>(int)($review['n']??0),'scope'=>$scope];
        $signals=self::signals($metrics,$profile?:null);$added=0;
        foreach($signals as $rule=>$severity){
            $case=hash('sha256',$subject.':'.$day.':'.$rule.':'.self::RULE_VERSION);$at=gmdate('c');
            $db->transaction(function(Database $db)use($case,$subject,$day,$rule,$severity,$metrics,$at,&$added){
                $statement=$db->pdo()->prepare("INSERT INTO argus_aml_cases(id,account_id,rule_code,rule_version,period_key,severity,evidence_json,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'open',?,?) ON CONFLICT(id) DO NOTHING");
                $statement->execute([$case,$subject,$rule,self::RULE_VERSION,$day,$severity,Compliance::encodeJson($metrics),$at,$at]);
                if($statement->rowCount()===1){self::event($db,$case,'case','system','opened',['rule'=>$rule,'period'=>$day]);$added++;}
            });
        }
        return $added;
    }
    public static function scanPage(Database $db,string $day,string $cursor='',string $scope='seller'):array {
        self::period($day);if($cursor!=='')self::ident($cursor);
        if(!in_array($scope,['seller','admin'],true))self::fail('Escopo inválido.');
        if($scope==='admin'){
            [$start,$end]=self::period($day);
            $rows=$db->all("SELECT DISTINCT id FROM (SELECT actor_id AS id FROM admin_quick_pix WHERE created_at>=? AND created_at<? UNION SELECT actor_id AS id FROM admin_payouts WHERE created_at>=? AND created_at<?) a WHERE id>? ORDER BY id LIMIT 51",[$start,$end,$start,$end,$cursor]);
        }else $rows=$db->all('SELECT id FROM argus_portal_accounts WHERE id>? ORDER BY id LIMIT 51',[$cursor]);
        $page=array_slice($rows,0,50);$count=0;
        foreach($page as $a)$count+=self::scanAccount($db,(string)$a['id'],$day,$scope);
        return ['scanned'=>count($page),'created'=>$count,'next_cursor'=>count($rows)>50?(string)$page[count($page)-1]['id']:null,'day'=>$day,'scope'=>$scope];
    }
    public static function decide(Database $db,array $actor,array $body):array {
        Compliance::authorize($actor);$id=self::ident($body['case_id']??null);
        $who=self::ident($actor['id']??null);$ref=self::evidence($body['evidence_ref']??null);
        $state=self::choice($body['state']??null,['investigating','escalated','closed_no_escalation','closed_escalated']);
        $from=self::choice($body['from_state']??null,['open','investigating','escalated']);
        $allowed=['open'=>['investigating'],'investigating'=>['escalated','closed_no_escalation'],'escalated'=>['closed_escalated']];
        if(!in_array($state,$allowed[$from],true))self::fail('Transição inválida.',409);
        $db->transaction(function(Database $db)use($id,$who,$ref,$state,$from){
            $statement=$db->pdo()->prepare('UPDATE argus_aml_cases SET state=?,updated_at=? WHERE id=? AND state=?');
            $statement->execute([$state,gmdate('c'),$id,$from]);
            if($statement->rowCount()!==1)self::fail('Caso inexistente ou atualizado por outro analista.',409);
            self::event($db,$id,'case',$who,'state_changed',['from'=>$from,'to'=>$state,'evidence_ref'=>$ref]);
        });
        return ['case_id'=>$id,'state'=>$state];
    }
    public static function overview(Database $db,array $actor):array {
        Compliance::authorize($actor);
        return ['states'=>$db->all('SELECT state,COUNT(*) AS n FROM argus_aml_cases GROUP BY state'),
          'cases'=>$db->all('SELECT id,account_id,rule_code,period_key,severity,state,created_at,updated_at FROM argus_aml_cases ORDER BY created_at DESC,id DESC LIMIT 100'),
          'profile_counts'=>$db->all('SELECT risk,COUNT(*) AS n FROM argus_aml_profiles GROUP BY risk'),
          'scope'=>'Monitor piloto de revendedores e operações administrativas; consultas PEP/sanções manuais, sem integração externa ou envio ao COAF.'];
    }
    public static function detail(Database $db,array $actor,string $id):array {
        Compliance::authorize($actor);self::ident($id);
        $r=$db->one('SELECT * FROM argus_aml_cases WHERE id=?',[$id]);if(!$r)self::fail('Caso não encontrado.',404);
        return ['case'=>$r,'events'=>$db->all("SELECT actor_id,action,details_json,created_at FROM argus_aml_events WHERE subject_type='case' AND subject_id=? ORDER BY created_at,id LIMIT 200",[$id])];
    }
    public static function handle(Database $db,array $actor,string $method,string $path,array $body):never {
        Compliance::authorize($actor);
        if(getenv('ARGUS_AML_ENABLED')!=='yes')self::fail('Central PLD/FT aguarda migração e habilitação.',503);
        $data=match([$method,$path]){
            ['GET','/api/admin/aml/overview']=>self::overview($db,$actor),
            ['GET','/api/admin/aml/detail']=>self::detail($db,$actor,self::ident($_GET['id']??null)),
            ['GET','/api/admin/aml/profile']=>self::getProfile($db,$actor,self::ident($_GET['id']??null)),
            ['POST','/api/admin/aml/profile']=>self::profile($db,$actor,$body),
            ['POST','/api/admin/aml/decision']=>self::decide($db,$actor,$body),
            ['POST','/api/admin/aml/scan']=>self::scanPage($db,(string)($body['day']??''),is_string($body['cursor']??null)?$body['cursor']:'',self::choice($body['scope']??'seller',['seller','admin'])),
            default=>throw new ApiError('Endpoint indisponível.',404)
        };
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        echo Compliance::encodeJson($data);exit;
    }
}
