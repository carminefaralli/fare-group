#!/usr/bin/env python3
"""Controllo SEO statico del sito fare-group.com, eseguibile prima del deploy.

Uso: python3 tests/seo-static-check.py   (dalla root del repo). Exit 0 = tutto PASS.
Verifica sui file del repo ciò che lo smoke post-deploy verifica sul live.
"""
import glob
import json
import os
import re
import sys
import xml.dom.minidom

HOST = "https://www.fare-group.com"
TITLE_MAX = 65
DESC_MAX = 160
CHARSET_BYTES = 1024
AI_CRAWLERS = ("OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Google-Extended")
SERVER_ROUTES = {"bot", "en/bot", "intranet"}
INDEXABLE = sorted(glob.glob("it/*.html") + glob.glob("en/*.html")) + ["bot.html"]

failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


def url_to_file(url):
    path = url.replace(HOST, "")
    if path.endswith("/"):
        return path.lstrip("/") + "index.html"
    if path == "/bot":
        return "bot.html"
    if path == "/en/bot":
        return "en/bot.html"
    return path.lstrip("/")


def visible_faq(html):
    sec = re.search(r'<section class="(?:sec faq|mq-faq)[^"]*"[^>]*>(.*?)</section>', html, re.S)
    if not sec:
        return []
    return [re.sub(r"<.*?>", "", q).strip() for q in re.findall(r"<summary>(.*?)</summary>", sec.group(1), re.S)]


def ld_nodes(html, f):
    out = []
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            failures.append(f"{f}: JSON-LD non valido ({e})")
            continue
        out.extend(data.get("@graph", [data]) if isinstance(data, dict) else data)
    return out


def check_links(f, html):
    for href in set(re.findall(r'(?:href|src)="(/(?!/)[^"#?]*|\.\./[^"#?]*)"', html)):
        if href.startswith(".."):
            target = os.path.normpath(os.path.join(os.path.dirname(f), href))
        else:
            target = href.lstrip("/")
        if target in SERVER_ROUTES:
            continue
        if target == "" or target.endswith("/"):
            target += "index.html"
        check(os.path.exists(target), f"{f}: link interno rotto {href}")


def check_page(f):
    s = open(f, encoding="utf-8").read()
    check(s.encode("utf-8").find(b'<meta charset="UTF-8">') < CHARSET_BYTES,
          f"{f}: meta charset oltre i primi {CHARSET_BYTES} byte")
    titles = re.findall(r"<title>(.*?)</title>", s, re.S)
    check(len(titles) == 1, f"{f}: title assente o multiplo")
    if titles:
        t = titles[0].replace("&amp;", "&")
        check(len(t) <= TITLE_MAX, f"{f}: title di {len(t)} caratteri (max {TITLE_MAX})")
    desc = re.findall(r'<meta name="description" content="(.*?)"', s)
    check(len(desc) == 1, f"{f}: meta description assente o multipla")
    if desc:
        d = desc[0].replace("&amp;", "&")
        check(len(d) <= DESC_MAX, f"{f}: description di {len(d)} caratteri (max {DESC_MAX})")
    check(len(re.findall(r"<h1[ >]", s)) == 1, f"{f}: deve avere esattamente un h1")
    can = re.findall(r'<link rel="canonical" href="(.*?)"', s)
    check(len(can) == 1 and url_to_file(can[0]) == f, f"{f}: canonical non self-referential ({can})")
    check("noindex" not in s, f"{f}: pagina indicizzabile con noindex")
    check('rel="icon"' in s, f"{f}: favicon non dichiarata")
    alts = dict(re.findall(r'<link rel="alternate" hreflang="(.*?)" href="(.*?)"', s))
    check({"it", "en", "x-default"} <= set(alts), f"{f}: hreflang incompleti ({sorted(alts)})")
    faq = [n for n in ld_nodes(s, f) if n.get("@type") == "FAQPage"]
    if faq:
        schema_q = [q["name"] for q in faq[0]["mainEntity"]]
        check(schema_q == visible_faq(s), f"{f}: domande FAQPage diverse dalle FAQ visibili")
    check_links(f, s)
    return alts


def check_hreflang(hmap):
    for f, alts in hmap.items():
        for lang in ("it", "en"):
            other = url_to_file(alts.get(lang, ""))
            if other in hmap:
                back = [u for u in hmap[other].values() if url_to_file(u) == f]
                check(bool(back), f"{f}: hreflang {lang} -> {other} senza ritorno")


def check_site_files():
    locs = [n.firstChild.data for n in xml.dom.minidom.parse("sitemap.xml").getElementsByTagName("loc")]
    for loc in locs:
        check(os.path.exists(url_to_file(loc)), f"sitemap: {loc} non esiste nel repo")
    for icon in ("favicon.ico", "assets/img/favicon-32.png", "assets/img/apple-touch-icon.png"):
        check(os.path.exists(icon), f"icona mancante: {icon}")
    robots = open("robots.txt", encoding="utf-8").read()
    check(f"Sitemap: {HOST}/sitemap.xml" in robots, "robots.txt senza riga Sitemap")
    check(not re.search(r"^Disallow: /\s*$", robots, re.M), "robots.txt blocca il sito")
    for bot in AI_CRAWLERS:
        check(f"User-agent: {bot}" in robots, f"robots.txt: {bot} non esplicitato")
    return len(locs)


def main():
    hmap = {f: check_page(f) for f in INDEXABLE}
    check_hreflang(hmap)
    n_locs = check_site_files()
    if failures:
        print(f"FAIL: {len(failures)} problemi su {len(INDEXABLE)} pagine")
        for m in failures:
            print("  -", m)
        return 1
    print(f"PASS: {len(INDEXABLE)} pagine indicizzabili, {n_locs} URL in sitemap, nessun problema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
