<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Finance control plane: no transfer, refund, QR creation or wallet mutation.
 * Financial exports use the existing append-only ledger, and each account
 * scope comes solely from the authenticated portal/API, never from query params.
 */
final class FinanceOperations {
    private static function fail(string $msg,int $status=422):never{throw new ApiError($msg,$status);}
    private static function out(array $payload):never{
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        echo json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;
    }
    private static function dates(?array $query=null):array{
        $q=$query??$_GET;
        $today=new \DateTimeImmutable('today',new \DateTimeZone('UTC'));
        $from=$q['from']??$today->modify('-29 days')->format('Y-m-d');
        $to=$q['to']??$today->format('Y-m-d');
        if(!is_string($from)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$from)||
           !is_string($to)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$to))
            self::fail('Informe datas no formato AAAA-MM-DD',422);
        $tz=new \DateTimeZone('UTC');
        $a=\DateTimeImmutable::createFromFormat('!Y-m-d',$from,$tz);
        $b=\DateTimeImmutable::createFromFormat('!Y-m-d',$to,$tz);
        if(!$a||!$b||$a->format('Y-m-d')!==$from||$b->format('Y-m-d')!==$to||
           $a>$b||$a->diff($b)->days>365||$b>$today)
            self::fail('Selecione um intervalo válido de até 366 dias, sem datas futuras.',422);
        return [$from,$to,$a->format('Y-m-d 00:00:00'),$b->modify('+1 day')->format('Y-m-d 00:00:00')];
    }
    private static function money(int $cents):string{
        $negative=$cents<0?'-':'';
        $abs=abs($cents);
        return $negative.intdiv($abs,100).','.str_pad((string)($abs%100),2,'0',STR_PAD_LEFT);
    }
    private static function cell(mixed $v):string{
        $s=(string)$v;
        // Protect Excel and LibreOffice CSV formula evaluation.
        if(preg_match('/^[\s\x00-\x1F]*[=+\-@\t\r]/u',$s))return "'".$s;
        return $s;
    }
    /** Underlying rows in strict tenant scope; max 10,000 transactions per export. */
    public static function csv(Database $db,?string $accountId=null,?array $query=null):string{
        MerchantWallet::install($db);
        [$from,$to,$start,$end]=self::dates($query);
        if($accountId!==null&&!preg_match('/^[a-f0-9]{32}$/D',$accountId))
            self::fail('Conta inválida',403);
        $scope=$accountId===null?'':' AND l.account_id=?';
        $args=$accountId===null?[$start,$end]:[$start,$end,$accountId];
        $events=$db->all('SELECT l.id,l.account_id,l.operation_kind,l.operation_id,
            l.delta_available,l.delta_held,l.delta_debt,l.service_fee_cents,l.created_at
            FROM argus_seller_ledger l
            WHERE l.created_at>=? AND l.created_at<?'.$scope.'
            ORDER BY l.created_at ASC,l.id ASC LIMIT 10001',$args);
        if(count($events)>10000)
            self::fail('Extrato muito grande. Reduza o período e tente novamente.',422);
        $file=fopen('php://temp/maxmemory:1048576','w+');
        if(!$file)self::fail('Não foi possível gerar o extrato',503);
        fwrite($file,"\xEF\xBB\xBF");
        fputcsv($file,['Data/hora (UTC)','Conta ID','Tipo de evento','Operação ID',
            'Variação disponível (R$)','Variação reservada (R$)',
            'Variação ajuste (R$)','Taxa de serviço (R$)','Evento ID'],';','"', '');
        foreach($events as $event){
            fputcsv($file,[
                self::cell($event['created_at']),self::cell($event['account_id']),
                self::cell($event['operation_kind']),self::cell($event['operation_id']),
                self::money((int)$event['delta_available']),
                self::money((int)$event['delta_held']),
                self::money((int)$event['delta_debt']),
                self::money((int)$event['service_fee_cents']),
                self::cell($event['id'])
            ],';','"', '');
        }
        rewind($file);$csv=stream_get_contents($file);fclose($file);
        if(!is_string($csv))self::fail('Falha ao finalizar extrato',503);
        return $csv;
    }
    public static function download(Database $db,?string $accountId=null):never{
        [$from,$to]=self::dates();
        $csv=self::csv($db,$accountId);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="argus-extrato-'.$from.'-a-'.$to.'.csv"');
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo $csv;exit;
    }
    /** Diagnostic sums include all historical ledger deltas, never sales guesses. */
    public static function health(Database $db):array{
        MerchantWallet::install($db);
        $balances=$db->all('SELECT w.account_id,w.available_cents,w.held_cents,w.debt_cents,
            a.display_name,a.status AS account_status,
            COALESCE(SUM(l.delta_available),0) AS book_available,
            COALESCE(SUM(l.delta_held),0) AS book_held,
            COALESCE(SUM(l.delta_debt),0) AS book_debt
            FROM argus_seller_wallets w
            LEFT JOIN argus_seller_ledger l ON l.account_id=w.account_id
            LEFT JOIN argus_portal_accounts a ON a.id=w.account_id
            GROUP BY w.account_id,w.available_cents,w.held_cents,w.debt_cents,a.display_name,a.status
            ORDER BY w.account_id');
        $mismatch=[];$debt=[];$negative=[];
        foreach($balances as $w){
            $id=(string)$w['account_id'];
            $label=(string)($w['display_name']?:'Revendedor');
            $notBalanced=((int)$w['available_cents']!==(int)$w['book_available'])||
                ((int)$w['held_cents']!==(int)$w['book_held'])||
                ((int)$w['debt_cents']!==(int)$w['book_debt']);
            if($notBalanced)$mismatch[]=['account_id'=>$id,'name'=>$label,
                'available_delta_cents'=>(int)$w['available_cents']-(int)$w['book_available'],
                'held_delta_cents'=>(int)$w['held_cents']-(int)$w['book_held'],
                'debt_delta_cents'=>(int)$w['debt_cents']-(int)$w['book_debt']];
            if((int)$w['debt_cents']>0)$debt[]=['account_id'=>$id,'name'=>$label,'debt_cents'=>(int)$w['debt_cents']];
            if((int)$w['available_cents']<0||(int)$w['held_cents']<0||(int)$w['debt_cents']<0)
                $negative[]=['account_id'=>$id,'name'=>$label];
        }
        $late=gmdate('Y-m-d H:i:s',time()-1800);
        $stale=gmdate('Y-m-d H:i:s',time()-600);
        $unknownCharges=$db->all("SELECT id,account_id,created_at FROM argus_seller_charges
            WHERE status='unknown' AND created_at<? ORDER BY created_at LIMIT 30",[$late]);
        $oldCharges=$db->all("SELECT id,account_id,created_at FROM argus_seller_charges
            WHERE status='pending' AND created_at<? ORDER BY created_at LIMIT 30",[$late]);
        $uncertainPayouts=$db->all("SELECT id,account_id,status,created_at
            FROM argus_seller_withdrawals
            WHERE status IN ('unknown','processing') AND created_at<?
            ORDER BY created_at LIMIT 30",[$stale]);
        $heldPayouts=$db->all("SELECT id,account_id,status,created_at
            FROM argus_seller_withdrawals
            WHERE status IN ('requested','queued','pending') AND created_at<?
            ORDER BY created_at LIMIT 30",[$late]);
        $worker=getenv('ARGUS_NOTIFICATIONS_WORKER_ENABLED')==='yes';
        $custody=getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')==='yes'&&
             getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')==='yes';
        return [
            'read_only'=>true,'as_of_utc'=>gmdate('c'),'basis'=>'seller_ledger_and_operation_status',
            'wallets_checked'=>count($balances),
            'ledger_mismatches'=>$mismatch,'wallet_debts'=>$debt,
            'negative_wallets'=>$negative,
            'unknown_charges'=>$unknownCharges,'old_pending_charges'=>$oldCharges,
            'uncertain_withdrawals'=>$uncertainPayouts,'stale_withdrawals'=>$heldPayouts,
            'settings'=>[
                'database_persistent'=>in_array($db->driver(),['pgsql','mysql'],true),
                'database_shared'=>filter_var((string)(getenv('ARGUS_PGSQL_SHARED')?:'false'),FILTER_VALIDATE_BOOLEAN),
                'custody_configuration_confirmed'=>$custody,
                'payouts_enabled'=>getenv('ARGUS_PAYOUTS_ENABLED')==='yes'&&$custody,
                'background_reconciliation_configured'=>$worker,
                'email_delivery_configured'=>
                   strlen((string)getenv('ARGUS_RESET_RESEND_KEY'))>=15&&
                   filter_var((string)getenv('ARGUS_RESET_FROM_EMAIL'),FILTER_VALIDATE_EMAIL)!==false
            ],
            'warning'=>'Diagnóstico local: não certifica saldos do PSP, liquidação, antifraude ou conformidade regulatória.'
        ];
    }
    public static function admin(Database $db,string $method,string $path):never{
        if($method==='GET'&&$path==='/api/admin/merchant-wallet/health')
            self::out(self::health($db));
        if($method==='GET'&&$path==='/api/admin/merchant-wallet/export.csv'){
            $accountId=$_GET['account_id']??null;
            if($accountId!==null&&(!is_string($accountId)||!preg_match('/^[a-f0-9]{32}$/D',$accountId)))
                self::fail('Identificador de revendedor inválido',422);
            self::download($db,$accountId);
        }
        self::fail('Função financeira de auditoria não encontrada',404);
    }
}
