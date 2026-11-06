#!/usr/bin/env python3
"""Segnala a IndexNow (Bing e motori aderenti) le pagine cambiate nell'ultimo rilascio.

Uso (dalla root del repo):
  python3 .github/scripts/indexnow.py <base_sha> <head_sha> [--dry-run]

Invia solo gli URL della sitemap i cui file HTML sono cambiati tra i due commit. Nessun segreto:
la chiave IndexNow è pubblica per definizione ed è servita dal file <chiave>.txt nella root del sito.
Exit 0 anche se IndexNow non risponde: la segnalazione non deve mai bloccare il deploy.
"""
import glob
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.dom.minidom

HOST = "www.fare-group.com"
BASE_URL = f"https://{HOST}"
ENDPOINT = "https://api.indexnow.org/indexnow"
KEY_LENGTH = 32
KEY_WAIT_ATTEMPTS = 10
KEY_WAIT_SECONDS = 15
TIMEOUT_SECONDS = 30


def find_key():
    for path in glob.glob("*.txt"):
        name = os.path.splitext(os.path.basename(path))[0]
        if len(name) == KEY_LENGTH and all(c in "0123456789abcdef" for c in name):
            return name
    return None


def url_to_file(url):
    path = url.replace(BASE_URL, "").lstrip("/")
    return path + "index.html" if path == "" or path.endswith("/") else path


def sitemap_urls():
    dom = xml.dom.minidom.parse("sitemap.xml")
    return [n.firstChild.data.strip() for n in dom.getElementsByTagName("loc")]


def changed_files(base, head):
    out = subprocess.run(["git", "diff", "--name-only", base, head], capture_output=True, text=True, check=True)
    return {line.strip() for line in out.stdout.splitlines() if line.strip()}


def urls_to_submit(base, head):
    files = changed_files(base, head)
    return sorted({u for u in sitemap_urls() if url_to_file(u) in files})


def key_is_live(key):
    url = f"{BASE_URL}/{key}.txt"
    for attempt in range(1, KEY_WAIT_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as r:
                if r.status == 200 and r.read().decode().strip() == key:
                    return True
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"chiave non ancora raggiungibile (tentativo {attempt}): {e}")
        time.sleep(KEY_WAIT_SECONDS)
    return False


def submit(key, urls):
    body = json.dumps({"host": HOST, "key": key, "keyLocation": f"{BASE_URL}/{key}.txt", "urlList": urls}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as r:
            print(f"IndexNow: HTTP {r.status} per {len(urls)} URL")
    except urllib.error.HTTPError as e:
        print(f"IndexNow ha risposto HTTP {e.code}: {e.read().decode()[:300]}")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"IndexNow non raggiungibile: {e}")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 0
    base, head, dry = sys.argv[1], sys.argv[2], "--dry-run" in sys.argv
    key = find_key()
    if not key:
        print("chiave IndexNow assente: nessun invio")
        return 0
    try:
        urls = urls_to_submit(base, head)
    except subprocess.CalledProcessError as e:
        print(f"diff tra {base[:7]} e {head[:7]} non disponibile ({e.stderr.strip()[:200]}): nessun invio")
        return 0
    print(f"URL cambiati da segnalare: {len(urls)}")
    for u in urls:
        print("  ", u)
    if not urls or dry:
        return 0
    if not key_is_live(key):
        print("chiave non raggiungibile sul sito: nessun invio")
        return 0
    submit(key, urls)
    return 0


if __name__ == "__main__":
    sys.exit(main())
