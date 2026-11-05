#!/usr/bin/env bash
# ruben.sh: doet na wat Ruben van planning met de hand op de webserver deed.
#
# Gebruik:   sudo bash ruben.sh
#
# Alleen voor je eigen lab-VM web01 of web02, bij missie m8 van het Larixa-spel.
# Het script verandert je server. Herstel daarna alles met je eigen playbook.

set -eu

naam="$(hostname -s)"
case "$naam" in
  web01|web02) ;;
  *) echo "Dit script draait alleen op web01 of web02. Deze server heet $naam."; exit 1 ;;
esac

if [ "$(id -u)" -ne 0 ]; then
  echo "Start het script met sudo: sudo bash ruben.sh"
  exit 1
fi

read -r -p "Dit past $naam aan, zoals Ruben deed. Typ ja om door te gaan: " antwoord
if [ "$antwoord" != "ja" ]; then
  echo "Niets veranderd."
  exit 0
fi

# Ruben: "De pagina moest even weg, ik was aan het testen."
if [ -d /var/www/html ]; then
  printf '<h1>Pagina tijdelijk weg</h1>\n<p>Ben even aan het testen. Groet, Ruben</p>\n' > /var/www/html/index.html
fi

# Ruben: "nginx deed raar, dus ik heb hem uitgezet."
systemctl disable --now nginx >/dev/null 2>&1 || true

# Ruben: "Zonder firewall werkt alles, toch?"
ufw --force disable >/dev/null 2>&1 || true

mkdir -p /var/lib/larixa
date -Iseconds > /var/lib/larixa/ruben

echo "Klaar. Ruben heeft iets aangepast op $naam. Zoek uit wat, en herstel het met je playbook."
