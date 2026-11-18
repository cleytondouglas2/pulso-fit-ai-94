<?php
declare(strict_types=1);
namespace ArgusPayments;

/** Authenticated read-only Pix readiness diagnosis. Never creates a charge. */
final class PixDiagnostics
{
    private static function out(array $data):never {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    public static function status(Database $db,string $method,string $path,array $actor):never {
        if($method!=='GET'||$path!=='/api/admin/pix/diagnostics')throw new ApiError('Rota indisponível',404);
        if(($actor['role']??'')!=='superadmin')throw new ApiError('Somente administrador principal',403);
        $persistent=in_array($db->driver(),['pgsql','mysql'],true);
        $configured=\ArgusPayments\Integrations\MisticPayFinance::configured();
        $idEnv=trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_ID'));
        $secretEnv=trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_SECRET'));
        $wrongFamily=\ArgusPayments\Integrations\MisticPayFinance::isLegacyKey($idEnv)||\ArgusPayments\Integrations\MisticPayFinance::isLegacyKey($secretEnv);
        $traditionalStyle=(bool)preg_match('/^(?:pk_|ci_)/',$idEnv)||(bool)preg_match('/^(?:sk_|cs_)/',$secretEnv);
        $readiness=LivePix::readiness($db);
        $storage=(bool)($readiness['checks']['storage_policy']??false);
        $provider=$wrongFamily?'legacy_misticpay_keys':'not_configured';
        $http=0;
        if($configured && $persistent && $storage){
            $id=trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_ID'));
            $secret=trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_SECRET'));
            $url='https://api.finance.misticpay.com/v1/public/charges/argus_diagnostic_'.bin2hex(random_bytes(8));
            if(function_exists('curl_init')){
                $ch=curl_init($url);
                curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_USERPWD=>$id.':'.$secret,
                    CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>8,
                    CURLOPT_MAXREDIRS=>0,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,
                    CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>['Accept: application/json']]);
                $raw=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
                if($http===404)$provider='authorized';
                elseif($http===401||$http===403)$provider='credentials_rejected';
                elseif($http===429)$provider='rate_limited';
                elseif($http===200){$provider='unexpected_success';} // a deliberately nonexistent charge must not exist
                else $provider='unavailable';
            }else $provider='unavailable';
        }
        $canTry=$persistent&&$storage&&$configured&&$provider==='authorized';
        $message=match(true){
            !$persistent=>'Banco persistente indisponível. Configure PostgreSQL ou MySQL antes de emitir Pix.',
            !$storage=>'Política de armazenamento não está pronta. Revise a infraestrutura.',
            $wrongFamily=>'Credenciais antigas ci/cs identificadas. Elas não são compatíveis com a API Finance QRCODES. Crie Client ID e Client Secret em MisticPay Finance → Configurações → API QR Codes.',
            $traditionalStyle&&$provider==='credentials_rejected'=>'O provedor Finance recusou a autenticação. O par apresenta prefixo também usado pela API MisticPay tradicional, mas o prefixo sozinho não prova a origem. Verifique em qual painel a credencial foi criada, se o par está ativo e se o IP de saída do Render está autorizado. Use credenciais de Configurações → API QR Codes da MisticPay Finance.',
            !$configured=>'Credenciais da API Finance QRCODES não configuradas. Atualize as variáveis protegidas no Render.',
            $provider==='credentials_rejected'=>'O provedor recusou as credenciais Pix (401/403). Confira Client ID, Client Secret, autorização QRCODES e restrições de IP no painel do provedor.',
            $provider==='authorized'=>'Consulta autenticada ao provedor aceita. A emissão ainda depende da autorização da conta e da operação.',
            default=>'Não foi possível confirmar a autenticação Pix agora. Nenhuma cobrança foi criada.'
        };
        self::out(['ready_to_attempt'=>$canTry,'provider'=>$provider,'provider_http'=>$http,
            'persistent_db'=>$persistent,'storage_ready'=>$storage,'credentials_present'=>$configured,
            'wrong_credential_family'=>$wrongFamily,'traditional_prefix_detected'=>$traditionalStyle,
            'message'=>$message,'read_only'=>true]);
    }
}
