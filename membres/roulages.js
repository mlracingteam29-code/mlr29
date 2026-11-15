/* =====================================================================
   ROULAGES DE L'ESPACE MEMBRES ML RACING TEAM
   ---------------------------------------------------------------------
   - membres/roulages.bin (chiffré avec la clé de l'espace) contient les
     roulages proposés / validés, les pilotes retenus et la "clé de
     participation" (accès GitHub au dépôt des intérêts).
   - Chaque membre enregistre ses intérêts dans SON fichier chiffré
     interets/<empreinte>.bin du dépôt de participation.
   Nécessite membres/membres.js (MLRT) chargé avant.
   ===================================================================== */
const MLRR = (() => {
  const MO = ["JANV","FÉVR","MARS","AVR","MAI","JUIN","JUIL","AOÛT","SEPT","OCT","NOV","DÉC"];
  const D = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  const norm = s => String(s || "").trim().toLowerCase();

  function span(s) {
    const ds = [...String(s || "").matchAll(D)].map(m => new Date(+m[3], +m[2] - 1, +m[1]));
    return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null;
  }
  const sortKey = r => { const p = span(r.dates); return p ? p.start.getTime() : 9e15; };
  function isPast(r) { const p = span(r.dates); if (!p) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return p.end < t; }
  const sorted = list => list.slice().sort((a, b) => sortKey(a) - sortKey(b));
  const newId = () => "r-" + Array.from(MLRT.rand(6), b => b.toString(16).padStart(2, "0")).join("");

  /* Petit calendrier (même style que l'onglet public "Dates de roulages") */
  function calBox(r) {
    const cal = document.createElement("div"); cal.className = "cal";
    const p = span(r.dates);
    const b = document.createElement("b"), s = document.createElement("span");
    if (!p) { b.textContent = "?"; s.textContent = r.dates || "date à venir"; }
    else {
      const multi = p.end > p.start, same = p.start.getMonth() === p.end.getMonth();
      b.textContent = multi && same ? p.start.getDate() + "-" + p.end.getDate() : p.start.getDate();
      s.textContent = (multi && !same ? MO[p.start.getMonth()] + " → " + p.end.getDate() + " " + MO[p.end.getMonth()] : MO[p.start.getMonth()]) + " " + p.start.getFullYear();
    }
    cal.append(b, s);
    if (p) { const J = ["DIM","LUN","MAR","MER","JEU","VEN","SAM"]; const w = document.createElement("i"); w.className = "wd";
      w.textContent = p.end > p.start ? J[p.start.getDay()] + " → " + J[p.end.getDay()] : J[p.start.getDay()]; cal.appendChild(w); }
    return cal;
  }

  const empty = () => ({ v: 1, cfg: null, roulages: [] });
  async function decode(KEY, buf) {
    if (!buf) return empty();
    const d = JSON.parse(new TextDecoder().decode(await MLRT.decBytes(KEY, buf)));
    d.roulages = Array.isArray(d.roulages) ? d.roulages : []; return d;
  }
  const encode = async (KEY, data) => MLRT.encBytes(KEY, new TextEncoder().encode(JSON.stringify(data)));

  /* Dépôt de participation (intérêts des membres) via l'API GitHub */
  /* Service Google (compte mlracingteam29@gmail.com) qui garde les intérêts des membres, chiffrés */
  const INTERETS_URL = "https://script.google.com/macros/s/AKfycbzjpC5liCODApecn41ONhCuIZ8BZ8cK8mrLtZDsY5bDiaGCDn3bSn487tquvjNuf4F3/exec";
  function GStore() {
    const keyFor = async id => (await MLRT.idHash(id)).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
    const dec = async (KEY, v) => { try { return JSON.parse(new TextDecoder().decode(await MLRT.decBytes(KEY, MLRT.unb64(v)))); } catch (_) { return null; } };
    return {
      async readAll(KEY) {
        const r = await fetch(INTERETS_URL + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status);
        const d = await r.json(); const out = await Promise.all(Object.values(d).map(v => dec(KEY, v)));
        return out.filter(x => x && x.id && Array.isArray(x.ids));
      },
      async write(KEY, id, ids) {
        const v = ids.length ? MLRT.b64(await MLRT.encBytes(KEY, new TextEncoder().encode(JSON.stringify({ id: String(id).trim(), ids, maj: new Date().toISOString() })))) : "";
        const r = await fetch(INTERETS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ k: await keyFor(id), v }) });
        if (!r.ok) throw new Error("HTTP " + r.status);
      }
    };
  }
  function Store(cfg) {
    if (!cfg || !cfg.repo || !cfg.tok) return INTERETS_URL ? GStore() : null;
    const api = (p, opt = {}) => fetch("https://api.github.com/repos/" + cfg.repo + "/" + p, { ...opt, cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.tok, "X-GitHub-Api-Version": "2022-11-28", ...(opt.headers || {}) } });
    const raw = c => Uint8Array.from(atob(String(c).replace(/\n/g, "")), x => x.charCodeAt(0));
    async function fileName(id) { return "interets/i-" + (await MLRT.idHash(id)).replace(/[^A-Za-z0-9]/g, "").slice(0, 24) + ".bin"; }
    return {
      async test() { const r = await api(""); if (!r.ok) return false; const j = await r.json(); return !!(j.permissions && j.permissions.push); },
      /* -> [{id, ids:[roulage ids], maj}] */
      async readAll(KEY) {
        const r = await api("contents/interets"); if (r.status === 404) return []; if (!r.ok) throw new Error("GitHub " + r.status);
        const list = (await r.json()).filter(f => f.type === "file" && /\.bin$/.test(f.name));
        const out = await Promise.all(list.map(async f => {
          try { const j = await (await api("contents/interets/" + encodeURIComponent(f.name))).json();
                return JSON.parse(new TextDecoder().decode(await MLRT.decBytes(KEY, raw(j.content)))); } catch (_) { return null; }
        }));
        return out.filter(x => x && x.id && Array.isArray(x.ids));
      },
      async write(KEY, id, ids) {
        const p = await fileName(id);
        const cur = await api("contents/" + p); const sha = cur.ok ? (await cur.json()).sha : undefined;
        const bytes = await MLRT.encBytes(KEY, new TextEncoder().encode(JSON.stringify({ id: String(id).trim(), ids, maj: new Date().toISOString() })));
        const body = { message: "Intérêt roulage", content: MLRT.b64(bytes) }; if (sha) body.sha = sha;
        const r = await api("contents/" + p, { method: "PUT", body: JSON.stringify(body) });
        if (!r.ok) throw new Error("GitHub " + r.status);
      }
    };
  }

  /* Intéressés par roulage : {roulageId: [identifiants]} */
  function byRoulage(interets) {
    const m = {};
    interets.forEach(x => x.ids.forEach(rid => { (m[rid] = m[rid] || []).push(x.id); }));
    return m;
  }

  /* Dates déjà publiées dans roulages.txt (onglet public) : reprises dans l'espace membres */
  async function fromTxt(text) {
    const out = [];
    for (const l of String(text || "").split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith("#"))) {
      const parts = l.split("|").map(x => x.trim());
      const di = parts.findIndex(x => /\d{1,2}\/\d{1,2}\/\d{4}/.test(x)); if (di < 0) continue;
      const rest = parts.filter((_, k) => k !== di);
      const r = { circuit: rest[0] || "Roulage", dates: parts[di], type: rest[1] || "", infos: rest.slice(2).filter(Boolean).join(" · "), statut: "propose", pilotes: [] };
      const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm(r.circuit) + "|" + r.dates.replace(/\s+/g, ""))));
      r.id = "t-" + Array.from(h.slice(0, 6), b => b.toString(16).padStart(2, "0")).join("");
      out.push(r);
    }
    return out;
  }
  async function loadTxt() { try { const r = await fetch("roulages.txt", { cache: "no-cache" }); return r.ok ? await fromTxt(await r.text()) : []; } catch (_) { return []; } }
  /* Ajoute à data.roulages les dates de roulages.txt absentes (sauf celles retirées par le bureau) ; renvoie le nombre ajouté */
  function merge(data, txt) {
    const have = new Set(data.roulages.map(r => r.id)), gone = new Set(data.retires || []); let n = 0;
    txt.forEach(r => { if (!have.has(r.id) && !gone.has(r.id)) { data.roulages.push(r); n++; } });
    return n;
  }

  /* Nom et prénom des membres (champ "np" chiffré dans acces.json) ; à défaut, l'identifiant */
  let NOMS = {};
  async function loadNoms(KEY, acces) {
    NOMS = {};
    for (const c of (acces && acces.comptes) || []) {
      try { const id = c.nom ? await MLRT.decText(KEY, c.nom) : ""; const np = c.np ? await MLRT.decText(KEY, c.np) : "";
            if (id) NOMS[norm(id)] = np || (c.role === "bureau" && norm(id) === "bureau" ? "LOECKX Maxence" : id); } catch (_) {}
    }
    return NOMS;
  }
  const label = id => NOMS[norm(id)] || String(id || "");
  const labels = list => (list || []).map(label).sort((a, b) => a.localeCompare(b, "fr")).join(", ");

  /* Inscrits = membres cochés + invités saisis à la main par le bureau */
  const inscrits = r => (r.pilotes || []).map(label).sort((a, b) => a.localeCompare(b, "fr"))
    .concat((r.invites || []).map(n => n + " (invité)"));
  const nbInscrits = r => (r.pilotes || []).length + (r.invites || []).length;

  /* Éditeur bureau : lignes libres pour les invités. onChange() est appelé après chaque modification. */
  function guestEditor(r, onChange) {
    const box = document.createElement("div"); box.className = "rl-guests";
    const t = document.createElement("div"); t.className = "rl-who"; t.textContent = "Invités (hors membres) — à saisir à la main :"; box.appendChild(t);
    (r.invites || []).forEach((n, i) => {
      const row = document.createElement("div"); row.className = "rl-grow";
      const inp = document.createElement("input"); inp.value = n; inp.placeholder = "Nom Prénom";
      inp.onchange = () => { const v = inp.value.trim(); r.invites = (r.invites || []).slice(); if (v) r.invites[i] = v; else r.invites.splice(i, 1); onChange(); };
      const x = document.createElement("button"); x.type = "button"; x.className = "rl-x"; x.textContent = "✕"; x.title = "Retirer";
      x.onclick = () => { r.invites = (r.invites || []).filter((_, k) => k !== i); onChange(); };
      row.append(inp, x); box.appendChild(row);
    });
    const row = document.createElement("div"); row.className = "rl-grow";
    const inp = document.createElement("input"); inp.placeholder = "Ajouter un invité : NOM Prénom";
    const add = document.createElement("button"); add.type = "button"; add.className = "rl-add"; add.textContent = "＋ Ajouter";
    const go = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } r.invites = (r.invites || []).concat(v); onChange(); };
    add.onclick = go; inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    row.append(inp, add); box.appendChild(row);
    return box;
  }

  /* Clé GitHub du bureau, chiffrée avec le code bureau (seul le bureau peut l'ouvrir) */
  async function wrapTok(code, tok) {
    const salt = MLRT.rand(16), k = await MLRT.derive(code, salt);
    return { s: MLRT.b64(salt), c: MLRT.b64(await MLRT.encBytes(k, new TextEncoder().encode(tok))) };
  }
  async function unwrapTok(code, gt) {
    try { const k = await MLRT.derive(code, MLRT.unb64(gt.s)); return new TextDecoder().decode(await MLRT.decBytes(k, MLRT.unb64(gt.c))); } catch (_) { return ""; }
  }
  async function restoreTok(code, compte) {
    if (!compte || !compte.gt) return false;
    const t = await unwrapTok(code, compte.gt); if (!t) return false;
    try { localStorage.setItem("mlrt_gh_token", t); } catch (_) {} return true;
  }

  return { wrapTok, unwrapTok, restoreTok, inscrits, nbInscrits, guestEditor, loadNoms, label, labels, fromTxt, loadTxt, merge, span, isPast, sorted, newId, calBox, empty, decode, encode, Store, byRoulage, norm };
})();
if (typeof module !== "undefined") module.exports = MLRR;
