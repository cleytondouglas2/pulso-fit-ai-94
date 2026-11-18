<?php
declare(strict_types=1);
require_once '/var/www/html/src/DocumentValidation.php';
use ArgusPayments\DocumentValidation;
$cnpj='19131243000197';
[$s,$match]=DocumentValidation::evaluateCnpj($cnpj,'OPEN KNOWLEDGE BRASIL',[
 'cnpj'=>$cnpj,'razao_social'=>'OPEN KNOWLEDGE BRASIL','descricao_situacao_cadastral'=>'ATIVA']);
if($s!=='cnpj_active_match'||$match!==1)throw new RuntimeException('CNPJ active exact mismatch');
[$s,$match]=DocumentValidation::evaluateCnpj($cnpj,'OUTRA EMPRESA',[
 'cnpj'=>$cnpj,'razao_social'=>'OPEN KNOWLEDGE BRASIL','descricao_situacao_cadastral'=>'ATIVA']);
if($s!=='cnpj_active_review'||$match!==0)throw new RuntimeException('CNPJ name mismatch must require human review');
[$s]=DocumentValidation::evaluateCnpj($cnpj,'OPEN KNOWLEDGE BRASIL',[
 'cnpj'=>$cnpj,'descricao_situacao_cadastral'=>'BAIXADA']);
if($s!=='cnpj_inactive')throw new RuntimeException('Inactive CNPJ not flagged');
[$s]=DocumentValidation::evaluateCnpj($cnpj,'OPEN KNOWLEDGE BRASIL',[
 'cnpj'=>'11111111111111','descricao_situacao_cadastral'=>'ATIVA']);
if($s!=='cnpj_unavailable')throw new RuntimeException('Mismatched lookup not rejected');
if(DocumentValidation::formatValid('%PDF-1.4 fake','application/pdf'))throw new RuntimeException('Truncated PDF accepted');
if(!DocumentValidation::formatValid("%PDF-1.4\nbody\n%%EOF",'application/pdf'))throw new RuntimeException('PDF structural check failed');
if(DocumentValidation::formatValid('not-an-image','image/jpeg'))throw new RuntimeException('Corrupt image accepted');
echo "ARGUS document structure and public CNPJ interpretation checks passed\n";
