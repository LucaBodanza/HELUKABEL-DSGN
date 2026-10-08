// HELUKABEL DSGN — Cerca codice (filtri su tutte le caratteristiche) e Interrogatore (dalle parole al prodotto)
// Tutto gira sul dispositivo: il database dei prodotti (prodotti.json) arriva con i dati dei cataloghi.

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = t => String(t).toUpperCase().replace(/[\s.\-_/–,+]/g, '');
const senzaAccenti = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------- caratteristiche
export const FACCETTE = [
  { k: 'tipo', nome: 'Famiglia' }, { k: 'fam', nome: 'Sottofamiglia' }, { k: 'anime', nome: 'Anime', numerica: true }, { k: 'sez', nome: 'Sezione', numerica: true },
  { k: 'awg', nome: 'AWG', numerica: true }, { k: 'pe', nome: 'Giallo-verde' }, { k: 'guaina', nome: 'Guaina' }, { k: 'schermo', nome: 'Schermatura' },
  { k: 'alogeni', nome: 'Alogeni' }, { k: 'catena', nome: 'Catena portacavi' }, { k: 'torsione', nome: 'Torsione' }, { k: 'ul', nome: 'Omologazioni' },
  { k: 'uv', nome: 'Esterno' }, { k: 'olio', nome: 'Olio' }, { k: 'tmax', nome: 'Temperatura max', numerica: true }, { k: 'tensione', nome: 'Tensione nominale' },
  { k: 'proto', nome: 'Dati / bus' }, { k: 'misura', nome: 'Misura' }, { k: 'cat', nome: 'Catalogo' },
];
const NOME_F = Object.fromEntries(FACCETTE.map(f => [f.k, f.nome]));
const numero = v => { const m = /-?\d+(?:[.,]\d+)?/.exec(String(v)); return m ? parseFloat(m[0].replace(',', '.')) : Infinity; };

const D = { pronti: false, carico: null, P: [], cat: {}, ctx: null };

async function prendiProdotti() {
  const url = D.ctx.WEB ? 'dati/prodotti.json' : '/api/prodotti';
  let ultimo = null;
  for (let giro = 0; giro < 3; giro++) {          // un paio di tentativi: su computer lenti la prima richiesta può cadere
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        let msg = `Il database dei prodotti non è nei dati installati (risposta ${r.status}).`;
        try { const j = await r.json(); if (j.errore) msg = j.errore; } catch (e) { /* risposta senza testo */ }
        const err = new Error(msg); err.definitivo = true; throw err;
      }
      return await r.json();
    } catch (e) {
      if (e.definitivo) throw e;
      ultimo = e;
      await new Promise(ok => setTimeout(ok, 500 + giro * 700));
    }
  }
  throw new Error(`Non riesco a leggere il database dei prodotti (${ultimo?.message || 'errore sconosciuto'}). Chiudi e riapri l'app; se continua, ricarica il file dei dati dalla pagina "Dati".`);
}
async function carica() {
  if (D.pronti) return;
  if (!D.carico) D.carico = (async () => {
    const j = await prendiProdotti();
    for (const c of D.ctx.S.cataloghi) if (c.manifest) D.cat[c.numero] = c;
    D.P = j.prodotti.filter(o => D.cat[o.n]);
    for (const o of D.P) {
      o.a = o.a || []; o.b = o.b || o.t; o.s = o.s || []; o.d = o.d || '';
      o.f.cat = `${String(o.n).padStart(2, '0')} · ${D.cat[o.n].nome}`;
      o._x = norm(o.c) + ' ' + o.a.map(norm).join(' ');
      const sz = o.f.sez ? o.f.sez.replace(' mm²', '') : '';
      const compatto = o.f.anime && sz ? `k${o.f.anime}x${sz} ${o.f.pe ? 'k' + o.f.anime + 'g' + sz : ''}` : '';
      o._w = senzaAccenti([o.c, o.a.join(' '), o.t, o.b, o.d, compatto, o.s.join(' '), Object.values(o.f).join(' ')].join(' '));
    }
    D.pronti = true;
  })().catch(e => { D.carico = null; throw e; });       // la prossima volta si riprova
  return D.carico;
}
const avvisoDati = e => `<div class="vuoto"><b>${esc(e.message)}</b>${D.ctx.WEB ? '' : '<a class="btn" href="/dati">Apri la pagina dei dati</a>'}</div>`;

// prodotto → va bene per i filtri? filtri = { chiave: Set(valori) }, saltando eventualmente una chiave (per i conteggi)
function passa(o, filtri, salta) {
  for (const k in filtri) {
    if (k === salta || !filtri[k].size) continue;
    if (!filtri[k].has(o.f[k])) return false;
  }
  return true;
}
function punteggioTesto(o, q) {            // q = { codice, parole[] }
  let p = 0;
  if (q.codice) {
    const c = norm(o.c);
    if (c === q.codice) p += 1000; else if (c.startsWith(q.codice)) p += 600; else if (o._x.includes(q.codice)) p += 400;
  }
  let trovate = 0;
  for (const w of q.parole) if (o._w.includes(w)) { trovate++; p += 30 + w.length; }
  if (q.parole.length && trovate === q.parole.length) p += 120;
  return { p, trovate };
}
function interrogaTesto(testo) {
  const t = testo.trim();
  const q = senzaAccenti(t).replace(/(\d)\.(\d)/g, '$1,$2').replace(/(\d+)\s*([gx×*])\s*(\d+(?:,\d+)?)/g, (m, a, x, b) => 'k' + a + (x === 'g' ? 'g' : 'x') + b);
  const parole = q.split(/[\s;]+/).map(w => w.replace(/^,+|,+$/g, '')).filter(w => w.length >= 2);
  const unico = !/\s/.test(t) && /\d/.test(t) && t.length >= 3 && !/^k\d+[gx]\d/.test(q);
  return { codice: unico ? norm(t) : '', parole: unico ? [senzaAccenti(t)] : parole, vuoto: !t };
}

// ---------------------------------------------------------------- scheda PDF: le pagine del prodotto estratte dal catalogo
let pdfLib = null;
const DOC = new Map();                      // gli ultimi PDF aperti restano in memoria per le schede successive
function fonte(o) {                         // le pagine della scheda nel PDF completo
  const m = D.cat[o.n].manifest;
  return { url: `cat/${encodeURI(m.slug)}/${encodeURI(m.file)}`, p: o.q || o.p, n: m.pagine };
}
async function documento(url) {
  if (!pdfLib) pdfLib = await import('./vendor/pdf-lib.esm.min.js');
  if (!DOC.has(url)) {
    if (DOC.size >= 2) DOC.delete(DOC.keys().next().value);
    DOC.set(url, (async () => pdfLib.PDFDocument.load(await (await fetch(url)).arrayBuffer(), { updateMetadata: false }))());
  }
  return DOC.get(url);
}
// pagine da…a di un PDF in un file nuovo (sotto-cataloghi "virtuali")
export async function estraiPagine(url, da, a, nome) {
  const { toast } = D.ctx;
  toast('Preparo il PDF…');
  try {
    if (!pdfLib) pdfLib = await import('./vendor/pdf-lib.esm.min.js');
    const doc = await documento(url), out = await pdfLib.PDFDocument.create();
    const idx = []; for (let p = da; p <= Math.min(a, doc.getPageCount()); p++) idx.push(p - 1);
    (await out.copyPages(doc, idx)).forEach(pg => out.addPage(pg));
    out.setTitle(nome); out.setProducer('HELUKABEL DSGN');
    scarica(await out.save(), nome.replace(/[^\w.-]+/g, '_') + '.pdf');
    toast(`PDF pronto · ${idx.length} pagine`);
  } catch (e) { toast('PDF non riuscito: ' + e.message); }
}
function scarica(byte, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([byte], { type: 'application/pdf' }));
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
export async function schedaPdf(prodotti, nomeFile) {
  const { toast } = D.ctx;
  toast(prodotti.length > 1 ? `Preparo ${prodotti.length} schede…` : 'Preparo la scheda…');
  try {
    if (!pdfLib) pdfLib = await import('./vendor/pdf-lib.esm.min.js');
    const out = await pdfLib.PDFDocument.create();
    const fatte = new Set();
    for (const o of prodotti) {
      const f = fonte(o), doc = await documento(f.url);
      const idx = [];
      for (let i = 0; i < (o.k || 1); i++) { const p = f.p + i; if (p <= f.n && !fatte.has(f.url + '#' + p)) { fatte.add(f.url + '#' + p); idx.push(p - 1); } }
      if (idx.length) (await out.copyPages(doc, idx)).forEach(pg => out.addPage(pg));
    }
    if (!out.getPageCount()) throw new Error('nessuna pagina');
    out.setTitle(prodotti.length === 1 ? `${prodotti[0].c} — scheda tecnica HELUKABEL` : 'Schede tecniche HELUKABEL');
    out.setProducer('HELUKABEL DSGN');
    const blob = new Blob([await out.save()], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeFile || `HELUKABEL_${prodotti[0].c.replace(/[^\w.-]+/g, '_')}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`Scheda pronta · ${out.getPageCount()} ${out.getPageCount() === 1 ? 'pagina' : 'pagine'}`);
  } catch (e) { toast('Scheda non riuscita: ' + e.message); }
}
function apriNelCatalogo(o) {
  const c = D.cat[o.n], m = c.manifest;
  D.ctx.S.cur = c;
  D.ctx.sfoglia({ url: `cat/${encodeURI(m.slug)}/${encodeURI(m.file)}`, titolo: c.nome, pagina: o.p });
}

// ================================================================ CERCA CODICE
const C = { filtri: {}, testo: '', lista: [], mostrati: 0, scelti: new Map(), aperte: new Set(), pagina: null };
const PASSO = 60;

function descr(o) { return o.d || o.s[o.s.length - 1] || ''; }
function etichette(o, max = 7) {
  const out = [];
  for (const k of ['guaina', 'schermo', 'alogeni', 'catena', 'torsione', 'ul', 'tmax', 'tensione', 'proto', 'olio', 'uv']) {
    const v = o.f[k]; if (!v) continue;
    out.push(`<span class="et">${esc(v)}</span>`);
    if (out.length >= max) break;
  }
  return out.join('');
}
function rigaProdotto(o, i) {
  const sel = C.scelti.has(o.c + '|' + o.n);
  return `<div class="pr ${sel ? 'sel' : ''}" data-i="${i}">
    <button class="spunta" data-a="sel" title="Aggiungi alle schede da scaricare" aria-pressed="${sel}"></button>
    <div class="pc"><div class="cod">${esc(o.c)}<span>${esc(o.t)}</span></div>
      <div class="ds">${esc(descr(o))}</div><div class="ets">${etichette(o)}</div></div>
    <div class="pd"><div class="dove">${esc(o.f.cat)}<span>pag. ${o.p}</span></div>
      <div class="az"><button data-a="pdf" class="pri">Scheda PDF</button><button data-a="cat">Apri nel catalogo</button></div></div></div>`;
}
function calcola() {
  const q = interrogaTesto(C.testo);
  let L = D.P.filter(o => passa(o, C.filtri) && (C.pagina ? (o.n === C.pagina.n && o.p === C.pagina.p) : true));
  if (!q.vuoto) {
    const P = [];
    for (const o of L) { const s = punteggioTesto(o, q); if (s.p > 0 && (q.codice || s.trovate === q.parole.length)) { o._p = s.p; P.push(o); } }
    P.sort((a, b) => b._p - a._p || a.n - b.n || a.p - b.p);
    L = P;
  }
  C.lista = L; C.mostrati = 0;
  return q;
}
function disegnaFiltri(q) {
  // per ogni caratteristica: i valori disponibili con gli altri filtri attivi
  const base = D.P.filter(o => (C.pagina ? (o.n === C.pagina.n && o.p === C.pagina.p) : true) && (q.vuoto || (s => s.p > 0 && (q.codice || s.trovate === q.parole.length))(punteggioTesto(o, q))));
  const html = [];
  for (const f of FACCETTE) {
    const conta = new Map();
    for (const o of base) if (passa(o, C.filtri, f.k)) { const v = o.f[f.k]; if (v) conta.set(v, (conta.get(v) || 0) + 1); }
    const attivi = C.filtri[f.k] || new Set();
    for (const v of attivi) if (!conta.has(v)) conta.set(v, 0);
    if (conta.size < 2 && !attivi.size) continue;
    let V = [...conta.entries()];
    V.sort(f.numerica ? ((a, b) => numero(a[0]) - numero(b[0]) || a[0].localeCompare(b[0])) : ((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
    const tutte = C.aperte.has(f.k), LIM = 10;
    const vis = tutte ? V : V.filter((x, i) => i < LIM || attivi.has(x[0]));
    html.push(`<div class="fac"><div class="fn">${f.nome}${attivi.size ? `<button data-azz="${f.k}">azzera</button>` : ''}</div><div class="fv">` +
      vis.map(([v, n]) => `<button class="fc ${attivi.has(v) ? 'on' : ''} ${n ? '' : 'zero'}" data-k="${f.k}" data-v="${esc(v)}">${esc(v)}<i>${n}</i></button>`).join('') +
      (V.length > vis.length ? `<button class="fc piu" data-piu="${f.k}">+${V.length - vis.length}</button>` : (tutte && V.length > LIM ? `<button class="fc piu" data-piu="${f.k}">meno</button>` : '')) + '</div></div>');
  }
  $('#ccFiltri').innerHTML = html.join('') || '<p class="muted">Nessun filtro disponibile.</p>';
}
function disegnaLista(aggiungi = false) {
  const el = $('#ccLista');
  const da = aggiungi ? C.mostrati : 0, a = Math.min(C.lista.length, da + PASSO);
  const html = C.lista.slice(da, a).map((o, i) => rigaProdotto(o, da + i)).join('');
  if (aggiungi) { el.querySelector('.altri')?.remove(); el.insertAdjacentHTML('beforeend', html); } else { el.innerHTML = html; el.scrollTop = 0; }
  C.mostrati = a;
  if (!C.lista.length) el.innerHTML = '<div class="vuoto">Nessun prodotto con questi filtri. Togli un filtro o cambia le parole.</div>';
  else if (a < C.lista.length) el.insertAdjacentHTML('beforeend', `<button class="altri" data-a="altri">Mostra altri ${Math.min(PASSO, C.lista.length - a)} · ${C.lista.length - a} rimasti</button>`);
}
function barraScelti() {
  const n = C.scelti.size, b = $('#ccScelti');
  b.classList.toggle('su', n > 0);
  b.innerHTML = n ? `<b>${n}</b> ${n === 1 ? 'scheda selezionata' : 'schede selezionate'}<button class="btn" data-a="unisci">Scarica in un unico PDF</button><button class="btn ghost" data-a="svuota">Deseleziona</button>` : '';
}
function aggiornaCerca() {
  const q = calcola();
  const nf = Object.values(C.filtri).reduce((s, x) => s + x.size, 0);
  $('#ccConta').innerHTML = `<b>${C.lista.length.toLocaleString('it-IT')}</b> ${C.lista.length === 1 ? 'codice' : 'codici'}` +
    (C.pagina ? ` · <button class="lnk" data-azz="pagina">pagina ${C.pagina.p} del catalogo ${String(C.pagina.n).padStart(2, '0')} ✕</button>` : '') +
    (nf ? ` · <button class="lnk" data-azz="tutti">azzera ${nf} ${nf === 1 ? 'filtro' : 'filtri'}</button>` : '');
  disegnaFiltri(q); disegnaLista(); barraScelti();
}
export async function apriCerca(stato) {
  const { vai, toast } = D.ctx;
  vai('cerca');
  if (stato) { C.filtri = {}; for (const k in stato.filtri || {}) C.filtri[k] = new Set(stato.filtri[k]); C.testo = stato.testo || ''; C.pagina = stato.pagina || null; }
  $('#ccTesto').value = C.testo;
  if (!D.pronti) $('#ccLista').innerHTML = '<div class="vuoto"><div class="spinner"></div>Carico il database dei prodotti…</div>';
  try { await carica(); } catch (e) { $('#ccLista').innerHTML = avvisoDati(e); return; }
  aggiornaCerca();
  if (!matchMedia('(pointer: coarse)').matches) $('#ccTesto').focus();
}
function eventiCerca() {
  let t = 0;
  $('#ccTesto').addEventListener('input', e => { C.testo = e.target.value; clearTimeout(t); t = setTimeout(aggiornaCerca, 140); });
  $('#ccFiltri').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.piu) { C.aperte.has(b.dataset.piu) ? C.aperte.delete(b.dataset.piu) : C.aperte.add(b.dataset.piu); return aggiornaCerca(); }
    if (b.dataset.azz) { delete C.filtri[b.dataset.azz]; return aggiornaCerca(); }
    const { k, v } = b.dataset; if (!k) return;
    const s = C.filtri[k] || (C.filtri[k] = new Set());
    s.has(v) ? s.delete(v) : s.add(v);
    aggiornaCerca();
  });
  $('#ccConta').addEventListener('click', e => {
    const a = e.target.closest('[data-azz]')?.dataset.azz; if (!a) return;
    if (a === 'pagina') C.pagina = null; else { C.filtri = {}; }
    aggiornaCerca();
  });
  $('#ccLista').addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'altri') return disegnaLista(true);
    const r = e.target.closest('.pr'); if (!r) return;
    const o = C.lista[+r.dataset.i]; if (!o) return;
    if (a === 'pdf') return schedaPdf([o]);
    if (a === 'cat') return apriNelCatalogo(o);
    const id = o.c + '|' + o.n;                    // clic sulla riga o sulla spunta: seleziona
    C.scelti.has(id) ? C.scelti.delete(id) : C.scelti.set(id, o);
    r.classList.toggle('sel', C.scelti.has(id)); r.querySelector('.spunta').setAttribute('aria-pressed', C.scelti.has(id));
    barraScelti();
  });
  $('#ccScelti').addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'svuota') { C.scelti.clear(); aggiornaCerca(); }
    if (a === 'unisci') { const L = [...C.scelti.values()].sort((x, y) => x.n - y.n || x.p - y.p); schedaPdf(L, L.length === 1 ? null : `HELUKABEL_schede_${L.length}_codici.pdf`); }
  });
}

// ================================================================ INTERROGATORE
// Dalle parole alle caratteristiche. Ogni concetto: come si dice (in italiano e in inglese) → caratteristica e valori.
// 'alt' = più strade equivalenti (basta una); 'peso' serve a decidere cosa togliere per ultimo se non si trova niente.
const sezione = x => x.replace('.', ',').replace(/,0+$/, '') + ' mm²';
const CONCETTI = [
  // anime x sezione: "4G1,5", "3x2.5", "7 G 0,75"
  { rx: /\b(\d{1,3})\s?([gx×*])\s?(\d{1,3}(?:[.,]\d{1,2})?)\b(?!\s?awg)/, multi: m => [
      { k: 'anime', v: [String(+m[1])], dico: `${+m[1]} anime` },
      { k: 'sez', v: [sezione(m[3])], dico: sezione(m[3]) },
      ...(m[2] === 'g' ? [{ k: 'pe', v: ['Con giallo-verde (G)'], dico: 'con giallo-verde (G)' }] : [])] },
  { rx: /\b(\d{1,3}(?:[.,]\d{1,2})?)\s?(mm2|mm²|mmq|mm quadri|quadri)\b/, k: 'sez', v: m => [sezione(m[1])], dico: m => sezione(m[1]) },
  { rx: /\b(\d{1,3})\s?(anime|conduttori|poli|fili|cores?|conductors)\b/, k: 'anime', v: m => [String(+m[1])], dico: m => `${+m[1]} anime` },
  { rx: /\bawg\s?(\d{1,2})\b|\b(\d{1,2})\s?awg\b/, k: 'awg', v: m => ['AWG ' + (m[1] || m[2])], dico: m => 'AWG ' + (m[1] || m[2]) },
  // tipo di cavo
  { rx: /\bunipolar\w*|cordin\w*|single core|singol[oa] (conduttore|anima)|filo\b/, k: 'tipo', v: () => valoriCon('tipo', 'Unipolari'), dico: 'unipolare' },
  { rx: /\bmultipolar\w*|multicore|multi-core/, k: 'tipo', v: () => valoriCon('tipo', 'Multipolari'), dico: 'multipolare' },
  { rx: /accessori\w*|pressacav\w*|\bglands?\b|guain\w* (corrugat|spiral)|tubo corrugato|fascett\w*|capicorda|connettor\w*|morsett\w*/, k: 'tipo', v: () => valoriCon('tipo', 'Accessori'), dico: 'accessori' },
  { rx: /\bdati\b|segnal\w*|trasmissione dati|\bdata\b|controllo|comando/, k: 'tipo', v: () => valoriCon('tipo', 'dati'), dico: 'trasmissione dati / segnale', largo: true },
  // guaina
  { rx: /\bpur\b|poliuretan\w*|polyurethan\w*/, k: 'guaina', v: ['PUR'], dico: 'guaina PUR' },
  { rx: /\bpvc\b/, k: 'guaina', v: ['PVC'], dico: 'guaina PVC' },
  { rx: /silicon\w*/, k: 'guaina', v: ['Silicone'], dico: 'silicone' },
  { rx: /\btpe\b/, k: 'guaina', v: ['TPE'], dico: 'TPE' },
  { rx: /\bgomma\b|rubber|neopren\w*|\bepr\b/, k: 'guaina', v: ['Gomma'], dico: 'gomma' },
  { rx: /teflon|\bptfe\b|\bfep\b/, k: 'guaina', v: ['FEP / PTFE'], dico: 'FEP / PTFE' },
  // proprietà
  { rx: /senza alogeni|privo di alogeni|halogen[- ]?free|ls0h|lszh|frnc|\bhmh\b|galleri\w*|edifici pubblici|ospedal\w*|aeroport\w*|metropolitan\w*|fumi tossici|bassa emissione di fumi/, k: 'alogeni', v: ['Senza alogeni'], dico: 'senza alogeni' },
  { rx: /non schermat\w*|senza scherm\w*|unshielded|unscreened/, k: 'schermo', v: ['Non schermato'], dico: 'non schermato' },
  { rx: /schermat\w*|schermo\b|shielded|screened|\bemc\b|\bemv\b|disturbi|interferenz\w*|inverter|\bvfd\b/, k: 'schermo', v: ['Schermato'], dico: 'schermato' },
  { rx: /catena portacav\w*|catene portacav\w*|portacavi|drag ?chain|energy chain|posa mobile|movimento continuo|movimentazione|in movimento|carrelli?\b|assi? mobil\w*/, k: 'catena', v: ['Per catene portacavi'], dico: 'per catene portacavi' },
  { rx: /torsion\w*|\brobot\w*|robotic\w*|antropomorf\w*/, alt: [{ k: 'torsione', v: ['Resistente a torsione'] }, { k: 'cat', v: () => catPerNumero(13) }], dico: 'resistente a torsione (robot)' },
  { rx: /\bul\b|\bcsa\b|\bawm\b|america\w*|\busa\b|stati uniti|canad\w*|nord ?america/, k: 'ul', v: ['UL / CSA'], dico: 'omologato UL / CSA' },
  { rx: /\buv\b|esterno|all'?aperto|outdoor|\bsole\b|intemperi\w*/, k: 'uv', v: ['Esterno / UV'], dico: 'per esterno / UV' },
  { rx: /\boli[oi]\b|lubrificant\w*|refrigerant\w*|macchine utensili|oil/, k: 'olio', v: ["Resistente all'olio"], dico: "resistente all'olio" },
  // temperatura e tensione
  { rx: /(\d{2,3})\s?(°\s?c?|gradi|deg\w*)/, k: 'tmax', v: m => valoriNum('tmax', +m[1], 'min'), dico: m => `fino ad almeno ${m[1]} °C` },
  { rx: /alt[ae] temperatur\w*|high temperature|forn[oi]\b|calore|caldo/, k: 'tmax', v: () => valoriNum('tmax', 105, 'min'), dico: 'alta temperatura (oltre 105 °C)' },
  { rx: /media tensione|medium voltage|\b(\d{1,2}(?:[.,]\d)?)\s?kv\b/, k: 'tensione', v: m => valori('tensione').filter(v => /kV/.test(v) && (!m[1] || numero(v.split('/').pop()) >= parseFloat(m[1].replace(',', '.')))), dico: m => m[1] ? `almeno ${m[1]} kV` : 'media tensione' },
  { rx: /\b(300\/500|450\/750|600\/1000|0[.,]6\/1)\b/, k: 'tensione', v: m => valoriCon('tensione', m[1].replace('.', ',')), dico: m => m[1] + ' V' },
  // dati e bus
  { rx: /profinet/, k: 'proto', v: ['PROFINET'], dico: 'PROFINET' },
  { rx: /profibus/, k: 'proto', v: ['PROFIBUS'], dico: 'PROFIBUS' },
  { rx: /ethercat/, k: 'proto', v: ['EtherCAT'], dico: 'EtherCAT' },
  { rx: /\bcan\b|canopen|devicenet/, k: 'proto', v: ['CAN', 'DeviceNet'], dico: 'CAN / DeviceNet' },
  { rx: /ethernet|\blan\b|\brete\b|\bcat\.? ?(5e?|6a?|7)\b|gigabit/, k: 'proto', v: ['Ethernet', 'Ethernet Cat.5e', 'Ethernet Cat.6', 'Ethernet Cat.6A', 'Ethernet Cat.7', 'PROFINET', 'EtherCAT', 'Single Pair Ethernet'], dico: 'Ethernet / rete' },
  { rx: /single pair|\bspe\b|monocoppia/, k: 'proto', v: ['Single Pair Ethernet'], dico: 'Single Pair Ethernet' },
  { rx: /fibra|ottic\w*|fibre|fiber/, k: 'proto', v: ['Fibra ottica'], dico: 'fibra ottica' },
  { rx: /coassial\w*|coax/, k: 'proto', v: ['Coassiale'], dico: 'coassiale' },
  { rx: /modbus|rs ?485/, k: 'proto', v: ['Modbus', 'RS485'], dico: 'Modbus / RS485' },
  // settori: si cercano le parole inglesi del catalogo
  { rx: /fotovoltaic\w*|solar\w*|pannelli solari/, parola: 'solar', dico: 'fotovoltaico' },
  { rx: /eolic\w*|turbin\w* eolic\w*|vento/, parola: 'wind', dico: 'eolico' },
  { rx: /ferrovi\w*|\btren[oi]\b|rotabil\w*|railway/, parola: 'rail', dico: 'ferroviario' },
  { rx: /saldatur\w*|saldatric\w*/, parola: 'weld', dico: 'saldatura' },
  { rx: /ascensor\w*|elevator\w*/, parola: 'elevator', dico: 'ascensori' },
  { rx: /\bgru\b|carroponte|crane/, parola: 'crane', dico: 'gru' },
  { rx: /servo\w*|servomotor\w*/, parola: 'servo', dico: 'servomotori' },
  { rx: /encoder|retroazion\w*/, parola: 'encoder', dico: 'encoder' },
  { rx: /\bmotor[ei]\b|motore elettrico/, parola: 'motor', dico: 'motori' },
  { rx: /alimentar\w*|food|lavaggi\w*/, parola: 'food', dico: 'alimentare' },
  { rx: /acqua|sommers\w*|sommergibil\w*|pompe? sommers\w*/, parola: 'water', dico: 'acqua / sommersi' },
  { rx: /termocoppi\w*|compensazione/, parola: 'thermocouple', dico: 'termocoppie' },
  { rx: /altoparlant\w*|audio|casse/, parola: 'speaker', dico: 'audio' },
  { rx: /ricarica|e-?mobility|veicol\w* elettric\w*|wallbox/, parola: 'charging', dico: 'ricarica veicoli elettrici' },
  { rx: /spiral\w*/, parola: 'spiral', dico: 'spiralato' },
  { rx: /piatt[oi]\b|flat/, parola: 'flat', dico: 'cavo piatto' },
  { rx: /intrecciat\w*|twist\w*|coppie/, parola: 'pair', dico: 'a coppie' },
  { rx: /armat\w*|armour\w*|armored/, parola: 'armour', dico: 'armato' },
  { rx: /interrat\w*|sotto terra|underground/, parola: 'underground', dico: 'interrato' },
];
// parole che non dicono niente sul prodotto
const VUOTE = new Set('un uno una il lo la i gli le di del dello della dei degli delle a ad al allo alla ai agli alle da dal dalla in nel nella con su per tra fra e ed o che mi ci si serve servono cerco cercando vorrei voglio devo bisogno ho abbiamo avrei necessito trovare comprare acquistare ordinare tipo specifico specifica giusto giusti giusta adatto adatta adatti buono qualcosa prodotto prodotti articolo codice cavo cavi cable cables wire filo applicazione applicazioni industriale industriali impianto impianti elettrico elettrici elettrica macchina macchine macchinario macchinari uso utilizzo sistema sistemi the for and with of to mio nostra nostro molto piu come quale quali essere deve devono sia sono anche ma se non helukabel helu'.split(' '));

function catPerNumero(n) { return D.cat[n] ? [`${String(n).padStart(2, '0')} · ${D.cat[n].nome}`] : []; }
const VAL = {};
function valori(k) { if (!VAL[k]) { const s = new Set(); for (const o of D.P) if (o.f[k]) s.add(o.f[k]); VAL[k] = [...s]; } return VAL[k]; }
function valoriCon(k, pezzo) { return valori(k).filter(v => v.toLowerCase().includes(pezzo.toLowerCase())); }
function valoriNum(k, x, modo) { return valori(k).filter(v => { const n = numero(v); return modo === 'min' ? n >= x && n < x * 40 : Math.abs(n - x) < 0.001; }); }

function interpreta(frase) {
  let t = ' ' + senzaAccenti(frase).replace(/["“”]/g, '"') + ' ';
  const vincoli = [], parole = [];
  for (const c of CONCETTI) {
    const m = c.rx.exec(t);
    if (!m) continue;
    t = t.replace(new RegExp(c.rx.source, 'g'), ' ');
    const dico = typeof c.dico === 'function' ? c.dico(m) : c.dico;
    if (c.parola) { parole.push(c.parola); continue; }
    if (c.multi) {
      for (const x of c.multi(m)) { const v = new Set(x.v); if (v.size) vincoli.push({ alt: [{ k: x.k, v }], dico: x.dico, largo: false }); }
      continue;
    }
    const alt = (c.alt || [{ k: c.k, v: c.v }]).map(a => ({ k: a.k, v: new Set(typeof a.v === 'function' ? a.v(m) : a.v) })).filter(a => a.v.size);
    if (!alt.length) continue;
    const gia = vincoli.find(v => !c.alt && v.alt.length === 1 && v.alt[0].k === c.k && !v.multi);
    if (gia) { for (const x of alt[0].v) gia.alt[0].v.add(x); gia.dico += ' o ' + dico; continue; }
    vincoli.push({ alt, dico, largo: !!c.alt || !!c.largo });
  }
  const resto = [...parole, ...t.split(/[^a-z0-9/"-]+/).filter(w => w.length >= 3 && !VUOTE.has(w) && !/^\d+$/.test(w))];
  return { vincoli, resto };
}
const vaBene = (o, v) => v.alt.some(a => a.v.has(o.f[a.k]));

const A = { frase: '', vincoli: [], resto: [], tolti: [], lista: [], gruppi: [], saltate: new Set() };
const DOMANDE = [
  { k: 'tipo', q: 'Che tipo di prodotto?', aiuto: { 'Unipolari di cablaggio': 'cordine per cablare quadri e apparecchi', 'Unipolari di installazione': 'unipolari per impianti, in tubo o canalina',
      'Multipolari posa fissa': 'cavi di comando e potenza, posa fissa', 'Multipolari posa fissa trasmissione dati': 'cavi dati, segnale e bus', 'Multipolari movimentazione': 'cavi per posa mobile e catene portacavi',
      'Accessori': 'pressacavi, guaine, fascette, capicorda', 'Imballi': 'bobine e confezioni' } },
  { k: 'fam', q: 'In quale famiglia?' },
  { k: 'catena', q: 'Il cavo si muove (catena portacavi)?', aiuto: { 'Per catene portacavi': 'posa mobile continua' } },
  { k: 'schermo', q: 'Serve la schermatura?', aiuto: { Schermato: 'protetto dai disturbi (inverter, motori)', 'Non schermato': 'per segnali e potenza normali' } },
  { k: 'guaina', q: 'Che guaina esterna?', aiuto: { PVC: 'la più comune, uso generale', PUR: 'resistente ad abrasione e olio, per posa mobile', 'Senza alogeni (LS0H)': 'pochi fumi in caso di incendio', Silicone: 'alte temperature', Gomma: 'robusta, per esterni e cantieri', TPE: 'flessibile, resistente', 'FEP / PTFE': 'temperature estreme e chimica' } },
  { k: 'anime', q: 'Quante anime (conduttori)?', numerica: true },
  { k: 'sez', q: 'Che sezione?', numerica: true },
  { k: 'ul', q: 'Serve l\'omologazione UL / CSA (Nord America)?' },
  { k: 'tensione', q: 'Che tensione nominale?' },
  { k: 'tmax', q: 'Temperatura massima di lavoro?', numerica: true },
  { k: 'cat', q: 'In quale catalogo?' },
];

function risolvi() {
  A.tolti = [];
  let V = [...A.vincoli];
  const filtra = () => D.P.filter(o => V.every(v => vaBene(o, v)));
  let L = filtra();
  // niente con tutte le richieste: tolgo una richiesta alla volta, partendo dalle più generiche
  while (!L.length && V.length > 1) {
    let migliore = null;
    for (const v of V) {
      const prova = D.P.filter(o => V.every(x => x === v || vaBene(o, x)));
      if (prova.length && (!migliore || (v.largo && !migliore.v.largo) || (v.largo === migliore.v.largo && prova.length > migliore.L.length))) migliore = { v, L: prova };
    }
    if (!migliore) { const v = V.find(x => x.largo) || V[V.length - 1]; A.tolti.push(v); V = V.filter(x => x !== v); L = filtra(); continue; }
    A.tolti.push(migliore.v); V = V.filter(x => x !== migliore.v); L = migliore.L;
  }
  // le parole non capite: se si trovano nei testi dei prodotti servono a ordinare (e a filtrare, se bastano)
  const trovabili = A.resto.filter(w => L.some(o => o._w.includes(w)));
  if (trovabili.length) {
    for (const o of L) { o._p = 0; for (const w of trovabili) if (o._w.includes(w)) o._p += 1; }
    const tutti = L.filter(o => o._p === trovabili.length);
    if (tutti.length >= 1 && V.length) L = tutti; else if (!V.length) L = L.filter(o => o._p > 0);
    L.sort((a, b) => b._p - a._p || a.n - b.n || a.p - b.p);
  }
  A.guidato = !V.length && !trovabili.length;       // niente di riconosciuto: si parte dalle domande, su tutti i prodotti
  A.usate = trovabili; A.attivi = V; A.lista = L;
  // raggruppo per scheda (catalogo + pagina + blocco)
  const G = new Map();
  for (const o of L) {
    const id = `${o.n}|${o.p}|${o.b}`;
    if (!G.has(id)) G.set(id, { o, lista: [] });
    G.get(id).lista.push(o);
  }
  A.gruppi = [...G.values()];
}
const aiuto = (d, v) => typeof d.aiuto === 'function' ? d.aiuto(v) : d.aiuto?.[v];
function domanda() {
  if (A.lista.length < 4) return null;
  for (const d of DOMANDE) {
    if (A.saltate.has(d.k) || A.attivi.some(v => v.alt.some(a => a.k === d.k) && !v.largo)) continue;
    const conta = new Map();
    for (const o of A.lista) { const v = o.f[d.k]; if (v) conta.set(v, (conta.get(v) || 0) + 1); }
    const copre = [...conta.values()].reduce((s, x) => s + x, 0) / A.lista.length;
    if (conta.size < 2 || copre < 0.5 || Math.max(...conta.values()) / A.lista.length > 0.97) continue;
    let V = [...conta.entries()];
    V.sort(d.numerica ? ((a, b) => numero(a[0]) - numero(b[0])) : ((a, b) => b[1] - a[1]));
    return { ...d, valori: V.slice(0, 14) };
  }
  return null;
}
function disegnaAI() {
  const el = $('#aiEsito');
  if (!A.frase.trim()) { el.innerHTML = ''; $('#aiEsempi').style.display = ''; return; }
  $('#aiEsempi').style.display = 'none';
  risolvi();
  const capito = A.vincoli.map((v, i) => `<button class="cap ${A.tolti.includes(v) ? 'tolto' : ''}" data-togli="${i}" title="Togli questa richiesta">${esc(v.dico)}<i>✕</i></button>`).join('');
  const nonCapite = A.resto.filter(w => !A.usate.includes(w));
  let h = `<div class="ai-capito"><span class="lab">Ho capito</span>${capito || '<span class="muted">nessuna caratteristica precisa</span>'}` +
    (A.usate.length ? `<span class="lab" style="margin-left:14px">cerco anche</span>${A.usate.map(w => `<span class="cap testo">${esc(w)}</span>`).join('')}` : '') + '</div>';
  if (nonCapite.length) h += `<div class="ai-nota">Non ho usato: ${nonCapite.map(esc).join(', ')} — nei cataloghi non trovo queste parole. Prova a dirlo in un altro modo o rispondi alle domande qui sotto.</div>`;
  if (A.tolti.length) h += `<div class="ai-nota forte">Nessun prodotto ha tutte le caratteristiche insieme: ho messo da parte «${A.tolti.map(v => esc(v.dico)).join('», «')}».</div>`;
  if (A.guidato) h += '<div class="ai-nota forte">Da queste parole non riconosco caratteristiche precise del prodotto. Nessun problema: rispondi alle domande qui sotto e ci arriviamo insieme.</div>';
  if (!A.lista.length) {
    h += '<div class="vuoto">Non trovo prodotti per questa richiesta. Prova con parole più semplici: anime e sezione (es. 4G1,5), guaina, se si muove, se serve la schermatura.</div>';
    el.innerHTML = h; return;
  }
  const d = domanda();
  if (d) h += `<div class="ai-domanda"><div class="q">${esc(d.q)}<button class="lnk" data-salta="${d.k}">non lo so, salta</button></div><div class="ops">` +
    d.valori.map(([v, n]) => `<button data-k="${d.k}" data-v="${esc(v)}"><b>${esc(d.k === 'anime' ? v + ' anime' : v)}</b>${aiuto(d, v) ? `<span>${esc(aiuto(d, v))}</span>` : ''}<i>${n}</i></button>`).join('') + '</div></div>';
  if (A.guidato && A.lista.length > 600) { el.innerHTML = h; return; }
  h += `<div class="ai-testa"><b>${A.lista.length.toLocaleString('it-IT')}</b> ${A.lista.length === 1 ? 'codice' : 'codici'} in <b>${A.gruppi.length}</b> ${A.gruppi.length === 1 ? 'scheda' : 'schede'}<button class="btn ghost" data-a="tutti">Apri tutti in Cerca codice →</button></div><div class="ai-griglia">`;
  h += A.gruppi.slice(0, 48).map((g, i) => {
    const o = g.o;
    return `<div class="fam" data-g="${i}"><div class="fs">${esc(o.f.cat)} · pag. ${o.p}</div>
      <h4>${esc(o.b || o.t || o.s[o.s.length - 1] || o.c)}</h4><p>${esc(o.s.slice(-2).join(' › '))}${o.d && g.lista.length === 1 ? ' — ' + esc(o.d) : ''}</p>
      <div class="ets">${etichette(o, 6)}</div>
      <div class="cods">${g.lista.slice(0, 3).map(x => `<span>${esc(x.c)}</span>`).join('')}${g.lista.length > 3 ? `<span class="piu">+${g.lista.length - 3}</span>` : ''}</div>
      <div class="az"><button data-a="pdf" class="pri">Scheda PDF</button><button data-a="codici">${g.lista.length === 1 ? 'Vedi il codice' : `Vedi i ${g.lista.length} codici`}</button><button data-a="cat">Catalogo</button></div></div>`;
  }).join('') + '</div>';
  if (A.gruppi.length > 48) h += `<p class="muted" style="margin:14px 2px 30px">Mostro le prime 48 schede: rispondi alle domande sopra per restringere, oppure apri tutto in Cerca codice.</p>`;
  el.innerHTML = h;
}
function chiedi(frase) {
  A.frase = frase; A.saltate.clear();
  const i = interpreta(frase);
  A.vincoli = i.vincoli; A.resto = i.resto;
  disegnaAI();
}
export async function apriAI() {
  const { vai, toast } = D.ctx;
  vai('ai');
  try { await carica(); } catch (e) { $('#aiEsito').innerHTML = avvisoDati(e); return; }
  if (!matchMedia('(pointer: coarse)').matches) $('#aiTesto').focus();
}
function filtriDaVincoli() {                 // per passare a Cerca codice: solo le richieste a una sola caratteristica
  const f = {};
  for (const v of A.attivi) if (v.alt.length === 1) f[v.alt[0].k] = [...v.alt[0].v];
  return f;
}
function eventiAI() {
  const invia = () => chiedi($('#aiTesto').value);
  $('#aiVai').onclick = invia;
  $('#aiTesto').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } });
  $('#aiEsempi').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('#aiTesto').value = b.textContent; invia(); });
  $('#aiEsito').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.togli != null) { A.vincoli.splice(+b.dataset.togli, 1); return disegnaAI(); }
    if (b.dataset.salta) { A.saltate.add(b.dataset.salta); return disegnaAI(); }
    if (b.dataset.k) {
      const d = DOMANDE.find(x => x.k === b.dataset.k), v = b.dataset.v;
      A.vincoli.push({ alt: [{ k: d.k, v: new Set([v]) }], dico: d.k === 'anime' ? v + ' anime' : (d.k === 'cat' ? v.replace(/^\d+ · /, '') : v), largo: false });
      return disegnaAI();
    }
    if (b.dataset.a === 'tutti') return apriCerca({ filtri: filtriDaVincoli(), testo: A.attivi.some(v => v.alt.length > 1) ? '' : A.usate.join(' ') });
    const g = A.gruppi[+b.closest('.fam')?.dataset.g]; if (!g) return;
    if (b.dataset.a === 'pdf') return schedaPdf([g.o]);
    if (b.dataset.a === 'cat') return apriNelCatalogo(g.o);
    if (b.dataset.a === 'codici') return apriCerca({ filtri: {}, testo: '', pagina: { n: g.o.n, p: g.o.p } });
  });
}

export function avviaCerca(ctx) {
  D.ctx = ctx;
  eventiCerca(); eventiAI();
}
