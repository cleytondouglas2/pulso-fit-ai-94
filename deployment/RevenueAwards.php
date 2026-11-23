<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * ARGUS sales achievements. Read-only money: only PSP-confirmed deposit ledger
 * events, minus refund events, are used. Never use wallet balance or charge creation.
 * Public identities and amounts require an explicit seller opt-in.
 */
final class RevenueAwards {
    private const ZONE='America/Sao_Paulo';
    private const GOALS=[1000000,2000000,5000000,10000000,50000000,100000000];
    private static function out(array $data):never {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_awards_public_consent (
          account_id VARCHAR(64) PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 0,
          updated_at VARCHAR(32) NOT NULL
        )");
    }
    private static function consents(Database $db):array {
        self::install($db);
        $map=[];
        foreach($db->all('SELECT account_id,enabled FROM argus_awards_public_consent') as $row)
            $map[(string)$row['account_id']]=(int)$row['enabled']===1;
        return $map;
    }
    private static function lifetime(Database $db):array {
        MerchantWallet::install($db);
        // Each settlement/refund journal entry is counted once. Payouts excluded.
        $rows=$db->all("SELECT l.account_id,
          SUM(CASE WHEN l.operation_kind='deposit_paid' THEN c.amount_cents
                   ELSE -c.amount_cents END) AS gross_cents,
          SUM(CASE WHEN l.operation_kind='deposit_paid' THEN 1 ELSE 0 END) AS paid_count,
          SUM(CASE WHEN l.operation_kind='deposit_refund' THEN 1 ELSE 0 END) AS refund_count
          FROM argus_seller_ledger l
          JOIN argus_seller_charges c
            ON c.id=l.operation_id AND c.account_id=l.account_id
          WHERE l.operation_kind IN ('deposit_paid','deposit_refund')
          GROUP BY l.account_id");
        $result=[];
        foreach($rows as $row)$result[(string)$row['account_id']]=[
            'gross_cents'=>max(0,(int)$row['gross_cents']),
            'paid_count'=>(int)$row['paid_count'],
            'refund_count'=>(int)$row['refund_count']
        ];
        return $result;
    }
    private static function plaques(int $sales):array {
        $list=[];
        foreach(self::GOALS as $goal){
            $list[]=['threshold_cents'=>$goal,'earned'=>$sales >= $goal,
                'remaining_cents'=>max(0,$goal-$sales),
                'progress'=>min(100,round(100*$sales/$goal,1))];
        }
        return $list;
    }
    private static function details(array $account,array $life,bool $consent):array {
        $period=$account['month'];
        $gross=max(0,(int)$period['gross_cents']);
        $count=(int)$period['paid_count'];
        $total=(int)($life['gross_cents']??0);
        $next=null;
        foreach(self::GOALS as $goal){if($total<$goal){$next=$goal;break;}}
        return [
          'account_id'=>(string)$account['account_id'],
          'display_name'=>(string)$account['display_name'],
          'monthly_gross_cents'=>$gross,
          'monthly_net_cents'=>(int)$period['net_cents'],
          'monthly_refunds'=>(int)$period['refund_count'],
          'monthly_count'=>$count,
          'ticket_cents'=>$count>0?(int)round($gross/$count):0,
          'previous_month_cents'=>(int)$account['previous_month']['gross_cents'],
          'lifetime_gross_cents'=>$total,
          'lifetime_paid_count'=>(int)($life['paid_count']??0),
          'lifetime_refunds'=>(int)($life['refund_count']??0),
          'current_goal_cents'=>$next,
          'remaining_cents'=>$next===null?0:max(0,$next-$total),
          'plaques'=>self::plaques($total),
          'public_opt_in'=>$consent
        ];
    }
    private static function ranked(Database $db):array {
        $data=RevenueReport::build($db);
        $all=self::lifetime($db);
        $consent=self::consents($db);
        $rows=[];
        foreach($data['sellers'] as $row){
            $id=(string)$row['account_id'];
            // Omit non-operational accounts and non-positive volume from rankings.
            if(!in_array((string)$row['status'],['active','approved','identity_verified','verified','financial_authorized'],true)
                && (int)$row['month']['gross_cents']<=0)continue;
            $detail=self::details($row,$all[$id]??[],(bool)($consent[$id]??false));
            if($detail['monthly_gross_cents']<=0)continue;
            $rows[]=$detail;
        }
        usort($rows,static fn($a,$b)=>($b['monthly_gross_cents']<=>$a['monthly_gross_cents'])
            ?:($b['monthly_count']<=>$a['monthly_count']) ?:strcmp($a['account_id'],$b['account_id']));
        foreach($rows as $idx=>&$r)$r['rank']=$idx+1;
        unset($r);
        return [$data,$rows,$all,$consent];
    }
    private static function timeline(Database $db,string $accountId):array {
        $zone=new \DateTimeZone(self::ZONE);
        $now=new \DateTimeImmutable('now',$zone);
        $start=$now->modify('first day of this month')->setTime(0,0)->modify('-11 months');
        $first=$start->format('Y-m');
        $points=[];
        for($i=0;$i<12;$i++){
            $month=$start->modify("+$i months")->format('Y-m');
            $points[$month]=['month'=>$month,'gross_cents'=>0,'sales'=>0];
        }
        $events=$db->all("SELECT l.operation_kind,l.created_at,c.amount_cents
          FROM argus_seller_ledger l JOIN argus_seller_charges c
            ON c.id=l.operation_id AND c.account_id=l.account_id
          WHERE l.account_id=? AND l.operation_kind IN ('deposit_paid','deposit_refund')
            AND l.created_at>=? ORDER BY l.created_at",[
                $accountId,$start->setTimezone(new \DateTimeZone('UTC'))->modify('-1 day')->format('Y-m-d')
            ]);
        foreach($events as $e){
            try{$time=(new \DateTimeImmutable((string)$e['created_at'],new \DateTimeZone('UTC')))->setTimezone($zone);}
            catch(\Throwable){continue;}
            if($time>$now)continue;
            $month=$time->format('Y-m');
            if(!isset($points[$month]))continue;
            $sign=$e['operation_kind']==='deposit_paid'?1:-1;
            $points[$month]['gross_cents']+=$sign*(int)$e['amount_cents'];
            if($sign===1)$points[$month]['sales']++;
        }
        return array_values($points);
    }
    public static function admin(Database $db,string $selected=''):array {
        [$data,$rows,$lifetime,$consent]=self::ranked($db);
        $list=[];
        foreach($data['sellers'] as $row){
            $id=(string)$row['account_id'];
            $entry=self::details($row,$lifetime[$id]??[],(bool)($consent[$id]??false));
            $entry['rank']=null;
            foreach($rows as $ranking)if($ranking['account_id']===$id){$entry['rank']=$ranking['rank'];break;}
            $list[]=$entry;
        }
        $chosen=$selected!==''?$selected:($rows[0]['account_id']??($list[0]['account_id']??''));
        $found=false;
        foreach($list as $r)if($r['account_id']===$chosen)$found=true;
        if(!$found)$chosen=$rows[0]['account_id']??($list[0]['account_id']??'');
        return ['basis'=>'confirmed_pix_ledger','timezone'=>self::ZONE,'period'=>'current_month',
            'as_of'=>$data['as_of'],'summary'=>$data['periods']['month'],
            'ranking'=>array_slice($rows,0,5),'sellers'=>$list,
            'selected_id'=>$chosen,
            'monthly'=> $chosen!==''?self::timeline($db,$chosen):[]];
    }
    public static function seller(Database $db,string $accountId):array {
        [$data,$rows,$lifetime,$consent]=self::ranked($db);
        $my=null;
        foreach($data['sellers'] as $r)if((string)$r['account_id']===$accountId){
            $my=self::details($r,$lifetime[$accountId]??[],(bool)($consent[$accountId]??false));
            break;
        }
        if(!$my)throw new ApiError('Conta não encontrada para consulta de faturamento',404);
        $my['rank']=null;
        foreach($rows as $r)if($r['account_id']===$accountId){$my['rank']=$r['rank'];break;}
        // The private leaderboard names are shown only to opted-in participants.
        $top=array_map(static function($r)use($accountId){
            if(!$r['public_opt_in']&&$r['account_id']!==$accountId)
                $r['display_name']='Revendedor '.(string)$r['rank'];
            unset($r['account_id'],$r['public_opt_in']);
            return $r;
        },array_slice($rows,0,5));
        return ['basis'=>'confirmed_pix_ledger','timezone'=>self::ZONE,
            'period'=>'current_month','as_of'=>$data['as_of'],
            'ranking'=>$top,'self'=>$my,'monthly'=>self::timeline($db,$accountId)];
    }
    public static function publicRanking(Database $db):array {
        [$data,$rows]=self::ranked($db);
        $public=[];
        foreach($rows as $row)if($row['public_opt_in']){
            // Only consenting participants' public name and settled monthly metrics.
            $public[]=['rank'=>count($public)+1,'display_name'=>$row['display_name'],
                'monthly_gross_cents'=>$row['monthly_gross_cents'],
                'monthly_count'=>$row['monthly_count'],'ticket_cents'=>$row['ticket_cents']];
        }
        return ['basis'=>'confirmed_pix_ledger','period'=>'current_month','timezone'=>self::ZONE,
            'as_of'=>$data['as_of'],'ranking'=>array_slice($public,0,5),
            'consent_required'=>true];
    }
    public static function visibility(Database $db,string $accountId,array $body):array {
        $val=$body['enabled']??null;
        if(!is_bool($val))throw new ApiError('Informe ativado ou desativado',422);
        SecurityShield::rate($db,'awards_visibility',$accountId,12,3600);
        self::install($db);
        $db->transaction(static function(Database $db)use($accountId,$val){
            $db->run('DELETE FROM argus_awards_public_consent WHERE account_id=?',[$accountId]);
            $db->run('INSERT INTO argus_awards_public_consent(account_id,enabled,updated_at) VALUES(?,?,?)',[
                $accountId,$val?1:0,Database::stamp()
            ]);
        });
        return ['ok'=>true,'public_opt_in'=>$val,
            'message'=>$val?'Participação pública ativada.':'Participação pública desativada.'];
    }
    public static function respond(array $data):never {self::out($data);}
}
