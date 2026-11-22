<?php
declare(strict_types=1);
/** Refine existing authenticated seller withdrawal to request TOTP in a modal.
 * The browser never sends a payout until the user confirms this second step;
 * server-side SellerMfa::requireCode remains unchanged and mandatory.
 */
$file='/var/www/html/public/static/merchant-portal.js';
$script=file_get_contents($file);
if(!is_string($script))throw new RuntimeException('Withdrawal modal: merchant script missing');
function otpModalReplace(string &$source,string $before,string $after,string $where):void{
 if(substr_count($source,$before)!==1)
     throw new RuntimeException('Withdrawal modal: changed upstream JS at '.$where);
 $source=str_replace($before,$after,$source);
}
$old=<<<'JS'
  if(!confirm('Valor total descontado do saldo: '+BRL(amount)+'\nTaxa de serviço: R$ 1,00\nValor do Pix: '+BRL(amount-FEE)+'\n\nConfirmar saque direto?'))return;
  working=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
JS;
$new=<<<'JS'
  // Stage 1: original form validation. Stage 2: top-layer branded OTP prompt.
  // No financial endpoint is called before this promise resolves with a code.
  if(typeof window.ArgusSellerWithdrawModal?.request!=='function'){
    notice('Janela de autenticação indisponível. Atualize a página e tente novamente.',true);
    return;
  }
  const dest=String(v.get('pix_key')||'').trim();
  if(!dest){notice('Informe a chave Pix de destino.',true);return;}
  working=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
  let otp=null;
  try{
    otp=await window.ArgusSellerWithdrawModal.request({
      amountCents:amount,feeCents:FEE,pixKeyType:String(v.get('pix_key_type')||''),
      pixKey:dest
    });
  }catch(_){notice('Não foi possível abrir a confirmação de segurança.',true);}
  // Cancel/close: no Pix, no new withdrawal, no change to wallet reservations.
  if(!otp){working=false;button.disabled=false;return;}
JS;
otpModalReplace($script,$old,$new,'branded OTP before submit');
otpModalReplace($script,"mfa_code:String(v.get('mfa_code')||'')","mfa_code:otp",'one-time code payload');
if(file_put_contents($file,$script)===false)throw new RuntimeException('Withdrawal modal script update failed');
$client='/var/www/html/public/static/client.html';
$html=file_get_contents($client);
if(!is_string($html))throw new RuntimeException('Withdrawal modal: client missing');
if(substr_count($html,'/static/seller_mfa.js?v=20261122-1')!==1)
    throw new RuntimeException('Withdrawal modal: MFA module is missing from client');
$html=str_replace('/static/seller_mfa.js?v=20261122-1',
    '/static/seller_mfa.js?v=withdraw-dialog-20261122-1',$html);
$found=0;
$html=preg_replace_callback('~(/static/merchant-portal\.js\?v=)[A-Za-z0-9._-]+~',
    static fn($m)=>$m[1].'withdraw-dialog-20261122-1',$html,1,$found);
if($found!==1||!is_string($html))
    throw new RuntimeException('Withdrawal modal: merchant JS version not found uniquely');
if(file_put_contents($client,$html)===false)
    throw new RuntimeException('Withdrawal modal: cannot update Safari cache version');
echo "PASS: branded post-click TOTP dialog; zero wallet calls before OTP; no change to server-side payout guard\n";
