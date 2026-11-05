// Pixel art voor het kantoor van Larixa Logistiek: alles eigen werk, getekend als tekst.
// Elk teken staat voor een kleur uit PALET; een punt is doorzichtig.

export const T = 16; // tegelgrootte in pixels

export const PALET = {
  k: "#1d2338", n: "#2c3a5e", N: "#3d4f7a",
  g: "#2f5d46", G: "#4f8a5b", L: "#86b86f",
  y: "#e3a72f", Y: "#f5d26b",
  w: "#f6f6f1", s: "#c9ced8", S: "#8b93a6", d: "#555c70",
  b: "#6e4429", B: "#a26b3c", W: "#c99a62",
  r: "#c8463d", R: "#ea8a7c", o: "#ef7d2d",
  u: "#3f6fb5", U: "#86b5e6",
  c: "#4a5677", C: "#55628a",
  m: "#8be0c7", M: "#2f8f78",
  f: "#a3abbd", F: "#bcc3d2",
  x: "#3a3f52", X: "#262a38",
  e: "#d5dbe6", E: "#aeb6c7",
  v: "#9fd3f0", V: "#dff2fb",
  p: "#f2c9a1", P: "#c98d62", q: "#8a5638",
  h: "#2a1d1a", H: "#6b4226", A: "#b5792e",
};

// --- personages -------------------------------------------------------------
// Sjabloon: O omtrek, A haar, K huid, E oog, J shirt, I accent, D broek, Z schoen.

const VOOR = [
  "................",
  ".....OOOOOO.....",
  "....OAAAAAAO....",
  "...OAAAAAAAAO...",
  "...OAAAAAAAAO...",
  "...OAKKKKKKAO...",
  "...OKKEKKEKKO...",
  "...OKKKKKKKKO...",
  "....OKKKKKKO....",
  "...OJJJKKJJJO...",
  "..OJJJJJJJJJJO..",
  "..OKJJIJJIJJKO..",
  "..OKOJJJJJJOKO..",
  "....ODDDDDDO....",
  "....ODDOODDO....",
  "....OZZOOZZO....",
];

const ACHTER = [
  "................",
  ".....OOOOOO.....",
  "....OAAAAAAO....",
  "...OAAAAAAAAO...",
  "...OAAAAAAAAO...",
  "...OAAAAAAAAO...",
  "...OAAAAAAAAO...",
  "...OAAAAAAAAO...",
  "....OKKKKKKO....",
  "...OJJJJJJJJO...",
  "..OJJJJJJJJJJO..",
  "..OKJJJJJJJJKO..",
  "..OKOJJJJJJOKO..",
  "....ODDDDDDO....",
  "....ODDOODDO....",
  "....OZZOOZZO....",
];

const ZIJ = [
  "................",
  ".....OOOOOO.....",
  "....OAAAAAAO....",
  "...OAAAAAAAAO...",
  "...OAAAAAAAAO...",
  "...OKKKKAAAAO...",
  "...OKEKKKAAAO...",
  "...OKKKKKKAAO...",
  "....OKKKKKKO....",
  "....OJJJJJJO....",
  "...OJJJJJJJJO...",
  "...OJKKJJJJJO...",
  "...OJOKJJJJJO...",
  "....ODDDDDDO....",
  "....ODDOODDO....",
  "....OZZOOZZO....",
];

// Kapsels: vervangen de bovenste rijen van een sjabloon.
const KAPSELS = {
  kort: {},
  knot: {
    0: ".......OO.......",
    1: "......OAAO......",
    2: "....OOAAAAOO....",
  },
  lang: {
    5: "...OAKKKKKKAO...",
    6: "..OAKKEKKEKKAO..",
    7: "..OAKKKKKKKKAO..",
    8: "..OAOKKKKKKOAO..",
    9: "..OAJJJKKJJJAO..",
  },
  krul: {
    1: "....O.OO.OO.....",
    2: "...OAOAAOAAOO...",
    3: "..OAAAAAAAAAAO..",
    4: "..OAAAAAAAAAAO..",
  },
};

function stapLos(rijen) {
  // Loopframe: lichaam een pixel omhoog, benen uit elkaar.
  const r = rijen.slice(1, 14);
  r.push("....ODDOODDO....", "...ODDO..ODDO...", "...OZZO..OZZO...");
  return r;
}

function pasKapselToe(rijen, kapsel, achter) {
  const aanpassing = KAPSELS[kapsel] || {};
  return rijen.map((rij, i) => {
    let nieuw = aanpassing[i];
    if (!nieuw) return rij;
    if (achter) nieuw = nieuw.replace(/[KE]/g, "A");
    return nieuw;
  });
}

function kleur(rijen, kleuren) {
  const kaart = { O: "k", E: "k", ...kleuren };
  return rijen.map((rij) => rij.replace(/[OAKEJIDZ]/g, (t) => kaart[t] || t));
}

export const PERSONAGES = {
  speler: { kapsel: "kort", kleuren: { A: "H", K: "p", J: "u", I: "U", D: "n", Z: "k" } },
  samira: { kapsel: "knot", kleuren: { A: "h", K: "P", J: "g", I: "w", D: "k", Z: "k" } },
  noor: { kapsel: "lang", kleuren: { A: "A", K: "p", J: "y", I: "Y", D: "u", Z: "b" } },
  ruben: { kapsel: "krul", kleuren: { A: "h", K: "q", J: "o", I: "Y", D: "n", Z: "k" } },
};

export function personageFrames(naam) {
  const p = PERSONAGES[naam];
  const voor = kleur(pasKapselToe(VOOR, p.kapsel, false), p.kleuren);
  const achter = kleur(pasKapselToe(ACHTER, p.kapsel, true), p.kleuren);
  const zij = kleur(pasKapselToe(ZIJ, p.kapsel === "lang" ? "kort" : p.kapsel, false), p.kleuren);
  return {
    omlaag: [voor, stapLos(voor)],
    omhoog: [achter, stapLos(achter)],
    links: [zij, stapLos(zij)],
  };
}

// --- tegels -----------------------------------------------------------------

export const TEGELS = {
  muurTop: [
    "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn", "nNnnnnnnnNnnnnnn", "nnnnnnnnnnnnnnnn",
    "nnnnnnnnnnnnnnnn", "nnnnnNnnnnnnnnNn", "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn",
    "nnnnnnnnnnnnnnnn", "nnNnnnnnnnnnNnnn", "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn",
    "nnnnnnnnnnnnnnnn", "NNNNNNNNNNNNNNNN", "kkkkkkkkkkkkkkkk", "kkkkkkkkkkkkkkkk",
  ],
  muur: [
    "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee",
    "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee",
    "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee", "eeeeeeeeeeeeeeee",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  raam: [
    "eeeeeeeeeeeeeeee", "eSSSSSSSSSSSSSSe", "eSVVvvvSSVVvvvSe", "eSVvvvvSSVvvvvSe",
    "eSvvvvvSSvvvvvSe", "eSvvvvvSSvvvvvSe", "eSSSSSSSSSSSSSSe", "eSvvvvvSSvvvvvSe",
    "eSvvvvVSSvvvvVSe", "eSvvvVVSSvvvVVSe", "eSSSSSSSSSSSSSSe", "esssssssssssssse",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  planbordL: [
    "eeeeeeeeeeeeeeee", "ebbbbbbbbbbbbbbb", "ebWWWWWWWWWWWWWW", "ebWyyyWWRRRWWUUU",
    "ebWyyyWWRRRWWUUU", "ebWWWWWWWWWWWWWW", "ebWkkkkkkkkkkkkk", "ebWWWWWWWWWWWWWW",
    "ebWLLLWWyyyWWWWW", "ebWLLLWWyyyWWRRR", "ebWWWWWWWWWWWRRR", "ebbbbbbbbbbbbbbb",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  planbordR: [
    "eeeeeeeeeeeeeeee", "bbbbbbbbbbbbbbbe", "WWWWWWWWWWWWWWbe", "WWyyyWWLLLWWWWbe",
    "WWyyyWWLLLWWWWbe", "WWWWWWWWWWWWWWbe", "kkkkkkkkkkkkkWbe", "WWWWWWWWWWWWWWbe",
    "WUUUWWWWWWWWWWbe", "WUUUWWRRRWWWWWbe", "WWWWWWRRRWWWWWbe", "bbbbbbbbbbbbbbbe",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  whiteboardL: [
    "eeeeeeeeeeeeeeee", "eSSSSSSSSSSSSSSS", "eSwwwwwwwwwwwwww", "eSwuuuwwwwwwwwww",
    "eSwuwuwwwkkwwwww", "eSwuuuwwkkwwrrww", "eSwwwwwwwwwwrwrw", "eSwwwwwwwwwwrrrw",
    "eSwwkkkkkkwwwwww", "eSwwwwwwwwwwwwww", "eSwwwwwwwwwwwwww", "eSSSSSSSSSSSSSSS",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  whiteboardR: [
    "eeeeeeeeeeeeeeee", "SSSSSSSSSSSSSSSe", "wwwwwwwwwwwwwwSe", "wwwwwwwwGGGwwwSe",
    "wwwkkwwwGwGwwwSe", "wwkkwwwwGGGwwwSe", "wwwwwwwwwwwwwwSe", "wkkkkkkwwwwwwwSe",
    "wwwwwwwwwwwwwwSe", "wwwwwwwwwwrrwwSe", "wwwwwwwwwwwwwwSe", "SSSSSSSSSSSSSSSe",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  poster: [
    "eeeeeeeeeeeeeeee", "eeekkkkkkkkkkeee", "eeekyyyyyyyykeee", "eeekyGGyyGGykeee",
    "eeekyGGyyGGykeee", "eeekyyyyyyyykeee", "eeekykkkkkkykeee", "eeekyyyyyyyykeee",
    "eeekykkkkyyykeee", "eeekyyyyyyyykeee", "eeekkkkkkkkkkeee", "eeeeeeeeeeeeeeee",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  poster2: [
    "eeeeeeeeeeeeeeee", "eeekkkkkkkkkkeee", "eeekUUUUUUUUkeee", "eeekUuuUUuuUkeee",
    "eeekUuUUUUuUkeee", "eeekUuuUUuuUkeee", "eeekUUUUUUUUkeee", "eeekUkkkkkkUkeee",
    "eeekUUUUUUUUkeee", "eeekUkkkUUUUkeee", "eeekkkkkkkkkkeee", "eeeeeeeeeeeeeeee",
    "EEEEEEEEEEEEEEEE", "gggggggggggggggg", "gGgGgGgGgGgGgGgG", "kkkkkkkkkkkkkkkk",
  ],
  bureau: [
    "................", "................", "................", "................",
    "kkkkkkkkkkkkkkkk", "kWWWWWWWWWWWWWWk", "kWWWWWsssssWWWWk", "kWWWWWsSSSsWWWWk",
    "kWWWWWsssssWWWWk", "kWWWWWWWWWWWWWWk", "kBBBBBBBBBBBBBBk", "kbbbbbbbbbbbbbbk",
    "kbk..........kbk", "kbk..........kbk", "kkk..........kkk", "................",
  ],
  bureauPc: [
    "....kkkkkkkk....", "....kMMMMMMk....", "....kMmmmmMk....", "....kMmMmmMk....",
    "kkkkkMMMMMMkkkkk", "kWWWWkkkkkkWWWWk", "kWWWWWWkkWWWWWWk", "kWWWdddddddddWWk",
    "kWWWdsdsdsdsdWWk", "kWWWWWWWWWWWWWWk", "kBBBBBBBBBBBBBBk", "kbbbbbbbbbbbbbbk",
    "kbk..........kbk", "kbk..........kbk", "kkk..........kkk", "................",
  ],
  stoel: [
    "................", "................", "................", "....kkkkkkkk....",
    "....kddddddk....", "....kdSSSSdk....", "....kdSSSSdk....", "....kddddddk....",
    "...kkkkkkkkkk...", "...kddddddddk...", "...kddddddddk...", "...kkkkkkkkkk...",
    "......kddk......", ".....kkddkk.....", "....kk....kk....", "................",
  ],
  plant: [
    "......G..G......", "...G..GLGG..G...", "....GGLLGLGG....", "..GGLGGLLGGLGG..",
    "...GLLGGGGLLG...", "..GGGLGgGLGGGG..", "...GgGGLGGgGG...", "....GGgGGgGG....",
    ".....gGGGGg.....", "....kkkkkkkk....", "....kBBBBBBk....", "....kBWBBBBk....",
    "....kBBBBBBk....", ".....kBBBBk.....", ".....kkkkkk.....", "................",
  ],
  koffie: [
    "...kkkkkkkkkk...", "...kSSSSSSSSk...", "...kSkkkkkkSk...", "...kSkmmmmkSk...",
    "...kSkkkkkkSk...", "...kSSSSSSSSk...", "...kSSrSSySSk...", "...kSSSSSSSSk...",
    "...kSkkkkkkSk...", "...kSk.ww.kSk...", "...kSk.ww.kSk...", "...kSkkkkkkSk...",
    "...kSSSSSSSSk...", "...kddddddddk...", "...kkkkkkkkkk...", "................",
  ],
  kast: [
    "kkkkkkkkkkkkkkkk", "kbbbbbbbbbbbbbbk", "kbruygyUrbgybubk", "kbruygyUrbgybubk",
    "kbruygyUrbgybubk", "kbbbbbbbbbbbbbbk", "kbgyubrgbuyrgbbk", "kbgyubrgbuyrgbbk",
    "kbgyubrgbuyrgbbk", "kbbbbbbbbbbbbbbk", "kbyubgrbyyugrbbk", "kbyubgrbyyugrbbk",
    "kbyubgrbyyugrbbk", "kbbbbbbbbbbbbbbk", "kkkkkkkkkkkkkkkk", ".k............k.",
  ],
  tafel: [
    "BBBBBBBBBBBBBBBB", "BWBBBBBBBBBBBBBB", "BBBBBBBBBBBWBBBB", "BBBBBBBBBBBBBBBB",
    "BBBBBWBBBBBBBBBB", "BBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBWBB", "BBBBBBBBBBBBBBBB",
    "BBWBBBBBBBBBBBBB", "BBBBBBBBBBBBBBBB", "BBBBBBBBWBBBBBBB", "BBBBBBBBBBBBBBBB",
    "BBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBBWB", "BBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBBBB",
  ],
  rackBoven: [
    "kkkkkkkkkkkkkkkk", "kxxxxxxxxxxxxxxk", "kxXXXXXXXXXXXXxk", "kxXmXyXXXXXXXXxk",
    "kxXXXXXXXXXXXXxk", "kxxxxxxxxxxxxxxk", "kxXXXXXXXXXXXXxk", "kxXmXmXXXdddXXxk",
    "kxXXXXXXXXXXXXxk", "kxxxxxxxxxxxxxxk", "kxXXXXXXXXXXXXxk", "kxXyXmXXXXXXXXxk",
    "kxXXXXXXXXXXXXxk", "kxxxxxxxxxxxxxxk", "kxXXXXXXXXXXXXxk", "kxXmXXXXXdddXXxk",
  ],
  rackOnder: [
    "kxXXXXXXXXXXXXxk", "kxxxxxxxxxxxxxxk", "kxXXXXXXXXXXXXxk", "kxXmXrXXXXXXXXxk",
    "kxXXXXXXXXXXXXxk", "kxxxxxxxxxxxxxxk", "kxXXXXXXXXXXXXxk", "kxXmXmXXXdddXXxk",
    "kxXXXXXXXXXXXXxk", "kxxxxxxxxxxxxxxk", "kxddddddddddddxk", "kxddddddddddddxk",
    "kxxxxxxxxxxxxxxk", "kkkkkkkkkkkkkkkk", "kk............kk", "................",
  ],
  zijmuur: [
    "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn", "nNnnnnnnnNnnnnnn", "nnnnnnnnnnnnnnnn",
    "nnnnnnnnnnnnnnnn", "nnnnnNnnnnnnnnNn", "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn",
    "nnnnnnnnnnnnnnnn", "nnNnnnnnnnnnNnnn", "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn",
    "nnnnnnnnnnnnnnnn", "nnnnnNnnnnnnnnnn", "nnnnnnnnnnnnnnnn", "nnnnnnnnnnnnnnnn",
  ],
  deurOpen: [
    "kkkkkkkkkkkkkkkk", "kyyyyyyyyyyyyyyk", "kyk..........kyk", "kyk..........kyk",
    "kyk..........kyk", "kyk..........kyk", "kyk..........kyk", "kyk..........kyk",
    "kyk..........kyk", "kyk..........kyk", "kyk..........kyk", "kyk..........kyk",
    "kyk..........kyk", "kyk..........kyk", "kyk..........kyk", "kyk..........kyk",
  ],
  deurDicht: [
    "kkkkkkkkkkkkkkkk", "kyyyyyyyyyyyyyyk", "kykSSSSSSSSSSkyk", "kykSssssssssSkyk",
    "kykSsSSSSSSsSkyk", "kykSsSssssSsSkyk", "kykSsSsrrsSsSkyk", "kykSsSrkkrSsSkyk",
    "kykSsSrrrrSsSkyk", "kykSsSrrrrSsSkyk", "kykSsSSSSSSsSkyk", "kykSssssssssSkyk",
    "kykSssssssssSkyk", "kykSssssssssSkyk", "kykSSSSSSSSSSkyk", "kykkkkkkkkkkkkyk",
  ],
  uitroep: [
    "....kkkkkk......", "...kYYYYYYk.....", "...kYYkkYYk.....", "...kYYkkYYk.....",
    "...kYYkkYYk.....", "...kYYYYYYk.....", "...kYYkkYYk.....", "...kYYYYYYk.....",
    "....kkYYkk......", "......kk........",
  ],
};

// Vloeren tekenen we met een eenvoudig patroon.
export function vloer(soort, x, y) {
  const rijen = [];
  for (let j = 0; j < T; j++) {
    let rij = "";
    for (let i = 0; i < T; i++) {
      if (soort === "tapijt") {
        rij += (i + j * 3 + x * 5 + y * 7) % 9 === 0 ? "C" : "c";
      } else if (soort === "hout") {
        const plank = Math.floor((j + (x % 2) * 8) / 4) % 4;
        rij += j % 4 === 3 ? "b" : plank === 1 && i === (x * 3 + j) % 16 ? "W" : "B";
      } else {
        rij += i === 0 || j === 0 ? "F" : i === 15 || j === 15 ? "S" : (i + j) % 11 === 0 ? "F" : "f";
      }
    }
    rijen.push(rij);
  }
  return rijen;
}

// --- tekenen ----------------------------------------------------------------

const cache = new Map();

export function plaatje(rijen, sleutel) {
  if (sleutel && cache.has(sleutel)) return cache.get(sleutel);
  const breed = Math.max(...rijen.map((r) => r.length));
  const doek = document.createElement("canvas");
  doek.width = breed;
  doek.height = rijen.length;
  const ctx = doek.getContext("2d");
  rijen.forEach((rij, y) => {
    for (let x = 0; x < rij.length; x++) {
      const kleurcode = PALET[rij[x]];
      if (!kleurcode) continue;
      ctx.fillStyle = kleurcode;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  if (sleutel) cache.set(sleutel, doek);
  return doek;
}

export function spiegel(bron) {
  const doek = document.createElement("canvas");
  doek.width = bron.width;
  doek.height = bron.height;
  const ctx = doek.getContext("2d");
  ctx.translate(bron.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(bron, 0, 0);
  return doek;
}

// Knipperende lampjes van de serverkasten: wissel twee kleuren om.
export function knipper(rijen) {
  return rijen.map((r) => r.replace(/[my]/g, (t) => (t === "m" ? "y" : "m")));
}
