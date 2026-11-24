<?php
declare(strict_types=1);
namespace ArgusPayments;
final class Compliance {
    public static function authorize(array $actor):void {
        if(($actor['role']??'')!=='superadmin')throw new ApiError('Acesso restrito.',403);
    }
    public static function sources():array {
        return [
            'seller-deposit'=>['argus_seller_charges','account_id','provider_id','deposit'],
            'seller-withdrawal'=>['argus_seller_withdrawals','account_id','provider_tx_id','withdraw'],
            'admin-deposit'=>['admin_quick_pix','actor_id','provider_id','deposit'],
            'admin-withdrawal'=>['admin_payouts','actor_id','provider_tx_id','withdraw']
        ];
    }
    public static function trace(Database $db,array $actor,string $source,string $id):array {
        self::authorize($actor);
        if(!isset(self::sources()[$source])||!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$id))throw new ApiError('Identificador inválido.',422);
        [$table,$owner,$provider,$kind]=self::sources()[$source];
        $row=$db->one("SELECT id,$owner AS owner_id,amount_cents,status,created_at,checked_at,$provider AS provider_reference FROM $table WHERE id=?",[$id]);
        if(!$row)throw new ApiError('Operação não encontrada.',404);
        $fee=$db->one('SELECT argus_fee_cents,commercial_net_cents,provider_amount_cents,status,finalized_at FROM argus_fee_operations WHERE operation_kind=? AND operation_id=?',[$kind,$id]);
        $events=[['source'=>$table,'event'=>'Registro criado','at'=>$row['created_at']]];
        if(!empty($row['checked_at']))$events[]=['source'=>$table,'event'=>'Última consulta registrada','at'=>$row['checked_at']];
        if($fee&&!empty($fee['finalized_at']))$events[]=['source'=>'argus_fee_operations','event'=>'Finalização do registro de taxas','at'=>$fee['finalized_at']];
        if(str_starts_with($source,'seller-')){
            $ledger=$db->all('SELECT operation_kind,created_at FROM argus_seller_ledger WHERE account_id=? AND operation_id=? ORDER BY created_at LIMIT 100',[$row['owner_id'],$id]);
            foreach($ledger as $item)$events[]=['source'=>'argus_seller_ledger','event'=>$item['operation_kind'],'at'=>$item['created_at']];
        }
        usort($events,static fn($a,$b)=>strcmp((string)$a['at'],(string)$b['at']));
        $journal=null;
        if(getenv('ARGUS_COMPLIANCE_JOURNAL_ENABLED')==='yes'){
            $journal=TransactionJournal::entries($db,$table,$id,(string)$row['owner_id']);
        }
        return ['operation'=>$row,'fees'=>$fee,'events'=>$events,'journal'=>$journal,'end_to_end_id'=>null,'coverage'=>'Registros históricos reconstruídos e, quando habilitado, novas transições registradas a partir da migração. Referência do provedor não equivale ao EndToEndId.'];
    }
    public static function admin(Database $db,array $actor):never {
        self::authorize($actor);
        $source=$_GET['source']??'';$id=$_GET['id']??'';
        if(!is_string($source)||!is_string($id))throw new ApiError('Consulta inválida.',422);
        $data=self::trace($db,$actor,$source,$id);
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;
    }
}
