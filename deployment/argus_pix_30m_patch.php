<?php
declare(strict_types=1);
/**
 * Server-side reconciliation remains active after the QR popup closes.
 * Reconcile pending traditional Pix only within 30 minutes after creation.
 * Provider verification remains mandatory to mark a charge paid.
 */
$file='/var/www/html/src/TraditionalQuickPix.php';
$source=file_get_contents($file);
if(!is_string($source))throw new RuntimeException('Pix source missing');
$old=<<<'PHP'
$cutoff=gmdate('Y-m-d H:i:s',time()-7*86400);
PHP;
$new=<<<'PHP'
$cutoff=gmdate('Y-m-d H:i:s',time()-1800);
PHP;
if(substr_count($source,$old)!==1)throw new RuntimeException('Monitor cutoff anchor changed');
if(file_put_contents($file,str_replace($old,$new,$source))===false)
    throw new RuntimeException('Could not apply 30-minute Pix monitoring window');
echo "ARGUS: thirty-minute server reconciliation enabled.\n";
