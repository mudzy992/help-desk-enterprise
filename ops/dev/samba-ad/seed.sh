#!/usr/bin/env bash
# Seeds an EPBiH-like OU tree, users and role groups into the test domain.
# Idempotent: existing objects are skipped. Usage (inside the container):
#   seed.sh                 # base data set (~30 users)
#   seed.sh --bulk 500      # plus N generated users in OU=Masovni
set -uo pipefail

REALM="${SAMBA_REALM:-TEST.EPBIH.LAB}"
BASE="DC=$(echo "${REALM,,}" | sed 's/\./,DC=/g')"
MAIL_DOMAIN="${SEED_MAIL_DOMAIN:-test.epbih.lab}"
PASSWORD="${SEED_USER_PASSWORD:-Test-Lozinka-2026!}"
BULK=0
if [ "${1:-}" = "--bulk" ]; then BULK="${2:-0}"; fi

ou() { samba-tool ou create "$1,${BASE}" >/dev/null 2>&1 && echo "OU  + $1" || echo "OU  = $1"; }

user() {
  # user <login> <ime> <prezime> <ou-relative> <company> <department>
  local login="$1" given="$2" sur="$3" ou_rel="$4" company="$5" dept="$6"
  if samba-tool user show "$login" >/dev/null 2>&1; then echo "USR = $login"; return; fi
  samba-tool user create "$login" "$PASSWORD" \
    --given-name="$given" --surname="$sur" \
    --mail-address="${login}@${MAIL_DOMAIN}" \
    --company="$company" --department="$dept" \
    --userou="$ou_rel" >/dev/null && echo "USR + $login ($ou_rel)"
}

group() { samba-tool group add "$1" --groupou="OU=Grupe,OU=HelpDesk" >/dev/null 2>&1 && echo "GRP + $1" || echo "GRP = $1"; }
member() { samba-tool group addmembers "$1" "$2" >/dev/null 2>&1 || true; }

# ── OU tree (mirrors the production shape: Korisnici / ED / poslovnica) ──
ou "OU=HelpDesk"
ou "OU=Grupe,OU=HelpDesk"
ou "OU=Servisni,OU=HelpDesk"
ou "OU=Korisnici"
for ed in "ED Zenica" "ED Sarajevo" "ED Tuzla" "ED Mostar" "ED Bihać"; do
  ou "OU=${ed},OU=Korisnici"
done
ou "OU=Visoko,OU=ED Zenica,OU=Korisnici"
ou "OU=Kakanj,OU=ED Zenica,OU=Korisnici"
ou "OU=Ilidža,OU=ED Sarajevo,OU=Korisnici"
ou "OU=Direkcija,OU=Korisnici"
ou "OU=IT,OU=Direkcija,OU=Korisnici"

# ── Bind account for the help desk (read-only; Domain Users is enough) ──
if ! samba-tool user show svc-helpdesk >/dev/null 2>&1; then
  samba-tool user create svc-helpdesk "${SVC_BIND_PASSWORD:-Bind-Lozinka-2026!}" \
    --userou="OU=Servisni,OU=HelpDesk" --description="EP HelpDesk LDAPS bind" >/dev/null
  samba-tool user setexpiry svc-helpdesk --noexpiry >/dev/null
  echo "USR + svc-helpdesk (bind)"
fi

# ── Role groups for roleSource = ad_groups ──
group "HD-Administratori"
group "HD-Agenti"

# ── Users (names with č ć š ž đ on purpose) ──
user amar.hodzic     Amar     Hodžić     "OU=Visoko,OU=ED Zenica,OU=Korisnici"  "EP BiH" "ED Zenica"
user lejla.begic     Lejla    Begić      "OU=Visoko,OU=ED Zenica,OU=Korisnici"  "EP BiH" "ED Zenica"
user emir.kovacevic  Emir     Kovačević  "OU=Visoko,OU=ED Zenica,OU=Korisnici"  "EP BiH" "ED Zenica"
user selma.dzafic    Selma    Džafić     "OU=Kakanj,OU=ED Zenica,OU=Korisnici"  "EP BiH" "ED Zenica"
user haris.mujic     Haris    Mujić      "OU=Kakanj,OU=ED Zenica,OU=Korisnici"  "EP BiH" "ED Zenica"
user adna.causevic   Adna     Čaušević   "OU=ED Zenica,OU=Korisnici"            "EP BiH" "ED Zenica"
user tarik.salihovic Tarik    Salihović  "OU=Ilidža,OU=ED Sarajevo,OU=Korisnici" "EP BiH" "ED Sarajevo"
user amra.djulic     Amra     Đulić      "OU=Ilidža,OU=ED Sarajevo,OU=Korisnici" "EP BiH" "ED Sarajevo"
user kenan.zukic     Kenan    Zukić      "OU=ED Sarajevo,OU=Korisnici"          "EP BiH" "ED Sarajevo"
user nermin.sehic    Nermin   Šehić      "OU=ED Tuzla,OU=Korisnici"             "EP BiH" "ED Tuzla"
user maja.jurkovic   Maja     Jurković   "OU=ED Mostar,OU=Korisnici"            "EP BiH" "ED Mostar"
user edin.pasic      Edin     Pašić      "OU=ED Bihać,OU=Korisnici"             "EP BiH" "ED Bihać"
user dzenana.omerovic Dženana Omerović   "OU=IT,OU=Direkcija,OU=Korisnici"      "EP BiH" "Direkcija"
user mirza.ibrahimovic Mirza  Ibrahimović "OU=IT,OU=Direkcija,OU=Korisnici"     "EP BiH" "Direkcija"
user sanela.kurtovic Sanela   Kurtović   "OU=Direkcija,OU=Korisnici"            "EP BiH" "Direkcija"
for i in $(seq -w 1 15); do
  user "korisnik.visoko${i}" Korisnik "Visoko ${i}" "OU=Visoko,OU=ED Zenica,OU=Korisnici" "EP BiH" "ED Zenica"
done

member "HD-Administratori" dzenana.omerovic
member "HD-Agenti" mirza.ibrahimovic
member "HD-Agenti" amar.hodzic
member "HD-Agenti" tarik.salihovic

# ── Edge cases the dry-run must report ──
# 1) user without e-mail → exception NO_EMAIL
if ! samba-tool user show bez.maila >/dev/null 2>&1; then
  samba-tool user create bez.maila "$PASSWORD" --given-name=Bez --surname=Maila \
    --userou="OU=Visoko,OU=ED Zenica,OU=Korisnici" >/dev/null && echo "USR + bez.maila (no mail)"
fi
# 2) disabled account → planned as deactivation / not created
user onemogucen.korisnik Onemogućen Korisnik "OU=Kakanj,OU=ED Zenica,OU=Korisnici" "EP BiH" "ED Zenica"
samba-tool user disable onemogucen.korisnik >/dev/null 2>&1 || true

# ── Optional bulk set (paging with pageSize 500, performance) ──
if [ "$BULK" -gt 0 ]; then
  ou "OU=Masovni,OU=Korisnici"
  for i in $(seq 1 "$BULK"); do
    login=$(printf "masovni.%05d" "$i")
    samba-tool user show "$login" >/dev/null 2>&1 && continue
    samba-tool user create "$login" "$PASSWORD" --given-name=Masovni --surname="$i" \
      --mail-address="${login}@${MAIL_DOMAIN}" --company="EP BiH" --department="Masovni" \
      --userou="OU=Masovni,OU=Korisnici" >/dev/null
    [ $((i % 100)) -eq 0 ] && echo "USR + ${i}/${BULK} bulk"
  done
fi

echo
echo "Base DN za korisnike:  OU=Korisnici,${BASE}"
echo "Base DN za grupe:      OU=Grupe,OU=HelpDesk,${BASE}"
echo "Bind DN:               CN=svc-helpdesk,OU=Servisni,OU=HelpDesk,${BASE}"
echo "Grupa ADMIN:           CN=HD-Administratori,OU=Grupe,OU=HelpDesk,${BASE}"
echo "Grupa AGENT:           CN=HD-Agenti,OU=Grupe,OU=HelpDesk,${BASE}"
