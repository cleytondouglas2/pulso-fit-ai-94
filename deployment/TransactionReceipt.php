<?php
declare(strict_types=1);
namespace ArgusPayments;

/** Read-only platform receipts. Status and amounts are taken only from existing
 * authenticated financial records. No receipt can settle, debit or create Pix. */
final class TransactionReceipt {
    private static function fail(string $message,int $status=404):never{throw new ApiError($message,$status);}
    private static function json(array $data):never{
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    private static function valid(string $id):bool{return preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$id)===1;}
    public static function present(string $kind,array $row,?int $fee,?int $net,?string $settledAt,bool $verified,?string $name=null,?string $document=null):array{
        $status=(string)($row['status']??'unknown');
        $confirmed=$status==='paid'&&$verified;
        $statusLabel=match($status){
            'paid'=>$confirmed?'Pagamento confirmado':'Registro em verificação',
            'refunded'=>'Devolvido','partially_refunded'=>'Devolução parcial em análise',
            'failed'=>'Não concluído','cancelled'=>'Cancelado','rejected'=>'Recusado',
            'review'=>'Em análise','requested'=>'Solicitado','queued'=>'Em fila',
            'processing'=>'Em processamento','pending'=>'Aguardando confirmação',
            'expired'=>'Expirado',default=>'Em verificação'
        };
        $id=(string)$row['id'];
        $doc=$document!==null&&preg_match('/^[0-9]{4}$/D',$document)?'•••• '.$document:null;
        return ['issuer'=>'ArgusPay','kind'=>$kind,'id'=>$id,
            'status'=>$status,'status_label'=>$statusLabel,'confirmed'=>$confirmed,
            'title'=>$confirmed?($kind==='withdrawal'?'Comprovante de saque':'Comprovante de recebimento Pix'):
                ($kind==='withdrawal'?'Registro de solicitação de saque':'Registro de cobrança Pix'),
            'amount_cents'=>(int)$row['amount_cents'],'fee_cents'=>$fee,'net_cents'=>$net,
            'created_at'=>$row['created_at']??null,'checked_at'=>$row['checked_at']??null,
            'settled_at'=>$confirmed?$settledAt:null,'issued_at'=>gmdate('c'),
            'account_name'=>$name,'document_masked'=>$doc,
            'pix_key_masked'=>$kind==='withdrawal'?($row['pix_key_masked']??null):null,
            'pix_key_type'=>$kind==='withdrawal'?($row['pix_key_type']??null):null,
            'description'=>$row['description']??null,
            'end_to_end_id'=>null,
            'notice'=>$confirmed?'Registro emitido pela plataforma ArgusPay, não por instituição bancária. Consulte a operação no painel para verificar o status atualizado.':'Este registro NÃO comprova pagamento ou transferência concluída. Consulte a situação atual da operação no painel.'];
    }
    public static function seller(Database $db,string $accountId,string $id):array{
        if(!self::valid($id))self::fail('Operação não encontrada.');
        $kind=str_starts_with($id,'mww_')?'withdrawal':'deposit';
        if($kind==='withdrawal'){
            $row=$db->one('SELECT id,account_id,amount_cents,service_fee_cents,debit_cents,pix_key_type,pix_key_masked,description,provider_tx_id,status,created_at,checked_at FROM argus_seller_withdrawals WHERE id=? AND account_id=?',[$id,$accountId]);
        }else{
            $row=$db->one('SELECT id,account_id,amount_cents,service_fee_cents,net_cents,description,provider_id,status,created_at,checked_at FROM argus_seller_charges WHERE id=? AND account_id=?',[$id,$accountId]);
        }
        if(!$row)self::fail('Operação não encontrada.');
        $account=$db->one('SELECT display_name,document_last4 FROM argus_portal_accounts WHERE id=?',[$accountId]);
        if(!$account)self::fail('Operação não encontrada.');
        $event=$db->one('SELECT created_at FROM argus_seller_ledger WHERE account_id=? AND operation_id=? AND operation_kind=?',
            [$accountId,$id,$kind==='withdrawal'?'withdraw_paid':'deposit_paid']);
        $fee=(int)$row['service_fee_cents'];
        $net=$kind==='withdrawal'?(int)$row['amount_cents']-$fee:(int)$row['net_cents'];
        return self::present($kind,$row,$fee,$net,$event['created_at']??null,
            (bool)$event&&!empty($row[$kind==='withdrawal'?'provider_tx_id':'provider_id']),
            (string)$account['display_name'],(string)$account['document_last4']);
    }
    public static function admin(Database $db,string $actorId,string $id,string $kind):array{
        if(!self::valid($id)||!in_array($kind,['deposit','withdrawal'],true))self::fail('Operação não encontrada.');
        if($kind==='withdrawal'){
            $row=$db->one('SELECT id,amount_cents,pix_key_type,pix_key_masked,provider_tx_id,status,created_at,checked_at FROM admin_payouts WHERE id=? AND actor_id=?',[$id,$actorId]);
        }else{
            $row=$db->one('SELECT id,amount_cents,description,provider_id,status,created_at,checked_at FROM admin_quick_pix WHERE id=? AND actor_id=?',[$id,$actorId]);
        }
        if(!$row)self::fail('Operação não encontrada.');
        $feeRow=$db->one('SELECT commercial_net_cents,provider_amount_cents,argus_fee_cents,status,finalized_at FROM argus_fee_operations WHERE operation_kind=? AND operation_id=?',
            [$kind==='withdrawal'?'withdraw':'deposit',$id]);
        $fee=$feeRow?(int)$feeRow['argus_fee_cents']:null;
        $net=$feeRow?(int)$feeRow[$kind==='withdrawal'?'provider_amount_cents':'commercial_net_cents']:null;
        $settled=$feeRow&&$feeRow['status']==='settled'?$feeRow['finalized_at']:null;
        // For historical transactions, do not invent fees or an exact settlement timestamp.
        return self::present($kind,$row,$fee,$net,$settled,
            !empty($row[$kind==='withdrawal'?'provider_tx_id':'provider_id']),'Conta administrativa ArgusPay');
    }
    public static function publicDeposit(array $row,int $amount,int $fee,?int $net):?array{
        if(($row['status']??'')!=='paid'||empty($row['provider_id']))return null;
        // Existing public endpoints authorize receipt tokens before calling this helper.
        // Never expose private account IDs, full payer documents, or provider credentials.
        $safe=['id'=>$row['charge_id']??$row['id'],'amount_cents'=>$amount,'status'=>'paid',
            'created_at'=>$row['created_at']??null,'checked_at'=>$row['checked_at']??null];
        return self::present('deposit',$safe,$fee,$net,null,true);
    }
    private static function range():array{
        $from=(string)($_GET['from']??gmdate('Y-m-d',time()-29*86400));$to=(string)($_GET['to']??gmdate('Y-m-d'));
        foreach([$from,$to] as $date){
            if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date))self::fail('Intervalo inválido.',422);
            $parts=explode('-',$date);
            if(!checkdate((int)$parts[1],(int)$parts[2],(int)$parts[0]))self::fail('Intervalo inválido.',422);
        }
        $start=strtotime($from.' UTC');$end=strtotime($to.' UTC');
        if($start>$end||$end-$start>365*86400||$to>gmdate('Y-m-d'))self::fail('Selecione até 366 dias, sem datas futuras.',422);
        return [$from.' 00:00:00',gmdate('Y-m-d H:i:s',$end+86400)];
    }
    public static function listing(Database $db,string $owner,bool $admin):array{
        [$start,$end]=self::range();
        $sets=$admin?[['admin_quick_pix','actor_id','deposit'],['admin_payouts','actor_id','withdrawal']]:
            [['argus_seller_charges','account_id','deposit'],['argus_seller_withdrawals','account_id','withdrawal']];
        $items=[];
        foreach($sets as [$table,$scope,$kind]){
            $rows=$db->all("SELECT id,amount_cents,status,created_at FROM {$table} WHERE {$scope}=? AND created_at>=? AND created_at<? ORDER BY created_at DESC LIMIT 151",[$owner,$start,$end]);
            foreach($rows as $row){$row['kind']=$kind;$items[]=$row;}
        }
        usort($items,static fn(array $a,array $b)=>strcmp((string)$b['created_at'],(string)$a['created_at']));
        return ['items'=>array_slice($items,0,150),'truncated'=>count($items)>150];
    }
    public static function portal(Database $db,string $path,array $account):never{
        $owner=(string)$account['id'];
        if($path==='/api/portal/receipts')self::json(self::listing($db,$owner,false));
        if(preg_match('~^/api/portal/receipts/([a-zA-Z0-9_-]{1,80})$~D',$path,$m))self::json(['receipt'=>self::seller($db,$owner,$m[1])]);
        self::fail('Operação não encontrada.');
    }
    public static function adminRoute(Database $db,string $path,array $actor):never{
        if(($actor['role']??'')!=='superadmin')self::fail('Acesso restrito.',403);
        $owner=(string)$actor['id'];
        if($path==='/api/admin/receipts')self::json(self::listing($db,$owner,true));
        if(preg_match('~^/api/admin/receipts/(deposit|withdrawal)/([a-zA-Z0-9_-]{1,80})$~D',$path,$m))self::json(['receipt'=>self::admin($db,$owner,$m[2],$m[1])]);
        self::fail('Operação não encontrada.');
    }
}