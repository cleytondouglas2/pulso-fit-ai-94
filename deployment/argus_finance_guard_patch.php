<?php
declare(strict_types=1);
/** Fail closed on MisticPay legacy pk/sk and ci/cs credentials in Finance QR configuration. */
$path='/var/www/html/src/Integrations/MisticPayFinance.php';
$s=file_get_contents($path);
if(!is_string($s))throw new RuntimeException('Missing Finance integration');
$old=<<<'PHP'
    public static function configured(): bool
    {
        return strlen(trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_ID'))) >= 8 &&
            strlen(trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_SECRET'))) >= 12;
    }
PHP;
$new=<<<'PHP'
    public static function configured(): bool
    {
        $id=trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_ID'));
        $secret=trim((string)getenv('ARGUS_FINANCE_QR_CLIENT_SECRET'));
        return strlen($id)>=8 && strlen($secret)>=12 &&
            !self::isLegacyKey($id) && !self::isLegacyKey($secret);
    }

    public static function isLegacyKey(string $value):bool
    {
        // Only the discontinued ci/cs header credentials are certainly incompatible.
        // pk/sk is used by the traditional API, but Finance does not publish a definitive prefix contract.
        return preg_match('/^(?:ci_|cs_)/',trim($value))===1;
    }
PHP;
if(substr_count($s,$old)!==1)throw new RuntimeException('Finance configured() anchor changed');
$s=str_replace($old,$new,$s);
$oldConstructor=<<<'PHP'
        if (strlen(trim($clientId)) < 8 || strlen(trim($clientSecret)) < 12 ||
            preg_match('/[\r\n]/', $clientId.$clientSecret)) {
PHP;
$newConstructor=<<<'PHP'
        // Dashboard paste errors must not change authentication headers.
        $this->clientId=trim($clientId);
        $this->clientSecret=trim($clientSecret);
        if(self::isLegacyKey($this->clientId)||self::isLegacyKey($this->clientSecret)){
            throw new \InvalidArgumentException('Credenciais antigas ci/cs não são compatíveis com a API Finance QRCODES');
        }
        if (strlen($this->clientId) < 8 || strlen($this->clientSecret) < 12 ||
            preg_match('/[\r\n]/', $this->clientId.$this->clientSecret)) {
PHP;
if(substr_count($s,$oldConstructor)!==1)throw new RuntimeException('Finance constructor anchor changed');
$s=str_replace($oldConstructor,$newConstructor,$s);
file_put_contents($path,$s);
echo "ARGUS Finance credential family guard installed. Legacy keys cannot mark Finance Pix ready.\n";
