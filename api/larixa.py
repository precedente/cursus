#!/usr/bin/env python3
"""Larixa-API voor het kantoorspel van de cursus Processen automatiseren.

Een kleine API zonder externe pakketten: alleen de standaardbibliotheek van
Python 3.10 of nieuwer. Caddy serveert het spel en stuurt /api/* hierheen.

    python3 larixa.py init                  database en geheim aanmaken
    python3 larixa.py docent-wachtwoord     wachtwoord voor de docentpagina
    python3 larixa.py klas-toevoegen NAAM   klas aanmaken, geeft een klascode
    python3 larixa.py serve                 de API starten (127.0.0.1:8081)

Met `python3 larixa.py --help` zie je alle opdrachten.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from collections import defaultdict, deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HIER = Path(__file__).resolve().parent
DATA = Path(os.environ.get("LARIXA_DATA", HIER.parent / "data"))
MISSIES_PAD = Path(os.environ.get("LARIXA_MISSIES", HIER / "missies.json"))

# Tekens voor klascodes en labsleutels: zonder I, O, 0 en 1, die lijken op elkaar.
ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
KLASCODE_RE = re.compile(r"^[A-Z2-9]{6}$")
STUDENTNUMMER_RE = re.compile(r"^[A-Z0-9]{3,20}$")
SPOREN = ("linux", "windows")

STUDENT_SESSIE_DUUR = 120 * 24 * 3600  # een semester
DOCENT_SESSIE_DUUR = 12 * 3600
MAX_BODY = 4096

# Remmen tegen raden: (aantal, venster in seconden)
REM_CODE = (8, 600)  # foute codes per student
REM_AANMELDEN = (20, 600)  # mislukte aanmeldingen per IP-adres
REM_DOCENT = (10, 600)  # mislukte docentlogins per IP-adres


# ---------------------------------------------------------------------------
# Codes en sleutels
# ---------------------------------------------------------------------------


def labsleutel(geheim: bytes, klas: str, studentnummer: str) -> str:
    """Persoonlijke labsleutel, afgeleid van het servergeheim. Bijvoorbeeld LRX-7KQ2-M9PD."""
    d = hmac.new(geheim, f"labsleutel|{klas}|{studentnummer}".encode(), hashlib.sha256).digest()
    tekens = "".join(ALFABET[b % 32] for b in d[:8])
    return f"LRX-{tekens[:4]}-{tekens[4:]}"


def missiecode(missie: str, sleutel: str) -> str:
    """De code die het checkscript toont. Moet gelijk blijven aan lab/larixa-check.sh en .ps1."""
    h = hashlib.sha256(f"larixa|{missie}|{sleutel}".encode()).hexdigest()[:8].upper()
    return f"{h[:4]}-{h[4:]}"


def normaliseer_code(code: str) -> str:
    schoon = re.sub(r"[^0-9A-F]", "", str(code).upper())
    return f"{schoon[:4]}-{schoon[4:]}" if len(schoon) == 8 else ""


def wachtwoord_hash(wachtwoord: str, zout: bytes | None = None, rondes: int = 400_000) -> str:
    zout = zout or secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", wachtwoord.encode(), zout, rondes)
    return f"pbkdf2${rondes}${zout.hex()}${h.hex()}"


def wachtwoord_klopt(wachtwoord: str, opgeslagen: str) -> bool:
    try:
        _, rondes, zout, h = opgeslagen.split("$")
        nieuw = hashlib.pbkdf2_hmac("sha256", wachtwoord.encode(), bytes.fromhex(zout), int(rondes))
        return hmac.compare_digest(nieuw.hex(), h)
    except (ValueError, AttributeError):
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(tekst: str) -> bytes:
    return base64.urlsafe_b64decode(tekst + "=" * (-len(tekst) % 4))


def maak_token(geheim: bytes, gegevens: dict) -> str:
    inhoud = _b64(json.dumps(gegevens, separators=(",", ":")).encode())
    handtekening = _b64(hmac.new(geheim, inhoud.encode(), hashlib.sha256).digest())
    return f"{inhoud}.{handtekening}"


def lees_token(geheim: bytes, token: str) -> dict | None:
    try:
        inhoud, handtekening = token.split(".")
        verwacht = _b64(hmac.new(geheim, inhoud.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(verwacht, handtekening):
            return None
        gegevens = json.loads(_unb64(inhoud))
        if gegevens.get("e", 0) < time.time():
            return None
        return gegevens
    except (ValueError, json.JSONDecodeError):
        return None


# ---------------------------------------------------------------------------
# Missies
# ---------------------------------------------------------------------------


def laad_missies(pad: Path = MISSIES_PAD) -> dict:
    data = json.loads(pad.read_text(encoding="utf-8"))
    controleer_missies(data)
    return data


def controleer_missies(data: dict) -> None:
    """Gooit een ValueError als missies.json niet klopt."""
    fases = {f["id"] for f in data["fases"]}
    personages = set(data["personages"])
    ids = [m["id"] for m in data["missies"]]
    badges = [b["id"] for b in data["badges"]]
    fouten = []
    if len(ids) != len(set(ids)):
        fouten.append("missie-id's zijn niet uniek")
    if set(ids) & set(badges):
        fouten.append("een badge heeft dezelfde id als een missie")
    for m in data["missies"]:
        mid = m["id"]
        if not re.fullmatch(r"[a-z0-9]{1,12}", mid):
            fouten.append(f"{mid}: id mag alleen kleine letters en cijfers bevatten")
        if m["soort"] not in ("lab", "docent"):
            fouten.append(f"{mid}: soort moet lab of docent zijn")
        if m["fase"] not in fases:
            fouten.append(f"{mid}: onbekende fase {m['fase']}")
        if m["van"] not in personages:
            fouten.append(f"{mid}: onbekend personage {m['van']}")
        for n in m.get("na", []):
            if n not in ids:
                fouten.append(f"{mid}: na verwijst naar onbekende missie {n}")
        sporen = m.get("sporen", list(SPOREN))
        if not set(sporen) <= set(SPOREN):
            fouten.append(f"{mid}: onbekend spoor")
        if m["soort"] == "lab":
            for s in sporen:
                if s not in m.get("server", {}):
                    fouten.append(f"{mid}: geen server voor spoor {s}")
                if s not in m.get("stappen", {}):
                    fouten.append(f"{mid}: geen stappen voor spoor {s}")
        elif "alle" not in m.get("stappen", {}) and not all(s in m.get("stappen", {}) for s in sporen):
            fouten.append(f"{mid}: geen stappen")
    if fouten:
        raise ValueError("missies.json klopt niet:\n- " + "\n- ".join(fouten))


def missie_zichtbaar(missie: dict, spoor: str | None) -> bool:
    return spoor is None or spoor in missie.get("sporen", SPOREN)


def missie_status(missie: dict, klaar: set[str]) -> str:
    if missie["id"] in klaar:
        return "klaar"
    if all(n in klaar for n in missie.get("na", [])):
        return "open"
    return "dicht"


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS instellingen (sleutel TEXT PRIMARY KEY, waarde TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS klassen (
    code TEXT PRIMARY KEY,
    naam TEXT NOT NULL,
    open INTEGER NOT NULL DEFAULT 1,
    aangemaakt REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS studenten (
    id INTEGER PRIMARY KEY,
    klas TEXT NOT NULL REFERENCES klassen(code) ON DELETE CASCADE,
    studentnummer TEXT NOT NULL,
    spoor TEXT,
    aangemaakt REAL NOT NULL,
    laatst_gezien REAL NOT NULL,
    UNIQUE (klas, studentnummer)
);
CREATE TABLE IF NOT EXISTS voltooid (
    student INTEGER NOT NULL REFERENCES studenten(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    door TEXT NOT NULL,
    tijd REAL NOT NULL,
    PRIMARY KEY (student, item)
);
CREATE TABLE IF NOT EXISTS pogingen (
    student INTEGER NOT NULL REFERENCES studenten(id) ON DELETE CASCADE,
    missie TEXT NOT NULL,
    gelukt INTEGER NOT NULL,
    tijd REAL NOT NULL
);
"""


def db_pad() -> Path:
    return DATA / "larixa.sqlite3"


def verbind() -> sqlite3.Connection:
    con = sqlite3.connect(db_pad(), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_data() -> bytes:
    DATA.mkdir(parents=True, exist_ok=True)
    os.chmod(DATA, 0o700)
    geheimpad = DATA / "geheim.key"
    if not geheimpad.exists():
        fd = os.open(geheimpad, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_hex(32))
    with verbind() as con:
        con.execute("PRAGMA journal_mode = WAL")
        con.executescript(SCHEMA)
    return lees_geheim()


def lees_geheim() -> bytes:
    pad = DATA / "geheim.key"
    if not pad.exists():
        sys.exit(f"Geen geheim gevonden in {pad}. Draai eerst: python3 larixa.py init")
    return bytes.fromhex(pad.read_text().strip())


def instelling(con: sqlite3.Connection, sleutel: str) -> str | None:
    rij = con.execute("SELECT waarde FROM instellingen WHERE sleutel = ?", (sleutel,)).fetchone()
    return rij["waarde"] if rij else None


def voltooide_items(con: sqlite3.Connection, student_id: int) -> dict[str, sqlite3.Row]:
    rijen = con.execute("SELECT item, door, tijd FROM voltooid WHERE student = ?", (student_id,))
    return {r["item"]: r for r in rijen}


# ---------------------------------------------------------------------------
# Rem tegen raden
# ---------------------------------------------------------------------------


class Rem:
    """Telt mislukte pogingen per sleutel binnen een tijdvenster (in het geheugen)."""

    def __init__(self, maximum: int, venster: int):
        self.maximum, self.venster = maximum, venster
        self.pogingen: dict[str, deque] = defaultdict(deque)
        self.slot = threading.Lock()

    def _opruimen(self, sleutel: str, nu: float) -> deque:
        rij = self.pogingen[sleutel]
        while rij and rij[0] < nu - self.venster:
            rij.popleft()
        return rij

    def geblokkeerd(self, sleutel: str) -> int:
        """Aantal seconden dat iemand moet wachten, of 0."""
        with self.slot:
            nu = time.time()
            rij = self._opruimen(sleutel, nu)
            if len(rij) >= self.maximum:
                return int(rij[0] + self.venster - nu) + 1
            return 0

    def mislukt(self, sleutel: str) -> None:
        with self.slot:
            self._opruimen(sleutel, time.time()).append(time.time())


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


class Fout(Exception):
    def __init__(self, status: int, bericht: str, extra: dict | None = None):
        super().__init__(bericht)
        self.status, self.bericht, self.extra = status, bericht, extra or {}


TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".sh": "text/plain; charset=utf-8",
    ".ps1": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


class App:
    def __init__(self, geheim: bytes, missies: dict, web: Path | None = None):
        self.web = web.resolve() if web else None
        self.geheim = geheim
        self.data = missies
        self.missies = {m["id"]: m for m in missies["missies"]}
        self.badges = {b["id"]: b for b in missies["badges"]}
        self.rem_code = Rem(*REM_CODE)
        self.rem_aanmelden = Rem(*REM_AANMELDEN)
        self.rem_docent = Rem(*REM_DOCENT)

    # -- studenten ---------------------------------------------------------

    def student_status(self, con: sqlite3.Connection, student: sqlite3.Row) -> dict:
        klaar = voltooide_items(con, student["id"])
        klaar_ids = set(klaar)
        missies = []
        for m in self.data["missies"]:
            if not missie_zichtbaar(m, student["spoor"]):
                continue
            item = {k: v for k, v in m.items() if k != "klaar"}
            item["status"] = missie_status(m, klaar_ids)
            if item["status"] == "klaar":
                item["klaar"] = m.get("klaar", "")
                item["klaar_op"] = klaar[m["id"]]["tijd"]
            missies.append(item)
        klas = con.execute("SELECT naam FROM klassen WHERE code = ?", (student["klas"],)).fetchone()
        return {
            "student": {
                "studentnummer": student["studentnummer"],
                "klas": student["klas"],
                "klasnaam": klas["naam"] if klas else "",
                "spoor": student["spoor"],
                "labsleutel": labsleutel(self.geheim, student["klas"], student["studentnummer"]),
            },
            "bedrijf": self.data["bedrijf"],
            "cursus": self.data["cursus"],
            "personages": self.data["personages"],
            "fases": self.data["fases"],
            "sporen": self.data["sporen"],
            "codeinstructie": self.data["codeinstructie"],
            "missies": missies,
            "badges": [dict(b, behaald=b["id"] in klaar_ids) for b in self.data["badges"]],
        }

    def huidige_student(self, con: sqlite3.Connection, cookies: dict) -> sqlite3.Row:
        gegevens = lees_token(self.geheim, cookies.get("larixa", ""))
        if not gegevens or gegevens.get("r") != "student":
            raise Fout(HTTPStatus.UNAUTHORIZED, "Je bent niet aangemeld.")
        student = con.execute(
            "SELECT s.* FROM studenten s JOIN klassen k ON k.code = s.klas"
            " WHERE s.klas = ? AND s.studentnummer = ?",
            (gegevens["k"], gegevens["s"]),
        ).fetchone()
        if not student:
            raise Fout(HTTPStatus.UNAUTHORIZED, "Je bent niet aangemeld.")
        con.execute("UPDATE studenten SET laatst_gezien = ? WHERE id = ?", (time.time(), student["id"]))
        return student

    def aanmelden(self, con, body, ip):
        wacht = self.rem_aanmelden.geblokkeerd(ip)
        if wacht:
            raise Fout(HTTPStatus.TOO_MANY_REQUESTS, f"Te veel pogingen. Probeer het over {wacht // 60 + 1} minuten opnieuw.")
        klascode = re.sub(r"[\s-]", "", str(body.get("klascode", ""))).upper()
        nummer = re.sub(r"\s", "", str(body.get("studentnummer", ""))).upper()
        if not STUDENTNUMMER_RE.fullmatch(nummer):
            raise Fout(HTTPStatus.BAD_REQUEST, "Vul je studentnummer in: alleen letters en cijfers.")
        klas = con.execute("SELECT * FROM klassen WHERE code = ?", (klascode,)).fetchone() if KLASCODE_RE.fullmatch(klascode) else None
        if not klas:
            self.rem_aanmelden.mislukt(ip)
            raise Fout(HTTPStatus.BAD_REQUEST, "Deze klascode kennen we niet. Controleer de code van je docent.")
        student = con.execute(
            "SELECT * FROM studenten WHERE klas = ? AND studentnummer = ?", (klascode, nummer)
        ).fetchone()
        if not student:
            if not klas["open"]:
                raise Fout(HTTPStatus.FORBIDDEN, "Deze klas is gesloten voor nieuwe aanmeldingen. Vraag je docent.")
            nu = time.time()
            con.execute(
                "INSERT INTO studenten (klas, studentnummer, aangemaakt, laatst_gezien) VALUES (?, ?, ?, ?)",
                (klascode, nummer, nu, nu),
            )
            student = con.execute(
                "SELECT * FROM studenten WHERE klas = ? AND studentnummer = ?", (klascode, nummer)
            ).fetchone()
        token = maak_token(self.geheim, {"r": "student", "k": klascode, "s": nummer, "e": int(time.time()) + STUDENT_SESSIE_DUUR})
        return self.student_status(con, student), [cookie("larixa", token, STUDENT_SESSIE_DUUR)]

    def kies_spoor(self, con, student, body):
        spoor = body.get("spoor")
        if spoor not in SPOREN:
            raise Fout(HTTPStatus.BAD_REQUEST, "Kies linux of windows.")
        con.execute("UPDATE studenten SET spoor = ? WHERE id = ?", (spoor, student["id"]))
        student = con.execute("SELECT * FROM studenten WHERE id = ?", (student["id"],)).fetchone()
        return self.student_status(con, student)

    def controleer_code(self, con, student, body):
        missie = self.missies.get(str(body.get("missie", "")))
        if not missie or not missie_zichtbaar(missie, student["spoor"]):
            raise Fout(HTTPStatus.NOT_FOUND, "Deze missie bestaat niet.")
        if missie["soort"] != "lab":
            raise Fout(HTTPStatus.BAD_REQUEST, "Deze missie vinkt je docent af. Je hebt geen code nodig.")
        klaar = set(voltooide_items(con, student["id"]))
        status = missie_status(missie, klaar)
        if status == "dicht":
            raise Fout(HTTPStatus.CONFLICT, "Deze missie is nog niet open.")
        if status == "klaar":
            return {"goed": True, "bericht": missie.get("klaar", ""), **self.student_status(con, student)}
        remsleutel = f"{student['klas']}|{student['studentnummer']}"
        wacht = self.rem_code.geblokkeerd(remsleutel)
        if wacht:
            raise Fout(HTTPStatus.TOO_MANY_REQUESTS, f"Even pauze. Je kunt over {wacht // 60 + 1} minuten weer een code proberen. Kijk intussen nog eens naar de uitvoer van het checkscript.")
        ingevuld = normaliseer_code(body.get("code", ""))
        sleutel = labsleutel(self.geheim, student["klas"], student["studentnummer"])
        goed = bool(ingevuld) and hmac.compare_digest(ingevuld, missiecode(missie["id"], sleutel))
        nu = time.time()
        con.execute("INSERT INTO pogingen (student, missie, gelukt, tijd) VALUES (?, ?, ?, ?)", (student["id"], missie["id"], int(goed), nu))
        if not goed:
            self.rem_code.mislukt(remsleutel)
            if not ingevuld:
                raise Fout(HTTPStatus.BAD_REQUEST, "Een code heeft 8 tekens, zoals 3FA9-0C1E.")
            raise Fout(HTTPStatus.BAD_REQUEST, "Deze code klopt niet. Draai het checkscript opnieuw en neem de code precies over.")
        con.execute("INSERT OR IGNORE INTO voltooid (student, item, door, tijd) VALUES (?, ?, 'code', ?)", (student["id"], missie["id"], nu))
        return {"goed": True, "bericht": missie.get("klaar", ""), **self.student_status(con, student)}

    # -- docent ------------------------------------------------------------

    def docent_inloggen(self, con, body, ip):
        wacht = self.rem_docent.geblokkeerd(ip)
        if wacht:
            raise Fout(HTTPStatus.TOO_MANY_REQUESTS, f"Te veel pogingen. Probeer het over {wacht // 60 + 1} minuten opnieuw.")
        opgeslagen = instelling(con, "docent_wachtwoord")
        if not opgeslagen:
            raise Fout(HTTPStatus.SERVICE_UNAVAILABLE, "Er is nog geen docentwachtwoord. Stel het in met: python3 larixa.py docent-wachtwoord")
        if not wachtwoord_klopt(str(body.get("wachtwoord", "")), opgeslagen):
            self.rem_docent.mislukt(ip)
            raise Fout(HTTPStatus.UNAUTHORIZED, "Dit wachtwoord klopt niet.")
        token = maak_token(self.geheim, {"r": "docent", "e": int(time.time()) + DOCENT_SESSIE_DUUR, "v": opgeslagen[-12:]})
        return {"ok": True}, [cookie("larixa_docent", token, DOCENT_SESSIE_DUUR)]

    def controleer_docent(self, con, cookies):
        gegevens = lees_token(self.geheim, cookies.get("larixa_docent", ""))
        opgeslagen = instelling(con, "docent_wachtwoord") or ""
        # Een nieuw wachtwoord maakt oude docentsessies ongeldig.
        if not gegevens or gegevens.get("r") != "docent" or gegevens.get("v") != opgeslagen[-12:]:
            raise Fout(HTTPStatus.UNAUTHORIZED, "Log in als docent.")

    def overzicht(self, con):
        klassen = []
        for k in con.execute("SELECT * FROM klassen ORDER BY aangemaakt"):
            studenten = []
            for s in con.execute("SELECT * FROM studenten WHERE klas = ? ORDER BY studentnummer", (k["code"],)):
                klaar = voltooide_items(con, s["id"])
                mislukt = con.execute(
                    "SELECT COUNT(*) AS n FROM pogingen WHERE student = ? AND gelukt = 0 AND tijd > ?",
                    (s["id"], time.time() - 7 * 24 * 3600),
                ).fetchone()["n"]
                studenten.append({
                    "studentnummer": s["studentnummer"],
                    "spoor": s["spoor"],
                    "laatst_gezien": s["laatst_gezien"],
                    "foute_codes_week": mislukt,
                    "voltooid": {item: {"door": r["door"], "tijd": r["tijd"]} for item, r in klaar.items()},
                    "status": {m["id"]: missie_status(m, set(klaar)) for m in self.data["missies"] if missie_zichtbaar(m, s["spoor"])},
                })
            klassen.append({"code": k["code"], "naam": k["naam"], "open": bool(k["open"]), "studenten": studenten})
        return {
            "klassen": klassen,
            "missies": [{k: m.get(k) for k in ("id", "week", "titel", "soort", "van", "zij", "sporen")} for m in self.data["missies"]],
            "badges": self.data["badges"],
        }

    def afvinken(self, con, body):
        item = str(body.get("item", ""))
        if item not in self.missies and item not in self.badges:
            raise Fout(HTTPStatus.NOT_FOUND, "Onbekende missie of badge.")
        student = con.execute(
            "SELECT * FROM studenten WHERE klas = ? AND studentnummer = ?",
            (str(body.get("klas", "")), str(body.get("studentnummer", ""))),
        ).fetchone()
        if not student:
            raise Fout(HTTPStatus.NOT_FOUND, "Deze student bestaat niet.")
        if body.get("klaar", True):
            con.execute("INSERT OR IGNORE INTO voltooid (student, item, door, tijd) VALUES (?, ?, 'docent', ?)", (student["id"], item, time.time()))
        else:
            con.execute("DELETE FROM voltooid WHERE student = ? AND item = ?", (student["id"], item))
        return {"ok": True}


def cookie(naam: str, waarde: str, duur: int) -> str:
    return f"{naam}={waarde}; Max-Age={duur}; Path=/api; HttpOnly; Secure; SameSite=Strict"


def wis_cookie(naam: str) -> str:
    return f"{naam}=; Max-Age=0; Path=/api; HttpOnly; Secure; SameSite=Strict"


def maak_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = "Larixa"
        sys_version = ""

        def log_message(self, fmt, *args):  # geen studentgegevens in de log
            sys.stderr.write(f"{self.command} {urlparse(self.path).path} {args[1] if len(args) > 1 else ''}\n")

        def client_ip(self) -> str:
            ip = self.client_address[0]
            doorgestuurd = self.headers.get("X-Forwarded-For")
            if doorgestuurd and ip in ("127.0.0.1", "::1"):
                return doorgestuurd.split(",")[-1].strip()
            return ip

        def cookies(self) -> dict:
            uit = {}
            for deel in self.headers.get("Cookie", "").split(";"):
                if "=" in deel:
                    k, v = deel.strip().split("=", 1)
                    uit[k] = v
            return uit

        def stuur(self, status: int, gegevens: dict, cookies: list[str] | None = None):
            inhoud = json.dumps(gegevens, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(inhoud)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for c in cookies or []:
                self.send_header("Set-Cookie", c)
            self.end_headers()
            self.wfile.write(inhoud)

        def lees_body(self) -> dict:
            if "application/json" not in self.headers.get("Content-Type", ""):
                raise Fout(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "Stuur JSON.")
            origin = self.headers.get("Origin")
            if origin and urlparse(origin).netloc != self.headers.get("Host"):
                raise Fout(HTTPStatus.FORBIDDEN, "Verzoek van een andere website.")
            lengte = int(self.headers.get("Content-Length") or 0)
            if lengte > MAX_BODY:
                raise Fout(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Te veel gegevens.")
            try:
                body = json.loads(self.rfile.read(lengte) or b"{}")
            except json.JSONDecodeError:
                raise Fout(HTTPStatus.BAD_REQUEST, "Ongeldige JSON.")
            if not isinstance(body, dict):
                raise Fout(HTTPStatus.BAD_REQUEST, "Ongeldige JSON.")
            return body

        def afhandelen(self, methode: str):
            pad = urlparse(self.path).path.rstrip("/")
            try:
                with verbind() as con:
                    resultaat = self.route(con, methode, pad)
                gegevens, cookies = resultaat if isinstance(resultaat, tuple) else (resultaat, None)
                self.stuur(HTTPStatus.OK, gegevens, cookies)
            except Fout as f:
                self.stuur(f.status, {"fout": f.bericht, **f.extra})
            except Exception as e:  # noqa: BLE001
                sys.stderr.write(f"Fout: {e!r}\n")
                self.stuur(HTTPStatus.INTERNAL_SERVER_ERROR, {"fout": "Er ging iets mis op de server."})

        def route(self, con, methode: str, pad: str):
            c = self.cookies()
            if methode == "GET" and pad == "/api/gezond":
                return {"ok": True}
            if methode == "POST" and pad == "/api/aanmelden":
                return app.aanmelden(con, self.lees_body(), self.client_ip())
            if methode == "POST" and pad == "/api/afmelden":
                return {"ok": True}, [wis_cookie("larixa")]
            if methode == "GET" and pad == "/api/status":
                return app.student_status(con, app.huidige_student(con, c))
            if methode == "POST" and pad == "/api/spoor":
                body = self.lees_body()
                return app.kies_spoor(con, app.huidige_student(con, c), body)
            if methode == "POST" and pad == "/api/code":
                body = self.lees_body()
                return app.controleer_code(con, app.huidige_student(con, c), body)
            if methode == "POST" and pad == "/api/docent/inloggen":
                return app.docent_inloggen(con, self.lees_body(), self.client_ip())
            if methode == "POST" and pad == "/api/docent/afmelden":
                return {"ok": True}, [wis_cookie("larixa_docent")]
            if methode == "GET" and pad == "/api/docent/overzicht":
                app.controleer_docent(con, c)
                return app.overzicht(con)
            if methode == "POST" and pad == "/api/docent/afvinken":
                body = self.lees_body()
                app.controleer_docent(con, c)
                return app.afvinken(con, body)
            raise Fout(HTTPStatus.NOT_FOUND, "Onbekend adres.")

        def stuur_bestand(self):
            """Alleen voor proberen op je eigen computer (serve --web). Op de server doet Caddy dit."""
            pad = urlparse(self.path).path
            doel = (app.web / pad.lstrip("/")).resolve()
            if doel.is_dir():
                doel = doel / "index.html"
            if not doel.is_relative_to(app.web) or not doel.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            inhoud = doel.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", TYPES.get(doel.suffix, "application/octet-stream"))
            self.send_header("Content-Length", str(len(inhoud)))
            self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
            self.end_headers()
            self.wfile.write(inhoud)

        def do_GET(self):
            if app.web and not urlparse(self.path).path.startswith("/api/"):
                self.stuur_bestand()
                return
            self.afhandelen("GET")

        def do_POST(self):
            self.afhandelen("POST")

    return Handler


# ---------------------------------------------------------------------------
# Opdrachtregel
# ---------------------------------------------------------------------------


def nieuwe_klascode(con: sqlite3.Connection) -> str:
    while True:
        code = "".join(secrets.choice(ALFABET) for _ in range(6))
        if not con.execute("SELECT 1 FROM klassen WHERE code = ?", (code,)).fetchone():
            return code


def zoek_klas(con: sqlite3.Connection, code: str) -> sqlite3.Row:
    klas = con.execute("SELECT * FROM klassen WHERE code = ?", (code.upper(),)).fetchone()
    if not klas:
        sys.exit(f"Klas {code} bestaat niet. Bekijk de klassen met: python3 larixa.py klassen")
    return klas


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Larixa-API voor het kantoorspel.")
    sub = p.add_subparsers(dest="opdracht", required=True)
    sub.add_parser("init", help="database en geheim aanmaken")
    s = sub.add_parser("serve", help="de API starten")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8081)
    s.add_argument("--web", type=Path, help="map met het spel meeserveren, om lokaal te proberen")
    sub.add_parser("docent-wachtwoord", help="wachtwoord voor de docentpagina instellen")
    k = sub.add_parser("klas-toevoegen", help="klas aanmaken; toont de klascode")
    k.add_argument("naam")
    sub.add_parser("klassen", help="klassen en klascodes tonen")
    for naam, uitleg in (("klas-sluiten", "geen nieuwe aanmeldingen meer"), ("klas-openen", "weer aanmeldingen toestaan")):
        sub.add_parser(naam, help=uitleg).add_argument("klascode")
    v = sub.add_parser("klas-verwijderen", help="klas met alle studenten en voortgang verwijderen")
    v.add_argument("klascode")
    v.add_argument("--ja", action="store_true", help="niet om bevestiging vragen")
    ls = sub.add_parser("labsleutel", help="labsleutel van een student tonen")
    ls.add_argument("klascode")
    ls.add_argument("studentnummer")
    c = sub.add_parser("code", help="missiecode van een student tonen, als het lab niet meewerkt")
    c.add_argument("missie")
    c.add_argument("klascode")
    c.add_argument("studentnummer")
    sub.add_parser("controleer", help="missies.json controleren")
    a = p.parse_args(argv)

    if a.opdracht == "controleer":
        data = laad_missies()
        print(f"missies.json klopt: {len(data['missies'])} missies, {len(data['badges'])} badges.")
        return
    if a.opdracht == "init":
        init_data()
        print(f"Klaar. Gegevens staan in {DATA}. Stel nu het docentwachtwoord in: python3 larixa.py docent-wachtwoord")
        return

    if a.opdracht == "serve":
        geheim = init_data()  # maakt bij de eerste start de database en het geheim aan
        app = App(geheim, laad_missies(), a.web)
        server = ThreadingHTTPServer((a.host, a.port), maak_handler(app))
        print(f"Larixa-API luistert op http://{a.host}:{a.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        return

    geheim = lees_geheim()
    with verbind() as con:
        if a.opdracht == "docent-wachtwoord":
            w1 = getpass.getpass("Nieuw docentwachtwoord (minstens 12 tekens): ")
            if len(w1) < 12:
                sys.exit("Te kort. Kies minstens 12 tekens.")
            if getpass.getpass("Nog een keer: ") != w1:
                sys.exit("De wachtwoorden zijn niet gelijk.")
            con.execute("INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('docent_wachtwoord', ?)", (wachtwoord_hash(w1),))
            print("Opgeslagen. Bestaande docentsessies zijn uitgelogd.")
        elif a.opdracht == "klas-toevoegen":
            code = nieuwe_klascode(con)
            con.execute("INSERT INTO klassen (code, naam, aangemaakt) VALUES (?, ?, ?)", (code, a.naam, time.time()))
            print(f"Klas {a.naam} aangemaakt. Klascode: {code}")
        elif a.opdracht == "klassen":
            rijen = con.execute(
                "SELECT k.*, COUNT(s.id) AS n FROM klassen k LEFT JOIN studenten s ON s.klas = k.code GROUP BY k.code ORDER BY k.aangemaakt"
            ).fetchall()
            if not rijen:
                print("Nog geen klassen. Maak er een met: python3 larixa.py klas-toevoegen NAAM")
            for r in rijen:
                print(f"{r['code']}  {r['naam']}  ({r['n']} studenten, {'open' if r['open'] else 'gesloten'})")
        elif a.opdracht in ("klas-sluiten", "klas-openen"):
            klas = zoek_klas(con, a.klascode)
            con.execute("UPDATE klassen SET open = ? WHERE code = ?", (int(a.opdracht == "klas-openen"), klas["code"]))
            print(f"Klas {klas['naam']} is {'open' if a.opdracht == 'klas-openen' else 'gesloten'} voor nieuwe aanmeldingen.")
        elif a.opdracht == "klas-verwijderen":
            klas = zoek_klas(con, a.klascode)
            if not a.ja and input(f"Klas {klas['naam']} met alle studenten en voortgang verwijderen? Typ ja: ").strip().lower() != "ja":
                sys.exit("Niets verwijderd.")
            con.execute("DELETE FROM klassen WHERE code = ?", (klas["code"],))
            print(f"Klas {klas['naam']} is verwijderd.")
        elif a.opdracht == "labsleutel":
            print(labsleutel(geheim, zoek_klas(con, a.klascode)["code"], a.studentnummer.upper()))
        elif a.opdracht == "code":
            missies = {m["id"] for m in laad_missies()["missies"]}
            if a.missie not in missies:
                sys.exit(f"Onbekende missie {a.missie}.")
            sleutel = labsleutel(geheim, zoek_klas(con, a.klascode)["code"], a.studentnummer.upper())
            print(missiecode(a.missie, sleutel))


if __name__ == "__main__":
    main()
