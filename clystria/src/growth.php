<?php
/** Clystria: CRM and financial growth modules — standalone server routes. */
declare(strict_types=1);
function growthSchema():void {
 static $once=false;if($once)return;$pdo=getDb();
 foreach([
 "CREATE TABLE IF NOT EXISTS crm_leads(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',stage TEXT NOT NULL DEFAULT 'new',value_cents BIGINT NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS crm_interactions(id TEXT PRIMARY KEY,client_id TEXT DEFAULT NULL,lead_id TEXT DEFAULT NULL,message TEXT NOT NULL,channel TEXT DEFAULT 'note',actor TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS crm_invoices(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,plan_id TEXT DEFAULT NULL,amount_cents BIGINT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',paid_at TEXT DEFAULT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE)",
 "CREATE TABLE IF NOT EXISTS crm_campaigns(id TEXT PRIMARY KEY,title TEXT NOT NULL,channel TEXT NOT NULL,template TEXT NOT NULL,days_offset INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS crm_message_queue(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,campaign_id TEXT NOT NULL,channel TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',due_date TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,provider_message_id TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,campaign_id,channel,due_date))",
 "CREATE TABLE IF NOT EXISTS crm_consent(client_id TEXT PRIMARY KEY,whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,email_opt_in INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS crm_referrals(id TEXT PRIMARY KEY,referrer_id TEXT NOT NULL,client_id TEXT NOT NULL,bonus_cents BIGINT NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS crm_second_factor(staff_id TEXT PRIMARY KEY,secret_enc TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0)"
 ] as $sql)$pdo->exec($sql);$once=true;
}
function growthOtp(string $secret,int $adjust=0):string {
 $alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split($secret) as $char){$n=strpos($alpha,$char);if($n===false)return ''; $bits.=str_pad(decbin($n),5,'0',STR_PAD_LEFT);}
 $key='';foreach(str_split(substr($bits,0,intdiv(strlen($bits),8)*8),8) as $part)$key.=chr(bindec($part));
 $h=hash_hmac('sha1',pack('N2',0,(int)floor(time()/30)+$adjust),$key,true);$o=ord($h[19])&15;
 return str_pad((string)((((ord($h[$o])&127)<<24)|((ord($h[$o+1])&255)<<16)|((ord($h[$o+2])&255)<<8)|(ord($h[$o+3])&255))%1000000),6,'0',STR_PAD_LEFT);
}
function growthOtpValid(string $secret,mixed $code):bool {
 if(!is_string($code)||!preg_match('/^\d{6}$/',$code))return false;
 foreach([-1,0,1] as $i)if(hash_equals(growthOtp($secret,$i),$code))return true;
 return false;
}
function verifyGrowth2fa(array $staff,mixed $otp):bool {
 growthSchema();$row=one('SELECT secret_enc,enabled FROM crm_second_factor WHERE staff_id=?',[$staff['id']]);
 return !$row||(int)$row['enabled']!==1||growthOtpValid(unseal($row['secret_enc']),$otp);
}
function growthPaid(string $id,string $actor):array {
 $pdo=getDb();$pdo->beginTransaction();
 try {
 $i=one('SELECT * FROM crm_invoices WHERE id=?',[$id]);if(!$i)throw new InvalidArgumentException('Fatura não encontrada');
 if($i['status']==='paid'){$pdo->commit();return ['ok'=>true,'already_paid'=>true];}
 if($i['status']!=='pending')throw new InvalidArgumentException('Fatura indisponível');
 if(run("UPDATE crm_invoices SET status='paid',paid_at=? WHERE id=? AND status='pending'",[today(),$id])!==1){$pdo->commit();return ['ok'=>true,'already_paid'=>true];}
 run('INSERT INTO payments(id,client_id,amount_cents,method,description,paid_at) VALUES(?,?,?,?,?,?)',[id(),$i['client_id'],$i['amount_cents'],'manual','Fatura '.$id,today()]);
 $c=one('SELECT c.due_date,c.plan_id,p.days FROM clients c LEFT JOIN plans p ON p.id=COALESCE(?,c.plan_id) WHERE c.id=?',[$i['plan_id'],$i['client_id']]);
 if($c&&(int)($c['days']??0)>0){$base=max(today(),$c['due_date']);$new=(new DateTimeImmutable($base))->modify('+'.(int)$c['days'].' days')->format('Y-m-d');run("UPDATE clients SET due_date=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?",[$new,$i['client_id']]);}
 activity($actor,'fatura.baixa',$id);$pdo->commit();return ['ok'=>true,'renewed'=>(bool)($c&&(int)($c['days']??0)>0)];
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
function growthApi(string $route,string $method,string $role,string $actor,array $session):void {
 if(!str_starts_with($route,'/api/crm/')&&!str_starts_with($route,'/api/security/'))return;
 growthSchema();
 if($route==='/api/crm/summary'&&$method==='GET')jsonout(['leads'=>all('SELECT stage,COUNT(*) total,SUM(value_cents) value FROM crm_leads GROUP BY stage'),'invoices'=>all('SELECT status,COUNT(*) total,SUM(amount_cents) value FROM crm_invoices GROUP BY status'),'messages'=>all('SELECT status,COUNT(*) total FROM crm_message_queue GROUP BY status')]);
 if($route==='/api/crm/leads'&&$method==='GET')jsonout(['leads'=>all('SELECT * FROM crm_leads ORDER BY created_at DESC LIMIT 2000')]);
 if($route==='/api/crm/leads'&&$method==='POST'){
  $x=body();$name=clean($x['name']??'',100);$stage=clean($x['stage']??'new',25);if(!$name||!in_array($stage,['new','contacted','negotiating','won','lost'],true))fail(400,'Dados inválidos');
  $id=id();run('INSERT INTO crm_leads(id,name,phone,email,source,stage,value_cents,notes) VALUES(?,?,?,?,?,?,?,?)',[$id,$name,clean($x['phone']??'',40),clean($x['email']??'',180),clean($x['source']??'',80),$stage,money($x['value']??0),clean($x['notes']??'',2000)]);activity($actor,'crm.lead',$name);jsonout(['id'=>$id],201);
 }
 if(preg_match('~^/api/crm/leads/([a-f0-9]{32})$~',$route,$m)&&in_array($method,['PUT','DELETE'],true)){
  if(!canManage($role))fail(403,'Acesso restrito');if(!one('SELECT 1 FROM crm_leads WHERE id=?',[$m[1]]))fail(404,'Oportunidade não encontrada');
  if($method==='DELETE'){run('DELETE FROM crm_interactions WHERE lead_id=?',[$m[1]]);run('DELETE FROM crm_leads WHERE id=?',[$m[1]]);jsonout(['ok'=>true]);}
  $x=body();$stage=clean($x['stage']??'',25);if(!in_array($stage,['new','contacted','negotiating','won','lost'],true))fail(400,'Etapa inválida');run('UPDATE crm_leads SET stage=? WHERE id=?',[$stage,$m[1]]);activity($actor,'crm.lead.etapa',$stage);jsonout(['ok'=>true]);
 }
 if($route==='/api/crm/interactions'&&$method==='GET')jsonout(['interactions'=>all('SELECT i.*,c.name client_name,l.name lead_name FROM crm_interactions i LEFT JOIN clients c ON c.id=i.client_id LEFT JOIN crm_leads l ON l.id=i.lead_id ORDER BY i.created_at DESC LIMIT 200')]);
 if($route==='/api/crm/interactions'&&$method==='POST'){
  $x=body();$cid=clean($x['client_id']??'',60);$lid=clean($x['lead_id']??'',60);$msg=clean($x['message']??'',2000);
  if(!$msg||(($cid==='')===($lid===''))||($cid&&!one('SELECT 1 FROM clients WHERE id=?',[$cid]))||($lid&&!one('SELECT 1 FROM crm_leads WHERE id=?',[$lid])))fail(400,'Informe cliente ou lead e uma anotação válida');
  run('INSERT INTO crm_interactions(id,client_id,lead_id,message,channel,actor) VALUES(?,?,?,?,?,?)',[id(),$cid?:null,$lid?:null,$msg,clean($x['channel']??'note',30),$actor]);activity($actor,'crm.atendimento','Anotação registrada');jsonout(['ok'=>true],201);
 }
 if($route==='/api/crm/invoices'&&$method==='GET')jsonout(['invoices'=>all('SELECT i.*,c.name client_name FROM crm_invoices i JOIN clients c ON c.id=i.client_id ORDER BY i.created_at DESC LIMIT 2000')]);
 if($route==='/api/crm/invoices'&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');$x=body();$client=one('SELECT id FROM clients WHERE id=? AND archived_at IS NULL',[$x['client_id']??'']);$due=clean($x['due_date']??'',10);$amount=money($x['amount']??0);
  if(!$client||!date_valid($due)||$amount<1)fail(400,'Cliente, valor ou vencimento inválido');
  $plan=clean($x['plan_id']??'',60)?:null;if($plan&&!one('SELECT id FROM plans WHERE id=?',[$plan]))fail(400,'Plano inválido');
  $id=id();run('INSERT INTO crm_invoices(id,client_id,plan_id,amount_cents,due_date) VALUES(?,?,?,?,?)',[$id,$client['id'],$plan,$amount,$due]);activity($actor,'crm.fatura','Gerada: '.$id);jsonout(['ok'=>true,'id'=>$id],201);
 }
 if(preg_match('~^/api/crm/invoices/([a-f0-9]{32})/paid$~',$route,$m)&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');jsonout(growthPaid($m[1],$actor));
 }
 if($route==='/api/crm/campaigns'&&$method==='GET')jsonout(['campaigns'=>all('SELECT * FROM crm_campaigns ORDER BY created_at DESC'),'queue'=>all('SELECT q.*,c.name client_name FROM crm_message_queue q JOIN clients c ON c.id=q.client_id ORDER BY q.created_at DESC LIMIT 150')]);
 if($route==='/api/crm/campaigns'&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');$x=body();$title=clean($x['title']??'',100);$message=clean($x['template']??'',1000);$channel=clean($x['channel']??'',20);$offset=(int)($x['days_offset']??0);
  if(!$title||!$message||!in_array($channel,['email','whatsapp'],true)||$offset< -180||$offset>180)fail(400,'Campanha inválida');
  $id=id();run('INSERT INTO crm_campaigns(id,title,channel,template,days_offset,enabled) VALUES(?,?,?,?,?,?)',[$id,$title,$channel,$message,$offset,empty($x['enabled'])?0:1]);activity($actor,'crm.campanha',$title);jsonout(['id'=>$id],201);
 }
 if(preg_match('~^/api/crm/campaigns/([a-f0-9]{32})/toggle$~',$route,$m)&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');$row=one('SELECT enabled FROM crm_campaigns WHERE id=?',[$m[1]]);if(!$row)fail(404,'Não encontrada');run('UPDATE crm_campaigns SET enabled=? WHERE id=?',[(int)$row['enabled']?0:1,$m[1]]);jsonout(['ok'=>true]);
 }
 if(preg_match('~^/api/crm/consent/([a-f0-9]{32})$~',$route,$m)){
  if(!one('SELECT 1 FROM clients WHERE id=?',[$m[1]]))fail(404,'Cliente não encontrado');
  if($method==='GET')jsonout(['consent'=>one('SELECT * FROM crm_consent WHERE client_id=?',[$m[1]])??['whatsapp_opt_in'=>0,'email_opt_in'=>0]]);
  if($method==='PUT'){if(!canManage($role))fail(403,'Acesso restrito');$x=body();run('INSERT INTO crm_consent(client_id,whatsapp_opt_in,email_opt_in) VALUES(?,?,?) ON CONFLICT(client_id) DO UPDATE SET whatsapp_opt_in=excluded.whatsapp_opt_in,email_opt_in=excluded.email_opt_in,updated_at=CURRENT_TIMESTAMP',[$m[1],empty($x['whatsapp_opt_in'])?0:1,empty($x['email_opt_in'])?0:1]);activity($actor,'crm.consentimento',$m[1]);jsonout(['ok'=>true]);}
 }
 if($route==='/api/crm/referrals'&&$method==='GET')jsonout(['referrals'=>all('SELECT r.*,a.name referrer_name,b.name referred_name FROM crm_referrals r JOIN clients a ON a.id=r.referrer_id JOIN clients b ON b.id=r.client_id ORDER BY r.created_at DESC')]);
 if($route==='/api/crm/referrals'&&$method==='POST'){
  $x=body();$a=clean($x['referrer_id']??'',60);$b=clean($x['client_id']??'',60);if(!$a||!$b||$a===$b||!one('SELECT 1 FROM clients WHERE id=?',[$a])||!one('SELECT 1 FROM clients WHERE id=?',[$b]))fail(400,'Clientes inválidos');run('INSERT INTO crm_referrals(id,referrer_id,client_id,bonus_cents) VALUES(?,?,?,?)',[id(),$a,$b,money($x['bonus']??0)]);activity($actor,'crm.indicacao',$a);jsonout(['ok'=>true],201);
 }
 if($route==='/api/security/2fa'&&$method==='GET'){ $r=one('SELECT enabled FROM crm_second_factor WHERE staff_id=?',[$session['staff_id']]);jsonout(['enabled'=>(bool)($r['enabled']??false)]); }
 if($route==='/api/security/2fa/start'&&$method==='POST'){
  $random=random_bytes(20);$alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split($random) as $byte)$bits.=str_pad(decbin(ord($byte)),8,'0',STR_PAD_LEFT);$secret='';foreach(str_split($bits,5) as $part)$secret.=$alpha[bindec(str_pad($part,5,'0'))];
  run('INSERT INTO crm_second_factor(staff_id,secret_enc,enabled) VALUES(?,?,0) ON CONFLICT(staff_id) DO UPDATE SET secret_enc=excluded.secret_enc,enabled=0',[$session['staff_id'],seal($secret)]);jsonout(['secret'=>$secret,'uri'=>'otpauth://totp/'.rawurlencode('Clystria:'.$session['email']).'?secret='.$secret.'&issuer=Clystria']);
 }
 if($route==='/api/security/2fa/confirm'&&$method==='POST'){
  $r=one('SELECT secret_enc FROM crm_second_factor WHERE staff_id=?',[$session['staff_id']]);$x=body();if(!$r||!growthOtpValid(unseal($r['secret_enc']),$x['code']??''))fail(400,'Código inválido');run('UPDATE crm_second_factor SET enabled=1 WHERE staff_id=?',[$session['staff_id']]);activity($actor,'2fa.ativado','Conta protegida');jsonout(['ok'=>true]);
 }
 if($route==='/api/security/2fa/disable'&&$method==='POST'){
  $x=body();$u=one('SELECT passhash FROM staff WHERE id=?',[$session['staff_id']]);$r=one('SELECT secret_enc FROM crm_second_factor WHERE staff_id=?',[$session['staff_id']]);
  if(!$u||!password_verify((string)($x['password']??''),$u['passhash'])||!$r||!growthOtpValid(unseal($r['secret_enc']),$x['code']??''))fail(403,'Credenciais inválidas');run('DELETE FROM crm_second_factor WHERE staff_id=?',[$session['staff_id']]);activity($actor,'2fa.desativado','Ação confirmada');jsonout(['ok'=>true]);
 }
 fail(404,'Recurso não encontrado');
}
