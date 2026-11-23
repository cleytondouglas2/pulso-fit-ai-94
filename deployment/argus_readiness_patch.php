<?php
declare(strict_types=1);
/** Health endpoints are read-only and do not call any payment provider. */
$path='/var/www/html/src/Gateway.php';
$s=file_get_contents($path);
if(!is_string($s))throw new RuntimeException('Gateway missing');
$anchor='            // Public presentation: no account is required, never expose credentials.';
if(substr_count($s,$anchor)!==1)throw new RuntimeException('Health route anchor changed');
$code=<<<'PHP'
            // Render liveness: HEAD / must not yield 404.
            // /readyz additionally requires a working persistent database.
            if($method==='HEAD'&&$path==='/'){
                header('Cache-Control: no-store');
                http_response_code(200);
                exit;
            }
            if(($method==='GET'||$method==='HEAD')&&$path==='/readyz'){
                header('Content-Type: text/plain; charset=utf-8');
                header('Cache-Control: no-store, no-cache, must-revalidate');
                try{
                    $probe=$db->one('SELECT 1 AS ready');
                    if((int)($probe['ready']??0)!==1)throw new \RuntimeException('Database unavailable');
                    http_response_code(200);
                    if($method==='GET')echo 'ARGUS_READY';
                }catch(\Throwable){
                    http_response_code(503);
                    if($method==='GET')echo 'UNAVAILABLE';
                }
                exit;
            }
PHP;
$s=str_replace($anchor,$code."\n".$anchor,$s);
if(file_put_contents($path,$s)===false)throw new RuntimeException('Health patch write failure');
echo "PASS: HEAD liveness and isolated persistent database readiness route installed.\n";
