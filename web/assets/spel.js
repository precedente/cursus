// Het kantoorspel van Larixa Logistiek. Geen frameworks: een canvas, een paar
// dialogen en de API op /api. Alles wat je in het kantoor kunt doen, kan ook via
// de knoppen Planbord en Handboek.

import { T, plaatje, spiegel, personageFrames, TEGELS, vloer, knipper } from "./kunst.js";
import { RUIMTES, PLEKKEN, BREED, HOOG, tegel, isVast, voorwerp } from "./kaart.js";

const $ = (s) => document.querySelector(s);
const doek = $("#spel");
const ctx = doek.getContext("2d");
const STIL = matchMedia("(prefers-reduced-motion: reduce)").matches;

const FASENAMEN = { hand: "Met de hand", analyseren: "Analyseren", automatiseren: "Automatiseren", verbeteren: "Verbeteren", opleveren: "Opleveren" };
const FASERUIMTE = { hand: "werkplek", analyseren: "vergaderzaal", automatiseren: "serverruimte", verbeteren: "serverruimte", opleveren: "vergaderzaal" };
const RICHTINGEN = { ArrowUp: "omhoog", KeyW: "omhoog", ArrowDown: "omlaag", KeyS: "omlaag", ArrowLeft: "links", KeyA: "links", ArrowRight: "rechts", KeyD: "rechts" };
const STAP = { omhoog: [0, -1], omlaag: [0, 1], links: [-1, 0], rechts: [1, 0] };
const DUUR = 170; // milliseconden per tegel

const spel = {
  status: null,
  handboek: null,
  ruimte: "werkplek",
  speler: { x: 6, y: 9, richting: "omhoog", van: null, start: 0, stappen: 0 },
  toetsen: [],
  pad: [],
  naPad: null,
  lagen: {},
};

// --- API ----------------------------------------------------------------------

async function api(pad, gegevens) {
  const opties = { credentials: "same-origin", headers: {} };
  if (gegevens !== undefined) {
    opties.method = "POST";
    opties.headers["Content-Type"] = "application/json";
    opties.body = JSON.stringify(gegevens);
  }
  let antwoord;
  try {
    antwoord = await fetch(pad, opties);
  } catch {
    throw Object.assign(new Error("Geen verbinding met de server. Probeer het zo opnieuw."), { status: 0 });
  }
  let data = {};
  try { data = await antwoord.json(); } catch { /* geen JSON */ }
  if (!antwoord.ok) throw Object.assign(new Error(data.fout || "Er ging iets mis. Probeer het opnieuw."), { status: antwoord.status });
  return data;
}

// --- hulpjes voor de pagina -------------------------------------------------

function el(tag, eigenschappen = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eigenschappen)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "klasse") e.className = v;
    else if (k === "tekst") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...schoon(kinderen));
  return e;
}

function schoon(kinderen) {
  return kinderen.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false);
}

function vervang(doel, ...kinderen) {
  doel.replaceChildren(...schoon(kinderen));
}

function vul(tekst) {
  const s = spel.status;
  const spoor = s?.student.spoor;
  return String(tekst)
    .replaceAll("{LABSLEUTEL}", s?.student.labsleutel || "je labsleutel")
    .replaceAll("{BASIS}", location.origin)
    .replaceAll("{SPOOR}", spoor || "");
}

// Tekst met `code` tussen backticks wordt tekst plus <code>-elementen.
function rijk(tekst, extra = {}) {
  let t = vul(tekst);
  for (const [k, v] of Object.entries(extra)) t = t.replaceAll(`{${k}}`, v);
  const delen = t.split("`");
  return delen.map((deel, i) => (i % 2 ? el("code", { tekst: deel }) : document.createTextNode(deel)));
}

function sluitknop(dialoog) {
  return el("button", { type: "button", klasse: "sluiten", "aria-label": "Sluiten", tekst: "×", onclick: () => dialoog.close() });
}

function toast(tekst, soort = "") {
  const t = el("div", { klasse: `toast ${soort}`, tekst });
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 6000);
}

function portret(naam) {
  const c = el("canvas", { width: 16, height: 16, "aria-hidden": "true" });
  c.getContext("2d").drawImage(sprites[naam].omlaag[0], 0, 0);
  return c;
}

function streepjescode(tekst) {
  const c = el("canvas", { width: 48, height: 20, "aria-hidden": "true" });
  const g = c.getContext("2d");
  g.fillStyle = "#1d2338";
  let h = 7;
  for (const t of tekst) h = (Math.imul(h, 31) + t.charCodeAt(0)) >>> 0;
  for (let x = 1; x < 47; ) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const w = 1 + ((h >>> 16) % 3);
    g.fillRect(x, 1, w, 18);
    x += w + 1 + ((h >>> 8) % 2);
  }
  return c;
}

function datum(sec) {
  return new Date(sec * 1000).toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

function openDialoog(d) {
  if (!d.open) d.showModal();
}

// --- gegevens -------------------------------------------------------------------

const missies = () => spel.status?.missies || [];
const missie = (id) => missies().find((m) => m.id === id);
const gelezen = () => new Set(spel.status?.gelezen || []);
const ongelezen = (m) => (m.theorie || []).filter((id) => !gelezen().has(id));
const ruimteVanFase = (fase) => spel.status?.fases.find((f) => f.id === fase)?.ruimte || FASERUIMTE[fase];
const fasenaam = (fase) => spel.status?.fases.find((f) => f.id === fase)?.naam || FASENAMEN[fase] || fase;

function ruimteOpen(naam) {
  if (naam === "werkplek") return true;
  return missies().some((m) => ruimteVanFase(m.fase) === naam && m.status !== "dicht");
}

function openMissies(van) {
  return missies()
    .filter((m) => m.status === "open" && (!van || m.van === van))
    .sort((a, b) => a.week - b.week || (a.zij ? 1 : 0) - (b.zij ? 1 : 0));
}

function personages() {
  return Object.entries(PLEKKEN).map(([naam, plek]) => {
    const open = openMissies(naam);
    // Een personage staat bij zijn nieuwste open missie; oudere tickets blijven op het planbord.
    const nieuwste = open.filter((m) => !m.zij).sort((a, b) => b.week - a.week)[0] || open[0];
    let ruimte = nieuwste ? ruimteVanFase(nieuwste.fase) : plek.thuis;
    if (!plek[ruimte] || !ruimteOpen(ruimte)) ruimte = plek.thuis;
    return { naam, ruimte, x: plek[ruimte][0], y: plek[ruimte][1], open };
  });
}

// --- sprites en ruimtes -----------------------------------------------------

const sprites = {};

function bouwSprites() {
  for (const naam of ["speler", "samira", "noor", "ruben"]) {
    const f = personageFrames(naam);
    const s = {};
    for (const r of ["omlaag", "omhoog", "links"]) s[r] = f[r].map((rijen, i) => plaatje(rijen, `${naam}-${r}-${i}`));
    s.rechts = s.links.map(spiegel);
    sprites[naam] = s;
  }
  sprites.uitroep = plaatje(TEGELS.uitroep, "uitroep");
}

function tegelPlaatje(ruimte, x, y, knipperen) {
  const t = tegel(ruimte, x, y);
  const links = tegel(ruimte, x - 1, y);
  const boven = tegel(ruimte, x, y - 1);
  const kies = {
    "=": "muurTop", _: "muurTop", "|": "zijmuur", "-": "muur", w: "raam",
    P: links === "P" ? "planbordR" : "planbordL",
    B: links === "B" ? "whiteboardR" : "whiteboardL",
    O: "poster", Q: "poster2", d: "bureau", D: "bureauPc", Y: "bureauPc",
    c: "stoel", p: "plant", k: "koffie", H: "kast", t: "tafel",
    r: boven === "r" ? "rackOnder" : "rackBoven",
  }[t];
  if (t === ">" || t === "<") {
    const doel = t === ">" ? RUIMTES[ruimte].rechts : RUIMTES[ruimte].links;
    return plaatje(TEGELS[ruimteOpen(doel) ? "deurOpen" : "deurDicht"], ruimteOpen(doel) ? "deurOpen" : "deurDicht");
  }
  if (!kies) return null;
  const rijen = knipperen && t === "r" ? knipper(TEGELS[kies]) : TEGELS[kies];
  return plaatje(rijen, `${kies}-${knipperen && t === "r" ? 1 : 0}`);
}

// Een tafel van meerdere tegels krijgt alleen aan de buitenkant een rand.
function randTafel(g, naam, x, y) {
  const px = x * T;
  const py = y * T;
  g.fillStyle = "#1d2338";
  if (tegel(naam, x, y - 1) !== "t") g.fillRect(px, py, T, 1);
  if (tegel(naam, x - 1, y) !== "t") g.fillRect(px, py, 1, T);
  if (tegel(naam, x + 1, y) !== "t") g.fillRect(px + T - 1, py, 1, T);
  if (tegel(naam, x, y + 1) !== "t") {
    g.fillStyle = "#6e4429";
    g.fillRect(px, py + T - 4, T, 3);
    g.fillStyle = "#1d2338";
    g.fillRect(px, py + T - 1, T, 1);
  }
}

function bouwRuimte(naam) {
  const lagen = [0, 1].map((frame) => {
    const laag = el("canvas", { width: BREED * T, height: HOOG * T });
    const g = laag.getContext("2d");
    for (let y = 0; y < HOOG; y++) {
      for (let x = 0; x < BREED; x++) {
        const t = tegel(naam, x, y);
        if (!"=_|-wPBOQ".includes(t)) g.drawImage(plaatje(vloer(RUIMTES[naam].vloer, x, y), `vloer-${naam}-${x}-${y}`), x * T, y * T);
        const p = tegelPlaatje(naam, x, y, frame === 1);
        if (p) g.drawImage(p, x * T, y * T);
        if (t === "t") randTafel(g, naam, x, y);
        if (t === "Y") {
          // Een geel briefje: dit is jouw bureau.
          g.fillStyle = "#f5d26b";
          g.fillRect(x * T + 11, y * T + 6, 3, 3);
        }
      }
    }
    return laag;
  });
  spel.lagen[naam] = lagen;
}

function bouwAlleRuimtes() {
  for (const naam of Object.keys(RUIMTES)) bouwRuimte(naam);
}

// --- bewegen ------------------------------------------------------------------

function deurOpen(doel) {
  return Boolean(doel) && ruimteOpen(doel);
}

function personageOp(x, y) {
  return personages().find((p) => p.ruimte === spel.ruimte && p.x === x && p.y === y);
}

function geblokkeerd(x, y) {
  return isVast(spel.ruimte, x, y, deurOpen) || Boolean(personageOp(x, y));
}

function huidigeRichting() {
  return spel.toetsen[spel.toetsen.length - 1];
}

function dialoogOpen() {
  return Boolean(document.querySelector("dialog[open]")) || !$("#aanmelden").hidden;
}

function probeerStap(richting, nu) {
  const s = spel.speler;
  s.richting = richting;
  const [dx, dy] = STAP[richting];
  const nx = s.x + dx;
  const ny = s.y + dy;
  if (geblokkeerd(nx, ny)) {
    const t = tegel(spel.ruimte, nx, ny);
    if ((t === ">" || t === "<") && spel.toetsen.length) meldDichteDeur(t);
    spel.pad = [];
    return false;
  }
  s.van = [s.x, s.y];
  s.x = nx;
  s.y = ny;
  s.start = nu;
  s.stappen++;
  return true;
}

let laatsteDeurmelding = 0;
function meldDichteDeur(t) {
  if (performance.now() - laatsteDeurmelding < 2500) return;
  laatsteDeurmelding = performance.now();
  const doel = t === ">" ? RUIMTES[spel.ruimte].rechts : RUIMTES[spel.ruimte].links;
  toast(doel === "vergaderzaal"
    ? "De deur zit op slot. Hij gaat open als je je eerste server met de hand hebt geïnstalleerd."
    : "De deur zit op slot. Hij gaat open als je docent je procesanalyse heeft afgevinkt.");
}

function aangekomen() {
  const s = spel.speler;
  const t = tegel(spel.ruimte, s.x, s.y);
  if (t === ">" || t === "<") {
    const doel = t === ">" ? RUIMTES[spel.ruimte].rechts : RUIMTES[spel.ruimte].links;
    spel.ruimte = doel;
    s.x = t === ">" ? 1 : BREED - 2;
    s.richting = t === ">" ? "rechts" : "links";
    spel.pad = [];
    spel.naPad = null;
    toonRuimtenaam();
    return;
  }
  if (!spel.pad.length && spel.naPad) {
    const actie = spel.naPad;
    spel.naPad = null;
    actie();
  }
}

function voorSpeler() {
  const s = spel.speler;
  const [dx, dy] = STAP[s.richting];
  return [s.x + dx, s.y + dy];
}

function gebruik() {
  const [x, y] = voorSpeler();
  const p = personageOp(x, y);
  if (p) return praat(p);
  const t = tegel(spel.ruimte, x, y);
  if (t === ">" || t === "<") return deurOpen(t === ">" ? RUIMTES[spel.ruimte].rechts : RUIMTES[spel.ruimte].links) || meldDichteDeur(t);
  const v = voorwerp(t);
  if (v) doeVoorwerp(v);
}

function doeVoorwerp(v) {
  if (v.soort === "planbord") return toonPlanbord();
  if (v.soort === "handboek") return toonHandboek(v.tab, v.fase);
  if (v.soort === "koffie") return toast("Koffie! Noor noemt wachten bij de automaat verspilling. Jij noemt het pauze.");
  if (v.soort === "pc") return toast("Dit is niet jouw computer. Jouw bureau is het bureau linksboven.");
  if (v.soort === "bureau") {
    if (!spel.status) return toast("Meld je eerst aan.");
    const lab = openMissies().find((m) => m.soort === "lab");
    return lab ? toonTicket(lab.id) : toonPlanbord();
  }
}

function hintTekst() {
  if (!spel.status) return "";
  const [x, y] = voorSpeler();
  const p = personageOp(x, y);
  if (p) return `E of spatie: praten met ${spel.status.personages[p.naam].naam.split(" ")[0]}`;
  const v = voorwerp(tegel(spel.ruimte, x, y));
  if (v) return `E of spatie: ${v.hint}`;
  return "Loop met de pijltjes of WASD. Klikken kan ook.";
}

// Klikken: loop naar de tegel, of naar een plek naast een personage of voorwerp.
function zoekPad(doelen) {
  const s = spel.speler;
  const sleutel = (x, y) => `${x},${y}`;
  const vorige = new Map([[sleutel(s.x, s.y), null]]);
  const rij = [[s.x, s.y]];
  const doelSet = new Set(doelen.map(([x, y]) => sleutel(x, y)));
  while (rij.length) {
    const [x, y] = rij.shift();
    if (doelSet.has(sleutel(x, y))) {
      const pad = [];
      let k = sleutel(x, y);
      while (vorige.get(k)) {
        const [px, py] = vorige.get(k);
        const [cx, cy] = k.split(",").map(Number);
        pad.unshift(cx - px === 1 ? "rechts" : cx - px === -1 ? "links" : cy - py === 1 ? "omlaag" : "omhoog");
        k = sleutel(px, py);
      }
      return pad;
    }
    for (const [dx, dy] of Object.values(STAP)) {
      const nx = x + dx;
      const ny = y + dy;
      if (vorige.has(sleutel(nx, ny)) || geblokkeerd(nx, ny)) continue;
      const t = tegel(spel.ruimte, nx, ny);
      if ((t === ">" || t === "<") && !doelSet.has(sleutel(nx, ny))) continue;
      vorige.set(sleutel(nx, ny), [x, y]);
      rij.push([nx, ny]);
    }
  }
  return null;
}

function klik(ev) {
  if (dialoogOpen()) return;
  const vak = doek.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - vak.left) / vak.width) * BREED);
  const y = Math.floor(((ev.clientY - vak.top) / vak.height) * HOOG);
  const p = personageOp(x, y);
  const v = voorwerp(tegel(spel.ruimte, x, y));
  if (p || v) {
    const buren = Object.entries(STAP).map(([r, [dx, dy]]) => [x - dx, y - dy, r]);
    const s = spel.speler;
    const naast = buren.find(([bx, by]) => bx === s.x && by === s.y);
    const actie = () => {
      const [bx, by, r] = buren.find(([bx, by]) => bx === spel.speler.x && by === spel.speler.y) || [];
      if (r) spel.speler.richting = r;
      if (bx !== undefined) gebruik();
    };
    if (naast) return actie();
    const pad = zoekPad(buren.map(([bx, by]) => [bx, by]));
    if (pad) {
      spel.pad = pad;
      spel.naPad = actie;
    }
    return;
  }
  const pad = zoekPad([[x, y]]);
  if (pad) {
    spel.pad = pad;
    spel.naPad = null;
  }
}

// --- tekenen ------------------------------------------------------------------

function tekenFiguur(naam, px, py, richting, frame) {
  ctx.drawImage(sprites[naam][richting][frame], Math.round(px), Math.round(py) - 4);
}

function kijkrichting(p) {
  const s = spel.speler;
  const dx = s.x - p.x;
  const dy = s.y - p.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) return "omlaag";
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "rechts" : "links";
  return dy < 0 ? "omhoog" : "omlaag";
}

function tekenen(nu) {
  const frame = STIL ? 0 : Math.floor(nu / 600) % 2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spel.lagen[spel.ruimte][frame], 0, 0);

  const s = spel.speler;
  let sx = s.x * T;
  let sy = s.y * T;
  let loopframe = 0;
  if (s.van) {
    const t = Math.min(1, (nu - s.start) / DUUR);
    sx = (s.van[0] + (s.x - s.van[0]) * t) * T;
    sy = (s.van[1] + (s.y - s.van[1]) * t) * T;
    loopframe = t < 0.5 ? s.stappen % 2 : 0;
  }

  const figuren = personages()
    .filter((p) => p.ruimte === spel.ruimte)
    .map((p) => ({ y: p.y * T, teken: () => {
      tekenFiguur(p.naam, p.x * T, p.y * T, kijkrichting(p), 0);
      if (spel.status && p.open.length) {
        const wip = STIL ? 0 : Math.round(Math.sin(nu / 180) * 1.5);
        ctx.drawImage(sprites.uitroep, p.x * T + 4, p.y * T - 16 + wip);
      }
    } }));
  if (spel.status) figuren.push({ y: sy, teken: () => tekenFiguur("speler", sx, sy, s.richting, loopframe) });
  figuren.sort((a, b) => a.y - b.y).forEach((f) => f.teken());
}

function lus(nu) {
  const s = spel.speler;
  if (s.van && nu - s.start >= DUUR) {
    s.van = null;
    aangekomen();
  }
  if (!s.van && spel.status && !dialoogOpen()) {
    const r = huidigeRichting() || spel.pad.shift();
    if (r) {
      if (huidigeRichting()) spel.naPad = null;
      probeerStap(r, nu);
    }
  }
  tekenen(nu);
  const hint = $("#hint");
  const nieuw = hintTekst();
  if (hint.textContent !== nieuw) hint.textContent = nieuw;
  requestAnimationFrame(lus);
}

function schaal() {
  const veld = $("#speelveld");
  const ruimte = veld.getBoundingClientRect();
  const beschikbaarB = Math.max(320, ruimte.width - 48);
  const beschikbaarH = Math.max(192, ruimte.height - 48);
  const f = Math.max(1, Math.floor(Math.min(beschikbaarB / 320, beschikbaarH / 192)));
  const breedte = Math.min(320 * f, window.innerWidth - 40);
  doek.style.width = `${breedte}px`;
  doek.style.height = `${(breedte * 192) / 320}px`;
}

// --- dialogen: praten -----------------------------------------------------------

const PRAATJES = {
  samira: ["Lekker bezig. Kijk op het planbord wat er nog openstaat.", "Een goede beheerder doet iets één keer met de hand. Daarna automatiseert ze het."],
  noor: ["Meten is weten. Schrijf het meteen op, niet achteraf.", "Wachten is ook verspilling. Ook bij de koffieautomaat."],
  ruben: ["Hoi! Ik doe de planning. Van servers weet ik niks, hoor.", "Ik zou nooit zomaar iets op een server veranderen. Nooit."],
};

function praat(p) {
  const d = $("#praat");
  const persoon = spel.status.personages[p.naam];
  const inhoud = $("#praat-inhoud");
  let regel;
  let knoppen = [];
  if (p.open.length) {
    regel = p.open.length === 1 ? `Ik heb een ticket voor je: ${p.open[0].titel}.` : "Ik heb een paar tickets voor je.";
    knoppen = p.open.map((m) => el("button", { type: "button", klasse: "knop knop-hoofd", tekst: p.open.length === 1 ? "Ticket lezen" : m.titel, onclick: () => { d.close(); toonTicket(m.id); } }));
  } else if (p.naam === "ruben" && missie("m8")?.status === "klaar") {
    regel = "Ik raak die server nooit meer aan. Echt niet.";
  } else {
    const lijst = PRAATJES[p.naam];
    regel = lijst[spel.speler.stappen % lijst.length];
  }
  knoppen.push(el("button", { type: "button", klasse: "knop", tekst: "Verder", onclick: () => d.close() }));
  inhoud.replaceChildren(
    portret(p.naam),
    el("div", {},
      el("p", { klasse: "wie", id: "praat-naam", tekst: `${persoon.naam}, ${persoon.rol}` }),
      el("p", { tekst: regel }),
      el("div", { klasse: "code-invoer" }, knoppen)),
  );
  openDialoog(d);
  knoppen[0].focus();
}

// --- dialogen: ticket -----------------------------------------------------------

function toonTicket(id) {
  const m = missie(id);
  if (!m) return;
  if (m.status === "open" && ongelezen(m).length) return toonLeesEerst(m);
  const d = $("#ticket");
  const s = spel.status;
  const spoor = s.student.spoor;
  const persoon = s.personages[m.van];
  const nr = m.id.toUpperCase();
  const server = spoor ? m.server?.[spoor] : null;
  const delen = [
    sluitknop(d),
    el("header", { klasse: "label-kop" },
      streepjescode(`${m.id}${s.student.labsleutel}`),
      el("p", { klasse: "label-nr", tekst: `Ticket ${nr}${m.zij ? ", extra missie" : ""}` }),
      el("h2", { id: "ticket-titel", tekst: m.titel })),
    el("dl", { klasse: "velden" },
      el("div", {}, el("dt", { tekst: "Van" }), el("dd", { tekst: persoon.naam })),
      el("div", {}, el("dt", { tekst: "Week" }), el("dd", { tekst: String(m.week) })),
      el("div", {}, el("dt", { tekst: "Fase" }), el("dd", { tekst: fasenaam(m.fase) })),
      el("div", {}, el("dt", { tekst: m.soort === "lab" ? "Server" : "Afvinken" }), el("dd", { tekst: m.soort === "lab" ? server || "Kies een spoor" : "Je docent" }))),
    el("div", { klasse: "bericht" }, portret(m.van), el("div", {},
      el("p", { klasse: "wie", tekst: `${persoon.naam}, ${persoon.rol}` }),
      el("p", {}, rijk(m.bericht)))),
  ];

  if (!spoor && m.soort === "lab") {
    delen.push(el("p", { klasse: "tip" }, "Kies eerst je spoor. Dan zie je de stappen voor jouw server. ",
      el("button", { type: "button", klasse: "knop knop-klein", tekst: "Spoor kiezen", onclick: () => { d.close(); toonSpoorkeuze(); } })));
  } else {
    const stappen = m.stappen[spoor] || m.stappen.alle || [];
    delen.push(el("h3", { tekst: "Wat je doet" }), el("ol", {}, stappen.map((st) => el("li", {}, rijk(st)))));
    const tip = m.tip?.[spoor];
    if (tip) delen.push(el("p", { klasse: "tip" }, el("strong", { tekst: "Tip: " }), rijk(tip)));
  }

  if (m.status === "klaar") {
    delen.push(el("p", { klasse: "stempel", tekst: "Afgeleverd" }),
      el("p", {}, `${persoon.naam.split(" ")[0]}: ${m.klaar}`),
      el("p", { klasse: "klein", tekst: `Afgeleverd op ${datum(m.klaar_op)}.` }));
  } else if (m.soort === "docent") {
    delen.push(el("div", { klasse: "docent-blok" },
      el("p", { tekst: "Voor deze missie heb je geen code nodig. Klaar? Laat je werk aan je docent zien. Je docent vinkt de missie af, en dan zie je hem hier als afgeleverd." })));
  } else if (spoor) {
    const instructie = s.codeinstructie[spoor].map((r) => el("li", {}, rijk(r, { SERVER: server, MISSIE: m.id })));
    const invoer = el("input", { id: "code", name: "code", autocomplete: "off", spellcheck: "false", maxlength: "9", placeholder: "0000-0000", "aria-describedby": "code-melding" });
    const melding = el("p", { klasse: "melding", id: "code-melding", role: "status" });
    const knop = el("button", { type: "submit", klasse: "knop knop-hoofd", tekst: "Code controleren" });
    invoer.addEventListener("input", () => {
      const schoon = invoer.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 8);
      invoer.value = schoon.length > 4 ? `${schoon.slice(0, 4)}-${schoon.slice(4)}` : schoon;
    });
    const formulier = el("form", { klasse: "code-invoer", onsubmit: async (ev) => {
      ev.preventDefault();
      knop.disabled = true;
      melding.className = "melding";
      melding.textContent = "Even controleren...";
      try {
        const vorig = spel.status;
        const nieuw = await api("/api/code", { missie: m.id, code: invoer.value });
        zetStatus(nieuw, vorig);
        toast(`Missie afgeleverd: ${m.titel}`, "goed");
        toonTicket(m.id);
      } catch (f) {
        if (f.status === 401) return toonAanmelden();
        melding.className = "melding fout";
        melding.textContent = f.message;
        knop.disabled = false;
        invoer.focus();
      }
    } }, el("label", { for: "code", tekst: "Je code uit het checkscript" }), invoer, knop);
    delen.push(el("section", { klasse: "code-blok", "aria-labelledby": "code-kop" },
      el("h3", { id: "code-kop", tekst: "Zo haal je je code" }),
      el("ol", {}, instructie), formulier, melding));
  }

  $("#ticket-inhoud").replaceChildren(...delen);
  openDialoog(d);
  d.querySelector("#code")?.focus();
}

// --- dialogen: planbord ---------------------------------------------------------

const STATUSTEKST = { dicht: "Nog dicht", open: "Open", klaar: "Afgeleverd" };

function toonPlanbord() {
  if (!spel.status) return toast("Meld je eerst aan.");
  const d = $("#planbord");
  const s = spel.status;
  const strip = (m) => el("li", { klasse: `strip fase-${m.fase} ${m.status}` },
    el("span", { klasse: "week", tekst: `wk ${m.week}` }),
    el("span", { klasse: "wat" },
      el("strong", { tekst: m.titel }),
      el("span", { tekst: `${s.personages[m.van].naam.split(" ")[0]}, ${fasenaam(m.fase).toLowerCase()}${m.soort === "docent" ? ", je docent vinkt af" : ""}` })),
    el("span", { klasse: `status ${m.status}`, tekst: STATUSTEKST[m.status] }),
    el("button", { type: "button", klasse: "knop knop-klein", disabled: m.status === "dicht", tekst: m.status === "open" && ongelezen(m).length ? "Eerst theorie" : "Ticket openen", "aria-label": `Ticket openen: ${m.titel}`, onclick: () => { d.close(); toonTicket(m.id); } }));
  const hoofd = missies().filter((m) => !m.zij);
  const extra = missies().filter((m) => m.zij);
  const spoor = s.student.spoor;
  vervang($("#planbord-inhoud"),
    sluitknop(d),
    el("h2", { id: "planbord-titel", tekst: "Planbord" }),
    el("p", { klasse: "bord-intro", tekst: `${voortgangTekst()}. De missies gaan in deze volgorde open.` }),
    el("ul", { klasse: "strips" }, hoofd.map(strip)),
    extra.length ? [el("h3", { tekst: "Extra missies" }), el("p", { klasse: "bord-intro", tekst: "Voor wie sneller gaat. Je hebt ze niet nodig voor een voldoende." }), el("ul", { klasse: "strips" }, extra.map(strip))] : null,
    el("h3", { tekst: "Vakmanschap" }),
    el("p", { klasse: "bord-intro", tekst: "Deze stickers krijg je van je docent als je het laat zien." }),
    el("ul", { klasse: "stickers" }, s.badges.map((b) => el("li", { klasse: `sticker ${b.behaald ? "behaald" : ""}` },
      el("strong", { tekst: b.naam }), b.uitleg, b.behaald ? el("span", { klasse: "klein" }, " Behaald.") : null))),
    el("div", { klasse: "spoor-regel" },
      el("p", {}, spoor ? `Je spoor: ${s.sporen[spoor].naam}. ${s.sporen[spoor].uitleg}.` : "Je hebt nog geen spoor gekozen."),
      el("button", { type: "button", klasse: "knop knop-klein", tekst: spoor ? "Ander spoor kiezen" : "Spoor kiezen", onclick: () => { d.close(); toonSpoorkeuze(); } })),
  );
  openDialoog(d);
}

function voortgangTekst() {
  const hoofd = missies().filter((m) => !m.zij);
  const klaar = hoofd.filter((m) => m.status === "klaar").length;
  return `${klaar} van de ${hoofd.length} missies afgeleverd`;
}

// --- dialogen: spoor ------------------------------------------------------------

function toonSpoorkeuze() {
  const d = $("#spoorkeuze");
  const s = spel.status;
  const kies = async (spoor) => {
    try {
      zetStatus(await api("/api/spoor", { spoor }));
      d.close();
      toast(`Je spoor is ${s.sporen[spoor].naam}. Succes!`, "goed");
    } catch (f) {
      if (f.status === 401) return toonAanmelden();
      toast(f.message);
    }
  };
  $("#spoor-inhoud").replaceChildren(
    sluitknop(d),
    el("header", { klasse: "label-kop" }, streepjescode("spoor"), el("p", { klasse: "label-nr", tekst: "Keuze" }), el("h2", { id: "spoor-titel", tekst: "Kies je spoor" })),
    el("p", { tekst: "Je kiest een platform. Beide sporen hebben dezelfde missies en dezelfde rubric. Je kunt later nog wisselen; je voortgang blijft staan." }),
    el("div", { klasse: "code-invoer" }, Object.entries(s.sporen).map(([id, sp]) =>
      el("button", { type: "button", klasse: `knop ${s.student.spoor === id ? "knop-hoofd" : ""}`, onclick: () => kies(id) }, `${sp.naam}: ${sp.uitleg}`))),
    el("p", { klasse: "tip", tekst: "Doe je niveau 3? Kies dan Linux. Een playbook lees je makkelijk." }),
  );
  openDialoog(d);
}

// --- dialogen: handboek ---------------------------------------------------------

function blok(b) {
  return el("section", {},
    el("h3", { tekst: b.kop }),
    (b.alineas || []).map((a) => el("p", {}, rijk(a))),
    b.lijst ? el("ul", {}, b.lijst.map((l) => el("li", {}, rijk(l)))) : null,
    b.tabel ? tabel(b.tabel.koppen, b.tabel.rijen) : null);
}

function tabel(koppen, rijen, rijkop = false) {
  return el("div", { klasse: "tabel-wrap" }, el("table", {},
    el("thead", {}, el("tr", {}, koppen.map((k) => el("th", { scope: "col", tekst: k })))),
    el("tbody", {}, rijen.map((r) => el("tr", {}, r.map((c, i) => (rijkop && i === 0 ? el("th", { scope: "row", tekst: c }) : el("td", { tekst: c }))))))));
}

function paneelOver(h) {
  return [
    el("p", { tekst: h.intro }),
    el("div", { klasse: "blokken" }, h.blokken.map(blok)),
    el("h3", { tekst: h.planning.kop }),
    tabel(h.planning.koppen, h.planning.rijen),
  ];
}

function paneelTheorie(h) {
  const fases = Object.keys(FASENAMEN).filter((f) => h.kaarten.some((k) => k.fase === f));
  return [
    el("p", { tekst: h.intro }),
    fases.map((f) => [
      el("h3", { klasse: `fase-kop fase-${f}`, id: `theorie-${f}`, tekst: fasenaam(f) }),
      el("div", { klasse: "kaarten" }, h.kaarten.filter((k) => k.fase === f).map((k) => kaartElement(k))),
    ]),
  ];
}

// Een theoriekaart. Aangemelde studenten zien een knop om de kaart als gelezen te markeren.
function kaartElement(k, naGelezen) {
  const al = gelezen().has(k.id);
  const knop = spel.status ? el("button", {
    type: "button", klasse: `knop knop-klein ${al ? "" : "knop-hoofd"}`, disabled: al,
    tekst: al ? "Gelezen" : "Ik heb dit gelezen",
    onclick: async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        await markeerGelezen(k.id);
        b.textContent = "Gelezen";
        b.classList.remove("knop-hoofd");
        b.closest(".kaart").classList.add("gelezen");
        naGelezen?.();
      } catch (f) {
        if (f.status === 401) return toonAanmelden();
        b.disabled = false;
        toast(f.message);
      }
    },
  }) : null;
  return el("article", { klasse: `kaart ${al ? "gelezen" : ""}` },
    el("h4", { tekst: k.titel }),
    k.alineas.map((a) => el("p", {}, rijk(a))),
    k.lijst ? el("ul", {}, k.lijst.map((l) => el("li", {}, rijk(l)))) : null,
    (k.voorbeelden || []).map((v) => [el("p", { klasse: "voorbeeld-label", tekst: v.label }), el("pre", {}, el("code", { tekst: v.code }))]),
    (k.links || []).map((l) => el("p", {}, el("a", { href: l.url, target: "_blank", rel: "noopener", tekst: l.tekst }))),
    knop);
}

async function markeerGelezen(id) {
  zetStatus(await api("/api/gelezen", { kaart: id }));
}

// Voor een open missie met ongelezen theorie: eerst lezen, dan pas het ticket.
function toonLeesEerst(m) {
  if (!spel.handboek) return toast("De theorie laadt nog. Probeer het zo opnieuw.");
  const d = $("#ticket");
  const persoon = spel.status.personages[m.van];
  const kaarten = (m.theorie || []).map((id) => spel.handboek.theorie.kaarten.find((k) => k.id === id)).filter(Boolean);
  const melding = el("p", { klasse: "melding", role: "status" });
  const verder = el("button", { type: "button", klasse: "knop knop-hoofd", tekst: "Ticket openen", onclick: () => toonTicket(m.id) });
  const bij = () => {
    const n = ongelezen(m).length;
    verder.disabled = n > 0;
    melding.textContent = n ? `Nog ${n} ${n === 1 ? "kaart" : "kaarten"} te lezen.` : "Alles gelezen. Je kunt het ticket openen.";
  };
  vervang($("#ticket-inhoud"),
    sluitknop(d),
    el("header", { klasse: "label-kop" },
      streepjescode(`theorie${m.id}`),
      el("p", { klasse: "label-nr", tekst: `Ticket ${m.id.toUpperCase()}, eerst de theorie` }),
      el("h2", { id: "ticket-titel", tekst: m.titel })),
    el("div", { klasse: "bericht" }, portret(m.van), el("div", {},
      el("p", { klasse: "wie", tekst: `${persoon.naam}, ${persoon.rol}` }),
      el("p", { tekst: "Ik heb een ticket voor je. Lees eerst de theorie die erbij hoort. Klaar met een kaart? Klik op 'Ik heb dit gelezen'. Daarna opent het ticket." }))),
    el("div", { klasse: "kaarten lees" }, kaarten.map((k) => kaartElement(k, bij))),
    el("div", { klasse: "lees-verder" }, melding, verder));
  bij();
  openDialoog(d);
  d.scrollTop = 0;
}

function paneelBeoordeling(h) {
  const r = h.rubric;
  return [
    el("p", { tekst: h.intro }),
    el("ul", {}, h.norm.map((n) => el("li", { tekst: n }))),
    el("h3", { tekst: h.eindproduct.kop }),
    el("ul", {}, h.eindproduct.lijst.map((l) => el("li", { tekst: l }))),
    el("h3", { tekst: r.kop }),
    el("div", { klasse: "tabel-wrap" }, el("table", { klasse: "rubric" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", tekst: "Criterium" }), r.niveaus.map((n) => el("th", { scope: "col", tekst: n })))),
      el("tbody", {}, r.criteria.map((c) => el("tr", {},
        el("th", { scope: "row", tekst: c.naam }),
        c.levels.map((l, i) => el("td", { klasse: i === 1 ? "voldoende" : "", tekst: l }))))))),
  ];
}

function toonHandboek(tab = "over", fase = null) {
  const d = $("#handboek");
  const h = spel.handboek;
  if (!h) return toast("Het handboek laadt nog. Probeer het zo opnieuw.");
  const tabs = [["over", h.over.titel], ["theorie", h.theorie.titel], ["beoordeling", h.beoordeling.titel]];
  const paneel = el("div", { klasse: "tabpaneel", role: "tabpanel", id: "handboek-paneel", tabindex: "0" });
  const knoppen = tabs.map(([id, naam]) => el("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "handboek-paneel", tekst: naam, onclick: () => kies(id) }));
  function kies(id, focusFase) {
    knoppen.forEach((k, i) => {
      const actief = tabs[i][0] === id;
      k.setAttribute("aria-selected", String(actief));
      k.tabIndex = actief ? 0 : -1;
    });
    paneel.setAttribute("aria-labelledby", `tab-${id}`);
    vervang(paneel, id === "over" ? paneelOver(h.over) : id === "theorie" ? paneelTheorie(h.theorie) : paneelBeoordeling(h.beoordeling));
    if (focusFase) requestAnimationFrame(() => d.querySelector(`#theorie-${focusFase}`)?.scrollIntoView({ block: "start" }));
    else paneel.scrollTop = 0;
  }
  const lijst = el("div", { klasse: "tabs", role: "tablist", "aria-label": "Onderdelen van het handboek" }, knoppen);
  lijst.addEventListener("keydown", (ev) => {
    const i = knoppen.indexOf(document.activeElement);
    if (i < 0 || !["ArrowLeft", "ArrowRight"].includes(ev.key)) return;
    const j = (i + (ev.key === "ArrowRight" ? 1 : knoppen.length - 1)) % knoppen.length;
    knoppen[j].focus();
    kies(tabs[j][0]);
  });
  $("#handboek-inhoud").replaceChildren(
    sluitknop(d),
    el("h2", { id: "handboek-titel", tekst: "Handboek" }),
    el("p", { klasse: "klein", tekst: spel.status ? spel.status.cursus : "Processen automatiseren (P2-K1-W2)" }),
    lijst, paneel);
  openDialoog(d);
  kies(tab, fase);
}

// --- aanmelden en status --------------------------------------------------------

function zetStatus(nieuw, vorig = spel.status) {
  const wasOpen = new Set((vorig?.missies || []).filter((m) => m.status !== "dicht").map((m) => m.id));
  const ruimtesVoor = vorig ? ["vergaderzaal", "serverruimte"].filter(ruimteOpen) : [];
  spel.status = nieuw;
  if (vorig) {
    for (const m of nieuw.missies) {
      if (m.status === "open" && !wasOpen.has(m.id)) toast(`Nieuw ticket van ${nieuw.personages[m.van].naam.split(" ")[0]}: ${m.titel}`, "nieuw");
    }
    for (const r of ["vergaderzaal", "serverruimte"]) if (ruimteOpen(r) && !ruimtesVoor.includes(r)) toast(`${RUIMTES[r].naam} is open.`, "nieuw");
  }
  bouwAlleRuimtes();
  $("#labsleutel").textContent = nieuw.student.labsleutel;
  $("#voortgang").textContent = voortgangTekst();
  $("#voet").hidden = false;
  $("#knop-planbord").hidden = false;
  $("#knop-afmelden").hidden = false;
  $("#aanmelden").hidden = true;
}

function toonAanmelden() {
  spel.status = null;
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("#voet").hidden = true;
  $("#knop-planbord").hidden = true;
  $("#knop-afmelden").hidden = true;
  $("#aanmelden").hidden = false;
  bouwAlleRuimtes();
  $("#klascode").focus();
}

function toonRuimtenaam() {
  $("#ruimte-naam").textContent = spel.status ? RUIMTES[spel.ruimte].naam : "";
}

async function start(status) {
  zetStatus(status, null);
  spel.ruimte = "werkplek";
  spel.speler = { ...spel.speler, x: RUIMTES.werkplek.start[0], y: RUIMTES.werkplek.start[1], richting: "omhoog", van: null };
  toonRuimtenaam();
  if (!status.student.spoor) {
    toast("Welkom bij Larixa! Kies eerst je spoor.", "nieuw");
    toonSpoorkeuze();
  } else {
    const open = openMissies();
    if (open.length) {
      const wie = open[0].van;
      toast(`${status.personages[wie].naam.split(" ")[0]} heeft een ticket voor je. Loop naar ${wie === "ruben" ? "hem" : "haar"} toe, of open het planbord.`, "nieuw");
    }
  }
}

async function ververs() {
  if (!spel.status || document.hidden) return;
  try {
    zetStatus(await api("/api/status"));
  } catch (f) {
    if (f.status === 401) toonAanmelden();
  }
}

function tekenMerk() {
  const rijen = [
    ".......y........", "......yGy.......", ".....yGGGy......", "......GGG.......",
    ".....GGGGG......", "....yGGgGGy.....", ".....GGGGG......", "....GGGgGGG.....",
    "...yGGGGGGGy....", "....GGgGGGG.....", "...GGGGGgGGG....", "..yGGGGGGGGGy...",
    "......bb........", "......bb........", "....yyyyyy......", "................",
  ];
  const c = $(".merk-icoon");
  c.getContext("2d").drawImage(plaatje(rijen, "merk"), 0, 0);
}

function koppelInvoer() {
  addEventListener("keydown", (ev) => {
    if (dialoogOpen() || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const r = RICHTINGEN[ev.code];
    if (r) {
      ev.preventDefault();
      if (!spel.toetsen.includes(r)) spel.toetsen.push(r);
      spel.pad = [];
    } else if (["KeyE", "Space", "Enter"].includes(ev.code) && spel.status && !ev.repeat) {
      const focus = document.activeElement;
      if (focus?.matches("input, textarea, select")) return;
      if (ev.code !== "KeyE" && focus?.matches("button, a")) return;
      ev.preventDefault();
      gebruik();
    }
  });
  addEventListener("keyup", (ev) => {
    const r = RICHTINGEN[ev.code];
    if (r) spel.toetsen = spel.toetsen.filter((t) => t !== r);
  });
  addEventListener("blur", () => { spel.toetsen = []; });
  doek.addEventListener("click", (ev) => spel.status && klik(ev));
  $("#knop-planbord").addEventListener("click", toonPlanbord);
  $("#knop-handboek").addEventListener("click", () => toonHandboek());
  $("#info-zonder-login").addEventListener("click", () => toonHandboek());
  $("#knop-afmelden").addEventListener("click", async () => {
    try { await api("/api/afmelden", {}); } catch { /* toch afmelden */ }
    toonAanmelden();
  });
  $("#kopieer-sleutel").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(spel.status.student.labsleutel);
      toast("Labsleutel gekopieerd.");
    } catch {
      toast("Kopiëren lukt niet. Selecteer de sleutel en kopieer hem zelf.");
    }
  });
  $("#aanmeldformulier").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const melding = $("#aanmeld-melding");
    melding.className = "melding";
    melding.textContent = "";
    try {
      await start(await api("/api/aanmelden", { klascode: $("#klascode").value, studentnummer: $("#studentnummer").value }));
    } catch (f) {
      melding.className = "melding fout";
      melding.textContent = f.message;
    }
  });
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("close", () => { spel.toetsen = []; doek.focus?.(); }));
  addEventListener("resize", schaal);
  document.addEventListener("visibilitychange", ververs);
  setInterval(ververs, 60000);
}

async function init() {
  bouwSprites();
  bouwAlleRuimtes();
  tekenMerk();
  doek.tabIndex = 0;
  koppelInvoer();
  schaal();
  requestAnimationFrame(lus);
  fetch("/data/handboek.json").then((a) => a.json()).then((h) => { spel.handboek = h; }).catch(() => {});
  try {
    await start(await api("/api/status"));
  } catch {
    toonAanmelden();
  }
}

init();
