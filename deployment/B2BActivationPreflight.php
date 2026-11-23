<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Read-only financial activation checklist. This class NEVER sets enable flags,
 * saves credentials, updates balances, creates Pix, triggers payouts or calls PSP.
 * The authoritative gates remain LivePix::readiness + existing wallet guards.
 */
final class B2BActivationPreflight {
    private const TITLES=[
        'explicit_activation'=>['Autorização expressa de produção','Somente após toda a homologação, habilitar manualmente no ambiente B2B.'],
        'persistent_database'=>['PostgreSQL persistente','Banco dedicado, não expirável, com backup e restauração testados; SQLite bloqueia o financeiro.'],
        'storage_policy'=>['Política de armazenamento','Registrar isolamento, responsabilidade pela custódia e estratégia de backup e recuperação.'],
        'split_direction_authorized'=>['Autorização das taxas','Confirmar por escrito a direção das taxas entre adquirente, ARGUS Pay e revendedores.'],
        'provider_split_confirmed'=>['Divisão homologada na adquirente','Conferir em consulta autenticada a liquidação, retenção e extratos do PSP.'],
        'strong_operator_secret'=>['Segredo de assinatura do operador','Configurar um segredo forte exclusivo do B2B via ambiente protegido, nunca no painel público.'],
        'protected_webhook'=>['Webhooks autenticados','Validar HMAC/assinatura, replay, idempotência e processamento de notificações.'],
        'https_callback'=>['Callback HTTPS','Confirmar endpoint público HTTPS, certificado válido e rota exata homologada na adquirente.'],
        'payer_blocklist_secret'=>['Proteção de pagadores','Configurar segredo exclusivo usado na identificação e prevenção de abuso de pagadores.']
    ];
    private static function fail(string $message,int $code=403):never{throw new ApiError($message,$code);}
    private static function keyPresent(string $a,string $b):bool {
        return trim((string)(getenv($a)?:''))!==''&&trim((string)(getenv($b)?:''))!=='';
    }
    public static function status(Database $db):array {
        // Never infer readiness from a green website or from key presence alone.
        require_once __DIR__.'/LivePix.php';
        $snapshot=LivePix::readiness($db);
        $checks=is_array($snapshot['checks']??null)?$snapshot['checks']:[];
        $items=[];
        foreach(self::TITLES as $key=>[$title,$guidance]){
            $items[]=[
                'code'=>$key,
                'title'=>$title,
                'passed'=>($checks[$key]??false)===true,
                'guidance'=>$guidance
            ];
        }
        // Unknown/future gates must also hold; do not imply total readiness
        // just because nine known labels have become true.
        $unknown=[];
        foreach($checks as $key=>$value){
            if(!array_key_exists((string)$key,self::TITLES)&&$value!==true)
                $unknown[]=(string)$key;
        }
        $dbDriver=$db->driver();
        $persistent=in_array($dbDriver,['pgsql','mysql'],true);
        $shared=filter_var((string)(getenv('ARGUS_PGSQL_SHARED')?:'false'),FILTER_VALIDATE_BOOLEAN);
        $traditional=self::keyPresent('ARGUS_TRADITIONAL_PIX_CLIENT_ID','ARGUS_TRADITIONAL_PIX_CLIENT_SECRET');
        $payout=self::keyPresent('ARGUS_MISTICPAY_PAYOUT_PK','ARGUS_MISTICPAY_PAYOUT_SK');
        $worker=getenv('ARGUS_NOTIFICATIONS_WORKER_ENABLED')==='yes';
        $payoutGate=getenv('ARGUS_PAYOUTS_ENABLED')==='yes';
        // Readiness does NOT certify real PSP scopes, successful settlements,
        // worker continuity, backups, or dedicated independent DB permissions.
        $flagsReady=($snapshot['ready']??false)===true;
        return [
            'read_only'=>true,
            'environment'=>'B2B',
            'checked_at_utc'=>gmdate('c'),
            'ready_local'=>$flagsReady&&$persistent&&!$shared,
            'payments_enabled_by_this_endpoint'=>false,
            'requirements'=>$items,
            'unknown_blockers'=>$unknown,
            'ready_checks_total'=>count($checks),
            'ready_checks_passed'=>count(array_filter($checks,static fn($v)=>$v===true)),
            'storage'=>[
                'driver'=>$dbDriver,
                'persistent'=>$persistent,
                'shared_reported'=>$shared,
                'dedicated_database_verified'=>false,
                'backup_restore_verified'=>false
            ],
            'integration'=>[
                'traditional_pix_keys_present'=>$traditional,
                'payout_keys_present'=>$payout,
                'payout_enabled_in_environment'=>$payoutGate,
                'worker_enabled_in_environment'=>$worker,
                'payout_create_scope_verified'=>false,
                'psp_split_evidence_verified'=>false
            ],
            'activation_allowed'=>false,
            'warning'=>'Somente diagnóstico: requisitos externos como PostgreSQL dedicado, backups, contratos, credenciais e escopos da adquirente devem ser validados antes da ativação financeira.',
            'render_service_url'=>'https://dashboard.render.com/web/srv-dbusl00jo6nc73b1m05g'
        ];
    }
    public static function handle(Database $db,string $method,string $path,array $actor):never{
        if(($actor['role']??'')!=='superadmin')self::fail('Super Admin obrigatório',403);
        if(getenv('ARGUS_B2B_PREFLIGHT_UI')!=='yes')self::fail('Disponível somente no ambiente B2B',404);
        if($method!=='GET'||$path!=='/api/admin/b2b/readiness')
            self::fail('Apenas diagnóstico GET está disponível',405);
        $data=self::status($db);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }
}
