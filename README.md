# cursus.gloudemansict.nl

Het 8-bit kantoorspel bij de mbo-cursus **Processen automatiseren (P2-K1-W2)**, voor ICT system engineer (27016, niveau 4) en als verdieping voor ICT support technician (27015, niveau 3).

Studenten lopen rond in het kantoor van Larixa Logistiek, een fictief transportbedrijf. Collega's geven missies als ticket. Een checkscript op de labserver controleert het werk en geeft een persoonlijke code. Met die code speelt de student het volgende deel vrij. In het spel staan ook het handboek met opleiding, cursusduur, planning, voorkennis, theorie per fase en de rubric.

Het spel is er voor motivatie en overzicht. De beoordeling loopt via de rubric in Canvas.

## Zo werkt het

```
student ── https ──> Caddy ──┬── /          web/ (spel, handboek, checkscripts)
                             └── /api/*  ──> larixa.py (Python) ──> SQLite
```

- **Aanmelden** gaat met een klascode van de docent en het studentnummer. Er zijn geen wachtwoorden.
- **Labsleutel**: elke student krijgt in het spel een eigen sleutel, zoals `LRX-7KQ2-M9PD`. De server leidt die af van het studentnummer en een geheim dat alleen op de server staat. De student zet de sleutel op de labserver: eerst met de hand, later met de eigen automatisering.
- **Code**: het checkscript (`web/lab/larixa-check.sh` of `.ps1`) test de server. Is alles goed, dan maakt het een code van de missie en de labsleutel. De API controleert die code. Een code van een klasgenoot werkt dus niet.
- **Volgorde**: een missie gaat open als de missies in `na` klaar zijn. Lab-missies sluit de student af met een code. Docentmissies, zoals de procesanalyse, vinkt de docent af op `/docent/`.
- **Ruimtes**: de werkplek is altijd open. De vergaderzaal en de serverruimte gaan open met de fases Analyseren en Automatiseren.

Eerlijk is eerlijk: wie het checkscript goed leest, kan zonder werkend lab een code uitrekenen. Dat is geen probleem, want de codes tellen niet mee voor het cijfer. De API voorkomt wel dat codes in de broncode van het spel staan, dat studenten codes van elkaar overnemen en dat iemand eindeloos gokt (maximaal 8 foute codes per 10 minuten).

## Mappen

| Map | Wat erin staat |
| --- | --- |
| `api/larixa.py` | De API en de beheeropdrachten. Alleen de standaardbibliotheek van Python 3.10 of nieuwer. |
| `api/missies.json` | Missies, personages, fases, sporen en badges. |
| `web/` | Het spel, de docentpagina en het handboek (`web/data/handboek.json`). Caddy serveert deze map. |
| `web/lab/` | Checkscripts voor Linux en Windows, en het script van Ruben voor de gebeurtenis in week 7. |
| `deploy/` | Site-blok voor Caddy en een systemd-service. |
| `tests/` | Tests voor de API en het Linux-checkscript. |

## Lokaal proberen

```sh
export LARIXA_DATA=/tmp/larixa
python3 api/larixa.py init
python3 api/larixa.py docent-wachtwoord
python3 api/larixa.py klas-toevoegen "Testklas"
python3 api/larixa.py serve --web web --port 8099
```

Open http://localhost:8099 voor het spel en http://localhost:8099/docent/ voor het docentoverzicht. Met `--web` serveert de API ook de bestanden. Op de server doet Caddy dat.

## Installeren op de server

Dit gaat uit van een Debian- of Ubuntu-container op Proxmox, met Caddy op dezelfde container. Staat Caddy ergens anders, lees dan de opmerking boven in `deploy/Caddyfile`.

```sh
sudo apt install python3 git
sudo useradd --system --home /var/lib/larixa --shell /usr/sbin/nologin larixa
sudo git clone https://github.com/precedente/cursus /srv/cursus

sudo cp /srv/cursus/deploy/larixa-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now larixa-api
```

De service maakt bij de eerste start `/var/lib/larixa` aan, met de database en het geheim. Stel daarna het docentwachtwoord in en maak een klas:

```sh
alias larixa='sudo -u larixa LARIXA_DATA=/var/lib/larixa python3 /srv/cursus/api/larixa.py'
larixa docent-wachtwoord
larixa klas-toevoegen "4ICT-A 2026"
```

Zet het site-blok uit `deploy/Caddyfile` in de Caddyfile en herlaad Caddy (`sudo systemctl reload caddy`). Controleer daarna:

- `curl https://cursus.gloudemansict.nl/api/gezond` geeft `{"ok": true}`.
- Het spel opent, en aanmelden met de klascode werkt.
- `/docent/` vraagt om het docentwachtwoord.

**Bijwerken:** `cd /srv/cursus && sudo git pull`. Is er iets in `api/` veranderd, herstart dan de API: `sudo systemctl restart larixa-api`. Een herstart zet de rem op foute codes terug op nul; voortgang blijft bewaard.

**Back-up:** maak een back-up van `/var/lib/larixa`. Zonder `geheim.key` veranderen alle labsleutels.

## Beheer

| Opdracht | Wat het doet |
| --- | --- |
| `larixa klas-toevoegen NAAM` | Klas aanmaken. Toont de klascode die je aan studenten geeft. |
| `larixa klassen` | Klassen, klascodes en aantallen studenten. |
| `larixa klas-sluiten CODE` | Geen nieuwe aanmeldingen meer. Bestaande studenten spelen door. |
| `larixa klas-verwijderen CODE` | Klas met alle studenten en voortgang verwijderen. |
| `larixa labsleutel CODE STUDENTNUMMER` | Labsleutel van een student opzoeken. |
| `larixa code MISSIE CODE STUDENTNUMMER` | Code van een student opzoeken, als het lab niet meewerkt. |
| `larixa docent-wachtwoord` | Docentwachtwoord instellen. Oude docentsessies worden uitgelogd. |
| `larixa controleer` | `missies.json` controleren na een wijziging. |

Op `/docent/` zie je per klas de voortgang. Bovenaan staat wat op jou wacht, zoals een procesanalyse die je nog moet afvinken. Je kunt ook stickers geven (Herhaalbaar, Feniks, Schoon, Kluis) en de voortgang exporteren als CSV.

## Missies en teksten aanpassen

- Teksten voor studenten volgen het schrijfkader van de opleiding: B1, korte zinnen, je-vorm, één handeling per stap.
- Missies staan in `api/missies.json`. In teksten worden `{LABSLEUTEL}` en `{BASIS}` (het adres van de site) ingevuld. Tussen backticks staat een opdracht in code-opmaak. Draai na een wijziging `larixa controleer` en herstart de API.
- Verander geen `id` van een missie waar al studenten mee bezig zijn: de code hangt af van de id. Een nieuwe lab-missie moet ook in beide checkscripts staan.
- Het handboek staat in `web/data/handboek.json`. Daarvoor hoeft de API niet opnieuw te starten.
- De formule voor de code staat op drie plekken en moet gelijk blijven: `missiecode()` in `api/larixa.py`, en het einde van `larixa-check.sh` en `larixa-check.ps1`.

## Privacy

De API bewaart alleen de klascode, het studentnummer, het gekozen spoor, de voortgang en de tijdstippen van codepogingen. Er zijn geen trackers of cookies van derden; het spel gebruikt alleen een sessiecookie. Gebruik `klas-verwijderen` als een klas klaar is. Draait de server buiten de school, vraag dan na of er een verwerkersovereenkomst nodig is.

De repository is openbaar. Zet nooit `data/` of `geheim.key` in Git; ze staan in `.gitignore`.

## Testen

```sh
python3 -m unittest discover -s tests -v
```

## Nog te controleren in het lab

- Het PowerShell-checkscript en `ruben.ps1` zijn nog niet op een echte win01 gedraaid.
- Het Windows-checkscript gaat ervan uit dat Setup het antwoordbestand bewaart in `C:\Windows\Panther\unattend.xml`. Controleer dat na de eerste onbemande installatie.
- Het Linux-checkscript is getest met een nagebootste server. Draai het één keer op een echte Ubuntu Server 26.04.
