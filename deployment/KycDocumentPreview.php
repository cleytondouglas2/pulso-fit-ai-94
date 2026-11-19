<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Renders a single protected PDF page to a PNG for browsers (including iOS
 * Safari) that cannot reliably display blob: PDF frames. NEVER accepts user
 * paths, URLs, flags or executable commands: only the decrypted PDF bytes from
 * the KYC service. The caller must authenticate the KYC reviewer, authorize
 * account/document ownership and audit access BEFORE invoking this class.
 */
final class KycDocumentPreview {
    private const MAX_PAGES=30;
    private const MAX_PDF_BYTES=3200000;
    private const MAX_IMAGE_BYTES=6000000;

    private static function fail(string $message,int $code=422):never {
        throw new ApiError($message,$code);
    }
    private static function validate(string $bytes):void {
        if(strlen($bytes)<1024||strlen($bytes)>self::MAX_PDF_BYTES||
           !str_starts_with($bytes,'%PDF-'))
            self::fail('Arquivo PDF inválido ou incompatível para visualização',422);
    }
    /** A private temporary directory exists only for the duration of rendering. */
    private static function withPdf(string $bytes,callable $work):mixed {
        self::validate($bytes);
        $dir=sys_get_temp_dir().'/argus-kyc-'.bin2hex(random_bytes(12));
        if(!mkdir($dir,0700)||!is_dir($dir))
            self::fail('Visualizador PDF temporariamente indisponível',503);
        $input=$dir.'/input.pdf';
        try {
            if(file_put_contents($input,$bytes,LOCK_EX)!==strlen($bytes))
                self::fail('Não foi possível preparar o PDF protegido',503);
            chmod($input,0600);
            return $work($input,$dir);
        } finally {
            foreach(glob($dir.'/*')?:[] as $file)if(is_file($file))@unlink($file);
            @rmdir($dir);
        }
    }
    private static function run(array $args):array {
        if(!function_exists('proc_open'))
            self::fail('Visualizador PDF não está disponível no servidor',503);
        $spec=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
        $pipes=[];
        $process=@proc_open($args,$spec,$pipes,null,null,['bypass_shell'=>true]);
        if(!is_resource($process))self::fail('Falha ao iniciar visualização protegida do PDF',503);
        fclose($pipes[0]);
        $output=stream_get_contents($pipes[1]);
        $error=stream_get_contents($pipes[2]);
        fclose($pipes[1]);fclose($pipes[2]);
        $exit=proc_close($process);
        // Deliberately never return process stderr: it might contain PDF metadata.
        return [$exit,is_string($output)?$output:''];
    }
    private static function pageCount(string $path):int {
        [$exit,$out]=self::run(['/usr/bin/timeout','6s','/usr/bin/pdfinfo',$path]);
        if($exit!==0||!preg_match('/^Pages:\s*(\d+)\s*$/mi',$out,$m))
            self::fail('PDF não pôde ser interpretado. Baixe o original para conferência.',422);
        $count=(int)$m[1];
        if($count<1||$count>200)
            self::fail('PDF possui quantidade de páginas não suportada. Baixe o original.',422);
        return $count;
    }
    public static function info(string $bytes):array {
        return self::withPdf($bytes,static function(string $path):array {
            $count=self::pageCount($path);
            return [
                'pages'=>$count,
                'preview_pages'=>min($count,self::MAX_PAGES),
                'truncated'=>$count>self::MAX_PAGES
            ];
        });
    }
    public static function png(string $bytes,int $page):string {
        if($page<1||$page>self::MAX_PAGES)
            self::fail('Página PDF fora do intervalo de visualização',422);
        return self::withPdf($bytes,static function(string $path,string $dir)use($page):string {
            $pages=self::pageCount($path);
            if($page>$pages)self::fail('Página PDF inexistente',404);
            $target=$dir.'/page';
            // Scale the longest edge to 1400 pixels to avoid huge raster output.
            // timeout prevents excessively complex PDFs holding PHP workers.
            [$exit,$_]=self::run([
                '/usr/bin/timeout','12s','/usr/bin/pdftoppm',
                '-f',(string)$page,'-l',(string)$page,
                '-singlefile','-scale-to','1400','-png',$path,$target
            ]);
            $png=$target.'.png';
            if($exit!==0||!is_file($png))
                self::fail('Não foi possível renderizar esta página. Baixe o PDF original.',422);
            $size=filesize($png);
            if($size===false||$size<64||$size>self::MAX_IMAGE_BYTES)
                self::fail('Prévia PDF excede o limite seguro',422);
            $image=file_get_contents($png);
            if(!is_string($image)||!str_starts_with($image,"\x89PNG\r\n\x1a\n"))
                self::fail('Prévia PNG indisponível',422);
            return $image;
        });
    }
}
