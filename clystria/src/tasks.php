<?php
/** Run through an external scheduler: php src/tasks.php */
declare(strict_types=1);
require_once __DIR__.'/integrations.php';

function smtpSend(string $recipient,string $subject,string $message):void {
 $host=envv('SMTP_HOST');$port=(int)envv('SMTP_PORT','465');$from=envv('SMTP_FROM');$user=envv('SMTP_USER');$pass=envv('SMTP_PASS');
 if(!$host||!$from||!filter_var($recipient,FILTER_VALIDATE_EMAIL)||!filter_var($from,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Configuração SMTP ou destinatário inválido');
 $scheme=$port===465?'ssl://':'tcp://';$socket=stream_socket_client($scheme.$host.':'.$port,$errno,$errstr,12,STREAM_CLIENT_CONNECT,stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'peer_name'=>$host]]));
 if(!$socket)throw new RuntimeException('Falha no SMTP: '.$errstr);stream_set_timeout($socket,14);
 $read=function(array $codes)use($socket):string{$message='';do{$line=fgets($socket,1024);if($line===false)throw new RuntimeException('SMTP encerrou a conexão');$message.=$line;}while(strlen($line)>3&&$line[3]==='-');$code=(int)substr($line,0,3);if(!in_array($code,$codes,true))throw new RuntimeException('Servidor SMTP recusou solicitação ('.$code.')');return $message;};
 $send=function(string $cmd,array $codes)use($socket,$read):void{fwrite($socket,$cmd."\r\n");$read($codes);};
 try{
  $read([220]);$send('EHLO clystria.app',[250]);
  if($port===587){$send('STARTTLS',[220]);if(!stream_socket_enable_crypto($socket,true,STREAM_CRYPTO_METHOD_TLS_CLIENT))throw new RuntimeException('Falha STARTTLS');$send('EHLO clystria.app',[250]);}
  if($user!==''){$send('AUTH LOGIN',[334]);$send(base64_encode($user),[334]);$send(base64_encode($pass),[235]);}
  $send('MAIL FROM:<'.$from.'>',[250]);$send('RCPT TO:<'.$recipient.'>',[250,251]);$send('DATA',[354]);
  $safeSubject='=?UTF-8?B?'.base64_encode(str_replace(["\r","\n"],' ',$subject)).'?=';
  $payload="From: <{$from}>\r\nTo: <{$recipient}>\r\nSubject: {$safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($message),76,"\r\n");
  $send(rtrim($payload,"\r\n")."\r\n.",[250]);$send('QUIT',[221]);
 }finally{fclose($socket);}
}

if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
try{
 $syncCount=0;$panels=all('SELECT id,last_attempt FROM panels WHERE auto_sync=1');
 foreach($panels as $p){$last=$p['last_attempt']?strtotime($p['last_attempt']):false;if($last!==false&&time()-$last<3600)continue;try{syncPanel($p['id']);$syncCount++;}catch(Throwable $e){error_log('Clystria sync failed: '.$e->getMessage());}}
 $sent=0;if(config('email_enabled')==='true'&&envv('SMTP_HOST')&&envv('SMTP_FROM')){
  $days=array_map('intval',explode(',',config('reminder_days','7,3,1,0,-1,-3,-7')));
  foreach(reminderRows() as $c){if(!$c['email']||!filter_var($c['email'],FILTER_VALIDATE_EMAIL)||!in_array($c['d'],$days,true))continue;
   if(one('SELECT 1 FROM reminders WHERE client_id=? AND channel=? AND due_date=? AND sent_on=?',[$c['id'],'email',$c['due_date'],today()]))continue;
   try{smtpSend($c['email'],config('email_subject'),reminderMessage($c));run('INSERT INTO reminders(id,client_id,channel,due_date,sent_on,status) VALUES(?,?,?,?,?,?) ON CONFLICT(client_id,channel,due_date,sent_on) DO NOTHING',[id(),$c['id'],'email',$c['due_date'],today(),'sent']);$sent++;}catch(Throwable $e){error_log('Clystria mail failed for ID '. $c['id'].': '.$e->getMessage());}}
 }
 echo json_encode(['ok'=>true,'sync_count'=>$syncCount,'emails_sent'=>$sent,'date'=>today()],JSON_UNESCAPED_UNICODE).PHP_EOL;
}catch(Throwable $e){error_log($e->getMessage());exit(1);}
