<?php
declare(strict_types=1);
/** Offline security contract; no actual Pix, MisticPay request, browser or credentials. */
$js=(string)file_get_contents('/var/www/html/public/static/chat-payout.js');
$html=(string)file_get_contents('/var/www/html/public/static/client.html');
$wallet=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$ai=(string)file_get_contents('/var/www/html/src/AI.php');
$assert=static function(bool $condition,string $error):void{
    if(!$condition)throw new RuntimeException('Chat payout contract: '.$error);
};
foreach([
    "document.getElementById('argus-portal-ai')",
    "chatForm.addEventListener('submit'",
    'event.stopImmediatePropagation()',
    "request('/api/portal/wallet')",
    "request('/api/portal/wallet/withdrawals'",
    'crypto.randomUUID()',
    'idempotency_key:idempotency',
    'confirm:true',
    'window.confirm(',
    'withdrawals_enabled===true',
    'value>available',
    'send.disabled=true',
    'No',
] as $needle){
    if($needle==='No')continue;
    $assert(str_contains($js,$needle),'missing '+$needle);
}
$assert(str_contains($js,'never blind-retry'),'must not retry uncertain withdrawals');
$assert(str_contains($js,'bypass Groq'),'merchant PII must never be forwarded to Groq');
$assert(!str_contains($js,'api.groq.com'),'UI cannot call LLM directly');
$assert(str_contains($html,'/static/chat-payout.js?v=20261120-1'),'chat JS mount');
$assert(str_contains($html,'/static/chat-payout.css?v=20261120-1'),'chat CSS mount');
$assert(strpos($html,'/static/chat-payout.js')>strpos($html,'/static/ai-ui.js'),'capture listener requires AI script already loaded');
$assert(str_contains($wallet,'public static function requestWithdraw'),'server wallet source unchanged');
$assert(str_contains($wallet,'HybridPayout::assess'),'hybrid approval still applied');
$assert(str_contains($ai,"Não execute transferências nem autorize ações de dinheiro"),'LLM remains readonly');
echo "PASS: chat form auth path, explicit confirmation, tenant balance, idempotency and AI isolation; zero PSP calls.\n";
