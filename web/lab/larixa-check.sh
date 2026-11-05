#!/usr/bin/env bash
# larixa-check.sh: controleert je labserver voor een missie van Larixa Logistiek.
#
# Gebruik:   sudo bash larixa-check.sh <missie>
# Voorbeeld: sudo bash larixa-check.sh m1
#
# Dit script verandert niets aan je server. Het kijkt alleen. Per controle zie
# je wat al goed is en wat nog niet. Is alles goed, dan krijg je een code voor
# het spel. Die code hoort bij jouw labsleutel: voor een klasgenoot werkt hij niet.

set -u

ROOT="${LARIXA_ROOT:-}"   # alleen voor tests: een map die / nabootst
MISSIE="${1:-}"
FOUTEN=0
SLEUTEL=""

if [ -t 1 ]; then
  GROEN=$'\e[32m'; ROOD=$'\e[31m'; GEEL=$'\e[33m'; VET=$'\e[1m'; UIT=$'\e[0m'
else
  GROEN=""; ROOD=""; GEEL=""; VET=""; UIT=""
fi

goed() { printf '  %s✔%s %s\n' "$GROEN" "$UIT" "$1"; }

fout() {
  printf '  %s✘%s %s\n' "$ROOD" "$UIT" "$1"
  [ -n "${2:-}" ] && printf '      %s%s%s\n' "$GEEL" "$2" "$UIT"
  FOUTEN=$((FOUTEN + 1))
}

# controle "wat je controleert" "tip als het niet goed is" opdracht [argumenten]
controle() {
  local wat="$1" tip="$2"
  shift 2
  if "$@" >/dev/null 2>&1; then goed "$wat"; else fout "$wat" "$tip"; fi
}

# --- losse tests ------------------------------------------------------------

lees_sleutel() {
  if [ -r "$ROOT/etc/larixa/labsleutel" ]; then
    SLEUTEL="$(tr -d '[:space:]' < "$ROOT/etc/larixa/labsleutel")"
  fi
}
sleutel_klopt()    { [[ "$SLEUTEL" =~ ^LRX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$ ]]; }
naam_is()          { [ "$(hostname -s 2>/dev/null)" = "$1" ]; }
ip_is()            { ip -4 -o addr show 2>/dev/null | grep -q " $1/"; }
tijdzone_ams()     { [[ "$(readlink "$ROOT/etc/localtime" 2>/dev/null)" == *Europe/Amsterdam ]]; }
bouwinfo_auto()    { grep -Eq '^[[:space:]]*methode[[:space:]]*=[[:space:]]*autoinstall[[:space:]]*$' "$ROOT/etc/larixa/bouwinfo"; }
pakket()           { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
dienst_actief()    { systemctl is-active --quiet "$1"; }
dienst_aan()       { systemctl is-enabled --quiet "$1"; }
pagina_sleutel()   { [ -n "$SLEUTEL" ] && curl -fsS --max-time 5 http://localhost/ | grep -qF "$SLEUTEL"; }
gebruiker()        { getent passwd "$1"; }
sshsleutel()       { local thuis; thuis="$(getent passwd "$1" | cut -d: -f6)"; [ -n "$thuis" ] && [ -s "$ROOT$thuis/.ssh/authorized_keys" ]; }
ssh_zonder_ww()    { sshd -T 2>/dev/null | grep -qi '^passwordauthentication no$'; }
ufw_actief()       { ufw status 2>/dev/null | grep -q '^Status: active'; }
ufw_standaard()    { ufw status verbose 2>/dev/null | grep -Eq 'Default: (deny|reject) \(incoming\)'; }
ufw_toe()          { ufw status 2>/dev/null | grep -Eq "^($1)[[:space:]]+(ALLOW|LIMIT)"; }
ruben_geweest()    { [ -e "$ROOT/var/lib/larixa/ruben" ]; }

# --- groepen controles ------------------------------------------------------

basis() { # $1 servernaam, $2 IP-adres
  controle "De servernaam is $1" \
    "Stel de naam in, bijvoorbeeld met: sudo hostnamectl set-hostname $1" naam_is "$1"
  controle "Het IP-adres is $2" \
    "Kijk naar de netwerkinstellingen van je server (netplan)." ip_is "$2"
  controle "Je labsleutel staat in /etc/larixa/labsleutel" \
    "Zet de labsleutel uit het spel in dat bestand, precies zoals hij in het spel staat." sleutel_klopt
}

tijdzone() {
  controle "De tijdzone is Europe/Amsterdam" \
    "Kijk wat timedatectl zegt over de tijdzone." tijdzone_ams
}

bouwinfo() {
  controle "/etc/larixa/bouwinfo zegt methode=autoinstall" \
    "Laat je autoinstall-bestand dit bestand maken, bijvoorbeeld met late-commands." bouwinfo_auto
}

web() {
  controle "nginx is geïnstalleerd" "Laat je playbook het pakket nginx installeren." pakket nginx
  controle "nginx draait" "Laat je playbook de dienst nginx starten." dienst_actief nginx
  controle "nginx start vanzelf na een herstart" "Zet de dienst aan met enabled: true." dienst_aan nginx
  controle "Je labsleutel staat op de startpagina" \
    "Bekijk de pagina met: curl http://localhost/" pagina_sleutel
}

beveiliging() {
  controle "De gebruiker samira bestaat" "Laat je playbook de gebruiker aanmaken." gebruiker samira
  controle "samira heeft een SSH-sleutel" \
    "Zet een publieke sleutel in ~samira/.ssh/authorized_keys." sshsleutel samira
  controle "Inloggen met een wachtwoord via SSH staat uit" \
    "Kijk naar PasswordAuthentication in de SSH-instellingen." ssh_zonder_ww
  firewall
  controle "ufw blokkeert standaard inkomend verkeer" "Kijk wat ufw status verbose zegt." ufw_standaard
  controle "ufw staat SSH toe" "Sta poort 22 of OpenSSH toe." ufw_toe '22(/tcp)?|OpenSSH'
  controle "ufw staat HTTP toe" "Sta poort 80 of Nginx HTTP toe." ufw_toe '80(/tcp)?|Nginx HTTP|Nginx Full'
  controle "unattended-upgrades is geïnstalleerd" \
    "Laat je playbook het pakket unattended-upgrades installeren." pakket unattended-upgrades
}

firewall() {
  controle "De firewall ufw staat aan" "Laat je playbook ufw aanzetten." ufw_actief
}

ruben() {
  controle "Het script van Ruben is gedraaid" \
    "Draai eerst ruben.sh. Dat hoort bij deze missie." ruben_geweest
}

# --- start ------------------------------------------------------------------

case "$MISSIE" in
  m1|m4|m5|m6|m7|m8) SERVER="web01"; IP="192.168.150.21" ;;
  z1) SERVER="web02"; IP="192.168.150.22" ;;
  *)
    echo "Gebruik: sudo bash larixa-check.sh <missie>"
    echo "Missies met een check: m1, m4, m5, m6, m7, m8 en z1."
    exit 2
    ;;
esac

if [ -z "$ROOT" ] && [ "$(id -u)" -ne 0 ]; then
  echo "Start het script met sudo: sudo bash larixa-check.sh $MISSIE"
  exit 2
fi

lees_sleutel
printf '\n%sLarixa-check voor missie %s op %s%s\n\n' "$VET" "$MISSIE" "$SERVER" "$UIT"

case "$MISSIE" in
  m1) basis "$SERVER" "$IP"; tijdzone ;;
  m4) basis "$SERVER" "$IP"; tijdzone; bouwinfo ;;
  m5) basis "$SERVER" "$IP"; web ;;
  m6) basis "$SERVER" "$IP"; web; beveiliging ;;
  m7) basis "$SERVER" "$IP"; bouwinfo; web; beveiliging ;;
  m8) basis "$SERVER" "$IP"; ruben; web; firewall ;;
  z1) basis "$SERVER" "$IP"; web; firewall ;;
esac

echo
if [ "$FOUTEN" -eq 0 ]; then
  code="$(printf '%s' "larixa|$MISSIE|$SLEUTEL" | sha256sum | cut -c1-8 | tr 'a-f' 'A-F')"
  printf '%sAlles goed!%s Je code voor missie %s: %s%s-%s%s\n' "$GROEN" "$UIT" "$MISSIE" "$VET" "${code:0:4}" "${code:4:4}" "$UIT"
  echo "Typ de code in het spel."
  exit 0
fi
if [ "$FOUTEN" -eq 1 ]; then
  echo "Nog 1 punt te gaan. Los het op en draai het script opnieuw."
else
  echo "Nog $FOUTEN punten te gaan. Los ze op en draai het script opnieuw."
fi
exit 1
