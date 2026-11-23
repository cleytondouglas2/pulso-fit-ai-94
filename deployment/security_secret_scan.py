#!/usr/bin/env python3
"""Redacted, bounded scan of tracked source files including source.zip contents.
This checks the current tree only; historic commits need separate review.
"""
import io
import pathlib
import re
import subprocess
import sys
import zipfile

TEXT={".php",".js",".json",".env",".yaml",".yml",".txt",".md",".sh",".py",".html",".sql",".ini",".conf"}
MAX_MEMBER=4_000_000
MAX_TOTAL=60_000_000
PATTERNS={
 "ARGUS secret":re.compile(rb"\bags_live_[a-f0-9]{64}\b"),
 "ARGUS live key":re.compile(rb"\bagp_live_[a-f0-9]{16,}\b"),
 "MisticPay secret":re.compile(rb"\bsk_[A-Za-z0-9_-]{40,}\b"),
 "PEM private key":re.compile(rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"),
 "Cloud credential assignment":re.compile(rb"(?i)(?:resend_api_key|cloudflare_api_token|argus_misticpay_payout_sk)\s*[:=]\s*['\"]?[A-Za-z0-9_-]{25,}")
}
def scan(label,data):
 hits=[]
 for name,pattern in PATTERNS.items():
  for m in pattern.finditer(data):
   hits.append((label,data.count(b"\n",0,m.start())+1,name))
 return hits
def scan_zip(path):
 hits=[];warnings=[];total=0
 try:
  with zipfile.ZipFile(path) as archive:
   for item in archive.infolist():
    if item.is_dir() or pathlib.PurePosixPath(item.filename).suffix.lower() not in TEXT:continue
    label=str(path)+"!/"+item.filename.replace("\n","_").replace("\r","_")
    if item.flag_bits&1 or item.file_size>MAX_MEMBER:
     warnings.append("Encrypted/oversized text: "+label);continue
    total+=item.file_size
    if total>MAX_TOTAL:
     warnings.append("Archive scan limit exceeded: "+str(path));break
    try:
     with archive.open(item) as h:data=h.read(MAX_MEMBER+1)
     if len(data)>MAX_MEMBER:warnings.append("Oversized text: "+label);continue
     hits.extend(scan(label,data))
    except (RuntimeError,OSError,EOFError,zipfile.BadZipFile):
     warnings.append("Unreadable ZIP member: "+label)
 except (OSError,zipfile.BadZipFile,zipfile.LargeZipFile):
  warnings.append("Unreadable ZIP: "+str(path))
 return hits,warnings
def main():
 if sys.argv[1:]==["--self-test"]:
  value=b"ags_"+b"live_"+b"0"*64
  b=io.BytesIO()
  with zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED) as f:f.writestr("src/mock.php",b"<?php "+value)
  b.seek(0)
  with zipfile.ZipFile(b) as f:found=scan("synthetic",f.read("src/mock.php"))
  if len(found)!=1:sys.exit("FAIL: archive secret detection self-test")
  print("PASS: synthetic archive credential detection");return 0
 if len(sys.argv)>1:sys.exit("Usage: security_secret_scan.py [--self-test]")
 try:names=subprocess.check_output(["git","ls-files","-z"]).split(b"\0")
 except (OSError,subprocess.CalledProcessError):sys.exit("FAIL: cannot enumerate tracked files")
 hits=[];warnings=[]
 for raw in names:
  if not raw:continue
  path=pathlib.Path(raw.decode("utf-8","replace"))
  if not path.is_file():continue
  if path.suffix.lower()==".zip":
   h,w=scan_zip(path);hits+=h;warnings+=w
  elif path.suffix.lower() in TEXT:
   try:
    if path.stat().st_size>MAX_MEMBER:warnings.append("Oversized text file: "+str(path));continue
    hits+=scan(str(path),path.read_bytes())
   except OSError:warnings.append("Unreadable text file: "+str(path))
 for path,line,kind in hits:print("Potential credential: "+path+":"+str(line)+" ("+kind+"); VALUE HIDDEN")
 for msg in warnings:print("Scan incomplete: "+msg)
 if hits or warnings:
  print("FAIL: "+str(len(hits))+" possible secrets, "+str(len(warnings))+" unscanned entries. Rotate confirmed leaks; review Git history separately.")
  return 1
 print("PASS: no signature matches in tracked text or ZIP; historical Git commits NOT checked")
 return 0
if __name__=="__main__":sys.exit(main())
