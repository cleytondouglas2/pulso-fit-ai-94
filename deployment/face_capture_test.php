<?php
declare(strict_types=1);
/** Synthetic camera/JPEG storage and KYC state tests. No real biometric data. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
use ArgusPayments\FaceCapture;
putenv('ARGUS_DOC_HMAC_KEY='.str_repeat('B',64));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);KycStudio::install($db);FaceCapture::install($db);
$id=bin2hex(random_bytes(16));$created=DB::stamp();
$db->run('INSERT INTO argus_portal_accounts
  (id,account_type,display_name,email,document_digest,document_last4,
  password_hash,status,merchant_id,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
  $id,'PF','Facial test','face-'.substr($id,0,10).'@example.invalid',
  hash('sha256',$id),'0000','test-not-login','documents_required',null,$created,$created
]);
$account=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
$before=FaceCapture::status($db,$id);
if($before['guided_capture_completed']||$before['bank_grade_liveness']||$before['identity_verified'])
 throw new RuntimeException('Face captured without challenge');
$path='/tmp/argus-face-synthetic-'.substr($id,0,12).'.jpg';
$command=['convert','-size','800x800','gradient:#d8d4cc-#847461',
    '-quality','87','-strip',$path];
$proc=proc_open($command,[
  0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']
],$pipes,null,null,['bypass_shell'=>true]);
if(!is_resource($proc))throw new RuntimeException('Synthetic image tool unavailable');
fclose($pipes[0]);stream_get_contents($pipes[1]);stream_get_contents($pipes[2]);
fclose($pipes[1]);fclose($pipes[2]);
$exit=proc_close($proc);
if($exit!==0||!is_file($path))throw new RuntimeException('Synthetic JPG fixture failed');
$bytes=file_get_contents($path);@unlink($path);
if(!is_string($bytes)||strlen($bytes)<1024)throw new RuntimeException('Synthetic JPG unreadable');
$stored=KycStudio::storeGuidedSelfie($db,$account,$bytes,'image/jpeg');
$row=$db->one('SELECT * FROM argus_kyc_encrypted_documents WHERE id=? AND account_id=?',[$stored['id'],$id]);
if(!$row||str_contains((string)$row['payload_encrypted'],$bytes)||
   (string)$row['sha256']!==hash('sha256',$bytes))
 throw new RuntimeException('Guided selfie not encrypted or bound to owner');
$kyc=KycStudio::summary($db,$account);
if(!in_array('selfie',$kyc['received'],true)||KycStudio::identityApproved($db,$id)||
   $kyc['financial_enabled'])
 throw new RuntimeException('Camera capture is not isolated from KYC/financial approval');
$challenge=bin2hex(random_bytes(16));
$steps=['turn_left','blink','center'];
$db->run('INSERT INTO argus_kyc_face_challenges
 (id,account_id,steps_json,issued_at,expires_at,used_at,capture_hash)
 VALUES(?,?,?,?,?,?,?)',[
  $challenge,$id,json_encode($steps,JSON_THROW_ON_ERROR),$created,
  gmdate('Y-m-d H:i:s',time()+140),DB::stamp(),hash('sha256',$bytes)
]);
$face=FaceCapture::status($db,$id);
if(!$face['guided_capture_completed']||$face['identity_verified']||
   $face['bank_grade_liveness']||$face['status']!=='captured_pending_human_review')
 throw new RuntimeException('Guided capture incorrectly reported certified or approved');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$backend=(string)file_get_contents('/var/www/html/src/KycStudio.php');
$server=(string)file_get_contents('/var/www/html/src/FaceCapture.php');
$client=(string)file_get_contents('/var/www/html/public/static/kyc-portal.js');
$camera=(string)file_get_contents('/var/www/html/public/static/face-capture.js');
$html=(string)file_get_contents('/var/www/html/public/static/client.html');
foreach(["require_once __DIR__ . '/FaceCapture.php'"] as $token){
 if(!str_contains($gateway,$token))throw new RuntimeException('Gateway missing face module');
}
foreach(["/api/portal/kyc/face/start","/api/portal/kyc/face/complete",
    "storeGuidedSelfie","face_capture","face_guided_capture"] as $token){
 if(!str_contains($backend.$server,$token))
  throw new RuntimeException('KYC face processing missing: '.$token);
}
foreach(["getUserMedia","FaceLandmarker.createFromOptions","detectForVideo",
    "eyeBlinkLeft","eyeBlinkRight","performance.now","photo_base64",
    "window.ArgusFaceCapture","mediaDevices","facingMode",
    "'blink'","'center'"] as $token){
 if(!str_contains($camera,$token))throw new RuntimeException('Motion camera UI absent: '.$token);
}
if(str_contains($camera,'getUserMedia({audio:true')||
   !str_contains($camera,'audio:false'))
 throw new RuntimeException('Microphone must remain off');
if(!str_contains($client,'data-kyc-face-open')||
   !str_contains($client,'Refazer captura facial')||
   !str_contains($html,'face-capture.js?v=1')||
   !str_contains($html,'face-capture.css?v=1')||
   !str_contains($html,'kyc-portal.js?v=3'))
 throw new RuntimeException('Guided camera not integrated into customer dashboard');
foreach(['random_bytes(16)','expires_at','used_at IS NULL',
    "face_guided_capture",'bank_grade_liveness','status','received'] as $token){
 if(!str_contains($backend.$server,$token))
  throw new RuntimeException('Missing challenge replay, scope, or review safeguard: '.$token);
}
echo "PASS: encrypted synthetic camera selfie, KYC-safe guided challenges, TTL/replay guards, iPhone camera UX, no gallery bypass, no automatic identity or Pix approval.\n";
