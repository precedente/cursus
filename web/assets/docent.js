// Docentoverzicht: voortgang per klas, missies afvinken en stickers geven.

const $ = (s) => document.querySelector(s);
const gegevens = { overzicht: null, klas: null };

async function api(pad, body) {
  const opties = { credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    opties.method = "POST";
    opties.headers["Content-Type"] = "application/json";
    opties.body = JSON.stringify(body);
  }
  const antwoord = await fetch(pad, opties);
  let data = {};
  try { data = await antwoord.json(); } catch { /* geen JSON */ }
  if (!antwoord.ok) throw Object.assign(new Error(data.fout || "Er ging iets mis."), { status: antwoord.status });
  return data;
}

function el(tag, eig = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eig)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "klasse") e.className = v;
    else if (k === "tekst") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kinderen.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return e;
}

const wanneer = (sec) => new Date(sec * 1000).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function toonInloggen() {
  $("#inloggen").hidden = false;
  $("#overzicht").hidden = true;
  for (const id of ["ververs", "export", "uitloggen"]) $(`#${id}`).hidden = true;
  $("#wachtwoord").focus();
}

async function laad() {
  try {
    gegevens.overzicht = await api("/api/docent/overzicht");
  } catch (f) {
    if (f.status === 401) return toonInloggen();
    throw f;
  }
  $("#inloggen").hidden = true;
  $("#overzicht").hidden = false;
  for (const id of ["ververs", "export", "uitloggen"]) $(`#${id}`).hidden = false;
  const klassen = gegevens.overzicht.klassen;
  if (!klassen.some((k) => k.code === gegevens.klas)) gegevens.klas = klassen[0]?.code || null;
  teken();
}

async function vink(klas, student, item, klaar, vraag) {
  if (vraag && !confirm(vraag)) return;
  try {
    await api("/api/docent/afvinken", { klas, studentnummer: student, item, klaar });
    await laad();
  } catch (f) {
    if (f.status === 401) return toonInloggen();
    alert(f.message);
  }
}

function teken() {
  const { klassen, missies, badges } = gegevens.overzicht;
  $("#klaskeuze").replaceChildren(...klassen.map((k) => el("button", {
    type: "button", role: "tab", klasse: "knop", "aria-selected": String(k.code === gegevens.klas),
    tekst: `${k.naam} (${k.studenten.length})`, onclick: () => { gegevens.klas = k.code; teken(); },
  })));
  const klas = klassen.find((k) => k.code === gegevens.klas);
  if (!klas) {
    $("#klas").replaceChildren(el("p", {}, "Nog geen klassen. Maak er een op de server met ", el("code", { tekst: 'python3 larixa.py klas-toevoegen "4ICT-A"' }), "."));
    return;
  }

  const titel = Object.fromEntries(missies.map((m) => [m.id, m]));
  const wachtrij = [];
  for (const s of klas.studenten) {
    for (const [id, status] of Object.entries(s.status)) {
      if (status === "open" && titel[id].soort === "docent") wachtrij.push({ s, m: titel[id] });
    }
  }

  const kop = el("tr", {},
    el("th", { scope: "col", tekst: "Student" }),
    el("th", { scope: "col", tekst: "Spoor" }),
    el("th", { scope: "col", tekst: "Laatst gezien" }),
    el("th", { scope: "col" }, el("abbr", { title: "Foute codes in de afgelopen 7 dagen", tekst: "Fout" })),
    missies.map((m, i) => el("th", { scope: "col", klasse: i === 0 ? "scheiding" : "" },
      el("abbr", { title: `Week ${m.week}: ${m.titel}${m.soort === "docent" ? " (docent vinkt af)" : ""}`, tekst: m.id.toUpperCase() }))),
    badges.map((b, i) => el("th", { scope: "col", klasse: i === 0 ? "scheiding" : "" }, el("abbr", { title: b.uitleg, tekst: b.naam }))),
  );

  const rijen = klas.studenten.map((s) => el("tr", {},
    el("th", { scope: "row", tekst: s.studentnummer }),
    el("td", { tekst: s.spoor || "nog niet" }),
    el("td", { tekst: wanneer(s.laatst_gezien) }),
    el("td", { tekst: String(s.foute_codes_week) }),
    missies.map((m, i) => {
      const status = s.status[m.id];
      const td = el("td", { klasse: i === 0 ? "scheiding" : "" });
      if (!status) return td.append(el("span", { klasse: "nvt", tekst: "n.v.t.", title: "Hoort niet bij het spoor van deze student" })), td;
      const v = s.voltooid[m.id];
      const label = status === "klaar" ? (v?.door === "docent" ? "klaar (d)" : "klaar") : status;
      const vraag = status === "klaar"
        ? `${m.id.toUpperCase()} terugzetten voor ${s.studentnummer}?`
        : m.soort === "lab" ? `${m.id.toUpperCase()} afvinken zonder code voor ${s.studentnummer}? Doe dit alleen als het lab niet meewerkt.` : null;
      td.append(el("button", {
        type: "button", klasse: `vak ${status}`, tekst: label,
        "aria-label": `${m.id.toUpperCase()} ${m.titel} voor ${s.studentnummer}: ${label}. ${status === "klaar" ? "Terugzetten" : "Afvinken"}`,
        title: v ? `Afgerond ${wanneer(v.tijd)} via ${v.door === "docent" ? "docent" : "code"}` : "",
        onclick: () => vink(klas.code, s.studentnummer, m.id, status !== "klaar", vraag),
      }));
      return td;
    }),
    badges.map((b, i) => {
      const heeft = Boolean(s.voltooid[b.id]);
      return el("td", { klasse: i === 0 ? "scheiding" : "" }, el("button", {
        type: "button", klasse: `vak ${heeft ? "klaar" : "dicht"}`, tekst: heeft ? "ja" : "geven",
        "aria-label": `${b.naam} voor ${s.studentnummer}: ${heeft ? "gegeven, afnemen" : "geven"}`,
        onclick: () => vink(klas.code, s.studentnummer, b.id, !heeft, heeft ? `Sticker ${b.naam} afnemen van ${s.studentnummer}?` : null),
      }));
    }),
  ));

  $("#klas").replaceChildren(
    el("p", { klasse: "klasinfo" }, "Klascode ", el("code", { tekst: klas.code }), `. ${klas.open ? "Open voor nieuwe aanmeldingen." : "Gesloten voor nieuwe aanmeldingen."}`),
    el("h2", { tekst: wachtrij.length ? `Wacht op jou (${wachtrij.length})` : "Wacht op jou" }),
    wachtrij.length
      ? el("ul", { klasse: "wachtrij" }, wachtrij.map(({ s, m }) => el("li", {},
        el("span", {}, el("strong", { tekst: s.studentnummer }), `: week ${m.week}, ${m.titel}`),
        el("button", { type: "button", klasse: "knop knop-klein", tekst: "Afvinken", onclick: () => vink(klas.code, s.studentnummer, m.id, true) }))))
      : el("p", { tekst: "Niemand wacht op een afvinkmissie." }),
    el("h2", { tekst: "Per student" }),
    klas.studenten.length
      ? el("div", { klasse: "tabel-wrap" }, el("table", { klasse: "voortgang-tabel" }, el("thead", {}, kop), el("tbody", {}, rijen)))
      : el("p", { tekst: `Nog geen studenten. Geef je klas de klascode ${klas.code}.` }),
    el("p", { klasse: "legenda", tekst: "Klik op een vak om af te vinken of terug te zetten. klaar (d) = afgevinkt door een docent. n.v.t. = hoort niet bij het spoor." }),
  );
}

function exporteer() {
  const { klassen, missies, badges } = gegevens.overzicht;
  const klas = klassen.find((k) => k.code === gegevens.klas);
  if (!klas) return;
  const regels = [["studentnummer", "spoor", ...missies.map((m) => m.id), ...badges.map((b) => b.id)]];
  for (const s of klas.studenten) {
    regels.push([s.studentnummer, s.spoor || "", ...missies.map((m) => s.status[m.id] || "nvt"), ...badges.map((b) => (s.voltooid[b.id] ? "ja" : ""))]);
  }
  const csv = regels.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = el("a", { href: url, download: `larixa-${klas.naam.replace(/[^\w-]+/g, "_")}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("#inlogformulier").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const melding = $("#inlog-melding");
  melding.textContent = "";
  try {
    await api("/api/docent/inloggen", { wachtwoord: $("#wachtwoord").value });
    $("#wachtwoord").value = "";
    await laad();
  } catch (f) {
    melding.className = "melding fout";
    melding.textContent = f.message;
  }
});
$("#ververs").addEventListener("click", laad);
$("#export").addEventListener("click", exporteer);
$("#uitloggen").addEventListener("click", async () => {
  await api("/api/docent/afmelden", {}).catch(() => {});
  toonInloggen();
});
setInterval(() => { if (!document.hidden && !$("#overzicht").hidden) laad(); }, 30000);
laad();
