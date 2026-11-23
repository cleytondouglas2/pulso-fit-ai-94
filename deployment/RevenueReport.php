<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Read-only revenue: exclusively journalled, PSP-confirmed Pix settlements.
 * Reversals are recognized on the reversal day. Wallet balances and withdrawals
 * are never presented as sales. All dates are compared in São Paulo local time.
 */
final class RevenueReport {
    private const ZONE='America/Sao_Paulo';
    private static function blank():array {
        return ['gross_cents'=>0,'net_cents'=>0,'paid_gross_cents'=>0,'paid_count'=>0,'refund_count'=>0];
    }
    private static function apply(array &$bucket,int $gross,int $net,string $kind,int $count):void {
        $sign=$kind==='deposit_refund'?-1:1;
        $bucket['gross_cents']+=$sign*$gross;
        $bucket['net_cents']+=$sign*$net;
        if($sign===1)$bucket['paid_gross_cents']+=$gross;
        $bucket[$sign===1?'paid_count':'refund_count']+=$count;
    }
    private static function change(array $current,array $baseline):array {
        $delta=$current['gross_cents']-$baseline['gross_cents'];
        $base=$baseline['gross_cents'];
        return ['delta_cents'=>$delta,
            'direction'=>$delta===0?'stable':($delta>0?'up':'down'),
            'percent'=>$base>0?round(100*$delta/$base,1):null,
            'no_baseline'=>$base<=0];
    }
    private static function seed():array {
        return ['today'=>self::blank(),'yesterday'=>self::blank(),
            'month'=>self::blank(),'previous_month'=>self::blank(),
            'today_benchmark'=>self::blank(),'month_benchmark'=>self::blank()];
    }
    private static function fill(array &$periods,\DateTimeImmutable $time,
                                 int $gross,int $net,string $kind,int $count,
                                 array $limits):void {
        foreach($limits as $name=>[$start,$end]){
            if($time >= $start && $time < $end)
                self::apply($periods[$name],$gross,$net,$kind,$count);
        }
    }
    public static function build(Database $db,?string $accountId=null,?\DateTimeImmutable $clock=null):array {
        $zone=new \DateTimeZone(self::ZONE);
        $utc=new \DateTimeZone('UTC');
        $now=($clock??new \DateTimeImmutable('now',$zone))->setTimezone($zone);
        $today=$now->setTime(0,0,0);
        $yesterday=$today->modify('-1 day');
        $month=$today->modify('first day of this month');
        $prevMonth=$month->modify('-1 month');
        $monthEnd=$month->modify('+1 month');
        $elapsedDay=$now->getTimestamp()-$today->getTimestamp();
        $elapsedMonth=$now->getTimestamp()-$month->getTimestamp();
        $sameTimeYesterday=$yesterday->setTimestamp($yesterday->getTimestamp()+$elapsedDay);
        $monthBenchmarkEnd=$prevMonth->setTimestamp(min(
            $prevMonth->getTimestamp()+$elapsedMonth,$month->getTimestamp()));
        $limits=[
          'today'=>[$today,$now->modify('+1 second')],
          'yesterday'=>[$yesterday,$today],
          'month'=>[$month,$now->modify('+1 second')],
          'previous_month'=>[$prevMonth,$month],
          'today_benchmark'=>[$yesterday,$sameTimeYesterday],
          'month_benchmark'=>[$prevMonth,$monthBenchmarkEnd]
        ];
        // Use ledger event timestamps (immutable settlement/refund moments), never
        // charge creation time or its mutable last-check timestamp.
        MerchantWallet::install($db);
        Portal::install($db);
        $where=$accountId===null?'':' AND l.account_id=?';
        $since=$prevMonth->setTimezone($utc)->modify('-1 day')->format('Y-m-d');
        $args=$accountId===null?[$since]:[$since,$accountId];
        $events=$db->all("SELECT l.account_id,l.operation_kind,l.created_at,
                        c.amount_cents,c.net_cents
                    FROM argus_seller_ledger l
                    JOIN argus_seller_charges c
                      ON c.id=l.operation_id AND c.account_id=l.account_id
                    WHERE l.operation_kind IN ('deposit_paid','deposit_refund')
                      AND l.created_at >= ?".$where." ORDER BY l.created_at", $args);
        $periods=self::seed();
        $daily=[];
        $sellerPeriods=[];
        $graphStart=$today->modify('-13 days');
        for($d=$graphStart;$d<=$today;$d=$d->modify('+1 day'))
            $daily[$d->format('Y-m-d')]=self::blank();
        foreach($events as $event){
            try{$time=(new \DateTimeImmutable((string)$event['created_at'],$utc))->setTimezone($zone);}
            catch(\Throwable){continue;}
            if($time>$now->modify('+1 second'))continue;
            $kind=(string)$event['operation_kind'];
            $gross=(int)$event['amount_cents'];$net=(int)$event['net_cents'];
            if($gross<0||$net<0)continue;
            $seller=(string)$event['account_id'];
            self::fill($periods,$time,$gross,$net,$kind,1,$limits);
            if($accountId===null){
                if(!isset($sellerPeriods[$seller]))$sellerPeriods[$seller]=self::seed();
                self::fill($sellerPeriods[$seller],$time,$gross,$net,$kind,1,$limits);
            }
            $date=$time->format('Y-m-d');
            if(isset($daily[$date]))self::apply($daily[$date],$gross,$net,$kind,1);
        }
        $rows=[];
        if($accountId===null){
            $accounts=$db->all('SELECT id,display_name,account_type,status
                FROM argus_portal_accounts ORDER BY display_name');
            foreach($accounts as $account){
                $p=$sellerPeriods[(string)$account['id']]??self::seed();
                $rows[]=['account_id'=>$account['id'],
                    'display_name'=>$account['display_name'],
                    'account_type'=>$account['account_type'],
                    'status'=>$account['status'],
                    'today'=>$p['today'],
                    'yesterday'=>$p['yesterday'],
                    'month'=>$p['month'],
                    'previous_month'=>$p['previous_month'],
                    'comparison_today'=>self::change($p['today'],$p['today_benchmark']),
                    'comparison_month'=>self::change($p['month'],$p['month_benchmark'])];
            }
            usort($rows,static function(array $a,array $b):int {
                return ($b['month']['gross_cents'] <=> $a['month']['gross_cents'])
                    ?:strcmp((string)$a['display_name'],(string)$b['display_name']);
            });
        }
        $points=[];
        foreach($daily as $date=>$bucket)$points[]=array_merge(['date'=>$date],$bucket);
        return [
            'currency'=>'BRL','timezone'=>self::ZONE,'as_of'=>$now->format(\DateTimeInterface::ATOM),
            'basis'=>'confirmed_pix_ledger','refund_policy'=>'reversal_day',
            'periods'=>$periods,
            'comparison_today'=>self::change($periods['today'],$periods['today_benchmark']),
            'comparison_month'=>self::change($periods['month'],$periods['month_benchmark']),
            'daily'=>$points,
            'sellers'=>$accountId===null?$rows:[]
        ];
    }
}
