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
    cal.append(b, s); return cal;
  }

  const empty = () => ({ v: 1, cfg: null, roulages: [] });
  async function decode(KEY, buf) {
    if (!buf) return empty();
    const d = JSON.parse(new TextDecoder().decode(await MLRT.decBytes(KEY, buf)));
    d.roulages = Array.isArray(d.roulages) ? d.roulages : []; return d;
  }
  const encode = async (KEY, data) => MLRT.encBytes(KEY, new TextEncoder().encode(JSON.stringify(data)));

  /* Dépôt de participation (intérêts des membres) via l'API GitHub */
  function Store(cfg) {
    if (!cfg || !cfg.repo || !cfg.tok) return null;
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

  return { fromTxt, loadTxt, merge, span, isPast, sorted, newId, calBox, empty, decode, encode, Store, byRoulage, norm };
})();
if (typeof module !== "undefined") module.exports = MLRR;
