// De drie ruimtes van Larixa Logistiek. Elke ruimte is 20 bij 12 tegels.
//
//  = muur boven      | zijmuur     _ onderkant      - muur      w raam
//  P planbord (2)    B whiteboard (2)   O poster automatiseren   Q poster verbeteren
//  . vloer   c stoel   d bureau   D bureau met pc   Y jouw bureau
//  p plant   k koffie  H kast met het handboek   t tafel   r serverkast
//  > deur naar rechts  < deur naar links

export const BREED = 20;
export const HOOG = 12;

export const RUIMTES = {
  werkplek: {
    naam: "De werkplek",
    vloer: "tapijt",
    rechts: "vergaderzaal",
    start: [6, 9],
    kaart: [
      "====================",
      "|-ww--PP----ww--ww-|",
      "|k........p......H.|",
      "|..Yd...Dd...Dd....|",
      "|..c....c....c.....|",
      "|..................|",
      "|..................>",
      "|..Dd...Dd.........|",
      "|..c....c..........|",
      "|..................|",
      "|p................p|",
      "____________________",
    ],
  },
  vergaderzaal: {
    naam: "De vergaderzaal",
    vloer: "hout",
    links: "werkplek",
    rechts: "serverruimte",
    start: [1, 6],
    kaart: [
      "====================",
      "|-BB----ww--ww-----|",
      "|p.................|",
      "|......cccccc......|",
      "|.....tttttttt.....|",
      "|.....tttttttt.....|",
      "<.....tttttttt.....>",
      "|......cccccc......|",
      "|..................|",
      "|..................|",
      "|p................p|",
      "____________________",
    ],
  },
  serverruimte: {
    naam: "De serverruimte",
    vloer: "tegels",
    links: "vergaderzaal",
    start: [1, 6],
    kaart: [
      "====================",
      "|-O-------------Q--|",
      "|..................|",
      "|...rrrrr..rrrrr...|",
      "|...rrrrr..rrrrr...|",
      "|..................|",
      "<..................|",
      "|...rrrrr..rrrrr...|",
      "|...rrrrr..rrrrr...|",
      "|..................|",
      "|..................|",
      "____________________",
    ],
  },
};

export const VOLGORDE = ["werkplek", "vergaderzaal", "serverruimte"];

// Waar een personage staat, per ruimte. Een personage staat in de ruimte van
// zijn eerstvolgende open missie, en anders in zijn eigen ruimte.
export const PLEKKEN = {
  samira: { thuis: "werkplek", werkplek: [13, 4], vergaderzaal: [5, 8], serverruimte: [9, 5] },
  noor: { thuis: "vergaderzaal", vergaderzaal: [15, 5], serverruimte: [16, 9], werkplek: [16, 8] },
  ruben: { thuis: "werkplek", werkplek: [8, 4], serverruimte: [10, 6], vergaderzaal: [14, 8] },
};

const VAST = new Set("=|_-wPBOQdDYpkHtr".split(""));

export function tegel(ruimte, x, y) {
  const rij = RUIMTES[ruimte].kaart[y];
  return rij ? rij[x] || "|" : "_";
}

export function isVast(ruimte, x, y, deurOpen) {
  const t = tegel(ruimte, x, y);
  if (t === ">" || t === "<") return !deurOpen(t === ">" ? RUIMTES[ruimte].rechts : RUIMTES[ruimte].links);
  return VAST.has(t);
}

// Wat er gebeurt als je iets in het kantoor gebruikt.
export function voorwerp(t) {
  return {
    P: { soort: "planbord", hint: "het planbord bekijken" },
    H: { soort: "handboek", tab: "over", hint: "het handboek lezen" },
    B: { soort: "handboek", tab: "theorie", fase: "analyseren", hint: "het whiteboard lezen" },
    O: { soort: "handboek", tab: "theorie", fase: "automatiseren", hint: "de poster lezen" },
    Q: { soort: "handboek", tab: "theorie", fase: "verbeteren", hint: "de poster lezen" },
    Y: { soort: "bureau", hint: "aan je bureau gaan zitten" },
    k: { soort: "koffie", hint: "koffie halen" },
    D: { soort: "pc", hint: "naar het scherm kijken" },
  }[t];
}
