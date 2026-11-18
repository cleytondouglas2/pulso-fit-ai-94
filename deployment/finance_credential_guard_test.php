<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/src/Integrations/MisticPayFinance.php';
use ArgusPayments\Integrations\MisticPayFinance;
foreach([['ci_abcdefgh1234','cs_abcdefgh12345678']] as [$id,$secret]){
    putenv('ARGUS_FINANCE_QR_CLIENT_ID='.$id);putenv('ARGUS_FINANCE_QR_CLIENT_SECRET='.$secret);
    if(MisticPayFinance::configured())throw new RuntimeException('Legacy credentials must not enable Finance');
    try{new MisticPayFinance($id,$secret);throw new RuntimeException('Legacy credentials passed constructor');}
    catch(InvalidArgumentException $e){if(!str_contains($e->getMessage(),'ci/cs'))throw $e;}
}
// Do not assume that Finance will never use pk/sk-style opaque tokens.
putenv('ARGUS_FINANCE_QR_CLIENT_ID=pk_abcdefgh1234');
putenv('ARGUS_FINANCE_QR_CLIENT_SECRET=sk_abcdefgh12345678');
if(!MisticPayFinance::configured())throw new RuntimeException('Do not reject valid-looking keys on undocumented prefix assumptions');
putenv('ARGUS_FINANCE_QR_CLIENT_ID=finance-client-id-12345');
putenv('ARGUS_FINANCE_QR_CLIENT_SECRET=finance-client-secret-12345');
if(!MisticPayFinance::configured())throw new RuntimeException('Correct-looking Finance credential rejected');
$adapter=new MisticPayFinance(" finance-client-id-12345 \n"," finance-client-secret-12345 \n",
    static function($method,$url,$body,$headers) {
        $auth=array_values(array_filter($headers,static fn($h)=>str_starts_with($h,'Authorization: Basic ')))[0]??'';
        if($auth!=='Authorization: Basic '.base64_encode('finance-client-id-12345:finance-client-secret-12345'))
            throw new RuntimeException('Credential whitespace not removed from header');
        return ['statusCode'=>404,'code'=>'CHARGE_NOT_FOUND'];
    });
if($adapter->credentialsStatus()['status']!=='verified')throw new RuntimeException('Trimmed credential auth regression');
putenv('ARGUS_FINANCE_QR_CLIENT_ID');putenv('ARGUS_FINANCE_QR_CLIENT_SECRET');
echo "PASS: Obsolete ci/cs rejected; undocumented prefixes allowed; Finance credentials sanitized without exposing secrets.\n";
