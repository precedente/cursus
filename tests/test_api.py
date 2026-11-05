"""Tests voor de Larixa-API en het Linux-checkscript.

Draaien vanuit de hoofdmap van de repository:

    python3 -m unittest discover -s tests -v
"""

import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

HOOFD = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HOOFD / "api"))

TMP = tempfile.mkdtemp(prefix="larixa-test-")
os.environ["LARIXA_DATA"] = TMP

import larixa  # noqa: E402

larixa.DATA = Path(TMP)


class Client:
    def __init__(self, poort):
        self.poort = poort
        self.cookies = {}

    def verzoek(self, methode, pad, body=None, headers=None):
        con = http.client.HTTPConnection("127.0.0.1", self.poort, timeout=10)
        h = {"Host": f"127.0.0.1:{self.poort}", **(headers or {})}
        if self.cookies:
            h["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        data = None
        if isinstance(body, bytes):
            data = body
        elif body is not None:
            data = json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
        con.request(methode, pad, body=data, headers=h)
        r = con.getresponse()
        for c in r.headers.get_all("Set-Cookie") or []:
            naam, rest = c.split("=", 1)
            waarde = rest.split(";", 1)[0]
            if "Max-Age=0" in c:
                self.cookies.pop(naam, None)
            else:
                self.cookies[naam] = waarde
        inhoud = r.read()
        try:
            return r.status, json.loads(inhoud)
        except json.JSONDecodeError:
            return r.status, inhoud

    def get(self, pad):
        return self.verzoek("GET", pad)

    def post(self, pad, body=None, **kw):
        return self.verzoek("POST", pad, {} if body is None else body, **kw)


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geheim = larixa.init_data()
        with larixa.verbind() as con:
            con.execute("INSERT INTO klassen (code, naam, aangemaakt) VALUES ('KLAS22', 'Testklas', 0)")
            con.execute("INSERT INTO klassen (code, naam, open, aangemaakt) VALUES ('DICHT2', 'Dichte klas', 0, 0)")
            con.execute(
                "INSERT INTO instellingen (sleutel, waarde) VALUES ('docent_wachtwoord', ?)",
                (larixa.wachtwoord_hash("geheim-wachtwoord", rondes=1000),),
            )
        cls.app = larixa.App(cls.geheim, larixa.laad_missies(), HOOFD / "web")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), larixa.maak_handler(cls.app))
        cls.poort = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        shutil.rmtree(TMP, ignore_errors=True)

    def nieuwe_student(self, nummer, spoor="linux"):
        c = Client(self.poort)
        status, data = c.post("/api/aanmelden", {"klascode": "klas-22", "studentnummer": nummer})
        self.assertEqual(status, 200, data)
        if spoor:
            status, data = c.post("/api/spoor", {"spoor": spoor})
            self.assertEqual(status, 200, data)
        return c, data

    def test_labsleutel_en_code(self):
        sleutel = larixa.labsleutel(b"x" * 32, "KLAS22", "123456")
        self.assertRegex(sleutel, r"^LRX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$")
        self.assertEqual(sleutel, larixa.labsleutel(b"x" * 32, "KLAS22", "123456"))
        self.assertNotEqual(sleutel, larixa.labsleutel(b"x" * 32, "KLAS22", "123457"))
        self.assertRegex(larixa.missiecode("m1", sleutel), r"^[0-9A-F]{4}-[0-9A-F]{4}$")
        self.assertEqual(larixa.normaliseer_code(" 3fa9 0c1e "), "3FA9-0C1E")
        self.assertEqual(larixa.normaliseer_code("abc"), "")

    def test_missies_kloppen(self):
        data = larixa.laad_missies()
        larixa.controleer_missies(data)
        kapot = json.loads(json.dumps(data))
        kapot["missies"][1]["na"] = ["bestaat-niet"]
        with self.assertRaises(ValueError):
            larixa.controleer_missies(kapot)

    def test_aanmelden(self):
        c = Client(self.poort)
        self.assertEqual(c.get("/api/status")[0], 401)
        status, data = c.post("/api/aanmelden", {"klascode": "ZZZZZZ", "studentnummer": "123"})
        self.assertEqual(status, 400)
        self.assertIn("klascode", data["fout"])
        status, _ = c.post("/api/aanmelden", {"klascode": "KLAS22", "studentnummer": "12 3!"})
        self.assertEqual(status, 400)
        status, _ = c.post("/api/aanmelden", {"klascode": "DICHT2", "studentnummer": "555"})
        self.assertEqual(status, 403)
        status, data = c.post("/api/aanmelden", {"klascode": "klas22", "studentnummer": "100001"})
        self.assertEqual(status, 200)
        self.assertIsNone(data["student"]["spoor"])
        self.assertEqual(c.get("/api/status")[0], 200)
        self.assertEqual(c.post("/api/afmelden")[0], 200)
        self.assertEqual(c.get("/api/status")[0], 401)

    def test_eerste_missie_met_code(self):
        c, data = self.nieuwe_student("100002")
        status = {m["id"]: m["status"] for m in data["missies"]}
        self.assertEqual(status["m1"], "open")
        self.assertEqual(status["m2"], "dicht")
        self.assertNotIn("z2", status, "z2 hoort bij het Windows-spoor")
        sleutel = data["student"]["labsleutel"]
        self.assertEqual(data["gelezen"], [])

        # Eerst de theorie lezen
        self.assertEqual(c.post("/api/code", {"missie": "m1", "code": larixa.missiecode("m1", sleutel)})[0], 409)
        self.assertEqual(c.post("/api/gelezen", {"kaart": "bestaat-niet"})[0], 404)
        status, data = c.post("/api/gelezen", {"kaart": "meten"})
        self.assertEqual(status, 200)
        self.assertEqual(data["gelezen"], ["meten"])

        self.assertEqual(c.post("/api/code", {"missie": "m1", "code": "0000-0000"})[0], 400)
        self.assertEqual(c.post("/api/code", {"missie": "m4", "code": larixa.missiecode("m4", sleutel)})[0], 409)
        self.assertEqual(c.post("/api/code", {"missie": "m2", "code": "0000-0000"})[0], 400)

        status, data = c.post("/api/code", {"missie": "m1", "code": larixa.missiecode("m1", sleutel).lower()})
        self.assertEqual(status, 200, data)
        status = {m["id"]: m["status"] for m in data["missies"]}
        self.assertEqual(status["m1"], "klaar")
        self.assertEqual(status["m2"], "open")
        self.assertEqual(status["m3"], "open")
        self.assertEqual(status["m4"], "dicht")

        # De code van een ander werkt niet.
        anders, data2 = self.nieuwe_student("100003")
        anders.post("/api/gelezen", {"kaart": "meten"})
        self.assertEqual(anders.post("/api/code", {"missie": "m1", "code": larixa.missiecode("m1", sleutel)})[0], 400)

    def test_rem_op_raden(self):
        c, _ = self.nieuwe_student("100004")
        c.post("/api/gelezen", {"kaart": "meten"})
        for _ in range(larixa.REM_CODE[0]):
            self.assertEqual(c.post("/api/code", {"missie": "m1", "code": "1111-1111"})[0], 400)
        self.assertEqual(c.post("/api/code", {"missie": "m1", "code": "1111-1111"})[0], 429)

    def test_andere_website_geweigerd(self):
        c, _ = self.nieuwe_student("100005")
        status, _ = c.post("/api/spoor", {"spoor": "windows"}, headers={"Origin": "https://kwaad.example"})
        self.assertEqual(status, 403)
        status, _ = c.verzoek("POST", "/api/spoor", b"", headers={"Content-Type": "text/plain"})
        self.assertEqual(status, 415)

    def test_docent(self):
        leerling, data = self.nieuwe_student("100006")
        sleutel = data["student"]["labsleutel"]
        leerling.post("/api/gelezen", {"kaart": "meten"})
        leerling.post("/api/code", {"missie": "m1", "code": larixa.missiecode("m1", sleutel)})

        d = Client(self.poort)
        self.assertEqual(d.get("/api/docent/overzicht")[0], 401)
        self.assertEqual(d.post("/api/docent/inloggen", {"wachtwoord": "fout"})[0], 401)
        self.assertEqual(d.post("/api/docent/inloggen", {"wachtwoord": "geheim-wachtwoord"})[0], 200)
        status, ov = d.get("/api/docent/overzicht")
        self.assertEqual(status, 200)
        klas = next(k for k in ov["klassen"] if k["code"] == "KLAS22")
        student = next(s for s in klas["studenten"] if s["studentnummer"] == "100006")
        self.assertEqual(student["status"]["m3"], "open")

        self.assertEqual(d.post("/api/docent/afvinken", {"klas": "KLAS22", "studentnummer": "100006", "item": "m3"})[0], 200)
        self.assertEqual(d.post("/api/docent/afvinken", {"klas": "KLAS22", "studentnummer": "100006", "item": "kluis"})[0], 200)
        self.assertEqual(d.post("/api/docent/afvinken", {"klas": "KLAS22", "studentnummer": "100006", "item": "onzin"})[0], 404)
        _, data = leerling.get("/api/status")
        status = {m["id"]: m["status"] for m in data["missies"]}
        self.assertEqual(status["m4"], "open")
        self.assertTrue(next(b for b in data["badges"] if b["id"] == "kluis")["behaald"])

        self.assertEqual(d.post("/api/docent/afvinken", {"klas": "KLAS22", "studentnummer": "100006", "item": "m3", "klaar": False})[0], 200)
        _, data = leerling.get("/api/status")
        self.assertEqual({m["id"]: m["status"] for m in data["missies"]}["m4"], "dicht")

        # Een student is geen docent.
        self.assertEqual(leerling.get("/api/docent/overzicht")[0], 401)
        self.assertEqual(leerling.post("/api/docent/klas", {"naam": "Stiekem"})[0], 401)

        # Klassen beheren
        status, nieuw = d.post("/api/docent/klas", {"naam": "  4ICT-B   2026 "})
        self.assertEqual(status, 200)
        self.assertEqual(nieuw["naam"], "4ICT-B 2026")
        self.assertRegex(nieuw["code"], r"^[A-HJ-NP-Z2-9]{6}$")
        self.assertEqual(d.post("/api/docent/klas", {"naam": "4ICT-B 2026"})[0], 409)
        self.assertEqual(d.post("/api/docent/klas", {"naam": ""})[0], 400)
        nieuwe = Client(self.poort)
        self.assertEqual(nieuwe.post("/api/aanmelden", {"klascode": nieuw["code"], "studentnummer": "900001"})[0], 200)
        self.assertEqual(d.post("/api/docent/klas-open", {"klas": nieuw["code"], "open": False})[0], 200)
        self.assertEqual(Client(self.poort).post("/api/aanmelden", {"klascode": nieuw["code"], "studentnummer": "900002"})[0], 403)
        self.assertEqual(d.post("/api/docent/klas-open", {"klas": "ZZZZZZ", "open": True})[0], 404)

    def test_bestanden(self):
        c = Client(self.poort)
        status, inhoud = c.get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"Larixa", inhoud)
        self.assertEqual(c.get("/data/handboek.json")[0], 200)
        self.assertEqual(c.get("/lab/larixa-check.sh")[0], 200)
        self.assertEqual(c.get("/../api/larixa.py")[0], 404)
        self.assertEqual(c.get("/%2e%2e/api/larixa.py")[0], 404)


class CheckscriptTest(unittest.TestCase):
    """Draait het Linux-checkscript met een nagebootste server."""

    SCRIPT = HOOFD / "web" / "lab" / "larixa-check.sh"

    def setUp(self):
        self.map = Path(tempfile.mkdtemp(prefix="larixa-check-"))
        self.root = self.map / "root"
        self.bin = self.map / "bin"
        (self.root / "etc" / "larixa").mkdir(parents=True)
        self.bin.mkdir()
        self.sleutel = larixa.labsleutel(b"y" * 32, "KLAS22", "777")
        (self.root / "etc" / "larixa" / "labsleutel").write_text(self.sleutel + "\n")
        (self.root / "etc" / "localtime").symlink_to("/usr/share/zoneinfo/Europe/Amsterdam")
        self.nep("hostname", "echo web01")
        self.nep("ip", "echo '2: ens33    inet 192.168.150.21/24 brd 192.168.150.255 scope global ens33'")
        self.nep("dpkg-query", "printf 'install ok installed'")
        self.nep("systemctl", "exit 0")
        self.nep("curl", f"echo '<p>{self.sleutel}</p>'")

    def tearDown(self):
        shutil.rmtree(self.map, ignore_errors=True)

    def nep(self, naam, regel):
        pad = self.bin / naam
        pad.write_text(f"#!/bin/sh\n{regel}\n")
        pad.chmod(0o755)

    def draai(self, missie):
        omgeving = {**os.environ, "LARIXA_ROOT": str(self.root), "PATH": f"{self.bin}:{os.environ['PATH']}"}
        return subprocess.run(["bash", str(self.SCRIPT), missie], capture_output=True, text=True, env=omgeving)

    def test_code_gelijk_aan_api(self):
        r = self.draai("m1")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn(larixa.missiecode("m1", self.sleutel), r.stdout)

    def test_inrichting(self):
        r = self.draai("m5")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn(larixa.missiecode("m5", self.sleutel), r.stdout)

    def test_fouten_geven_geen_code(self):
        self.nep("hostname", "echo ubuntu")
        r = self.draai("m1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("Nog 1 punt", r.stdout)
        self.assertNotIn(larixa.missiecode("m1", self.sleutel), r.stdout)

    def test_bouwinfo(self):
        r = self.draai("m4")
        self.assertEqual(r.returncode, 1)
        (self.root / "etc" / "larixa" / "bouwinfo").write_text("methode=autoinstall\n")
        r = self.draai("m4")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_onbekende_missie(self):
        self.assertEqual(self.draai("m2").returncode, 2)


if __name__ == "__main__":
    unittest.main()
