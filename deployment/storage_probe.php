<?php
declare(strict_types=1);
// Runtime storage diagnosis. Never logs credentials or connection strings.
require '/var/www/html/src/Database.php';
$config = require '/var/www/html/config.php';
$driver = (string)($config['driver'] ?? 'unknown');
$shared = filter_var(getenv('ARGUS_PGSQL_SHARED') ?: 'false', FILTER_VALIDATE_BOOLEAN);
try {
    $database = new \ArgusPayments\Database($config);
    $result = $database->one('SELECT 1 AS probe');
    if (!$result || (int)($result['probe'] ?? 0) !== 1) {
        throw new RuntimeException('Probe query failed');
    }
    if ($database->driver() === 'pgsql') {
        $expected = \ArgusPayments\Database::validatedPgSchema((string)($config['pgsql_schema'] ?? 'argus_payments_b2b'));
        $actual = (string)$database->pdo()->query('SELECT current_schema()')->fetchColumn();
        if ($actual !== $expected) {
            throw new RuntimeException('Schema isolation check failed');
        }
    }
    error_log('ARGUS_STORAGE_PROBE status=connected driver='.$driver.' shared='.($shared?'yes':'no').' schema_isolated=yes');
    // Provision the owner from bcrypt hash in Render; no plaintext password is kept.
    require_once '/var/www/html/src/Gateway.php';
    $database->installAndSeed();
    \ArgusPayments\Admin::install($database);
    $ownerEmail = strtolower((string)getenv('ARGUS_SUPERADMIN_BOOTSTRAP_EMAIL'));
    $owner = $database->one('SELECT role,status FROM admin_users WHERE email=?', [$ownerEmail]);
    error_log('ARGUS_OWNER_BOOTSTRAP status='.(($owner && $owner['role']==='superadmin' && $owner['status']==='active')?'ready':'missing'));
    require_once '/var/www/html/src/LivePix.php';
    $report = \ArgusPayments\LivePix::readiness($database);
    $missing = [];
    foreach ($report['checks'] as $label => $passed) {
        if (!$passed) $missing[] = $label;
    }
    // Only prerequisite names. Never log provider secrets or connection strings.
    error_log('ARGUS_LIVE_READINESS status='.($report['ready'] ? 'ready' : 'blocked').' missing='.($missing ? implode(',', $missing) : 'none'));
    // Show only whether Finance QR credentials are syntactically present, not their values.
    $financeId = trim((string)(getenv('ARGUS_FINANCE_QR_CLIENT_ID') ?: ''));
    $financeSecret = trim((string)(getenv('ARGUS_FINANCE_QR_CLIENT_SECRET') ?: ''));
    $financeConfigured = strlen($financeId) >= 8 && strlen($financeSecret) >= 12;
    error_log('ARGUS_FINANCE_QR_CONFIG status='.($financeConfigured ? 'configured' : 'missing'));

    // Only public credential category and boolean diagnostics, never raw values.
    $shape=static function(string $value):string {
        if(preg_match('/^(pk_|sk_|ci_|cs_)/D',$value))return 'legacy_misticpay';
        if(str_starts_with(strtolower($value),'basic ')||str_starts_with(strtolower($value),'bearer '))return 'full_auth_header_pasted';
        if(str_starts_with($value,'$'.'{')||str_starts_with($value,'$('))return 'env_reference';
        if((str_starts_with($value,'"')&&str_ends_with($value,'"'))||(str_starts_with($value,"'")&&str_ends_with($value,"'")))return 'quoted';
        return $value===''?'empty':'other';
    };
    $rawId=(string)(getenv('ARGUS_FINANCE_QR_CLIENT_ID')?:'');
    $rawSecret=(string)(getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')?:'');
    error_log('ARGUS_FINANCE_QR_SHAPE id_type='.$shape($financeId).' secret_type='.$shape($financeSecret).
        ' id_padding='.(trim($rawId)===$rawId?'no':'yes').
        ' secret_padding='.(trim($rawSecret)===$rawSecret?'no':'yes').
        ' same_value='.($financeId!==''&&hash_equals($financeId,$financeSecret)?'yes':'no'));
    // Safe one-shot, read-only API check. A random nonexistent charge must return
    // CHARGE_NOT_FOUND/404 if these credentials can read QRCODES; never creates Pix.
    if ($financeConfigured) {
        try {
            $probeUrl='https://api.finance.misticpay.com/v1/public/charges/argus_probe_'.bin2hex(random_bytes(8));
            $context=stream_context_create([
                'http'=>[
                    'method'=>'GET',
                    'header'=>"Authorization: Basic ".base64_encode($financeId.':'.$financeSecret)."\r\nAccept: application/json",
                    'timeout'=>8,
                    'ignore_errors'=>true,
                    'follow_location'=>0,
                    'protocol_version'=>1.1,
                ],
                'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true],
            ]);
            $result=@file_get_contents($probeUrl,false,$context);
            $line=$http_response_header[0]??'';
            $http=preg_match('/\s(\d{3})(?:\s|$)/',$line,$match)?(int)$match[1]:0;
            $parsed=is_string($result)?json_decode(substr($result,0,8000),true):null;
            $errorCode=is_array($parsed)?(string)($parsed['code']??'none'):'none';
            if(!preg_match('/^[A-Z0-9_]{1,64}$/D',$errorCode))$errorCode='unclassified';
            error_log('ARGUS_FINANCE_QR_AUTH_TEST http='.$http.' code='.$errorCode.' authenticated='.($http===404?'yes':'unknown'));

            // Compare standard cURL Basic with the PHP stream implementation, without issuing charges.
            if(function_exists('curl_init')){
                $ch=curl_init($probeUrl);
                curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,
                    CURLOPT_USERPWD=>$financeId.':'.$financeSecret,CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,
                    CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>8,CURLOPT_FOLLOWLOCATION=>false,
                    CURLOPT_MAXREDIRS=>0,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
                    CURLOPT_HTTPHEADER=>['Accept: application/json']]);
                $r=curl_exec($ch);
                $curlHttp=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
                curl_close($ch);
                $j=is_string($r)?json_decode(substr($r,0,8000),true):null;
                $curlCode=is_array($j)?(string)($j['code']??'none'):'none';
                if(!preg_match('/^[A-Z0-9_]{1,64}$/D',$curlCode))$curlCode='unclassified';
                error_log('ARGUS_FINANCE_QR_CURL_TEST http='.$curlHttp.' code='.$curlCode.
                    ' matches_stream='.($curlHttp===$http?'yes':'no'));
            }
        } catch (Throwable $e) {
            error_log('ARGUS_FINANCE_QR_AUTH_TEST http=0 code=PROBE_EXCEPTION error_type='.get_class($e));
        }
    }


    // Read-only Groq authentication probe; never sends a conversation or exposes the key.
    $groqKey=trim((string)(getenv('GROQ_API_KEY')?:''));
    error_log('ARGUS_GROQ_CONFIG status='.($groqKey!==''?'configured':'missing'));
    if($groqKey!==''){
        try{
            if(!function_exists('curl_init'))throw new RuntimeException('curl_unavailable');
            $ch=curl_init('https://api.groq.com/openai/v1/models/openai/gpt-oss-20b');
            curl_setopt_array($ch,[
                CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$groqKey,'Accept: application/json'],
                CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>7,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,
                CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            ]);
            $body=curl_exec($ch);
            $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
            curl_close($ch);
            $valid=($code===200 && is_string($body) && strlen($body)<150000);
            error_log('ARGUS_GROQ_AUTH_TEST http='.$code.' model_ready='.($valid?'yes':'no'));
        }catch(Throwable $e){
            error_log('ARGUS_GROQ_AUTH_TEST http=0 model_ready=no error_type='.get_class($e));
        }
    }


} catch (Throwable $error) {
    error_log('ARGUS_STORAGE_PROBE status=unavailable driver='.$driver.' shared='.($shared?'yes':'no').' error_type='.get_class($error));
    // Keep the web server running so /health can report a precise HTTP 503 status.
    // Financial API readiness remains fail-closed on unavailable DB.
}