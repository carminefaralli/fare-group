#!/usr/bin/env bash
# Smoke test post-deploy sito fare-group.com
# Verifica cio' che NON e' verificabile prima del deploy. Exit 0 = tutto PASS.
set -uo pipefail
H="https://www.fare-group.com"
fail=0
ok(){ printf "  PASS  %s\n" "$1"; }
ko(){ printf "  FAIL  %s\n" "$1"; fail=1; }

echo "== 1. redirect root -> /it/ (302) =="
read -r code loc < <(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 20 "$H/")
[ "$code" = "302" ] && ok "status 302 (letto: $code)" || ko "atteso 302, letto $code"
case "$loc" in */it/) ok "Location $loc";; *) ko "Location attesa /it/, letta '$loc'";; esac

echo "== 2. robots.txt e sitemap.xml non catturati dal redirect =="
for p in robots.txt sitemap.xml; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$H/$p")
  [ "$c" = "200" ] && ok "/$p -> 200" || ko "/$p -> $c (atteso 200)"
done
curl -s --max-time 20 "$H/robots.txt" | grep -q "^Sitemap: $H/sitemap.xml$" \
  && ok "robots.txt punta alla sitemap su host www" || ko "riga Sitemap assente o host errato"
curl -s --max-time 20 "$H/sitemap.xml" | python3 -c "import sys,xml.dom.minidom as m;m.parseString(sys.stdin.read())" 2>/dev/null \
  && ok "sitemap.xml e' XML valido servito live" || ko "sitemap.xml non parsabile dal live"

echo "== 3. 404 vero con body di 404.html (fine del soft-404) =="
c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$H/pagina-che-non-esiste-xyz")
[ "$c" = "404" ] && ok "URL inesistente -> 404" || ko "URL inesistente -> $c (atteso 404)"
b=$(curl -s --max-time 20 "$H/pagina-che-non-esiste-xyz")
echo "$b" | grep -qi "noindex" && ok "body di errore ha noindex" || ko "body di errore senza noindex"
echo "$b" | grep -qi "Redirecting" && ko "il 404 sta ancora servendo la shell della home (soft-404)" || ok "il 404 non serve piu' la home"

echo "== 4. canonical su www e self-referential =="
for u in "/it/" "/en/" "/it/servizi.html" "/en/services.html"; do
  can=$(curl -s --max-time 20 "$H$u" | grep -o 'rel="canonical"[^>]*href="[^"]*"' | sed -E 's/.*href="([^"]+)".*/\1/')
  [ "$can" = "$H$u" ] && ok "$u canonical self ($can)" || ko "$u canonical = '$can' (atteso $H$u)"
done
echo "== 5. nessun riferimento all'apex senza www nelle head =="
for u in "/it/" "/en/"; do
  n=$(curl -s --max-time 20 "$H$u" | grep -c 'https://fare-group\.com' || true)
  [ "$n" = "0" ] && ok "$u zero URL apex" || ko "$u ha $n riferimenti all'apex senza www"
done

echo "== 6. immagini: nessuna richiesta a host esterni bloccati =="
for u in "/it/" "/en/" "/it/servizi.html"; do
  n=$(curl -s --max-time 20 "$H$u" | grep -c 'images\.unsplash\.com' || true)
  [ "$n" = "0" ] && ok "$u zero img Unsplash remote" || ko "$u ha ancora $n img Unsplash (CSP le blocca)"
done

echo
[ $fail -eq 0 ] && echo "RISULTATO: tutti i check PASS" || echo "RISULTATO: almeno un FAIL"
exit $fail
