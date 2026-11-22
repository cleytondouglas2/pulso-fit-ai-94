<?php
/** Background delivery jobs. Execute in CLI only; no public HTTP endpoint. */
declare(strict_types=1);
function growthTasks():array {
 growthSchema();$created=0;$sent=0;$failed=0;
 foreach(all('SELECT * FROM crm_campaigns WHERE enabled=1') as $campaign){
  $channel=$campaign['channel'];$col=$channel==='whatsapp'?'whatsapp_opt_in':'email_opt_in';
  $clients=all("SELECT c.* FROM clients c JOIN crm_consent co ON co.client_id=c.id WHERE c.archived_at IS NULL AND c.status IN ('active','trial') AND co.$col=1");
  foreach($clients as $c){
   if(due_diff($c['due_date'])!==(int)$campaign['days_offset'])continue;
   $contact=$channel==='email'?filter_var($c['email'],FILTER_VALIDATE_EMAIL):(bool)preg_match('/^\d{10,15}$/',preg_replace('/\D/','',$c['phone']));
   if(!$contact)continue;
   $text=str_replace(['{nome}','{vencimento}','{valor}','{login}'],[$c['name'],date('d/m/Y',strtotime($c['due_date'])),number_format((int)$c['price_cents']/100,2,',','.'),$c['username']],$campaign['template']);
   $created+=run("INSERT INTO crm_message_queue(id,client_id,campaign_id,channel,body,due_date) VALUES(?,?,?,?,?,?) ON CONFLICT(client_id,campaign_id,channel,due_date) DO NOTHING",[id(),$c['id'],$campaign['id'],$channel,$text,$c['due_date']]);
  }
 }
 foreach(all("SELECT q.*,c.email,c.phone FROM crm_message_queue q JOIN clients c ON c.id=q.client_id JOIN crm_consent co ON co.client_id=c.id WHERE q.status='pending' AND ((q.channel='whatsapp' AND co.whatsapp_opt_in=1) OR (q.channel='email' AND co.email_opt_in=1)) ORDER BY q.created_at LIMIT 25") as $q){
  $ready=$q['channel']==='email'?(envv('SMTP_HOST')!==''&&envv('SMTP_FROM')!==''):(envv('WA_CLOUD_TOKEN')!==''&&envv('WA_PHONE_ID')!==''&&envv('WA_TEMPLATE_NAME')!=='');
  if(!$ready)continue;
  if(run("UPDATE crm_message_queue SET status='processing',attempts=attempts+1 WHERE id=? AND status='pending'",[$q['id']])!==1)continue;
  try {
   if($q['channel']==='email'){smtpSend($q['email'],config('email_subject','Lembrete de assinatura'),$q['body']);$msgid='smtp';}
   else {
    $number=preg_replace('/\D/','',$q['phone']);if(strlen($number)===10||strlen($number)===11)$number='55'.$number;
    $version=envv('WA_GRAPH_VERSION','v23.0');if(!preg_match('/^v\d+\.\d+$/',$version))throw new RuntimeException('Versão Graph inválida');
    $payload=['messaging_product'=>'whatsapp','to'=>$number,'type'=>'template','template'=>['name'=>envv('WA_TEMPLATE_NAME'),'language'=>['code'=>'pt_BR']]];
    $url='https://graph.facebook.com/'.$version.'/'.rawurlencode(envv('WA_PHONE_ID')).'/messages';
    $ch=curl_init($url);curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($payload,JSON_THROW_ON_ERROR),CURLOPT_HTTPHEADER=>['Content-Type: application/json','Authorization: Bearer '.envv('WA_CLOUD_TOKEN')],CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>20,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false]);
    $response=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);$decoded=is_string($response)?json_decode($response,true):null;
    if($status<200||$status>=300||empty($decoded['messages'][0]['id']))throw new RuntimeException('Envio não aceito pela Meta (HTTP '.$status.')');
    $msgid=(string)$decoded['messages'][0]['id'];
   }
   run("UPDATE crm_message_queue SET status='sent',provider_message_id=? WHERE id=?",[$msgid,$q['id']]);$sent++;
  }catch(Throwable $e){run("UPDATE crm_message_queue SET status='failed',last_error=? WHERE id=?",[mbcut($e->getMessage(),200),$q['id']]);$failed++;error_log('growthTasks: '.$e->getMessage());}
 }
 return ['created'=>$created,'sent'=>$sent,'failed'=>$failed];
}
