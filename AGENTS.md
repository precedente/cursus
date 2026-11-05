# Onderhoud

- Python alleen met de standaardbibliotheek (`api/larixa.py`). Geen pip-pakketten, zodat de server zonder buildstap draait.
- Het spel is plain JavaScript (ES-modules) zonder externe bronnen. De Content-Security-Policy in `deploy/Caddyfile` staat alleen `'self'` toe: geen inline scripts, inline styles, event-handler-attributen of CDN's. Stijl via CSSOM (`el.style.x = …`) mag wel.
- De codeformule staat in `missiecode()` in `api/larixa.py`, en aan het eind van `web/lab/larixa-check.sh` en `web/lab/larixa-check.ps1`. Wijzig ze samen.
- Een nieuwe lab-missie hoort ook in de `case` van `larixa-check.sh` en in `$geldig` en de `switch` van `larixa-check.ps1`.
- `.ps1`-bestanden blijven UTF-8 met BOM en CRLF, anders leest Windows PowerShell 5.1 ze verkeerd.
- Teksten voor studenten: Nederlands op B1, korte zinnen, je-vorm, één handeling per stap. Personages en beelden zijn eigen werk; geen bestaande series of merken.
- Draai na elke wijziging `python3 -m unittest discover -s tests` en `python3 api/larixa.py controleer`.
- Nooit `data/`, `geheim.key` of databasebestanden committen. De repository is openbaar.
