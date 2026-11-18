<?php
declare(strict_types=1);
/**
 * Read-only payout readiness. Never create, retry, queue or settle transfers here.
 * This runs after the existing Admin MFA, CSRF and payout workflows are patched.
 */
$file='/var/www/html/src/Admin.php';
$source=file_get_contents($file);
if(!is_string($source))throw new RuntimeException('ARGUS payout readiness: admin source missing');
$anchor=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/payouts') {
PHP;
if(substr_count($source,$anchor)!==1)
    throw new RuntimeException('ARGUS payout readiness: existing payouts route moved');
$insertion=<<<'PHP'
        // Diagnostics contains only presence/format of server secrets, never the values.
        // A valid-shaped key is not proof of BALANCE_READ / WITHDRAW_CREATE scopes.
        if($method==='GET'&&$path==='/api/admin/payouts/readiness'){
            self::writeAllowed($actor,true);
            $enabled=getenv('ARGUS_PAYOUTS_ENABLED')==='yes';
            $persistent=in_array($db->driver(),['pgsql','mysql'],true);
            $credentials=false;
            try{
                new MisticPayPayout(
                    trim((string)(getenv('ARGUS_MISTICPAY_PAYOUT_PK')?:'')),
                    trim((string)(getenv('ARGUS_MISTICPAY_PAYOUT_SK')?:''))
                );
                $credentials=true;
            }catch(\InvalidArgumentException){}
            $ready=$enabled&&$persistent&&$credentials;
            $reason=(!$enabled?'payouts_disabled':
                (!$credentials?'payout_credentials_missing':
                (!$persistent?'persistent_database_required':'configuration_ready')));
            self::reply([
                'ready_to_request'=>$ready,
                'enabled'=>$enabled,
                'credentials_configured'=>$credentials,
                'persistent_storage'=>$persistent,
                'scope_verified'=>false,
                'reason'=>$reason,
                'provider'=>'MisticPay API tradicional',
                'required_scopes'=>['BALANCE_READ','WITHDRAW_CREATE'],
                'message'=>match($reason){
                    'payouts_disabled'=>'Os saques estão desabilitados na configuração do servidor. Nenhuma transferência foi enviada.',
                    'payout_credentials_missing'=>'Cadastre no Render uma chave de acesso exclusiva para saques da MisticPay.',
                    'persistent_database_required'=>'O banco persistente de saques não está disponível.',
                    default=>'Configuração de saque presente. Confirme os escopos e o saldo na MisticPay antes de enviar.'
                }
            ]);
        }
PHP;
$source=str_replace($anchor,$insertion."\n".$anchor,$source);
if(file_put_contents($file,$source)===false)
    throw new RuntimeException('ARGUS payout readiness: could not save route');
$path='/var/www/html/public/static/admin.html';
$html=file_get_contents($path);
if(!is_string($html)||substr_count($html,'</head>')!==1||substr_count($html,'</body>')!==1)
    throw new RuntimeException('ARGUS payout readiness: admin markup invalid');
$html=str_replace('</head>','<link rel="stylesheet" href="/static/payout-readiness.css?v=1"></head>',$html);
$html=str_replace('</body>','<script src="/static/payout-readiness.js?v=1" defer></script></body>',$html);
file_put_contents($path,$html);
echo "ARGUS payout readiness: protected diagnostics added; payout flow unchanged and disabled until explicitly configured.\n";
