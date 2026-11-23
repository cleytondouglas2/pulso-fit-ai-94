<?php
declare(strict_types=1);
/**
 * ARGUS Pay merchant/public white-label presentation.
 *
 * Modify ONLY explicitly public and reseller-facing strings/metadata. Provider
 * API, bank settlement and real PSP wiring remain unchanged. The private
 * Super Admin fee studio, PSP diagnostics and provider credentials are retained.
 * No changes to QR payloads, bank receipts, legal disclosures, money or fees.
 */
$root='/var/www/html';
function argusPublicBrandOnce(string $filename,string $old,string $new,string $scope):void{
    $src=file_get_contents($filename);
    if(!is_string($src)||substr_count($src,$old)!==1)
        throw new RuntimeException('ARGUS public branding: missing anchor '.$scope);
    if(file_put_contents($filename,str_replace($old,$new,$src))===false)
        throw new RuntimeException('ARGUS public branding: cannot update '.$scope);
}
$public=$root.'/public/static';
$pix=$public.'/public-pix.html';
argusPublicBrandOnce($pix,
    'O QR Code é emitido pela MisticPay para a conta administrativa da ARGUS Pay. A confirmação acontece somente após a resposta do provedor.',
    'O pagamento é disponibilizado pela ARGUS Pay. A confirmação aparece somente após validação da transação Pix.',
    'public billing explanation');
argusPublicBrandOnce($pix,
    'Limite de R$ 100,00 incluindo a taxa da adquirente.',
    'Limite de R$ 100,00 incluindo a taxa de serviço.',
    'public checkout amount hint');
argusPublicBrandOnce($pix,'<span>Taxa da adquirente</span>',
    '<span>Taxa de serviço ARGUS Pay</span>','public Pix price label');
argusPublicBrandOnce($pix,
    '<span>Valor-base após o custo estimado da adquirente</span>',
    '<span>Valor-base do pagamento</span>','public Pix net/base label');
argusPublicBrandOnce($pix,
    '<span>Identificação do pagador</span><small>Solicitada pela MisticPay</small>',
    '<span>Identificação do pagador</span><small>Dados necessários para o Pix</small>',
    'public payer identity');
argusPublicBrandOnce($pix,
    '<span>Transações com confirmação da adquirente</span>',
    '<span>Recebimento confirmado no sistema ARGUS Pay</span>',
    'public checkout footer');
argusPublicBrandOnce($pix,
    'Pagamento confirmado pela MisticPay',
    'Pagamento confirmado pela ARGUS Pay',
    'public receipt aria label');
argusPublicBrandOnce($pix,
    'O recebimento foi confirmado pela MisticPay. Você já pode fechar esta janela com segurança.',
    'O recebimento Pix foi confirmado. Você já pode fechar esta janela com segurança.',
    'public Pix confirmed receipt');
argusPublicBrandOnce($pix,
    'public-pix.js?v=pix-premium-20261123-1',
    'public-pix.js?v=argus-white-label-20261123-1',
    'mobile Safari Pix JS cache bust');

$js=$public.'/public-pix.js';
argusPublicBrandOnce($js,
    "const INITIAL_HINT='Limite de R$ 100,00 incluindo a taxa da adquirente.';",
    "const INITIAL_HINT='Limite de R$ 100,00 incluindo a taxa de serviço.';",
    'public amount hint JS');
argusPublicBrandOnce($js,
    "paid:'Pagamento confirmado pela MisticPay'",
    "paid:'Pagamento confirmado pela ARGUS Pay'",
    'public verified Pix receipt');
argusPublicBrandOnce($js,
    "unknown:'Pagamento em verificação pela adquirente'",
    "unknown:'Pagamento em verificação pela ARGUS Pay'",
    'public unknown payment');
argusPublicBrandOnce($js,
    "'Aguardando a adquirente…'",
    "'Aguardando confirmação Pix…'",
    'public QR response');
argusPublicBrandOnce($js,
    "'Recebimento verificado pela adquirente. Nenhuma nova cobrança foi gerada.'",
    "'Recebimento Pix verificado. Nenhuma nova cobrança foi gerada.'",
    'public confirmed status');
argusPublicBrandOnce($js,
    "'Aguardando consulta segura da adquirente. Não gere cobranças repetidas.'",
    "'Aguardando verificação do Pix. Não gere cobranças repetidas.'",
    'public remaining status');

// Public pricing JSON must never name the underlying acquiring partner.
// This field is DISPLAY METADATA ONLY; fees and PSP calls stay intact.
$api=$root.'/src/PublicAdminPix.php';
argusPublicBrandOnce($api,
    "'provider'=>'MisticPay',",
    "'payment_platform'=>'ARGUS Pay',",
    'public quote metadata');

// The seller's readiness error and wallet fee note must reflect Argus Pay,
// not the underlying processor. These are only presentation strings.
$wallet=$root.'/src/MerchantWallet.php';
argusPublicBrandOnce($wallet,
    "Carteira financeira de revendedores aguardando homologação da conta de custódia na MisticPay",
    "Recebimentos ARGUS Pay ainda indisponíveis. Aguardando habilitação financeira da plataforma",
    'reseller financial readiness response');
argusPublicBrandOnce($wallet,
    "Taxa por operação: custo MisticPay mais tarifa ARGUS; percentuais variam conforme o valor. Confirme a cotação antes de sacar.",
    "Taxa de serviço ARGUS Pay calculada conforme a tabela vigente. Confira o valor total e o líquido antes de sacar.",
    'reseller wallet service-fee note');


// Clear reseller integration docs must not expose custody's infrastructure
// provider or pretend the two internal cost components are both ARGUS fees.
$merchantDocs=$public.'/merchant-docs.js';
argusPublicBrandOnce($merchantDocs,
    'O servidor ARGUS valida suas chaves e movimenta a conta de custódia central junto à MisticPay. Nenhuma chave ou segredo da MisticPay é compartilhado com revendedores.',
    'A ARGUS Pay valida suas chaves e controla o recebimento e o saldo segregado de cada revendedor. Credenciais de infraestrutura financeira não são compartilhadas.',
    'merchant docs provider relationship');
argusPublicBrandOnce($merchantDocs,
    'Somente a confirmação da MisticPay credita a carteira.',
    'A carteira é creditada somente após a confirmação financeira registrada na ARGUS Pay.',
    'merchant docs paid-only credit');
argusPublicBrandOnce($merchantDocs,
    'após homologação da conta MisticPay administrativa',
    'após a habilitação financeira da ARGUS Pay',
    'merchant operational readiness');
argusPublicBrandOnce($merchantDocs,
    'A taxa de serviço de cada depósito é definida pela tabela do Super Admin (inicialmente R$ 1,00: R$ 0,50 MisticPay e R$ 0,50 ARGUS).',
    'A taxa de serviço de cada depósito é definida pela tabela da ARGUS Pay (valor inicial de R$ 1,00 por operação, sujeito a alterações).',
    'merchant transparent service pricing without private allocation');

// The included scripts may be strongly cached by Safari. Refresh only the
// branding-related merchant assets without touching login or payment routes.
foreach(['client.html','docs.html'] as $page){
    $full=$public.'/'.$page;
    if(!is_file($full))continue;
    $markup=file_get_contents($full);
    if(!is_string($markup))throw new RuntimeException('Missing reseller page '.$page);
    foreach(['merchant-docs.js','chat-payout.js'] as $asset){
        $pattern='~(/static/'.preg_quote($asset,'~').'\?v=)[A-Za-z0-9._-]+~';
        $markup=preg_replace($pattern,'1argus-whitelabel-20261123-1',$markup);
        if(!is_string($markup))throw new RuntimeException('Cannot invalidate merchant cache');
    }
    if(file_put_contents($full,$markup)===false)
        throw new RuntimeException('Cannot refresh reseller branding cache');
}

// Seller/public-facing static resources are white-label presentation assets.
// Excludes private admin fees, processor settings, PSP readiness diagnostics,
// quick-Pix administrative screens and legally required pages.
$allowedExact=[
    'client.html','portal.js','portal.css','docs.html',
    'landing.html','landing.js','landing.css','chat-payout.js','chat-payout.css',
    'merchant-portal.js','merchant-portal.css','merchant-admin.js','merchant-admin.css',
    'merchant-docs.js','merchant-docs.css','merchant-webhooks-docs.js',
    'merchant-webhooks.js','merchant-webhooks.css',
    'kyc-portal.js','kyc-portal.css',
    'public-pix.html','public-pix.js','public-pix.css'
];
$allowedPrefixes=['reseller-','seller-','seller_','client-mobile-','client-native-'];
$changed=[];
$processor='/Mistic[\s_-]*Pay/iu';
foreach(new DirectoryIterator($public) as $file){
    if($file->isDot()||!$file->isFile())continue;
    $name=$file->getFilename();
    if(!preg_match('/\.(?:html|js|css)$/iD',$name))continue;
    $allowed=in_array($name,$allowedExact,true);
    foreach($allowedPrefixes as $prefix)
        if(str_starts_with($name,$prefix)){$allowed=true;break;}
    if(!$allowed)continue;
    $path=$file->getPathname();
    $src=file_get_contents($path);
    if(!is_string($src))throw new RuntimeException('Cannot scan public resource '.$name);
    // Never rewrite script identifiers/URL/env keys, even if somebody accidentally
    // inserts a private API reference into a reseller-facing asset in future.
    if(preg_match('/ARGUS_MISTICPAY|api\.misticpay\.com|MisticPayPayout|misticpay_email/i',$src))
        throw new RuntimeException('Review underlying PSP identifier in external page '.$name);
    $next=preg_replace($processor,'ARGUS Pay',$src);
    if(!is_string($next))throw new RuntimeException('Invalid Unicode in '.$name);
    if($next!==$src){
        if(file_put_contents($path,$next)===false)
            throw new RuntimeException('Cannot white-label public page '.$name);
        $changed[]=$name;
    }
    if(preg_match($processor,$next))
        throw new RuntimeException('Provider name remains in external page '.$name);
}
// White-label errors and notifications should never reveal an infrastructure
// provider in the API response; audit only the known seller-readable endpoints.
$afterWallet=file_get_contents($wallet);
if(!is_string($afterWallet)||
    str_contains($afterWallet,'na MisticPay')||
    str_contains($afterWallet,'custo MisticPay mais tarifa ARGUS'))
    throw new RuntimeException('Seller wallet output still discloses provider');
$afterApi=file_get_contents($api);
if(!is_string($afterApi)||str_contains($afterApi,"'provider'=>'MisticPay'"))
    throw new RuntimeException('Anonymous quote discloses private provider');
echo "PASS: White-label ARGUS Pay for public checkout, reseller documentation, wallet readiness, notifications and Pix API. Provider configuration and financial integration untouched. External resources updated: ".implode(',',$changed)."\n";
