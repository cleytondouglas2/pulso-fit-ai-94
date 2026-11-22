<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Render a QR image from an existing, provider-issued PIX "copia e cola".
 * No outgoing HTTP requests, payment operations, database writes, or logging.
 * qrencode is invoked with a command array (no shell interpolation).
 */
final class ArgusPixQr {
    public static function pngDataUri(?string $copyPaste):?string {
        if(!is_string($copyPaste))return null;
        $length=strlen($copyPaste);
        if($length<20||$length>1800||preg_match('/[\x00-\x1F\x7F]/',$copyPaste))return null;
        if(!function_exists('proc_open')||!is_executable('/usr/bin/qrencode'))return null;
        $spec=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
        $pipes=[];
        $process=@proc_open(
            ['/usr/bin/qrencode','-8','-t','PNG','-o','-','-s','6','-m','4','-l','M'],
            $spec,$pipes,null,null,['bypass_shell'=>true]
        );
        if(!is_resource($process))return null;
        $png='';
        try{
            $written=@fwrite($pipes[0],$copyPaste);
            @fclose($pipes[0]);
            $png=@stream_get_contents($pipes[1],131073);
            @fclose($pipes[1]);
            @stream_get_contents($pipes[2],1024);
            @fclose($pipes[2]);
            $code=@proc_close($process);
            if($written!==$length||$code!==0||!is_string($png)||
                strlen($png)<64||strlen($png)>131072||
                !str_starts_with($png,"\x89PNG\r\n\x1a\n"))return null;
            return 'data:image/png;base64,'.base64_encode($png);
        }catch(\Throwable){
            foreach($pipes as $p){if(is_resource($p))@fclose($p);}
            @proc_terminate($process);
            @proc_close($process);
            return null;
        }
    }
}
