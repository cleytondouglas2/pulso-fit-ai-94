#!/usr/bin/env python3
"""CI safety check: no credential contents are printed or transmitted."""
import pathlib
import re
import subprocess
import sys
patterns = {
    "ArgusPay secret": re.compile(rb"ags_live_[a-f0-9]{64}"),
    "MisticPay secret": re.compile(rb"\bsk_[A-Za-z0-9_-]{40,}\b"),
    "PEM private key": re.compile(rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"),
    "Cloud API token assignment": re.compile(rb"(?i)(?:resend_api_key|cloudflare_api_token|argus_misticpay_payout_sk)\s*[:=]\s*['\"]?(?:[A-Za-z0-9_-]{25,})"),
}
try:
    names = subprocess.check_output(["git", "ls-files", "-z"]).split(b"\0")
except subprocess.CalledProcessError:
    sys.exit("Unable to enumerate tracked files")
hits=[]
for name in names:
    if not name:
        continue
    path=pathlib.Path(name.decode("utf-8","replace"))
    if path.suffix.lower() not in {".php",".js",".json",".env",".yaml",".yml",".txt",".md",".sh",".py",".html",".sql"}:
        continue
    try:
        if path.stat().st_size>4_000_000:
            continue
        content=path.read_bytes()
    except (OSError,UnicodeError):
        continue
    for label,pattern in patterns.items():
        for m in pattern.finditer(content):
            line=content.count(b"\n",0,m.start())+1
            hits.append((str(path),line,label))
for file,line,label in hits:
    print(f"Potential secret: {file}:{line} ({label}); value hidden")
if hits:
    print(f"FAIL: {len(hits)} potential credential exposures; rotate leaked keys before deployment")
    sys.exit(1)
print("PASS: no tracked credential patterns found (heuristic check, not a substitute for history scan)")
