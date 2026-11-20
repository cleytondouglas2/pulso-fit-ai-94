<?php
declare(strict_types=1);
/** Install the chat-initiated payout UI after the production portal and finance patches. */
$path='/var/www/html/public/static/client.html';
$html=file_get_contents($path);
if(!is_string($html)||substr_count($html,'</head>')!==1||substr_count($html,'</body>')!==1)
    throw new RuntimeException('Argus chat payout: client layout missing');
if(!str_contains($html,'id="argus-portal-ai"')||
   !str_contains($html,'/static/ai-ui.js')||
   !str_contains($html,'/static/merchant-portal.js'))
    throw new RuntimeException('Argus chat payout requires existing AI and wallet pages');
if(str_contains($html,'chat-payout.js'))
    throw new RuntimeException('Argus chat payout already installed');
$html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/chat-payout.css?v=20261120-1"></head>',
    $html);
$html=str_replace('</body>',
    '<script src="/static/chat-payout.js?v=20261120-1" defer></script></body>',
    $html);
if(file_put_contents($path,$html)===false)
    throw new RuntimeException('Argus chat payout layout write failed');
echo "PASS: chat withdrawal wizard mounted after AI and merchant wallet assets. PSP unchanged.\n";
