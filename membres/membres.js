/* =====================================================================
   ESPACE MEMBRES ML RACING TEAM — chiffrement (ne pas modifier)
   ---------------------------------------------------------------------
   - Une clé secrète unique (la "clé de l'espace") chiffre tous les
     fichiers membres (AES-GCM 256 bits).
   - Chaque compte (membre ou bureau) possède une copie de cette clé,
     elle-même chiffrée avec une clé dérivée de son code (PBKDF2-SHA256).
   - Les identifiants ne sont jamais stockés en clair : seule leur
     empreinte (SHA-256) apparaît dans acces.json.
   ===================================================================== */
const MLRT = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const subtle = (globalThis.crypto || {}).subtle;
  const b64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
  const normId = id => String(id || "").trim().toLowerCase();
  const ITER = 250000;

  async function idHash(id) {
    return b64(await subtle.digest("SHA-256", enc.encode("mlrt-membre:" + normId(id))));
  }
  async function derive(code, salt, iter) {
    const base = await subtle.importKey("raw", enc.encode(String(code || "").trim()), "PBKDF2", false, ["deriveKey"]);
    return subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter || ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const importMaster = raw => subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

  async function encBytes(key, bytes) {
    const iv = rand(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
  }
  async function decBytes(key, buf) {
    const u = new Uint8Array(buf);
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, key, u.slice(12)));
  }
  const encText = async (key, txt) => b64(await encBytes(key, enc.encode(txt)));
  const decText = async (key, s) => dec.decode(await decBytes(key, unb64(s)));

  /* Connexion : renvoie {raw, key, role, compte} ou null */
  async function login(acces, id, code) {
    if (!acces || !Array.isArray(acces.comptes)) return null;
    const h = await idHash(id);
    const c = acces.comptes.find(x => x.h === h);
    if (!c) return null;
    try {
      const k = await derive(code, unb64(c.salt), acces.iter);
      const raw = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: unb64(c.iv) }, k, unb64(c.cle)));
      return { raw, key: await importMaster(raw), role: c.role || "membre", compte: c };
    } catch (e) { return null; }
  }

  /* Création d'un compte (bureau uniquement : nécessite la clé de l'espace) */
  async function makeCompte(id, code, raw, masterKey, role, iter) {
    const salt = rand(16), iv = rand(12);
    const k = await derive(code, salt, iter || ITER);
    const cle = await subtle.encrypt({ name: "AES-GCM", iv }, k, raw);
    return { h: await idHash(id), role: role || "membre", nom: await encText(masterKey, String(id).trim()),
             salt: b64(salt), iv: b64(iv), cle: b64(cle), cree: new Date().toISOString().slice(0, 10) };
  }

  function genCode() {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = rand(12); let s = "";
    for (let i = 0; i < 12; i++) { s += A[r[i] % A.length]; if (i === 3 || i === 7) s += "-"; }
    return s;
  }
  const randName = () => "f-" + Array.from(rand(8), b => b.toString(16).padStart(2, "0")).join("") + ".bin";

  return { ITER, b64, unb64, rand, idHash, derive, importMaster, encBytes, decBytes, encText, decText, login, makeCompte, genCode, randName };
})();
if (typeof module !== "undefined") module.exports = MLRT;
