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

echo "== 7. pagina /bot per il programma di lettura del Sales Office =="
c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$H/bot")
[ "$c" = "200" ] && ok "/bot -> 200" || ko "/bot -> $c (atteso 200)"
curl -s --max-time 20 "$H/bot" | grep -q "FARE-SalesOffice/1.0" \
  && ok "/bot contiene l'identificativo FARE-SalesOffice/1.0" || ko "/bot non contiene l'identificativo FARE-SalesOffice/1.0"

echo "== 8. vecchia pagina /it/bot redirette in modo permanente a /bot =="
read -r code loc < <(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 20 "$H/it/bot")
[ "$code" = "301" ] && ok "/it/bot -> 301 (letto: $code)" || ko "/it/bot atteso 301, letto $code"
case "$loc" in */bot) ok "/it/bot Location $loc";; *) ko "/it/bot Location attesa /bot, letta '$loc'";; esac

echo "== 9. pagina /en/bot (versione inglese completa, non redirect) =="
c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$H/en/bot")
[ "$c" = "200" ] && ok "/en/bot -> 200" || ko "/en/bot -> $c (atteso 200)"
curl -s --max-time 20 "$H/en/bot" | grep -q "FARE-SalesOffice/1.0" \
  && ok "/en/bot contiene l'identificativo FARE-SalesOffice/1.0" || ko "/en/bot non contiene l'identificativo FARE-SalesOffice/1.0"

echo "== 10. GA4 presente ma bloccato fino al consenso iubenda, CSP aperta ai soli domini Google Analytics =="
for u in "/it/" "/en/" "/it/contatti.html" "/en/contact.html" "/bot"; do
  b=$(curl -s --max-time 20 "$H$u")
  echo "$b" | grep -q 'class="_iub_cs_activate" data-iub-purposes="4" async data-suppressedsrc="https://www.googletagmanager.com/gtag/js?id=G-6G17HPDNFM"' \
    && ok "$u tag GA4 bloccato (text/plain, finalita' 4)" || ko "$u tag GA4 bloccato assente"
  echo "$b" | grep -qE '<script[^>]* src="https://www.googletagmanager.com' \
    && ko "$u carica GA4 SENZA attendere il consenso" || ok "$u nessun GA4 caricato prima del consenso"
done
csp=$(curl -s -D - -o /dev/null --max-time 20 "$H/it/" | grep -i '^content-security-policy:')
echo "$csp" | grep -q "script-src[^;]*https://www.googletagmanager.com" && ok "CSP script-src ammette googletagmanager" || ko "CSP script-src senza googletagmanager"
echo "$csp" | grep -q "connect-src[^;]*https://\*.google-analytics.com" && ok "CSP connect-src ammette google-analytics" || ko "CSP connect-src senza google-analytics"

echo
[ $fail -eq 0 ] && echo "RISULTATO: tutti i check PASS" || echo "RISULTATO: almeno un FAIL"
exit $fail
