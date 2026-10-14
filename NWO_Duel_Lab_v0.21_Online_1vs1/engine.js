/* NWO — motore di gioco (prototipo 0.20 · Martyrs). Funziona sia nel browser sia in Node. */
(function (root) {
'use strict';
const TYPES = { F: 'Fuoco', A: 'Acqua', N: 'Natura', R: 'Roccia', C: 'Celeste', X: 'Neutrale' };
const RAR = { C: 'Comune', R: 'Rara', E: 'Epica', L: 'Leggendaria', U: 'Fuoriserie' };
const RV = { C: 0, R: 3, E: 6, L: 12, U: 6 };
const hasT = (c, t) => !!c && (c.t === t || c.t2 === t);
const MAXT = 60;
const CFG = { hp: 50, defMult: 1 };
const bd = c => Math.round(c.d * CFG.defMult * (c.t === 'R' ? (CFG.rockMult || 1) : 1));
const CARDS = [], BY = {};
function card(id, n, t, k, r, a, d, text, h) { const c = Object.assign({ id, n, t, k, r, a, d, text }, h || {}); CARDS.push(c); BY[id] = c; return c; }
const C = x => BY[x.id];
const isMar = id => !!id && (id === 'N11' || !!(BY[id] && BY[id].mario));
const isOcc = x => x.occEnd > 0;
const vis = (g, pi) => g.p[pi].zones.filter(x => x && !isOcc(x));
const onField = (g, x) => !!x && g.p[x.ctrl].zones.includes(x);
const free = P => P.zones.findIndex(z => !z);
const freeT = P => P.traps.findIndex(z => !z);
const nm = id => BY[id].n;
function allOcc(g) { let n = 0; for (const P of g.p) for (const x of P.zones) if (x && isOcc(x)) n++; return n; }
function fx(g, t, d) { if (g.onFx) g.onFx(t, d || {}, g); }
function log(g, s) { g.log.push(s); if (g.onLog) g.onLog(s, g); }
function bestBy(a, f) { let b = null, bv = -Infinity; for (const x of a) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; }
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(g, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(g.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const typesOn = (g, pi) => new Set(vis(g, pi).flatMap(x => [C(x).t, C(x).t2].filter(Boolean)));

/* ---------- statistiche ---------- */
function atkC(g, x, vs, role) {
  const c = C(x); let v = c.a + x.atkPerm + x.atkTemp; const pi = x.ctrl;
  if (!isOcc(x)) {
    if (c.id === 'C06') v += 3 * allOcc(g);
    if (c.id === 'X01') v += 2 * new Set(g.p[pi].abyss.map(id => BY[id].t)).size;
    v += 2 * x.under.length * ((c.id === 'N03' ? 1 : 0) + x.under.filter(id => id === 'N03').length);
    if (c.id === 'R10') v += 3 * (x.hits || 0);
    if (g.p[pi].gear && isMar(x.under[0])) v += 2 * (x.under.length + 1);
    if (C(x).jok) v += 4 * rolled(g.p[pi], C(x).jok);
    if (x.under[0] === 'M4') v += 3;
    if (isMar(x.under[0]) && vis(g, pi).some(y => y.id === 'G3')) v += 4;
    if (c.id === 'TC4') v += 2 * g.p[x.owner].abyss.filter(id => BY[id].auto).length;
    if (c.id === 'AN1') v += 2 * vis(g, pi).filter(y => y !== x && C(y).emis).length;
    if (c.id === 'BY4') v += 4 * g.p[x.owner].abyss.filter(id => BY[id].byffo).length;
    if (c.id === 'X26') v += Math.min(c.cap || 10, (c.per || 2) * g.p[x.ctrl].abyss.filter(id => BY[id].k === 'ag' && BY[id].t === 'X').length);
  }
  if (c.t === 'A') for (const y of vis(g, 1 - pi)) if (y.id === 'N09') v -= 2;
  if (c.t === 'X') for (const y of vis(g, pi)) if (y !== x && y.id === 'X04') v += 2;
  if (vs) {
    if (c.id === 'A06' && C(vs).t === 'F') v += 5;
    if (role === 'att' && c.t === 'F' && vs.id === 'A10' && !isOcc(vs)) v -= 3;
    if (c.id === 'R06' && C(vs).t === 'F') v += 5;
    if (role === 'att' && c.t === 'F' && vs.id === 'R08' && !isOcc(vs)) v -= 4;
  }
  return Math.max(0, v);
}
function dfn(g, x) { let v = x.cur + x.defTemp; if (!isOcc(x)) v += 2 * x.under.length * ((x.id === 'N03' ? 1 : 0) + x.under.filter(id => id === 'N03').length); if (!isOcc(x) && g.p[x.ctrl].gear && isMar(x.under[0])) v += 2 * (x.under.length + 1); if (!isOcc(x) && isMar(x.under[0]) && vis(g, x.ctrl).some(y => y.id === 'G3')) v += 4; if (x.jdef && g.turn <= x.jdefEnd) v -= x.jdef; return v; }
const maxDef = x => bd(C(x)) + x.defPerm;
function val(g, x) { return atkC(g, x) + Math.max(0, dfn(g, x)) * 0.6 + RV[C(x).r]; }
function cval(id) { const c = BY[id]; if (c.k === 'ag') return c.a + c.d * 0.6 + RV[c.r]; return { C: 8, R: 11, E: 14, L: 18, U: 16 }[c.r]; }
function oppMaxAtk(g, pi) { return Math.max(0, ...vis(g, 1 - pi).filter(y => y.pos === 'atk').map(y => atkC(g, y))); }

/* ---------- eventi, PV ---------- */
function emit(g, ev) {
  if (g.ended) return;
  const o = ev.side != null ? ev.side : 1 - g.active, P = g.p[o];
  for (let s = 0; s < 3; s++) {
    const t = P.traps[s]; if (!t) continue; const c = BY[t.id], tr = c.trap;
    if (!tr || tr.on !== ev.type) continue;
    if (c.patto && !c.patto.can(g, o)) continue;
    if (!tr.match(g, ev, o)) continue;
    P.traps[s] = null; P.abyss.push(t.id); P.stats.traps++;
    fx(g, 'trap', { pi: o, z: s, id: t.id }); log(g, `Presagio di ${P.name}: ${c.n}!`); if (g.onTrap) g.onTrap(c, o);
    const pa = g.actor; g.actor = o; try { withSrc(g, c.t, () => tr.fire(g, ev, o)); } finally { g.actor = pa; }
    if (g.ended || ev.negated) return;
  }
}
function dmg(g, pi, n, src) {
  if (g.ended || n <= 0) return; if (src === 'eff' && g.spellNow === 1 - pi && g.src === 'F' && vis(g, 1 - pi).some(y => y.id === 'VU2')) { n += 2; log(g, 'Tifeo alimenta il fuoco: +2.'); } const P = g.p[pi]; if (P.arca && g.turn < P.arca) { log(g, `L'Arca dell'Alleanza protegge ${P.name}.`); return; } P.hp -= n;
  fx(g, 'dmg', { pi, n, src }); log(g, `${P.name} perde ${n} PV.`); if (g.onHit) g.onHit(pi, n);
  if (checkWin(g)) return; emit(g, { type: 'damage', to: pi, n, src }); checkPreg(g, pi);
}
function heal(g, pi, n) {
  if (g.ended || n <= 0) return; const P = g.p[pi]; P.hp += n; P.healed += n;
  fx(g, 'heal', { pi, n }); log(g, `${P.name} recupera ${n} PV.`);
  for (const x of vis(g, pi)) if (x.id === 'A01') dmg(g, 1 - pi, n, 'eff');
  checkPreg(g, pi);
}
function checkWin(g) {
  if (g.ended) return true; const a = g.p[0].hp <= 0, b = g.p[1].hp <= 0;
  if (a || b) { endGame(g, a && b ? -1 : a ? 1 : 0, 'PV esauriti'); return true; } return false;
}
function endGame(g, w, why) { if (g.ended) return; g.ended = true; g.winner = w; g.reason = why; fx(g, 'end', { w, why }); log(g, why + (w < 0 ? ' — pareggio.' : ` — vince ${g.p[w].name}.`)); }
function checkPreg(g, pi) {
  if (g.ended) return;
  for (const x of vis(g, pi)) {
    const c = C(x); if (!c.preg || x.pregDone || (c.preg.ready && !c.preg.ready(g, x))) continue; const hp = g.p[pi].hp;
    if (c.preg.ge != null ? hp >= c.preg.ge : hp <= c.preg.le) { x.pregDone = true; g.pregCount = (g.pregCount || 0) + 1; fx(g, 'kw', { pi, z: g.p[pi].zones.indexOf(x), id: x.id, kw: 'PREGHIERA' }); log(g, `Preghiera: ${c.n}!`); withSrc(g, c.t, () => c.preg.fn(g, x)); if (g.ended) return; }
  }
}
function drawCard(g, pi, silent) {
  const P = g.p[pi]; if (!P.deck.length) { if (!silent && !g.ended) { log(g, `${P.name} deve pescare ma il mazzo è finito.`); const a = g.p[0].hp, b = g.p[1].hp; endGame(g, a === b ? -1 : a > b ? 0 : 1, `Mazzo finito: vince chi ha più PV`); } return false; }
  const id = P.deck.shift();
  if (id === 'SS1X') { const own = (P.moles || []).shift(); log(g, `${P.name} pesca una Talpa infiltrata!`); if (own != null) g.p[own].abyss.push('SS1'); dmg(g, pi, 8, 'eff'); return true; }
  P.hand.push(id); if (!silent) { fx(g, 'draw', { pi, id }); log(g, `${P.name} pesca una carta.`); } return true;
}

/* ---------- istanze e campo ---------- */
function mk(g, id, pi, pos) { const c = BY[id]; const _x = { uid: g.uid++, id, owner: pi, ctrl: pi, pos, cur: bd(c), atkPerm: 0, defPerm: 0, atkTemp: 0, defTemp: 0, entered: g.turn, attacked: false, changed: false, occEnd: 0, under: [], resil: 0, resilDone: false, pregDone: false, noAtk: 0, actUsed: 0, extraUsed: 0, ret: null }; const _P = g.p && g.p[pi], _k = _P && _P.monkBuf ? _P.monkBuf.indexOf(id) : -1; if (_k >= 0) { _P.monkBuf.splice(_k, 1); _x.defPerm += 2; _x.cur += 2; } return _x; }
const canOcc = x => !!x && !['C04', 'X03', 'G3'].includes(x.id) && !x.noOcc && !(x.under || []).includes('C16');
function occult(g, x, n) {
  n = n || 1; if (!canOcc(x) || !onField(g, x)) return false;
  const actor = g.actor != null ? g.actor : g.active;
  if (actor !== x.ctrl && C(x).emis && vis(g, x.ctrl).some(y => y.id === 'AN3')) { log(g, `Il Custode Emissario protegge ${C(x).n}.`); return false; }
  const next = g.active === x.ctrl ? g.turn + 2 : g.turn + 1;
  x.occEnd = Math.max(x.occEnd, next + 2 * (n - 1)); g.occFlag = true; fx(g, 'occult', { pi: x.ctrl, z: g.p[x.ctrl].zones.indexOf(x), id: x.id });
  log(g, `${C(x).n} viene Occultato${n > 1 ? ' x' + n : ''}.`); return true;
}
function removeFromField(g, x) { const P = g.p[x.ctrl]; const i = P.zones.indexOf(x); if (i >= 0) P.zones[i] = null; return i; }
function withSrc(g, t, fn) { const p = g.src; g.src = t; try { return fn(); } finally { g.src = p; } }
function toAbyss(g, x, cause) {
  if (!x || !onField(g, x)) return;
  if (cause === 'effect' && x.id === 'TC4' && !isOcc(x)) { log(g, `${C(x).n} non può essere distrutto da effetti.`); return; }
  if (cause === 'effect' && x.id === 'R11' && g.src === 'F' && !isOcc(x)) { log(g, `${C(x).n} resiste all'effetto Fuoco.`); return; }
  const zi = removeFromField(g, x); fx(g, 'destroy', { pi: x.ctrl, z: zi, id: x.id, cause });
  const O = g.p[x.owner]; O.abyss.push(...x.under, x.id);
  log(g, `${C(x).n} va nell'Abisso.`);
  const c = C(x); if (!isOcc(x) && c.onAbyss) withSrc(g, c.t, () => c.onAbyss(g, x, cause));
  if (!g.ended) emit(g, { type: 'abyss', x, id: x.id, owner: x.owner, cause, t: c.t, t2: c.t2, side: cause === 'martire' ? x.owner : undefined });
}
function toHand(g, x) { const pc = x && x.ctrl; const zi = x ? removeFromField(g, x) : -1; if (zi < 0) return; fx(g, 'bounce', { pi: pc, z: zi, id: x.id, to: x.owner }); g.p[x.owner].hand.push(...x.under, x.id); log(g, `${C(x).n} torna in mano.`); }
function placeNew(g, pi, id, pos, zi) { const P = g.p[pi]; if (zi == null) zi = free(P); if (zi < 0) return null; const x = mk(g, id, pi, BY[id].noDef ? 'atk' : pos); P.zones[zi] = x; return x; }
function afterEnter(g, pi, x, how) {
  fx(g, 'enter', { pi, z: g.p[pi].zones.indexOf(x), id: x.id, how, pos: x.pos });
  if (hasT(C(x), 'R') && x.id !== 'Z25') for (const y of vis(g, pi)) if (y.id === 'Z25') { const d = Math.max(0, dfn(g, x)); y.atkPerm += d; log(g, `${C(y).n} +${d} ATK.`); }
  const c = C(x); if (c.onEnter && !isOcc(x)) withSrc(g, c.t, () => c.onEnter(g, x, how));
  if (g.ended) return; checkPreg(g, pi);
  if (!g.ended) emit(g, { type: 'summon', x, pi, how });
}
function summonFromAbyss(g, pi, filter, pos) {
  const P = g.p[pi]; if (free(P) < 0) return null; let bi = -1, bv = -1;
  P.abyss.forEach((id, i) => { const c = BY[id]; if (c.k === 'ag' && c.r !== 'L' && filter(c) && cval(id) > bv) { bv = cval(id); bi = i; } });
  if (bi < 0) return null; const [id] = P.abyss.splice(bi, 1); const c = BY[id];
  const x = placeNew(g, pi, id, pos || choosePos(g, pi, c)); log(g, `${c.n} torna in campo dall'Abisso.`);
  afterEnter(g, pi, x, 'special'); return x;
}
const hasAbyss = (g, pi, f) => g.p[pi].abyss.some(id => BY[id].k === 'ag' && BY[id].r !== 'L' && f(BY[id]));
function recover(g, pi, f, n) {
  const P = g.p[pi]; let got = 0;
  for (let k = 0; k < (n || 1); k++) {
    let bi = -1, bv = -1; P.abyss.forEach((id, i) => { const c = BY[id]; if (c.k === 'ag' && f(c) && cval(id) > bv) { bv = cval(id); bi = i; } });
    if (bi < 0) break; const [id] = P.abyss.splice(bi, 1); P.hand.push(id); log(g, `${nm(id)} recuperato dall'Abisso.`); got++;
  }
  return got;
}
function searchDeck(g, pi, f, n) {
  const P = g.p[pi]; let got = 0;
  for (let k = 0; k < (n || 1); k++) { let bi = -1, bv = -1; P.deck.forEach((id, i) => { if (f(BY[id]) && cval(id) > bv) { bv = cval(id); bi = i; } }); if (bi < 0) break; const [id] = P.deck.splice(bi, 1); P.hand.push(id); log(g, `${nm(id)} cercato nel mazzo.`); got++; }
  if (got) shuffle(g, P.deck); return got;
}
const destroyEff = (g, x) => { if (x) toAbyss(g, x, 'effect'); };
const pickR = (g, a) => a && a.length ? a[Math.floor(g.rand() * a.length)] : null;
const oppThreat = (g, pi, f) => pickR(g, vis(g, 1 - pi).filter(y => !f || f(y)));
const sampleR = (g, a, n) => { const b = a.slice(); shuffle(g, b); return b.slice(0, n); };
function buffTarget(g, pi, t) { return pickR(g, vis(g, pi).filter(x => !t || C(x).t === t)); }
const attackReady = (g, pi, t) => vis(g, pi).find(x => (!t || C(x).t === t) && x.pos === 'atk' && !x.attacked && g.turn > 1);
const nextTurnOf = (g, pi) => g.active === pi ? g.turn + 2 : g.turn + 1;
function shrinkDef(g, x, n) { x.defPerm -= n; x.cur -= n; log(g, `${C(x).n} perde ${n} DEF.`); if (dfn(g, x) <= 0) toAbyss(g, x, 'effect'); }
function flipEnemies(g, pi, n) {
  const done = new Set();
  for (let k = 0; k < n; k++) {
    const cand = vis(g, 1 - pi).filter(y => !C(y).noDef && !done.has(y));
    const t = pickR(g, cand);
    if (!t) break; done.add(t); t.pos = t.pos === 'def' ? 'atk' : 'def'; log(g, `${C(t).n} passa in ${t.pos === 'atk' ? 'attacco' : 'difesa'}.`);
  }
}
const seqAfter = (g, f) => !!g.prevLast && f(g.prevLast);
function seqLog(g, c) { log(g, `Sequenza attivata: ${c.n}!`); }

/* ======================= CATALOGO 120 CARTE ======================= */
/* ---------- FUOCO ---------- */
card('F01', "Il Drago Rosso dell'Apocalisse", 'F', 'ag', 'L', 28, 15, "Patto: manda nell'Abisso 2 Cavalieri dal tuo campo. Quando distrugge un agente in battaglia, infliggi 3 PV.", {
  patto: { label: '2 Cavalieri nel tuo campo', can: (g, pi) => vis(g, pi).filter(x => C(x).cav).length >= 2, pay: (g, pi) => { vis(g, pi).filter(x => C(x).cav).sort((a, b) => val(g, a) - val(g, b)).slice(0, 2).forEach(x => toAbyss(g, x, 'cost')); } },
  onKill: (g, x) => dmg(g, 1 - x.ctrl, 3, 'eff') });
card('F02', 'Cavaliere Pallido della Morte', 'F', 'ag', 'E', 17, 9, 'Ingresso: se controlli un altro Cavaliere, distruggi un agente avversario con DEF ≤ 8.', { cav: true,
  onEnter: (g, x) => { if (!vis(g, x.ctrl).some(y => y !== x && C(y).cav)) return; destroyEff(g, oppThreat(g, x.ctrl, y => dfn(g, y) <= 8)); } });
card('F03', 'Surtr, Gigante del Ragnarök', 'F', 'ag', 'E', 19, 7, 'Quando distrugge un agente in battaglia, può attaccare di nuovo (1 volta per turno).', {
  onKill: (g, x) => { if (x.extraUsed !== g.turn && g.active === x.ctrl && onField(g, x)) { x.extraUsed = g.turn; x.attacked = false; log(g, `${C(x).n} può attaccare di nuovo!`); } } });
card('F04', 'Fenrir, il Lupo della Fine', 'F', 'ag', 'R', 17, 7, 'Non può essere messo in difesa.', { noDef: true });
card('F05', "Caduto dell'Abisso", 'F', 'ag', 'R', 18, 7, "1/turno: manda nell'Abisso 1 carta dalla tua mano: infliggi 4 PV.", {
  act: { label: 'Scarta 1 carta: 4 danni', can: (g, x) => g.p[x.ctrl].hand.length > 0, fn: (g, x) => { const P = g.p[x.ctrl]; let bi = 0, bv = 1e9; P.hand.forEach((id, i) => { const v = cval(id); if (v < bv) { bv = v; bi = i; } }); const [id] = P.hand.splice(bi, 1); P.abyss.push(id); log(g, `${P.name} manda ${nm(id)} nell'Abisso.`); dmg(g, 1 - x.ctrl, 4, 'eff'); } },
  aiAct: (g, x) => g.p[x.ctrl].hand.length >= 3 || g.p[1 - x.ctrl].hp <= 4 });
card('F06', "L'Ombra dietro il Trono", 'F', 'ag', 'R', 11, 8, "Ingresso: prendi il controllo di un agente avversario Comune fino a fine turno; può attaccare.", {
  onEnter: (g, x) => { const pi = x.ctrl, P = g.p[pi]; if (free(P) < 0) return; const t = pickR(g, vis(g, 1 - pi).filter(y => C(y).r === 'C' && y.ret == null)); if (!t) return; removeFromField(g, t); t.ret = t.ctrl; t.ctrl = pi; if (!C(t).noDef) t.pos = 'atk'; t.attacked = false; P.zones[free(P)] = t; log(g, `${P.name} prende il controllo di ${C(t).n}.`); } });
card('F07', 'Cavaliere Rosso della Guerra', 'F', 'ag', 'C', 13, 5, 'Ingresso: +2 ATK (permanente) per ogni altro Cavaliere nel tuo campo.', { cav: true, onEnter: (g, x) => { const n = vis(g, x.ctrl).filter(y => y !== x && C(y).cav).length; if (n) { x.atkPerm += 2 * n; log(g, `${C(x).n} +${2 * n} ATK.`); } } });
card('F08', 'Cavaliere Nero della Carestia', 'F', 'ag', 'C', 11, 6, "Ingresso: se controlli un altro Cavaliere, l'avversario scarta 1 carta a caso.", { cav: true,
  onEnter: (g, x) => { if (!vis(g, x.ctrl).some(y => y !== x && C(y).cav)) return; const O = g.p[1 - x.ctrl]; if (!O.hand.length) return; const [id] = O.hand.splice(Math.floor(g.rand() * O.hand.length), 1); O.abyss.push(id); log(g, `${O.name} scarta ${nm(id)}.`); } });
card('F09', 'Cavaliere Bianco della Pestilenza', 'F', 'ag', 'C', 10, 7, 'Contro agenti in difesa la DEF del bersaglio cala di 3 in più (5 se Natura).', { cav: true });
card('F10', 'Il Falso Profeta', 'F', 'ag', 'C', 9, 8, 'Ingresso: cambia la posizione di un agente avversario. Sequenza (dopo un Evento): cambiane 2.', {
  onEnter: (g, x) => { const s = seqAfter(g, l => l.k === 'mg'); if (s) seqLog(g, C(x)); flipEnemies(g, x.ctrl, s ? 2 : 1); } });
card('F11', 'Ifrit della Brace', 'F', 'ag', 'C', 9, 7, 'Abisso: infliggi 3 PV.', { onAbyss: (g, x) => dmg(g, 1 - x.ctrl, 3, 'eff') });
card('F12', 'Pazuzu, Demone dei Venti Ardenti', 'F', 'ag', 'C', 14, 6, '');
function tsTarget(g, pi) { return oppThreat(g, pi, y => y.pos === 'def' && dfn(g, y) <= (hasT(C(y), 'N') ? 12 : 8)); }
card('F13', 'La Guerra dei Cinque Regni', 'F', 'mg', 'E', 0, 0, 'Distruggi tutti gli agenti in campo con ATK ≤ 10.', {
  can: (g, pi) => [0, 1].some(s => vis(g, s).some(x => atkC(g, x) <= 10)),
  play: (g, pi) => { [...vis(g, 0), ...vis(g, 1)].filter(x => atkC(g, x) <= 10).forEach(x => toAbyss(g, x, 'effect')); },
  ai: (g, pi) => { let s = 0; for (const x of vis(g, 1 - pi)) if (atkC(g, x) <= 10) s += val(g, x); for (const x of vis(g, pi)) if (atkC(g, x) <= 10) s -= val(g, x); return s > 8; } });
card('F14', 'Terra Spaccata', 'F', 'mg', 'R', 0, 0, 'Distruggi un agente avversario in difesa con DEF ≤ 8 (≤ 12 se Natura).', { can: (g, pi) => !!tsTarget(g, pi), play: (g, pi) => destroyEff(g, tsTarget(g, pi)) });
card('F15', 'Il Dono di Samael', 'F', 'mg', 'R', 0, 0, 'Paga 5 PV: pesca 2.', { can: (g, pi) => g.p[pi].hp > 5, play: (g, pi) => { g.p[pi].hp -= 5; log(g, `${g.p[pi].name} paga 5 PV.`); checkPreg(g, pi); drawCard(g, pi); drawCard(g, pi); }, ai: (g, pi) => g.p[pi].hp >= 18 });
card('F16', 'Pioggia di Zolfo', 'F', 'mg', 'C', 0, 0, "Infliggi 1 PV per ogni dado Fuoco del tuo lancio (minimo 3). Una per turno.", { once: true, dice: true, play: (g, pi) => dmg(g, 1 - pi, Math.max(3, rolled(g.p[pi], 'F')), 'eff') });
card('F17', 'La Cupidigia del Terzo Regno', 'F', 'mg', 'C', 0, 0, 'Un tuo agente Fuoco +4 ATK fino a fine turno. Sequenza (dopo un agente Fuoco): +6.', {
  can: (g, pi) => !!buffTarget(g, pi, 'F'), play: (g, pi) => { const s = seqAfter(g, l => l.k === 'ag' && hasT(l, 'F')); if (s) seqLog(g, BY.F17); const x = buffTarget(g, pi, 'F'); x.atkTemp += s ? 6 : 4; log(g, `${C(x).n} +${s ? 6 : 4} ATK.`); },
  ai: (g, pi) => !!attackReady(g, pi, 'F') });
card('F18', 'Fuoco Greco', 'F', 'tr', 'R', 0, 0, "Condizione (dopo l'attacco): un agente avversario ha attaccato un tuo agente in difesa ed è ancora in campo. Effetto: infliggi PV pari a metà del suo ATK (max 8).", {
  trap: { on: 'attack', match: (g, ev, o) => ev.tgt && ev.tgtDef && ev.tgtCtrl === o && onField(g, ev.att), fire: (g, ev, o) => dmg(g, 1 - o, Math.min(8, Math.floor(ev.attAtk / 2)), 'eff') } });
card('F19', 'Le Fiamme della Geenna', 'F', 'tr', 'C', 0, 0, "Condizione: un tuo agente va nell'Abisso in battaglia. Effetto: infliggi 4 PV.", {
  trap: { on: 'abyss', match: (g, ev, o) => ev.owner === o && ev.cause === 'battle', fire: (g, ev, o) => dmg(g, 1 - o, 4, 'eff') } });
card('F20', 'Lo Specchio Fumante di Tezcatlipoca', 'F', 'tr', 'C', 0, 0, "Condizione: l'avversario gioca un agente. Effetto: quell'agente −3 ATK fino a fine turno.", {
  trap: { on: 'summon', match: (g, ev, o) => ev.pi !== o && onField(g, ev.x), fire: (g, ev, o) => { ev.x.atkTemp -= 3; log(g, `${C(ev.x).n} −3 ATK.`); } } });

/* ---------- ACQUA ---------- */
card('A01', 'Danu, Madre delle Acque', 'A', 'ag', 'L', 22, 22, 'Patto: hai recuperato almeno 10 PV in questa partita. Continuo: ogni volta che recuperi PV, infliggi lo stesso valore.', { patto: { label: '10 PV recuperati', can: (g, pi) => g.p[pi].healed >= 10 } });
card('A02', 'Martire del Lago', 'A', 'ag', 'E', 14, 12, 'Ingresso: recuperi 5 PV. Preghiera (PV ≤ 25): i tuoi agenti Acqua +3 ATK.', {
  onEnter: (g, x) => heal(g, x.ctrl, 5), preg: { le: 25, fn: (g, x) => { vis(g, x.ctrl).filter(y => hasT(C(y), 'A')).forEach(y => y.atkPerm += 3); log(g, 'Gli agenti Acqua +3 ATK.'); } } });
card('A03', 'Maria delle Grazie', 'A', 'ag', 'E', 13, 11, 'Preghiera (PV ≤ 12): distruggi un agente avversario.', { preg: { le: 12, fn: (g, x) => destroyEff(g, oppThreat(g, x.ctrl)) } });
card('A04', 'Oceanina delle Maree', 'A', 'ag', 'R', 13, 9, 'Preghiera (PV ≤ 20): +5 ATK.', { preg: { le: 20, fn: (g, x) => { x.atkPerm += 5; } } });
card('A05', 'Monaco Silente', 'A', 'ag', 'R', 9, 10, '1/turno, se è in difesa: recuperi 2 PV.', { act: { label: 'Recuperi 2 PV', can: (g, x) => x.pos === 'def', fn: (g, x) => heal(g, x.ctrl, 2) }, aiAct: () => true });
card('A06', 'Ondina che Spegne il Rogo', 'A', 'ag', 'R', 14, 8, 'Quando combatte un agente Fuoco: +5 ATK nel calcolo.');
card('A07', 'Naiade della Sorgente', 'A', 'ag', 'C', 8, 9, 'Ingresso: recuperi 3 PV.', { onEnter: (g, x) => heal(g, x.ctrl, 3) });
card('A08', 'Apsara delle Acque', 'A', 'ag', 'C', 9, 8, 'Preghiera (PV ≤ 30): pesca un Evento a caso dal tuo mazzo.', { preg: { le: 30, fn: (g, x) => { const P = g.p[x.ctrl]; const ix = P.deck.map((id, i) => BY[id].k === 'mg' ? i : -1).filter(i => i >= 0); if (!ix.length) { log(g, 'Nessun Evento nel mazzo.'); return; } const [id] = P.deck.splice(ix[Math.floor(g.rand() * ix.length)], 1); P.hand.push(id); log(g, `${P.name} prende ${nm(id)} dal mazzo.`); } } });
card('A09', 'Spirito della Pioggia Buona', 'A', 'ag', 'C', 6, 10, 'Abisso: recuperi 4 PV.', { onAbyss: (g, x) => heal(g, x.ctrl, 4) });
card('A10', 'Kappa delle Risaie', 'A', 'ag', 'C', 10, 7, "Continuo: un agente Fuoco che l'attacca −3 ATK nel calcolo.");
card('A11', 'Melusina', 'A', 'ag', 'C', 9, 7, "Ingresso: se hai più PV dell'avversario, pesca 1.", { onEnter: (g, x) => { if (g.p[x.ctrl].hp > g.p[1 - x.ctrl].hp) drawCard(g, x.ctrl); } });
card('A12', 'Rusalka del Fiume', 'A', 'ag', 'C', 11, 8, '');
card('A13', 'Preghiera dei Monaci', 'A', 'mg', 'E', 0, 0, "Solo con PV ≤ 10: recuperi 12 PV e distruggi l'agente avversario con l'ATK più alto. Salti la tua prossima fase Attacco.", {
  can: (g, pi) => g.p[pi].hp <= 10, play: (g, pi) => { heal(g, pi, 12); destroyEff(g, pickR(g, vis(g, 1 - pi))); g.p[pi].skipAtk = g.turn; log(g, `${g.p[pi].name} salta la fase Attacco (penitenza).`); } });
card('A14', 'Il Diluvio Universale', 'A', 'mg', 'R', 0, 0, 'Distruggi un agente Fuoco con ATK ≤ 14.', { can: (g, pi) => !!oppThreat(g, pi, y => hasT(C(y), 'F') && atkC(g, y) <= 14), play: (g, pi) => destroyEff(g, oppThreat(g, pi, y => hasT(C(y), 'F') && atkC(g, y) <= 14)) });
card('A15', 'La Fonte della Giovinezza', 'A', 'mg', 'R', 0, 0, "Pesca 1 (2 se hai più PV dell'avversario).", { play: (g, pi) => { drawCard(g, pi); if (g.p[pi].hp > g.p[1 - pi].hp) drawCard(g, pi); } });
card('A16', 'Pioggia sui Campi', 'A', 'mg', 'C', 0, 0, "Recuperi 2 PV. Sequenza (dopo un agente Acqua): prendi un'altra Pioggia sui Campi dal tuo mazzo, se ne hai.", { play: (g, pi) => { const s = seqAfter(g, l => l.k === 'ag' && hasT(l, 'A')); heal(g, pi, 2); if (s) { seqLog(g, BY.A16); if (!searchDeck(g, pi, c => c.id === 'A16')) log(g, 'Nessuna Pioggia sui Campi nel mazzo.'); } } });
function chesedT(g, pi) { return pickR(g, vis(g, pi).filter(x => hasT(C(x), 'A') || hasT(C(x), 'R'))); }
card('A17', 'Chesed, la Misericordia', 'A', 'mg', 'C', 0, 0, 'Un tuo agente Acqua torna alla DEF originale +2.', { can: (g, pi) => !!chesedT(g, pi), play: (g, pi) => { const x = chesedT(g, pi); x.cur = maxDef(x); x.defPerm += 2; x.cur += 2; log(g, `${C(x).n} ripristina la DEF (+2).`); } });
card('A18', 'Il Tempio che Non Brucia', 'A', 'tr', 'R', 0, 0, "Condizione (all'attacco): un agente Fuoco avversario dichiara un attacco. Effetto: rimandalo in mano; l'attacco è annullato.", {
  trap: { on: 'declare', match: (g, ev, o) => ev.att.ctrl !== o && hasT(C(ev.att), 'F') && onField(g, ev.att), fire: (g, ev, o) => { toHand(g, ev.att); log(g, "L'attacco è annullato."); } } });
card('A19', 'Nebbia del Tempio', 'A', 'tr', 'C', 0, 0, "Condizione (all'attacco): un tuo agente in difesa viene attaccato. Effetto: prima del danno, torna alla DEF originale.", {
  trap: { on: 'declare', match: (g, ev, o) => ev.tgt && ev.tgt.pos === 'def' && ev.tgt.ctrl === o && onField(g, ev.tgt) && ev.tgt.cur < maxDef(ev.tgt), fire: (g, ev, o) => { ev.tgt.cur = maxDef(ev.tgt); log(g, `${C(ev.tgt).n} ripristina la DEF.`); } } });
card('A20', 'Marea che Restituisce', 'A', 'tr', 'C', 0, 0, 'Condizione: subisci danni ai PV. Effetto: recuperi metà del danno.', {
  trap: { on: 'damage', match: (g, ev, o) => ev.to === o && ev.n >= 2, fire: (g, ev, o) => heal(g, o, Math.floor(ev.n / 2)) } });

/* ---------- NATURA ---------- */
card('N01', "Il Maestro Hiram, Architetto del Tempio", 'N', 'ag', 'L', 24, 20, 'Patto: si gioca solo tramite Sviluppo su una pila di almeno 2 carte. Ingresso: pesca 1 per ogni carta nella pila.', {
  svilOnly: true, patto: { label: 'Sviluppo su pila di 2+ carte', can: () => false },
  svil: { cond: (g, pi, t) => t.ctrl === pi && t.under.length >= 1 && canNormal(g.p[pi]) },
  onEnter: (g, x) => { for (let i = 0; i < x.under.length + 1; i++) drawCard(g, x.ctrl); } });
card('N02', 'Dedalo, Costruttore del Labirinto', 'N', 'ag', 'E', 15, 11, 'Sviluppo (su un tuo agente Natura Raro o superiore): puoi fare un altro Sviluppo in questo turno.', {
  svil: { cond: (g, pi, t) => t.ctrl === pi && hasT(C(t), 'N') && C(t).r !== 'C', fn: (g, x) => { g.p[x.ctrl].svilMax = (g.p[x.ctrl].svilMax || 1) + 1; log(g, 'Sviluppo extra disponibile.'); } }, svilBase: c => hasT(c, 'N') && c.r !== 'C' });
card('N03', "Yggdrasil, l'Albero del Mondo", 'N', 'ag', 'E', 13, 13, 'Continuo: +2 ATK e +2 DEF per ogni carta nella sua pila.');
card('N04', 'I Costruttori di Babele', 'N', 'ag', 'R', 12, 10, 'Sviluppo (su un tuo agente Natura Comune): pesca 2.', {
  svil: { cond: (g, pi, t) => t.ctrl === pi && hasT(C(t), 'N') && C(t).r === 'C', fn: (g, x) => { drawCard(g, x.ctrl); drawCard(g, x.ctrl); } }, svilBase: c => hasT(c, 'N') && c.r === 'C' });
card('N05', 'Aida', 'N', 'ag', 'R', 8, 14, 'Sviluppo (su Marionetta Operaia): tutti gli agenti Natura in campo +1 ATK, anche quelli avversari.', {
  svil: { cond: (g, pi, t) => t.ctrl === pi && isMar(t.id), fn: (g, x) => { [...vis(g, 0), ...vis(g, 1)].filter(y => hasT(C(y), 'N')).forEach(y => y.atkPerm += 1); log(g, 'Tutti gli agenti Natura +1 ATK.'); } }, svilBase: c => isMar(c.id) });
card('N06', 'La Marea Nera', 'N', 'ag', 'R', 10, 8, 'Sviluppo (su un agente Acqua avversario Comune): la pila passa sotto il tuo controllo.', {
  svil: { steal: true, cond: (g, pi, t) => t.ctrl !== pi && hasT(C(t), 'A') && C(t).r === 'C' } });
card('N07', 'Carpentiere dei Moli', 'N', 'ag', 'C', 11, 6, 'Sviluppo (su Marionetta Operaia o Kodama): pesca 1.', {
  svil: { cond: (g, pi, t) => t.ctrl === pi && (isMar(t.id) || t.id === 'N10'), fn: (g, x) => drawCard(g, x.ctrl) }, svilBase: c => isMar(c.id) || c.id === 'N10' });
card('N08', 'Driade delle Radici', 'N', 'ag', 'C', 7, 10, 'Ingresso: un agente avversario non può attaccare nel suo prossimo turno.', {
  onEnter: (g, x) => { const t = pickR(g, vis(g, 1 - x.ctrl)); if (t) { t.noAtk = nextTurnOf(g, t.ctrl); log(g, `${C(t).n} è avvinghiato dalle radici.`); } } });
card('N09', 'Baba Jaga, la Casa che Cammina', 'N', 'ag', 'C', 12, 5, 'Continuo: gli agenti Acqua avversari −2 ATK.');
card('N10', 'Kodama, Spirito degli Alberi', 'N', 'ag', 'C', 7, 9, 'Abisso: pesca 1.', { onAbyss: (g, x) => drawCard(g, x.owner) });
card('N11', 'Marionetta Operaia', 'N', 'ag', 'C', 8, 9, '');
card('N12', 'Il Golem di Praga', 'N', 'ag', 'C', 13, 7, '');
card('N13', 'Il Grande Progetto', 'N', 'mg', 'E', 0, 0, 'Pesca 2. Puoi fare uno Sviluppo in più in questo turno. Sequenza (dopo uno Sviluppo): pesca 3.', {
  play: (g, pi) => { const s = seqAfter(g, l => l.svil); if (s) seqLog(g, BY.N13); for (let i = 0; i < (s ? 3 : 2); i++) drawCard(g, pi); g.p[pi].svilMax = (g.p[pi].svilMax || 1) + 1; } });
card('N14', 'Scie Chimiche', 'N', 'mg', 'R', 0, 0, 'Tutti gli agenti Acqua avversari −4 ATK e −4 DEF (permanente).', {
  can: (g, pi) => vis(g, 1 - pi).some(x => hasT(C(x), 'A')), play: (g, pi) => { vis(g, 1 - pi).filter(x => hasT(C(x), 'A')).forEach(x => { x.atkPerm -= 4; shrinkDef(g, x, 4); }); } });
card('N15', 'Squadra e Compasso', 'N', 'mg', 'R', 0, 0, "Recupera dall'Abisso un agente Natura e aggiungilo alla mano.", { can: (g, pi) => g.p[pi].abyss.some(id => BY[id].k === 'ag' && BY[id].t === 'N'), play: (g, pi) => recover(g, pi, c => hasT(c, 'N')) });
card('N16', 'Cantiere Navale', 'N', 'mg', 'C', 0, 0, 'Cerca nel mazzo un agente Natura Comune. Sequenza (dopo uno Sviluppo): cercane 2.', {
  can: (g, pi) => g.p[pi].deck.some(id => BY[id].k === 'ag' && BY[id].t === 'N' && BY[id].r === 'C'), play: (g, pi) => { const s = seqAfter(g, l => l.svil); if (s) seqLog(g, BY.N16); searchDeck(g, pi, c => c.k === 'ag' && hasT(c, 'N') && c.r === 'C', s ? 2 : 1); } });
card('N17', 'Linfa Selvaggia', 'N', 'mg', 'C', 0, 0, 'Un tuo agente Natura +4 ATK e +4 DEF fino a fine turno, +1/+1 per ogni dado Natura del tuo lancio.', { dice: true,
  can: (g, pi) => !!buffTarget(g, pi, 'N'), play: (g, pi) => { const x = buffTarget(g, pi, 'N'), n = 4 + rolled(g.p[pi], 'N'); x.atkTemp += n; x.defTemp += n; log(g, `${C(x).n} +${n}/+${n}.`); }, ai: (g, pi) => !!attackReady(g, pi, 'N') });
card('N18', 'Il Giuramento del Porto', 'N', 'tr', 'R', 0, 0, "Condizione: un tuo agente Natura va nell'Abisso. Effetto: evoca dall'Abisso un altro agente Natura Comune in difesa.", {
  trap: { on: 'abyss', match: (g, ev, o) => ev.owner === o && hasT(ev, 'N') && BY[ev.id].k === 'ag' && free(g.p[o]) >= 0 && hasAbyss(g, o, c => hasT(c, 'N') && c.r === 'C' && c.id !== ev.id), fire: (g, ev, o) => summonFromAbyss(g, o, c => hasT(c, 'N') && c.r === 'C' && c.id !== ev.id, 'def') } });
card('N19', 'Radici Profonde', 'N', 'tr', 'C', 0, 0, "Condizione: l'avversario gioca un agente. Effetto: non può attaccare in questo turno.", {
  trap: { on: 'summon', match: (g, ev, o) => ev.pi !== o && onField(g, ev.x), fire: (g, ev, o) => { ev.x.noAtk = g.turn; log(g, `${C(ev.x).n} non può attaccare in questo turno.`); } } });
card('N20', 'Il Bosco di Leshy', 'N', 'tr', 'C', 0, 0, "Condizione (dopo l'attacco): un agente avversario ha attaccato. Effetto: l'attaccante −4 DEF (permanente).", {
  trap: { on: 'attack', match: (g, ev, o) => ev.att.ctrl !== o && onField(g, ev.att), fire: (g, ev, o) => shrinkDef(g, ev.att, 4) } });

/* ---------- ROCCIA ---------- */
card('R01', 'Atlante che Solleva il Mondo', 'R', 'ag', 'L', 20, 30, 'Patto: hai attivato almeno 3 Resilienze in questa partita. Resilienza 1: rimanda in mano tutti gli agenti avversari in attacco.', {
  patto: { label: '3 Resilienze attivate', can: (g, pi) => g.p[pi].resil >= 3 }, resil: { n: 1, fn: (g, x) => { vis(g, 1 - x.ctrl).filter(y => y.pos === 'atk').forEach(y => toHand(g, y)); } } });
card('R02', 'Ymir, Padre dei Giganti', 'R', 'ag', 'E', 15, 6, "Detriti: +2 DEF all'inizio del turno. Resilienza 1: manda nell'Abisso un Presagio avversario.", { detriti: 2, resil: { n: 1, fn: (g, x) => { const O = g.p[1 - x.ctrl]; const k = O.traps.findIndex(Boolean); if (k < 0) { log(g, 'Nessun Presagio da distruggere.'); return; } const t = O.traps[k]; O.traps[k] = null; O.abyss.push(t.id); log(g, `${nm(t.id)} va nell'Abisso.`); } } });
card('R03', 'La Sfinge', 'R', 'ag', 'E', 0, 19, 'Continuo: ogni volta che un tuo agente Roccia attiva Resilienza, la Sfinge +1 ATK (permanente).');
card('R04', 'Lo Yeti delle Nevi Eterne', 'R', 'ag', 'R', 8, 16, 'Detriti: +2 DEF all\'inizio del turno. Resilienza 1: infliggi 5 PV.', { detriti: 2, resil: { n: 1, fn: (g, x) => dmg(g, 1 - x.ctrl, 5, 'eff') } });
card('R05', 'Behemoth', 'R', 'ag', 'R', 12, 13, "Detriti: +2 DEF all'inizio del turno. Resilienza 2: evoca dall'Abisso un agente Roccia Comune in difesa.", { detriti: 2, resil: { n: 2, fn: (g, x) => summonFromAbyss(g, x.ctrl, c => hasT(c, 'R') && c.r === 'C', 'def') } });
card('R06', 'Ziz, Re degli Uccelli', 'R', 'ag', 'R', 13, 11, 'Quando combatte un agente Fuoco: +5 ATK nel calcolo.');
card('R07', 'Troll di Pietra', 'R', 'ag', 'C', 7, 13, 'Detriti: +2 DEF all\'inizio del turno. Resilienza 1: infliggi 3 PV.', { detriti: 2, resil: { n: 1, fn: (g, x) => dmg(g, 1 - x.ctrl, 3, 'eff') } });
card('R08', 'Gargoyle', 'R', 'ag', 'C', 5, 14, "Detriti: +2 DEF all'inizio del turno. Continuo: un agente Fuoco che lo attacca −4 ATK nel calcolo.", { detriti: 2 });
card('R09', 'Civetta di Atena', 'R', 'ag', 'C', 6, 11, 'Ingresso: guarda le prime 3 carte del tuo mazzo e riordinale.', { onEnter: (g, x) => { const P = g.p[x.ctrl]; const top = P.deck.splice(0, 3).sort((a, b) => cval(b) - cval(a)); P.deck.unshift(...top); log(g, `${P.name} riordina la cima del mazzo.`); } });
card('R10', 'Tartaruga che Regge il Mondo', 'R', 'ag', 'C', 6, 13, 'Continuo: +3 ATK per ogni attacco subito. Jolly Sviluppo: vale come base per lo Sviluppo di qualsiasi carta fino a Rara.', { jolly: true });
card('R11', 'Colosso di Pietra', 'R', 'ag', 'C', 8, 13, 'Detriti: +2 DEF all\'inizio del turno. Non può essere distrutto da effetti di carte Fuoco.', { detriti: 2 });
card('R12', 'Sasquatch', 'R', 'ag', 'C', 12, 9, '');
card('R13', 'Le Porte di Agartha', 'R', 'mg', 'E', 0, 0, 'I tuoi agenti Roccia tornano alla DEF originale +3. Un tuo agente Roccia conta 1 attacco in più per la Resilienza.', {
  can: (g, pi) => vis(g, pi).some(x => hasT(C(x), 'R')), play: (g, pi) => { const rs = vis(g, pi).filter(x => hasT(C(x), 'R')); rs.forEach(x => { x.cur = maxDef(x); x.defPerm += 3; x.cur += 3; }); log(g, 'Gli agenti Roccia ripristinano la DEF (+3).'); const t = pickR(g, rs.filter(x => C(x).resil && !x.resilDone)); if (t) { t.resil++; log(g, `${C(t).n}: +1 attacco per la Resilienza.`); } } });
card('R14', 'Sottratto al Mondo', 'R', 'mg', 'R', 0, 0, 'Rimanda in mano un agente avversario non Leggendario.', { can: (g, pi) => !!oppThreat(g, pi, y => C(y).r !== 'L'), play: (g, pi) => toHand(g, oppThreat(g, pi, y => C(y).r !== 'L')) });
function valT(g, pi) { return pickR(g, vis(g, pi).filter(x => hasT(C(x), 'R') && dfn(g, x) >= 2)); }
card('R15', 'La Valanga', 'R', 'mg', 'R', 0, 0, 'Infliggi PV pari a metà della DEF di un tuo agente Roccia (max 8), +2 per ogni dado Roccia del tuo lancio.', { dice: true, can: (g, pi) => !!valT(g, pi) && dfn(g, valT(g, pi)) >= 2, play: (g, pi) => { const x = valT(g, pi); dmg(g, 1 - pi, Math.min(8, Math.floor(dfn(g, x) / 2)) + 2 * rolled(g.p[pi], 'R'), 'eff'); } });
card('R16', 'Corazza di Basalto', 'R', 'mg', 'C', 0, 0, 'Un tuo agente Roccia: il prossimo attacco che riceve non gli infligge danni (la Resilienza conta comunque).', { can: (g, pi) => vis(g, pi).some(x => hasT(C(x), 'R') && !x.shield), play: (g, pi) => { const x = pickR(g, vis(g, pi).filter(y => hasT(C(y), 'R') && !y.shield)); x.shield = true; log(g, `${C(x).n} è protetto dalla Corazza.`); } });
card('R17', 'Silenzio della Vetta', 'R', 'mg', 'C', 0, 0, 'Pesca 1. Sequenza (dopo un agente Roccia evocato in difesa): pesca 2.', { play: (g, pi) => { const s = seqAfter(g, l => l.k === 'ag' && hasT(l, 'R') && l.pos === 'def'); if (s) seqLog(g, BY.R17); drawCard(g, pi); if (s) drawCard(g, pi); } });
card('R18', 'Cerchio dei Menhir', 'R', 'tr', 'R', 0, 0, "Condizione (dopo l'attacco): un agente avversario ha attaccato un tuo agente Roccia in difesa. Effetto: Occulta l'attaccante (x2 se è un agente Fuoco).", {
  trap: { on: 'attack', match: (g, ev, o) => ev.tgt && ev.tgtDef && ev.tgtCtrl === o && hasT(C(ev.tgt), 'R') && onField(g, ev.att) && canOcc(ev.att), fire: (g, ev, o) => occult(g, ev.att, hasT(C(ev.att), 'F') ? 2 : 1) } });
card('R19', 'Muro degli Avi', 'R', 'tr', 'C', 0, 0, "Condizione (all'attacco): un tuo agente Roccia in difesa viene attaccato. Effetto: prima del danno, recupera 5 DEF.", {
  trap: { on: 'declare', match: (g, ev, o) => ev.tgt && ev.tgt.pos === 'def' && ev.tgt.ctrl === o && hasT(C(ev.tgt), 'R') && onField(g, ev.tgt) && ev.tgt.cur < maxDef(ev.tgt), fire: (g, ev, o) => { ev.tgt.cur = Math.min(maxDef(ev.tgt), ev.tgt.cur + 5); log(g, `${C(ev.tgt).n} recupera DEF.`); } } });
card('R20', 'Eco tra le Vette', 'R', 'tr', 'C', 0, 0, 'Condizione: un tuo agente Roccia attiva Resilienza. Effetto: infliggi 3 PV.', {
  trap: { on: 'resil', match: (g, ev, o) => ev.pi === o, fire: (g, ev, o) => dmg(g, 1 - o, 3, 'eff') } });

/* ---------- CELESTE ---------- */
card('C01', 'Metatron, Voce del Cubo', 'C', 'ag', 'L', 24, 22, 'Patto: almeno 2 agenti occultati in campo. Ingresso: Occulta fino a 2 agenti avversari con ATK ≤ 15.', {
  patto: { label: '2 agenti occultati in campo', can: g => allOcc(g) >= 2 },
  onEnter: (g, x) => { const t = [...vis(g, 0), ...vis(g, 1), ...g.p[0].zones, ...g.p[1].zones].filter((y, i, a) => y && isOcc(y) && a.indexOf(y) === i); if (!t.length) { log(g, 'Nessun agente occultato in campo.'); return; } t.forEach(y => { log(g, `${C(y).n} viene spinto fuori dal tempo.`); toAbyss(g, y, 'effect'); }); } });
card('C02', 'Angelo della Settima Tromba', 'C', 'ag', 'L', 26, 18, "Patto: manda nell'Abisso un tuo agente Fuoco e un tuo agente Celeste dal campo. Ingresso: distruggi un agente avversario non Leggendario.", {
  patto: { label: 'un tuo Fuoco e un tuo Celeste in campo', can: (g, pi) => vis(g, pi).some(x => hasT(C(x), 'F')) && vis(g, pi).some(x => hasT(C(x), 'C')), pay: (g, pi) => { for (const t of ['F', 'C']) toAbyss(g, bestBy(vis(g, pi).filter(x => C(x).t === t), x => -val(g, x)), 'cost'); } },
  onEnter: (g, x) => destroyEff(g, oppThreat(g, x.ctrl, y => C(y).r !== 'L')) });
card('C03', 'Annunaki, i Primi Visitatori', 'C', 'ag', 'E', 15, 11, "Ingresso: evoca dall'Abisso un agente Acqua o Roccia non Leggendario.", { onEnter: (g, x) => summonFromAbyss(g, x.ctrl, c => hasT(c, 'A') || hasT(c, 'R')) });
card('C04', 'Ofanim, le Ruote dagli Occhi', 'C', 'ag', 'E', 0, 22, "1/turno: Occulta un tuo agente o un agente avversario Comune, poi Ofanim passa in difesa e non può cambiare posizione fino al tuo prossimo turno. Non può essere occultato.", {
  act: { label: 'Occulta un agente', can: (g, x) => !!ofanimT(g, x), fn: (g, x) => { occult(g, ofanimT(g, x), 1); if (onField(g, x)) { x.pos = 'def'; x.changed = true; log(g, `${C(x).n} passa in difesa.`); } } },
  aiAct: (g, x) => !!attackReady(g, x.ctrl) || !!oppThreat(g, x.ctrl, y => C(y).r === 'C' && y.pos === 'atk') || (!oppThreat(g, x.ctrl, y => C(y).r === 'C' && canOcc(y)) && !!ofanimT(g, x)) });
/* bersaglio di Ofanim: un Comune avversario; altrimenti un tuo agente, solo se occultarlo serve (Metatron in mano, Occhio in campo) */
function ofanimT(g, x) { return oppThreat(g, x.ctrl, y => (C(y).r === 'C' || C(y).r === 'R') && canOcc(y)); }
card('C05', 'Serafino dalle Sei Ali', 'C', 'ag', 'R', 12, 10, 'Ingresso: Occulta un agente avversario.', { onEnter: (g, x) => { const t = oppThreat(g, x.ctrl, canOcc); if (t) occult(g, t, 1); } });
card('C06', "L'Occhio che Tutto Vede", 'C', 'ag', 'R', 9, 11, 'Continuo: +3 ATK per ogni agente occultato in campo.');
card('C07', "Gavri'El", 'C', 'ag', 'R', 15, 7, 'Se controlli un agente Fuoco: quando distrugge un agente, infliggi 3 PV.', { onKill: (g, x) => { if (vis(g, x.ctrl).some(y => hasT(C(y), 'F'))) dmg(g, 1 - x.ctrl, 3, 'eff'); } });
card('C08', 'Valchiria', 'C', 'ag', 'C', 10, 8, 'Ingresso: se controlli un agente Acqua o Roccia, pesca 1.', { onEnter: (g, x) => { if (vis(g, x.ctrl).some(y => ['A', 'R'].includes(C(y).t))) drawCard(g, x.ctrl); } });
card('C09', 'Nephilim, Figli dei Vigilanti', 'C', 'ag', 'C', 8, 10, 'Ingresso: puoi Occultare un tuo agente.', {
  onEnter: (g, x) => { const P = g.p[x.ctrl]; const wants = P.hand.includes('C01') || vis(g, x.ctrl).some(y => y.id === 'C06'); if (!wants) return; const t = bestBy(vis(g, x.ctrl).filter(y => y !== x && canOcc(y)), y => -val(g, y)) || x; occult(g, t, 1); } });
card('C10', 'Apertura della Quarta Dimensione', 'C', 'mg', 'E', 0, 0, 'Occulta x2 un agente avversario. Rilancia 1 dado non utilizzato per ogni agente occultato in campo.', { dice: true,
  can: (g, pi) => !!oppThreat(g, pi, canOcc), play: (g, pi) => { occult(g, oppThreat(g, pi, canOcc), 2); rerollWorst(g, pi, allOcc(g)); } });
card('C11', 'Il Ritorno degli Antichi', 'C', 'mg', 'R', 0, 0, "Evoca dall'Abisso un agente Celeste Comune o Raro (senza pagare dadi). Sequenza (dopo un'Occulta): anche Epico.", {
  can: (g, pi) => free(g.p[pi]) >= 0 && hasAbyss(g, pi, c => hasT(c, 'C') && (c.r !== 'E' || seqAfter(g, l => l.occ))),
  play: (g, pi) => { const s = seqAfter(g, l => l.occ); if (s) seqLog(g, BY.C11); summonFromAbyss(g, pi, c => hasT(c, 'C') && (s || c.r !== 'E')); } });
function sefTypes(g, pi) { const t = typesOn(g, pi); return ['A', 'R', 'C'].filter(k => t.has(k)).length; }
card('C12', "L'Albero delle Sefirot", 'C', 'mg', 'R', 0, 0, 'Un tuo agente +3 ATK e +3 DEF (permanente) per ogni tipo tra Acqua, Roccia e Celeste che controlli.', {
  can: (g, pi) => sefTypes(g, pi) > 0, play: (g, pi) => { const n = 3 * sefTypes(g, pi); const x = buffTarget(g, pi); x.atkPerm += n; x.defPerm += n; x.cur += n; log(g, `${C(x).n} +${n}/+${n}.`); } });
card('C13', 'Velo degli Antichi', 'C', 'mg', 'C', 0, 0, 'Occulta un agente, tuo o avversario. Sequenza (dopo un agente Celeste): Occulta x2.', {
  can: (g, pi) => !!oppThreat(g, pi, canOcc), play: (g, pi) => { const s = seqAfter(g, l => l.k === 'ag' && hasT(l, 'C')); if (s) seqLog(g, BY.C13); occult(g, oppThreat(g, pi, canOcc), s ? 2 : 1); },
  ai: (g, pi) => !!attackReady(g, pi) || g.p[pi].hand.includes('C01') || vis(g, pi).some(x => x.id === 'C06') });
card('C14', "Sguardo dell'Antico", 'C', 'tr', 'E', 0, 0, "Condizione: l'avversario gioca un agente. Effetto: Occulta x2 quell'agente.", {
  trap: { on: 'summon', match: (g, ev, o) => ev.pi !== o && onField(g, ev.x) && canOcc(ev.x) && !isOcc(ev.x), fire: (g, ev, o) => occult(g, ev.x, 2) } });
card('C15', "Adam Kadmon, l'Uomo Primordiale", 'C', 'tr', 'C', 0, 0, "Condizione: un tuo agente Celeste va nell'Abisso. Effetto: riprendilo in mano.", {
  trap: { on: 'abyss', match: (g, ev, o) => ev.owner === o && hasT(ev, 'C') && BY[ev.id].k === 'ag' && g.p[o].abyss.includes(ev.id), fire: (g, ev, o) => { const A = g.p[o].abyss; A.splice(A.lastIndexOf(ev.id), 1); g.p[o].hand.push(ev.id); log(g, `${nm(ev.id)} torna in mano.`); } } });

/* ---------- NEUTRALE ---------- */
card('X01', 'Campione dei Cinque Regni', 'X', 'ag', 'L', 24, 18, 'Patto: controlli agenti di almeno 3 tipi. Continuo: +2 ATK per ogni tipo diverso tra le carte del tuo Abisso.', { patto: { label: 'agenti di 3 tipi in campo', can: (g, pi) => typesOn(g, pi).size >= 3 } });
card('X02', 'Gran Maestro dei Templari', 'X', 'ag', 'E', 15, 11, 'Ingresso: evoca dalla mano un agente Neutrale Comune (senza pagare dadi).', {
  onEnter: (g, x) => { const P = g.p[x.ctrl]; if (free(P) < 0) return; let bi = -1, bv = -1; P.hand.forEach((id, i) => { const c = BY[id]; if (c.k === 'ag' && hasT(c, 'X') && c.r === 'C' && cval(id) > bv) { bv = cval(id); bi = i; } }); if (bi < 0) return; const [id] = P.hand.splice(bi, 1); const y = placeNew(g, x.ctrl, id, choosePos(g, x.ctrl, BY[id])); log(g, `${P.name} evoca ${nm(id)}.`); afterEnter(g, x.ctrl, y, 'special'); } });
card('X03', 'Automa del Laboratorio Segreto', 'X', 'ag', 'E', 17, 9, 'Non può essere occultato.');
card('X04', 'Capitano dei Templari Neri', 'X', 'ag', 'R', 12, 9, 'Continuo: gli altri tuoi agenti Neutrali +2 ATK.');
card('X05', 'Tiratore Scelto', 'X', 'ag', 'R', 15, 6, "Può attaccare direttamente i PV anche se l'avversario ha agenti, a metà danno.");
card('X06', 'Corsaro dello Stretto', 'X', 'ag', 'R', 13, 8, 'Quando distrugge un agente in battaglia, pesca 1.', { onKill: (g, x) => drawCard(g, x.ctrl) });
card('X07', 'Sentinella del Cubo', 'X', 'ag', 'R', 11, 10, 'Resilienza 1: infliggi 4 PV.', { resil: { n: 1, fn: (g, x) => dmg(g, 1 - x.ctrl, 4, 'eff') } });
card('X08', 'Operaio del Porto', 'X', 'ag', 'C', 9, 7, 'Sviluppo (su un tuo agente Neutrale o Natura): pesca 1.', { svil: { cond: (g, pi, t) => t.ctrl === pi && (hasT(C(t), 'X') || hasT(C(t), 'N')), fn: (g, x) => drawCard(g, x.ctrl) }, svilBase: c => hasT(c, 'X') || hasT(c, 'N') });
card('X09', 'Saggio del Cubo', 'X', 'ag', 'C', 9, 8, 'Ingresso: rilancia un tuo dado non utilizzato.', { dice: true, onEnter: (g, x) => rerollWorst(g, x.ctrl, 1) });
card('X10', 'Medico della Peste', 'X', 'ag', 'C', 8, 8, "Ingresso: recuperi 3 PV. Continuo: se è in attacco e viene attaccato da un agente Natura, subisci comunque il danno ma non va nell'Abisso.", { onEnter: (g, x) => heal(g, x.ctrl, 3) });
card('X11', 'Superstite della Diaspora', 'X', 'ag', 'C', 10, 7, 'Ingresso: se controlli agenti di 2 tipi diversi, pesca 1.', { onEnter: (g, x) => { if (typesOn(g, x.ctrl).size >= 2) drawCard(g, x.ctrl); } });
card('X12', 'Mercenario senza Bandiera', 'X', 'ag', 'C', 14, 5, "Abisso: l'avversario recupera 3 PV.", { onAbyss: (g, x) => heal(g, 1 - x.owner, 3) });
card('X13', 'Soldato del Terzo Regno', 'X', 'ag', 'C', 12, 8, '');
card('X14', 'Novizio dei Templari Neri', 'X', 'ag', 'C', 9, 11, '');
card('X15', 'Il Gioco dei Rotoli', 'X', 'mg', 'L', 0, 0, "Patto: almeno 10 carte nel tuo Abisso. Guarda le prime 3 carte del mazzo avversario: mandane una nell'Abisso e riordina le altre.", {
  patto: { label: '10 carte nel tuo Abisso', can: (g, pi) => g.p[pi].abyss.length >= 10 },
  can: (g, pi) => g.p[1 - pi].deck.length > 0,
  play: (g, pi) => { const O = g.p[1 - pi]; const top = O.deck.splice(0, 3).sort((a, b) => cval(b) - cval(a)); const [id] = top.splice(0, 1); O.abyss.push(id); log(g, `${nm(id)} dal mazzo di ${O.name} va nell'Abisso.`); O.deck.unshift(...top.sort((a, b) => cval(a) - cval(b))); log(g, `${g.p[pi].name} riordina il futuro dell'avversario.`); } });
card('X16', 'Alleanza del Sud', 'X', 'mg', 'E', 0, 0, 'Se controlli agenti di 2 o più tipi: pesca 2 e un tuo agente +5 ATK fino a fine turno.', { can: (g, pi) => typesOn(g, pi).size >= 2, play: (g, pi) => { drawCard(g, pi); drawCard(g, pi); const x = buffTarget(g, pi); x.atkTemp += 5; log(g, `${C(x).n} +5 ATK.`); } });
card('X17', "La Mappa dell'Est", 'X', 'mg', 'R', 0, 0, 'Guarda le prime 3 carte del tuo mazzo: prendine 1, metti le altre in fondo.', {
  can: (g, pi) => g.p[pi].deck.length > 0, play: (g, pi) => { const P = g.p[pi]; const top = P.deck.splice(0, 3); top.sort((a, b) => cval(b) - cval(a)); P.hand.push(top.shift()); P.deck.push(...top); log(g, `${P.name} prende una carta dalla cima del mazzo.`); } });
card('X18', 'Rinforzi della Corona', 'X', 'mg', 'R', 0, 0, 'Evoca dalla mano un agente Comune in difesa (senza pagare dadi). Sequenza (dopo un agente Neutrale): evocalo in attacco.', {
  can: (g, pi) => free(g.p[pi]) >= 0 && g.p[pi].hand.some(id => BY[id].k === 'ag' && BY[id].r === 'C'),
  play: (g, pi) => { const s = seqAfter(g, l => l.k === 'ag' && hasT(l, 'X')); if (s) seqLog(g, BY.X18); const P = g.p[pi]; let bi = -1, bv = -1; P.hand.forEach((id, i) => { const c = BY[id]; if (c.k === 'ag' && c.r === 'C' && cval(id) > bv) { bv = cval(id); bi = i; } }); const [id] = P.hand.splice(bi, 1); const y = placeNew(g, pi, id, s ? 'atk' : 'def'); log(g, `${P.name} evoca ${nm(id)}.`); afterEnter(g, pi, y, 'special'); } });
card('X19', 'Lama del Viandante', 'X', 'mg', 'C', 0, 0, 'Un tuo agente +4 ATK fino a fine turno. Sequenza (dopo un Evento): +6.', {
  can: (g, pi) => !!buffTarget(g, pi), play: (g, pi) => { const s = seqAfter(g, l => l.k === 'mg'); if (s) seqLog(g, BY.X19); const x = buffTarget(g, pi); x.atkTemp += s ? 6 : 4; log(g, `${C(x).n} +${s ? 6 : 4} ATK.`); }, ai: (g, pi) => !!attackReady(g, pi) });
card('X20', 'Razione da Campo', 'X', 'mg', 'C', 0, 0, 'Recuperi 5 PV.', { play: (g, pi) => heal(g, pi, 5), ai: (g, pi) => g.p[pi].hp <= 35 });
card('X21', 'Il Cubo si Chiude', 'X', 'tr', 'L', 0, 0, "Patto: hai meno PV dell'avversario. Condizione (all'attacco): l'avversario dichiara un attacco. Effetto: annulla l'attacco e Occulta tutti i suoi agenti in attacco.", {
  patto: { label: "meno PV dell'avversario", can: (g, pi) => g.p[pi].hp < g.p[1 - pi].hp },
  trap: { on: 'declare', match: (g, ev, o) => ev.att.ctrl !== o, fire: (g, ev, o) => { ev.negated = true; log(g, "L'attacco è annullato."); vis(g, 1 - o).filter(y => y.pos === 'atk').forEach(y => occult(g, y, 1)); } } });
card('X22', 'Imboscata', 'X', 'tr', 'R', 0, 0, "Condizione: l'avversario gioca un agente con ATK ≤ 12. Effetto: distruggilo.", {
  trap: { on: 'summon', match: (g, ev, o) => ev.pi !== o && onField(g, ev.x) && !isOcc(ev.x) && atkC(g, ev.x) <= 12, fire: (g, ev, o) => destroyEff(g, ev.x) } });
card('X23', 'Filo Spinato', 'X', 'tr', 'C', 0, 0, "Condizione (dopo l'attacco): un agente avversario ha attaccato un tuo agente in difesa. Effetto: l'attaccante −4 DEF (permanente).", {
  trap: { on: 'attack', match: (g, ev, o) => ev.tgt && ev.tgtDef && ev.tgtCtrl === o && onField(g, ev.att), fire: (g, ev, o) => shrinkDef(g, ev.att, 4) } });
card('X24', 'Rifugio Sotterraneo', 'X', 'tr', 'C', 0, 0, 'Condizione: subisci un attacco diretto. Effetto: recuperi 4 PV.', { trap: { on: 'direct', match: (g, ev, o) => ev.to === o, fire: (g, ev, o) => heal(g, o, 4) } });
card('X25', 'Gli Uomini in Nero', 'X', 'tr', 'C', 0, 0, "Condizione: l'avversario posiziona un Presagio. Effetto: guardalo, poi resta coperto.", { trap: { on: 'setTrap', match: (g, ev, o) => ev.pi !== o && !!g.p[ev.pi].traps[ev.z], fire: (g, ev, o) => { const t = g.p[ev.pi].traps[ev.z]; t.known = true; log(g, `${g.p[o].name} ha visto il Presagio avversario.`); if (t.id === 'SS2') counterSpy(g, ev.pi); } } });
function counterSpy(g, pi) { log(g, 'Controspionaggio!'); const t = pickR(g, vis(g, 1 - pi).filter(y => ['C', 'R', 'E'].includes(C(y).r))); if (t) { log(g, `${C(t).n} viene mandato nell'Abisso.`); toAbyss(g, t, 'effect'); } else log(g, 'Nessun agente avversario fino a Epico.'); }


/* ---------- FUORISERIE (BS-121 – 130) ---------- */
const NEVER = { on: 'never', match: () => false, fire: () => {} };
card('Z21', "Il Rotolo dell'Alba", 'C', 'tr', 'U', 0, 0, "Sigillo: non scatta mai. Se all'inizio del tuo turno hai 10 PV o meno e controlli i tre Rotoli posati in tre turni diversi nell'ordine Alba, Lacrima, Stella, vinci la partita.", { fs: true, trap: NEVER });
card('Z22', 'Il Rotolo della Lacrima', 'C', 'tr', 'U', 0, 0, "Sigillo: non scatta mai. Secondo dei tre Rotoli: va posato dopo il Rotolo dell'Alba e prima del Rotolo della Stella.", { fs: true, trap: NEVER });
card('Z23', 'Il Rotolo della Stella', 'C', 'tr', 'U', 0, 0, "Sigillo: non scatta mai. Terzo dei tre Rotoli: va posato per ultimo, in un turno successivo agli altri due.", { fs: true, trap: NEVER });
card('Z24', 'Il Drago dalle Sette Corone', 'F', 'ag', 'L', 32, 18, "Patto: si gioca solo tramite Sviluppo sul Drago Rosso dell'Apocalisse. Ingresso: l'avversario perde PV pari all'ATK totale dei suoi agenti in attacco.", { fs: true, t2: 'C', svilOnly: true,
  patto: { label: "Sviluppo sul Drago Rosso dell'Apocalisse", can: () => false },
  svil: { cond: (g, pi, t) => t.ctrl === pi && t.id === 'F01' && canNormal(g.p[pi]) },
  onEnter: (g, x) => { const n = vis(g, 1 - x.ctrl).filter(y => y.pos === 'atk').reduce((s, y) => s + atkC(g, y), 0); if (n) dmg(g, 1 - x.ctrl, n, 'eff'); else log(g, 'Nessun agente avversario in attacco.'); } });
card('Z25', 'Colui che Unisce la Terra', 'R', 'ag', 'L', 0, 0, "Patto: manda nell'Abisso 3 tuoi agenti Roccia. Ingresso: il suo ATK diventa la somma delle loro DEF. Continuo: ogni volta che evochi un agente Roccia, +ATK pari alla sua DEF.", { fs: true,
  patto: { label: '3 tuoi agenti Roccia in campo', can: (g, pi) => vis(g, pi).filter(x => hasT(C(x), 'R')).length >= 3,
    pay: (g, pi) => { const rs = vis(g, pi).filter(x => hasT(C(x), 'R')).sort((a, b) => dfn(g, b) - dfn(g, a)).slice(0, 3); g.p[pi].colSum = rs.reduce((s, x) => s + Math.max(0, dfn(g, x)), 0); rs.forEach(x => toAbyss(g, x, 'cost')); } },
  onEnter: (g, x) => { const n = g.p[x.ctrl].colSum || 0; x.atkPerm += n; log(g, `${C(x).n} assorbe la montagna: +${n} ATK.`); } });
card('Z26', "L'Arca dell'Alleanza", 'A', 'mg', 'L', 0, 0, "Patto: hai 20 PV o meno. Fino all'inizio del tuo terzo turno successivo non subisci danni ai PV, ma i tuoi agenti non possono attaccare.", { fs: true, t2: 'C',
  patto: { label: '20 PV o meno', can: (g, pi) => g.p[pi].hp <= 20 },
  play: (g, pi) => { g.p[pi].arca = g.turn + 6; log(g, `L'Arca protegge ${g.p[pi].name}.`); } });
const marionette = (g, pi) => { const P = g.p[pi]; let n = [...P.deck, ...P.abyss, ...P.hand].filter(isMar).length; for (const x of P.zones) if (x) n += [x.id, ...x.under].filter(isMar).length; return n; };
card('Z27', "L'Ingranaggio del Mondo", 'N', 'mg', 'L', 0, 0, "Patto: hai 3 Marionette Operaie tra mazzo, mano, Abisso e campo. In questo turno puoi fare 2 Sviluppi. Continuo: l'agente in cima a ogni tua pila con una Marionetta Operaia alla base +2 ATK e +2 DEF per ogni carta della pila.", { fs: true, t2: 'C',
  patto: { label: '3 Marionette Operaie tra mazzo, mano, Abisso e campo', can: (g, pi) => marionette(g, pi) >= 3 },
  play: (g, pi) => { const P = g.p[pi]; P.svilMax = 2; P.gear = true; log(g, `L'Ingranaggio del Mondo si mette in moto.`); } });
const idiT = (g, pi) => oppThreat(g, pi, y => hasT(C(y), 'X') && C(y).r === 'E');
const idiTrap = (g, pi) => g.p[1 - pi].traps.findIndex(t => t && hasT(BY[t.id], 'X') && BY[t.id].r === 'E');
card('Z28', 'Le Idi di Marzo', 'X', 'mg', 'E', 0, 0, "Manda nell'Abisso una carta Neutrale Epica dell'avversario, anche un Presagio coperto.", { fs: true,
  can: (g, pi) => !!idiT(g, pi) || idiTrap(g, pi) >= 0,
  play: (g, pi) => { const t = idiT(g, pi); if (t) return destroyEff(g, t); const O = g.p[1 - pi], k = idiTrap(g, pi); const tr = O.traps[k]; O.traps[k] = null; O.abyss.push(tr.id); log(g, `${nm(tr.id)} va nell'Abisso.`); } });
card('Z29', 'Il Giudizio degli Antichi', 'X', 'tr', 'E', 0, 0, "Condizione: l'avversario gioca un agente Fuoco. Effetto: tutti gli agenti in campo vanno nell'Abisso.", { fs: true,
  trap: { on: 'summon', match: (g, ev, o) => ev.pi !== o && hasT(C(ev.x), 'F'), fire: (g, ev, o) => { [...vis(g, 0), ...vis(g, 1)].forEach(x => toAbyss(g, x, 'effect')); } } });
card('Z30', 'Tradimento', 'X', 'ag', 'L', 22, 18, "Patto: manda nell'Abisso 2 tuoi agenti Neutrali. Ingresso: prendi il controllo definitivo di un agente avversario non Leggendario (non attacca in questo turno).", { fs: true,
  patto: { label: '2 tuoi agenti Neutrali in campo', can: (g, pi) => vis(g, pi).filter(x => hasT(C(x), 'X')).length >= 2,
    pay: (g, pi) => { vis(g, pi).filter(x => hasT(C(x), 'X')).sort((a, b) => val(g, a) - val(g, b)).slice(0, 2).forEach(x => toAbyss(g, x, 'cost')); } },
  onEnter: (g, x) => { const pi = x.ctrl, P = g.p[pi]; if (free(P) < 0) return; const t = oppThreat(g, pi, y => C(y).r !== 'L'); if (!t) return; removeFromField(g, t); t.ctrl = pi; t.ret = null; t.attacked = true; P.zones[free(P)] = t; log(g, `${C(t).n} tradisce e passa a ${P.name}.`); } });

/* ---------- SET TEMATICI (fuori dal set base, si sbloccano con eventi) ---------- */
const AUTO3 = ['TC1', 'TC2', 'TC3'];
const pileIds = x => [x.id, ...x.under];
card('TC1', 'La Colomba di Archita', 'X', 'ag', 'C', 7, 8, 'Ingresso: cerca nel mazzo un altro dei tre automi (Colomba, Teatro, Suonatore).', { set: 'TC', code: 'TC-01', auto: true,
  onEnter: (g, x) => searchDeck(g, x.ctrl, c => AUTO3.includes(c.id) && c.id !== 'TC1') });
card('TC2', 'Il Teatro di Erone', 'X', 'ag', 'C', 9, 9, "Sviluppo (su un automa, una Marionetta Operaia o l'Automa del Laboratorio Segreto): pesca 1.", { set: 'TC', code: 'TC-02', auto: true,
  svil: { cond: (g, pi, t) => t.ctrl === pi && (C(t).auto || isMar(t.id) || t.id === 'X03'), fn: (g, x) => drawCard(g, x.ctrl) }, svilBase: c => !!c.auto || isMar(c.id) || c.id === 'X03' });
card('TC3', 'Il Suonatore di al-Jazari', 'X', 'ag', 'C', 11, 7, 'Sviluppo (su un automa): la pila +3 DEF e non può essere occultata.', { set: 'TC', code: 'TC-03', auto: true,
  svil: { cond: (g, pi, t) => t.ctrl === pi && !!C(t).auto, fn: (g, x) => { x.defPerm += 3; x.cur += 3; x.noOcc = true; x.pileDef = (x.pileDef || 0) + 3; x.pileNoOcc = true; log(g, "La pila suona: +3 DEF e immune all'Occulta."); } }, svilBase: c => !!c.auto });
card('TC4', 'Il Cavaliere Meccanico', 'X', 'ag', 'L', 26, 22, 'Patto: si gioca solo tramite Sviluppo su una pila che contiene Colomba, Teatro e Suonatore. Continuo: non può essere distrutto da effetti; +2 ATK per ogni automa nel tuo Abisso.', { set: 'TC', code: 'TC-04', auto: true, svilOnly: true,
  patto: { label: 'Sviluppo su una pila con Colomba, Teatro e Suonatore', can: () => false },
  svil: { cond: (g, pi, t) => t.ctrl === pi && AUTO3.every(id => pileIds(t).includes(id)) && canNormal(g.p[pi]) } });
const emisT = (g, pi) => bestBy(vis(g, pi).filter(y => C(y).emis && canOcc(y)), y => -val(g, y));
card('AN1', 'Soldato Emissario degli Antichi', 'R', 'ag', 'C', 12, 9, 'Continuo: +2 ATK per ogni altro Emissario nel tuo campo.', { set: 'AN', code: 'AN-01', emis: true });
card('AN2', 'Araldo Emissario degli Antichi', 'C', 'ag', 'R', 10, 12, 'Ingresso: cerca nel mazzo un Emissario o la Merkabah.', { set: 'AN', code: 'AN-02', emis: true,
  onEnter: (g, x) => searchDeck(g, x.ctrl, c => c.emis || c.id === 'AN4') });
card('AN3', 'Custode Emissario degli Antichi', 'A', 'ag', 'E', 15, 15, "Continuo: l'avversario non può occultare i tuoi Emissari. 1/turno: Occulta un tuo Emissario (lo metti al sicuro in un'altra dimensione).", { set: 'AN', code: 'AN-03', emis: true,
  act: { label: 'Occulta un tuo Emissario', can: (g, x) => !!emisT(g, x.ctrl), fn: (g, x) => occult(g, emisT(g, x.ctrl), 1) }, aiAct: () => false });
card('AN4', 'La Merkabah, il Carro', 'C', 'mg', 'R', 0, 0, 'Occulta un tuo agente. Quando riappare: +6 ATK (permanente).', { set: 'AN', code: 'AN-04', t2: 'F',
  can: (g, pi) => vis(g, pi).some(canOcc), play: (g, pi) => { const x = bestBy(vis(g, pi).filter(canOcc), y => atkC(g, y)); if (occult(g, x, 1)) x.merk = true; },
  ai: (g, pi) => vis(g, pi).length >= 2 });
const detrN = (g, pi) => vis(g, pi).filter(y => detr(y)).length;
card('VU1', 'Pele, Signora del Kilauea', 'F', 'ag', 'R', 13, 8, 'Ingresso: un tuo agente con Detriti +4 DEF. Abisso: cerca nel mazzo una Colata di Lava.', { set: 'VU', code: 'VU-01',
  onEnter: (g, x) => { const t = bestBy(vis(g, x.ctrl).filter(y => detr(y)), y => -dfn(g, y)); if (t) { t.defPerm += 4; t.cur += 4; log(g, `${C(t).n} +4 DEF.`); } },
  onAbyss: (g, x) => searchDeck(g, x.owner, c => c.id === 'VU3') });
card('VU2', "Tifeo sotto l'Etna", 'R', 'ag', 'E', 12, 14, "Detriti: +2 DEF all'inizio del turno. Continuo: i tuoi Eventi Fuoco infliggono +2 PV.", { set: 'VU', code: 'VU-02', t2: 'F', detriti: 2 });
card('VU3', 'Colata di Lava', 'F', 'mg', 'C', 0, 0, 'Infliggi 2 PV per ogni tuo agente con Detriti. Sequenza (dopo Pele): 3 PV per ciascuno.', { set: 'VU', code: 'VU-03',
  can: (g, pi) => detrN(g, pi) > 0, play: (g, pi) => { const s = seqAfter(g, l => l.id === 'VU1'); if (s) seqLog(g, BY.VU3); dmg(g, 1 - pi, detrN(g, pi) * (s ? 3 : 2), 'eff'); } });
card('VU4', 'Cenere su Pompei', 'F', 'tr', 'R', 0, 0, "Condizione (all'attacco): un tuo agente con Detriti viene attaccato. Effetto: Occulta l'attaccante (l'attacco è annullato); se controlli Tifeo, distruggilo invece.", { set: 'VU', code: 'VU-04',
  trap: { on: 'declare', match: (g, ev, o) => ev.att.ctrl !== o && ev.tgt && ev.tgt.ctrl === o && detr(ev.tgt) > 0 && onField(g, ev.att), fire: (g, ev, o) => { if (vis(g, o).some(y => y.id === 'VU2')) destroyEff(g, ev.att); else occult(g, ev.att, 1); } } });
const molesIn = (g, pi) => g.p[pi].deck.filter(id => id === 'SS1X').length;
card('SS1', 'La Talpa', 'X', 'ag', 'R', 6, 6, "Ingresso: va nel mazzo dell'avversario. Quando l'avversario la pesca, perde 8 PV e la Talpa va nel tuo Abisso.", { set: 'SS', code: 'SS-01',
  onEnter: (g, x) => { const pi = x.ctrl, O = g.p[1 - pi]; removeFromField(g, x); const k = Math.floor(g.rand() * (O.deck.length + 1)); O.deck.splice(k, 0, 'SS1X'); (O.moles = O.moles || []).push(pi); log(g, `La Talpa si infiltra nel mazzo di ${O.name}.`); } });
card('SS1X', 'Talpa infiltrata', 'X', 'ag', 'R', 0, 0, 'Quando la peschi perdi 8 PV.', { token: true, code: 'SS-01' });
card('SS2', 'Controspionaggio', 'X', 'tr', 'C', 0, 0, "Condizione: viene rivelato da un effetto avversario. Effetto: l'avversario ti mostra un suo Presagio.", { set: 'SS', code: 'SS-02', trap: NEVER });
card('SS3', 'Colpo di Intelligence', 'X', 'mg', 'R', 0, 0, "Se nel mazzo avversario ci sono almeno 2 Talpe infiltrate, l'avversario scarta 2 carte dalla mano.", { set: 'SS', code: 'SS-03',
  can: (g, pi) => molesIn(g, 1 - pi) >= 2, play: (g, pi) => { const O = g.p[1 - pi]; for (let k = 0; k < 2 && O.hand.length; k++) { const [id] = O.hand.splice(Math.floor(g.rand() * O.hand.length), 1); O.abyss.push(id); log(g, `${O.name} scarta ${nm(id)}.`); } } });
card('SS4', 'Il Doppiogiochista', 'X', 'ag', 'R', 12, 9, "Ingresso: se nel mazzo avversario c'è una Talpa infiltrata, mettila in cima.", { set: 'SS', code: 'SS-04',
  onEnter: (g, x) => { const O = g.p[1 - x.ctrl]; const k = O.deck.indexOf('SS1X'); if (k > 0) { O.deck.splice(k, 1); O.deck.unshift('SS1X'); log(g, 'Il Doppiogiochista sposta una Talpa in cima al mazzo avversario.'); } } });
const BYF = c => !!c.byffo;
card('BY1', 'Byffo Morbidino', 'X', 'ag', 'C', 4, 6, "Abisso: evoca dall'Abisso un altro Byffo in difesa.", { set: 'BY', code: 'BY-01', byffo: true,
  onAbyss: (g, x) => summonFromAbyss(g, x.owner, c => BYF(c) && c.id !== 'BY1', 'def') });
card('BY2', 'Byffo Abbraccio', 'X', 'ag', 'C', 3, 8, "Ingresso: prendi il controllo di un agente avversario Comune fino a fine turno, poi va nell'Abisso.", { set: 'BY', code: 'BY-02', byffo: true,
  onEnter: (g, x) => { const pi = x.ctrl, P = g.p[pi]; if (free(P) < 0) return; const t = pickR(g, vis(g, 1 - pi).filter(y => C(y).r === 'C' && y.ret == null)); if (!t) return; removeFromField(g, t); t.ret = t.ctrl; t.ctrl = pi; t.hug = true; t.attacked = true; P.zones[free(P)] = t; log(g, `${C(t).n} viene abbracciato dal Byffo.`); } });
function blindBox(g, pi, n) { const P = g.p[pi]; for (let k = 0; k < n; k++) { if (free(P) < 0) return; const ix = P.deck.map((id, i) => BYF(BY[id]) && BY[id].k === 'ag' && BY[id].r !== 'L' ? i : -1).filter(i => i >= 0); if (!ix.length) { log(g, 'Nessun Byffo nel mazzo.'); return; } const [id] = P.deck.splice(ix[Math.floor(g.rand() * ix.length)], 1); const y = placeNew(g, pi, id, choosePos(g, pi, BY[id])); log(g, `Dalla Scatola Cieca esce ${nm(id)}!`); afterEnter(g, pi, y, 'special'); } }
card('BY3', 'La Scatola Cieca', 'X', 'mg', 'R', 0, 0, 'Evoca un Byffo a caso dal tuo mazzo (senza pagare dadi). Sequenza (dopo un Byffo): due.', { set: 'BY', code: 'BY-03', byffo: true,
  can: (g, pi) => free(g.p[pi]) >= 0 && g.p[pi].deck.some(id => BYF(BY[id]) && BY[id].k === 'ag' && BY[id].r !== 'L'), play: (g, pi) => { const s = seqAfter(g, l => l.byffo); if (s) seqLog(g, BY.BY3); blindBox(g, pi, s ? 2 : 1); } });
const byffoField = (g, pi) => vis(g, pi).filter(y => BYF(C(y)));
card('BY4', 'Il Capro che Ride', 'X', 'ag', 'L', 12, 16, "Patto: manda nell'Abisso 3 Byffo tra campo e mano. Continuo: +4 ATK per ogni Byffo nel tuo Abisso.", { set: 'BY', code: 'BY-04', byffo: true,
  patto: { label: '3 Byffo tra campo e mano', can: (g, pi) => byffoField(g, pi).length + g.p[pi].hand.filter(id => BYF(BY[id]) && id !== 'BY4').length >= 3,
    pay: (g, pi) => { let n = 3; for (const y of byffoField(g, pi)) { if (!n) break; toAbyss(g, y, 'cost'); n--; } const P = g.p[pi]; while (n > 0) { const i = P.hand.findIndex(id => BYF(BY[id]) && id !== 'BY4'); if (i < 0) break; P.abyss.push(P.hand.splice(i, 1)[0]); n--; } } } });

/* ======================= DADI ======================= */
const FACES = { F: 'Fuoco', A: 'Acqua', N: 'Natura', R: 'Roccia', C: 'Celeste', X: 'Neutrale', S: 'Stella', M: 'Morte', D: 'Demone', G: 'Ingranaggio', P: 'Fenice', O: 'Moneta', Q: 'Fortuna', H: 'Cuore', I: 'Mimo', K: 'Clown', Z: 'Nullo' };
const SPEND = 'FANRCXSD';
const TIERS = { S: 'Starter', A: 'Advance', P: 'Pro', X: 'Antico' };
const DICE = {};
function die(id, n, tier, f, desc) { DICE[id] = { id, n, tier, f: f.split(''), desc: desc || '' }; }
die('dF', 'Dado di Fuoco', 'S', 'FFFXXX'); die('dA', "Dado d'Acqua", 'S', 'AAAXXX'); die('dN', 'Dado di Natura', 'S', 'NNNXXX'); die('dR', 'Dado di Roccia', 'S', 'RRRXXX'); die('dG', 'Dado Grezzo', 'S', 'XXXXXX'); die('dPri', 'Dado Prisma', 'S', 'FANRCX', 'Una faccia per tipo: Fuoco, Acqua, Natura, Roccia, Celeste, Neutrale.');
die('dCel', 'Dado Celeste', 'A', 'CCCXXX'); die('dCen', 'Dado di Cenere', 'A', 'AAAFFF'); die('dMag', 'Dado di Magma', 'A', 'FFFRRR'); die('dCri', 'Dado di Cristallo', 'A', 'AAARRR');
die('dPal', 'Dado di Palude', 'A', 'NNNAAA'); die('dRad', 'Dado di Radice', 'A', 'NNNRRR'); die('dInc', "Dado d'Incendio", 'A', 'FFFNNN'); die('dOro', "Dado d'Oro", 'A', 'XXXOOO', 'Le Monete valgono denaro nella run; nel Duel Lab non danno energia.');
die('dBen', 'Dado della Benedizione', 'P', 'CCCAAA'); die('dGiu', 'Dado del Giudizio', 'P', 'CCCFFF'); die('dVet', 'Dado della Vetta', 'P', 'CCCRRR'); die('dEde', "Dado dell'Eden", 'P', 'CCCNNN');
die('dFor', 'Dado della Fortuna', 'P', 'QQQQQQ', 'Esce un tipo a caso; Stella al 5%.');
die('dCuo', 'Dado del Cuore', 'P', 'HHHHHH', 'Ogni faccia diventa il tipo di cui hai più carte nel mazzo.'); die('dMim', 'Dado del Mimo', 'P', 'IIIIII', 'Copia il dado alla sua sinistra; se è il primo, è nullo.');
die('dClo', 'Dado del Clown', 'P', 'XXXXXK', 'Clown: la partita ricomincia da capo ogni volta che esce, anche contro i boss.');
die('dApo', "Dado dell'Apocalisse", 'X', 'FFFFCS'); die('dAnt', 'Dado degli Antichi', 'X', 'CCCSSS'); die('dMal', 'Dado Maledetto', 'X', 'SSSSSM', 'Morte: perdi il duello (salvo Amuleto del Condannato).');
die('dTer', 'Dado Antico della Terraformazione', 'X', 'RRRRDD', 'Demone: +1 al contatore (vale anche come Roccia). A 4 arriva Colui che divide la Terra.');
die('dIng', "Dado Antico dell'Ingranaggio", 'X', 'XXXXGG', "Ingranaggio: +1 al contatore. A 4 arriva L'Androide.");
die('dFrn', 'Dado Antico della Fornace', 'X', 'FFFFPP', 'Fenice: +1 al contatore. A 4 arriva La Fenice Eterna.');
const DICE_ORDER = Object.keys(DICE);
const GEN = { P: 'G1', D: 'G2', G: 'G3' };
const SYMN = { P: 'Fenice', D: 'Demone', G: 'Ingranaggio' };
const unused = P => (P.pool || []).map((d, i) => d.used || d.lost ? -1 : i).filter(i => i >= 0);
const rolled = (P, t) => (P.pool || []).filter(d => d.f === t || (t === 'R' && d.f === 'D')).length;
function heartType(list) { const c = {}; for (const id of list || []) { const b = BY[id]; if (b && !b.token) c[b.t] = (c[b.t] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'X'; }
const adamEve = (g, pi) => vis(g, pi).some(x => x.id === 'ED2') && vis(g, pi).some(x => x.id === 'ED3');
const starBlocked = (g, pi) => vis(g, 1 - pi).some(x => x.id === 'ED6');
function faceOk(g, pi, f, r) {
  if (!SPEND.includes(f)) return false;
  if (f === 'S') return !starBlocked(g, pi);
  if (r === 'S') return false; if (r === 'X') return true; if (f === r) return true;
  if (r === 'R' && f === 'D') return true; if (r === 'C' && f === 'N' && adamEve(g, pi)) return true;
  return false;
}
const RORD = { S: 0, F: 1, A: 1, N: 1, R: 1, C: 1, X: 2 };
function canMatch(g, pi, cost, faces) {
  const req = [...cost].sort((a, b) => RORD[a] - RORD[b]); const usedF = new Array(faces.length).fill(false);
  const go = k => { if (k === req.length) return true; for (let j = 0; j < faces.length; j++) if (!usedF[j] && faceOk(g, pi, faces[j], req[k])) { usedF[j] = true; if (go(k + 1)) return true; usedF[j] = false; } return false; };
  return go(0);
}
function combos(a, n) { const out = []; const rec = (s, cur) => { if (cur.length === n) { out.push(cur.slice()); return; } for (let i = s; i < a.length; i++) { cur.push(a[i]); rec(i + 1, cur); cur.pop(); } }; rec(0, []); return out; }
function payOptions(g, pi, cost) {
  if (!cost || !cost.length) return [[]]; const P = g.p[pi], U = unused(P); if (U.length < cost.length) return [];
  const seen = new Set(), out = [];
  for (const cb of combos(U, cost.length)) { const fs = cb.map(i => P.pool[i].f); const key = fs.slice().sort().join(''); if (seen.has(key)) continue; if (canMatch(g, pi, cost, fs)) { seen.add(key); out.push(cb); } }
  return out;
}
function payValid(g, pi, cost, idx) { const P = g.p[pi]; if (!Array.isArray(idx) || idx.length !== cost.length || new Set(idx).size !== idx.length) return false; if (idx.some(i => !P.pool[i] || P.pool[i].used || P.pool[i].lost)) return false; return canMatch(g, pi, cost, idx.map(i => P.pool[i].f)); }
function demand(g, pi, skip) { const d = { F: 0, A: 0, N: 0, R: 0, C: 0, X: 0, S: 0 }; let sk = false; for (const id of g.p[pi].hand) { if (id === skip && !sk) { sk = true; continue; } for (const r of BY[id].cost || []) d[r]++; } return d; }
function faceW(f, dm) { if (f === 'S') return 9; if (f === 'X') return 1; if (f === 'D') return 2.5 + dm.R; return 2 + 1.5 * (dm[f] || 0); }
function autoPay(g, pi, cost, id) { const P = g.p[pi], dm = demand(g, pi, id); return bestBy(payOptions(g, pi, cost), o => -o.reduce((s, i) => s + faceW(P.pool[i].f, dm), 0)) || []; }
const costLabel = cost => cost.map(r => FACES[r]).join(' + ');
function fixDice(arr, list) { const a = (arr || []).filter(id => DICE[id]).slice(0, 5); return a.length === 5 ? a : autoDice(list || []); }
/* dadi automatici per un mazzo: copre i costi dei tipi presenti */
function autoDice(list, tiers) {
  tiers = tiers || 'SAP'; const need = { F: 0, A: 0, N: 0, R: 0, C: 0 }; let tot = 0;
  for (const id of list) for (const r of (BY[id] && BY[id].cost) || []) { if (need[r] != null) need[r]++; tot++; }
  if (!tot || !Object.values(need).some(Boolean)) return ['dG', 'dG', 'dG', 'dG', 'dG'];
  const cand = DICE_ORDER.filter(k => tiers.includes(DICE[k].tier) && DICE[k].f.every(f => 'FANRCX'.includes(f)) && k !== 'dPri');
  const tgt = {}; for (const t in need) tgt[t] = 5 * need[t] / tot;
  const cov = { F: 0, A: 0, N: 0, R: 0, C: 0 }, out = [];
  for (let n = 0; n < 5; n++) {
    const sc = k => { let v = 0; for (const t in cov) { const f = DICE[k].f.filter(z => z === t).length / 6; v += Math.min(cov[t] + f, tgt[t]) - Math.min(cov[t], tgt[t]) + (cov[t] < tgt[t] ? f * 0.05 : 0); } return v - 'SAPX'.indexOf(DICE[k].tier) * 0.001 + DICE[k].f.filter(z => z === 'X').length * 0.0001; };
    const k = bestBy(cand, sc); out.push(k); for (const f of DICE[k].f) if (cov[f] != null) cov[f] += 1 / 6;
  }
  return out.sort((a, b) => DICE_ORDER.indexOf(a) - DICE_ORDER.indexOf(b));
}
function faceVal(g, pi, f) { const dm = demand(g, pi); if (f === 'S') return starBlocked(g, pi) ? 0 : 10; if (f === 'M') return -100; if (f === 'K') return -5; if ('PDG'.includes(f)) return 6 + (f === 'D' ? dm.R : 0); if (f === 'O' || f === 'Z') return 0.5; if (f === 'X') return 2.5; return 3 + 2 * (dm[f] || 0); }
function resolveFace(g, P, i, f) {
  if (f === 'Q') { if (g.rand() < 0.05) return 'S'; return 'FANRCX'[Math.floor(g.rand() * 6)]; }
  if (f === 'H') return P.heart || 'X';
  if (f === 'I') { const l = P.pool[i - 1]; return l ? l.f : 'Z'; }
  return f;
}
function addSym(g, pi, s, n) {
  const P = g.p[pi]; if (n <= 0) return; P.sym[s] += n; fx(g, 'sym', { pi, s, n, v: P.sym[s] }); log(g, `${P.name}: +${n} ${SYMN[s]} (${P.sym[s]}/4).`); checkGen(g, pi);
}
function checkGen(g, pi) {
  const P = g.p[pi];
  for (const s of 'PDG') { const id = GEN[s]; if (P.sym[s] < 4) continue; if (P.hand.includes(id) || P.zones.some(x => x && (x.id === id || x.under.includes(id)))) continue; if (s !== 'P' && P.genDone && P.genDone[s]) continue; (P.genDone = P.genDone || {})[s] = true;
    const k = P.abyss.lastIndexOf(id); if (k >= 0) P.abyss.splice(k, 1); P.hand.push(id); fx(g, 'gen', { pi, id }); log(g, `${P.name} ottiene ${nm(id)}!`); }
}
/* applica la faccia uscita (effetti immediati dei simboli) */
function landFace(g, pi, i) {
  const P = g.p[pi], d = P.pool[i];
  if (d.f === 'M') {
    const am = vis(g, pi).find(x => x.id === 'D18');
    if (am) { log(g, `Morte! L'Amuleto del Condannato si spezza al posto di ${P.name}.`); toAbyss(g, am, 'effect'); d.f = 'S'; fx(g, 'dice', { pi }); }
    else { fx(g, 'death', { pi }); log(g, `Il Dado Maledetto mostra la Morte.`); endGame(g, 1 - pi, 'Dado Maledetto: Morte'); return; }
  }
  if (d.f === 'K') { fx(g, 'clown', { pi }); log(g, `Il Clown ride: la partita ricomincia!`); restartGame(g, pi); return 'restart'; }
  if (d.f === 'O') { P.gold++; }
  if (d.f === 'P') addSym(g, pi, 'P', vis(g, pi).some(x => x.id === 'FO1') ? 2 : 1);
  if (d.f === 'D') addSym(g, pi, 'D', 1);
  if (d.f === 'G') addSym(g, pi, 'G', 1);
}
const diceFor = t => t === 1 ? 3 : t <= 3 ? 4 : 5; /* rampa: 3 · 4 · 4 · poi sempre 5 */
function roll(g) {
  if (g.ended || g.phase !== 'roll') return R(false, 'Non è il momento di lanciare.');
  const pi = g.active, P = g.p[pi];
  if (P.quake) { const k = P.quake; P.quake = 0; for (let q = 0; q < k; q++) { const t = bestBy(vis(g, pi), x => val(g, x)); if (!t) break; log(g, `Spaccatura: ${C(t).n} sprofonda.`); toAbyss(g, t, 'effect'); if (g.ended) return R(true); } }
  let n = diceFor(g.turn) - (P.lessDice || 0); P.lessDice = 0; if (vis(g, 1 - pi).some(x => x.id === 'G2')) { n = Math.min(n, 4); } n = Math.max(0, Math.min(n, P.dice.length));
  P.pool = []; const choose = P.chooseTurn === -1 ? (P.chooseTurn = g.turn, true) : false;
  for (let i = 0; i < n; i++) {
    const dd = DICE[P.dice[i]]; let f;
    if (choose) { const opts = [...new Set(dd.f)].filter(x => !'QHIK'.includes(x)); f = opts.length ? bestBy(opts, x => faceVal(g, pi, x)) : dd.f[Math.floor(g.rand() * 6)]; }
    else f = dd.f[Math.floor(g.rand() * 6)];
    P.pool.push({ d: dd.id, f: 'Z', raw: f, used: false }); P.pool[i].f = resolveFace(g, P, i, f);
  }
  if (P.kept) { P.pool.push({ d: P.kept.d, f: P.kept.f, raw: P.kept.f, used: false, kept: true }); P.kept = null; }
  g.phase = 'main';
  fx(g, 'roll', { pi, n: P.pool.length }); log(g, `${P.name} lancia i dadi: ${P.pool.map(d => FACES[d.f]).join(', ') || 'nessuno'}.`);
  for (let i = 0; i < P.pool.length && !g.ended; i++) { if (P.pool[i].kept) continue; if (landFace(g, pi, i) === 'restart') return R(true); }
  if (g.ended) return R(true);
  for (const x of vis(g, pi)) if (x.id === 'D09') { const k = rolled(P, 'R'); if (k) { x.defPerm += k; x.cur += k; log(g, `${C(x).n} +${k} DEF.`); } }
  emit(g, { type: 'roll', pi, side: pi }); if (!g.ended) checkPreg(g, pi);
  return R(true);
}
/* rilanci e conversioni */
function dieVal(g, pi, i) { const d = g.p[pi].pool[i]; return faceVal(g, pi, d.f); }
function reroll(g, pi, i) { const P = g.p[pi], d = P.pool[i]; const f = DICE[d.d].f[Math.floor(g.rand() * 6)]; d.f = resolveFace(g, P, i, f === 'K' ? 'X' : f); if (d.f === 'M') { landFace(g, pi, i); return d.f; } if ('PDG'.includes(d.f)) addSym(g, pi, d.f, d.f === 'P' && vis(g, pi).some(x => x.id === 'FO1') ? 2 : 1); if (d.f === 'O') P.gold++; return d.f; }
function rerollWorst(g, pi, n, filter) {
  const P = g.p[pi]; const U = unused(P).filter(i => !filter || filter(P.pool[i])).sort((a, b) => dieVal(g, pi, a) - dieVal(g, pi, b)).slice(0, n); if (!U.length) return 0;
  const out = U.map(i => FACES[reroll(g, pi, i)]); fx(g, 'dice', { pi, idx: U }); log(g, `${P.name} rilancia ${U.length === 1 ? 'un dado' : U.length + ' dadi'}: ${out.join(', ')}.`); return U.length;
}
function convertDie(g, pi, filter, to, label) {
  const P = g.p[pi]; const i = bestBy(unused(P).filter(k => filter(P.pool[k])), k => -dieVal(g, pi, k)); if (i == null) return false;
  const was = P.pool[i].f; P.pool[i].f = to; fx(g, 'dice', { pi, idx: [i] }); log(g, `${label || 'Un dado'}: ${FACES[was]} → ${FACES[to]}.`);
  if ('PDG'.includes(to)) addSym(g, pi, to, 1); return true;
}
function setFace(g, pi, i, f) { const P = g.p[pi], d = P.pool[i]; const one = P.faceOne && (P.faceOne.idx == null || P.faceOne.idx === i); if (!myMain(g, pi) || (P.chooseTurn !== g.turn && !one) || !d || d.used || d.lost || d.kept || !DICE[d.d].f.includes(f) || 'QHIKM'.includes(f)) return R(false, 'Non puoi scegliere questa faccia.'); if (one) P.faceOne.idx = i; d.f = f; fx(g, 'dice', { pi, idx: [i] }); return R(true); }
function restartGame(g, pi) {
  g.clownUsed = true;
  for (const P of g.p) initPlayer(g, P);
  for (const P of g.p) for (let k = 0; k < 5; k++) drawCard(g, P.i, true);
  g.turn = 1; g.active = pi; g.last = null; g.prevLast = null; fx(g, 'restart', { pi }); startTurn(g);
}

/* ---------- CARTE DEI DADI (set base 131–153) ---------- */
const own = (g, pi) => vis(g, pi);
card('D01', 'Monaco della Preghiera', 'A', 'ag', 'C', 6, 10, 'Preghiera (PV ≤ 20): rilancia tutti i tuoi dadi, anche quelli già usati.', { nb: true, dice: true, cost: [],
  preg: { le: 20, ready: (g, x) => g.active === x.ctrl && g.phase === 'main', fn: (g, x) => { const pi = x.ctrl, P = g.p[pi]; P.pool.forEach((d, i) => { if (!d.lost) { d.used = false; reroll(g, pi, i); } }); fx(g, 'dice', { pi }); log(g, `${P.name} rilancia tutti i dadi.`); } } });
card('D02', 'Monaco del Caos', 'A', 'ag', 'C', 7, 8, 'Ingresso: se in questo turno non hai ancora usato dadi, rilancia tutti i tuoi dadi.', { nb: true, dice: true, cost: [],
  onEnter: (g, x) => { const P = g.p[x.ctrl]; if (g.active !== x.ctrl || P.pool.some(d => d.used)) return; rerollWorst(g, x.ctrl, 9); } });
card('D03', 'Danza della Pioggia', 'A', 'tr', 'R', 0, 0, 'Condizione: nel tuo lancio escono almeno 2 dadi Acqua. Effetto: tutti i tuoi dadi non usati diventano Acqua per questo turno.', { nb: true, dice: true,
  trap: { on: 'roll', match: (g, ev, o) => ev.pi === o && rolled(g.p[o], 'A') >= 2, fire: (g, ev, o) => { const P = g.p[o]; unused(P).forEach(i => { if (P.pool[i].f !== 'S') P.pool[i].f = 'A'; }); fx(g, 'dice', { pi: o }); log(g, 'I dadi diventano Acqua.'); } } });
card('D04', 'I Frutti della Terra', 'A', 'mg', 'C', 0, 0, 'Un tuo agente a caso +1 ATK (permanente) per ogni dado Acqua del tuo lancio.', { nb: true, dice: true,
  can: (g, pi) => own(g, pi).length > 0 && rolled(g.p[pi], 'A') > 0, play: (g, pi) => { const a = own(g, pi); const x = a[Math.floor(g.rand() * a.length)]; const n = rolled(g.p[pi], 'A'); x.atkPerm += n; log(g, `${C(x).n} +${n} ATK.`); } });
card('D05', 'Prometeo, Ladro del Fuoco', 'F', 'ag', 'E', 15, 9, 'Ingresso: fino a 2 tuoi dadi non usati diventano Fuoco.', { nb: true, dice: true,
  onEnter: (g, x) => { for (let k = 0; k < 2; k++) if (!convertDie(g, x.ctrl, d => !'FSDM'.includes(d.f), 'F', 'Prometeo')) break; } });
card('D06', 'Lancio di Brace', 'F', 'mg', 'C', 0, 0, 'Rilancia i tuoi dadi Fuoco non usati: infliggi 2 PV per ogni Fuoco che esce.', { nb: true, dice: true,
  can: (g, pi) => unused(g.p[pi]).filter(i => g.p[pi].pool[i].f === 'F').length >= 2,
  play: (g, pi) => { const P = g.p[pi]; const U = unused(P).filter(i => P.pool[i].f === 'F'); let n = 0; U.forEach(i => { if (reroll(g, pi, i) === 'F') n++; }); fx(g, 'dice', { pi, idx: U }); log(g, `Brace: ${n} Fuoco su ${U.length}.`); dmg(g, 1 - pi, 2 * n, 'eff'); },
  ai: (g, pi) => unused(g.p[pi]).filter(i => g.p[pi].pool[i].f === 'F').length >= 3 || g.p[1 - pi].hp <= 6 });
card('D07', 'Alchimista del Porto', 'N', 'ag', 'R', 10, 10, '1/turno: un tuo dado Neutrale non usato diventa Natura.', { nb: true, dice: true, diceAct: true,
  act: { label: 'Neutrale → Natura', can: (g, x) => unused(g.p[x.ctrl]).some(i => g.p[x.ctrl].pool[i].f === 'X'), fn: (g, x) => convertDie(g, x.ctrl, d => d.f === 'X', 'N', 'Alchimista') }, aiAct: (g, x) => demand(g, x.ctrl).N > 0 });
card('D08', 'Semi del Raccolto', 'N', 'tr', 'C', 0, 0, 'Condizione: finisci il turno con un dado non usato. Effetto: lo conservi; nel prossimo turno hai 6 dadi.', { nb: true, dice: true,
  trap: { on: 'endTurn', match: (g, ev, o) => ev.pi === o && unused(g.p[o]).length > 0 && !g.p[o].kept, fire: (g, ev, o) => { const P = g.p[o]; const i = bestBy(unused(P), k => dieVal(g, o, k)); const d = P.pool[i]; d.used = true; P.kept = { d: d.d, f: d.f }; log(g, `${P.name} conserva un dado ${FACES[d.f]}.`); } } });
card('D09', 'Sisifo', 'R', 'ag', 'R', 8, 14, 'Ogni volta che lanci i dadi: +1 DEF (permanente) per ogni dado Roccia uscito.', { nb: true, dice: true });
card('D10', 'Frana', 'R', 'tr', 'R', 0, 0, 'Condizione: nel tuo lancio escono almeno 3 dadi Roccia. Effetto: infliggi 6 PV.', { nb: true, dice: true,
  trap: { on: 'roll', match: (g, ev, o) => ev.pi === o && rolled(g.p[o], 'R') >= 3, fire: (g, ev, o) => dmg(g, 1 - o, 6, 'eff') } });
card('D11', 'Ira degli Antichi', 'C', 'mg', 'E', 0, 0, 'Occulta tanti agenti in campo quanti sono i dadi Celeste del tuo lancio.', { nb: true, dice: true,
  can: (g, pi) => rolled(g.p[pi], 'C') > 0 && !!oppThreat(g, pi, canOcc),
  play: (g, pi) => { const n = rolled(g.p[pi], 'C'); sampleR(g, vis(g, 1 - pi).filter(canOcc), n).forEach(y => occult(g, y, 1)); } });
card('D12', 'Tyche, Signora della Sorte', 'C', 'ag', 'E', 12, 12, '1/turno: un tuo dado non usato diventa Stella.', { nb: true, dice: true, diceAct: true,
  act: { label: 'Un dado → Stella', can: (g, x) => unused(g.p[x.ctrl]).some(i => g.p[x.ctrl].pool[i].f !== 'S'), fn: (g, x) => convertDie(g, x.ctrl, d => d.f !== 'S', 'S', 'Tyche') }, aiAct: () => true });
const jokerTxt = t => `L'ATK è 4 × i dadi ${TYPES[t]} del tuo ultimo lancio. La DEF è sempre 0.`;
card('D13', 'Il Joker Rosso', 'X', 'ag', 'E', 0, 0, jokerTxt('F'), { nb: true, dice: true, jok: 'F', joker: true, noDef: true });
card('D14', 'Il Joker Blu', 'X', 'ag', 'E', 0, 0, jokerTxt('A'), { nb: true, dice: true, jok: 'A', joker: true, noDef: true });
card('D15', 'Il Joker Verde', 'X', 'ag', 'E', 0, 0, jokerTxt('N'), { nb: true, dice: true, jok: 'N', joker: true, noDef: true });
const jokers = (g, pi) => vis(g, pi).filter(x => C(x).joker);
card('D16', 'Cappello del Joker', 'X', 'mg', 'R', 0, 0, "Manda nell'Abisso un tuo Joker: un altro tuo agente guadagna metà del suo ATK fino a fine turno.", { nb: true,
  can: (g, pi) => jokers(g, pi).length > 0 && vis(g, pi).some(x => !C(x).joker),
  play: (g, pi) => { const j = pickR(g, jokers(g, pi)); const n = Math.floor(atkC(g, j) / 2); toAbyss(g, j, 'cost'); const t = buffTarget(g, pi); if (t) { t.atkTemp += n; log(g, `${C(t).n} +${n} ATK.`); } },
  ai: (g, pi) => !!attackReady(g, pi) && jokers(g, pi).some(j => atkC(g, j) >= 8) });
card('D17', 'Bastone del Joker', 'X', 'tr', 'R', 0, 0, "Condizione: controlli un Joker e l'avversario gioca un agente. Effetto: il Joker va nell'Abisso; quell'agente perde DEF pari all'ATK del Joker fino alla fine del tuo prossimo turno.", { nb: true,
  trap: { on: 'summon', match: (g, ev, o) => ev.pi !== o && onField(g, ev.x) && jokers(g, o).length > 0, fire: (g, ev, o) => { const j = pickR(g, jokers(g, o)); const n = atkC(g, j); toAbyss(g, j, 'cost'); const t = ev.x; if (!onField(g, t)) return; t.jdef = (t.jdef || 0) + n; t.jdefEnd = nextTurnOf(g, o); log(g, `${C(t).n} −${n} DEF.`); if (dfn(g, t) <= 0) toAbyss(g, t, 'effect'); } } });
card('D18', 'Amuleto del Condannato', 'X', 'ag', 'C', 3, 8, "Se il Dado Maledetto mostra la Morte, l'Amuleto va nell'Abisso al posto tuo: il duello continua e quel dado diventa Stella.", { nb: true, dice: true });
card('D19', 'Il Baro', 'X', 'ag', 'R', 11, 8, 'Ingresso: rilancia un tuo dado non usato a scelta.', { nb: true, dice: true, onEnter: (g, x) => rerollWorst(g, x.ctrl, 1) });
/* marionette negli altri tipi */
card('M1', 'Marionetta di Brace', 'F', 'ag', 'C', 9, 7, "Vale come Marionetta Operaia. Abisso: infliggi 2 PV.", { nb: true, mario: true, cost: ['X'], onAbyss: (g, x) => dmg(g, 1 - x.owner, 2, 'eff') });
card('M2', 'Marionetta di Corallo', 'A', 'ag', 'C', 7, 10, 'Vale come Marionetta Operaia. Ingresso: recuperi 2 PV.', { nb: true, mario: true, onEnter: (g, x) => heal(g, x.ctrl, 2) });
card('M3', 'Marionetta di Granito', 'R', 'ag', 'C', 6, 12, "Vale come Marionetta Operaia. Detriti: +2 DEF all'inizio del turno.", { nb: true, mario: true, detriti: 2 });
card('M4', 'Marionetta di Luce', 'C', 'ag', 'C', 7, 9, 'Vale come Marionetta Operaia. Ingresso: puoi Occultare un tuo agente.', { nb: true, mario: true,
  onEnter: (g, x) => { const P = g.p[x.ctrl]; if (!(P.hand.includes('C01') || vis(g, x.ctrl).some(y => y.id === 'C06'))) return; const t = bestBy(vis(g, x.ctrl).filter(y => y !== x && canOcc(y)), y => -val(g, y)) || x; occult(g, t, 1); } });
/* ---------- TIN DELL'EDEN ---------- */
card('ED1', 'Libero Arbitrio', 'C', 'mg', 'L', 0, 0, 'Patto: con questa carta usi tutti i tuoi dadi del turno. Nel tuo prossimo turno scegli la faccia di ogni dado invece di lanciarlo.', { set: 'ED', code: 'ED-01', dice: true,
  patto: { label: 'usare tutti i dadi rimasti', can: (g, pi) => unused(g.p[pi]).length === 4 }, play: (g, pi) => { g.p[pi].chooseTurn = -1; log(g, `${g.p[pi].name} sceglierà le facce dei dadi.`); } });
card('ED2', 'Adamo', 'N', 'ag', 'R', 12, 12, 'Se controlli Eva: i tuoi dadi Natura valgono anche come Celeste.', { set: 'ED', code: 'ED-02', dice: true });
card('ED3', 'Eva', 'C', 'ag', 'R', 11, 11, 'Ingresso: rilancia fino a 2 tuoi dadi non usati; se controlli Adamo, scegli invece la faccia di uno.', { set: 'ED', code: 'ED-03', dice: true,
  onEnter: (g, x) => { const pi = x.ctrl, P = g.p[pi]; if (vis(g, pi).some(y => y.id === 'ED2')) { const i = bestBy(unused(P), k => -dieVal(g, pi, k)); if (i == null) return; const f = bestBy([...new Set(DICE[P.pool[i].d].f)].filter(z => !'QHIKM'.includes(z)), z => faceVal(g, pi, z)) || 'S'; P.pool[i].f = f; fx(g, 'dice', { pi, idx: [i] }); log(g, `Eva sceglie: ${FACES[f]}.`); } else rerollWorst(g, pi, 2); } });
card('ED4', 'Il Serpente Antico', 'N', 'ag', 'E', 14, 10, "Ingresso: nel suo prossimo turno l'avversario lancia 1 dado in meno.", { set: 'ED', code: 'ED-04', dice: true, onEnter: (g, x) => { g.p[1 - x.ctrl].lessDice = (g.p[1 - x.ctrl].lessDice || 0) + 1; log(g, `${g.p[1 - x.ctrl].name} lancerà un dado in meno.`); } });
card('ED5', 'Il Frutto Proibito', 'N', 'mg', 'C', 0, 0, 'Pesca 2. Nel tuo prossimo turno lanci 1 dado in meno.', { set: 'ED', code: 'ED-05', dice: true, play: (g, pi) => { drawCard(g, pi); drawCard(g, pi); g.p[pi].lessDice = (g.p[pi].lessDice || 0) + 1; }, ai: (g, pi) => g.p[pi].hand.length <= 4 });
card('ED6', 'Cherubino dalla Spada Fiammeggiante', 'C', 'ag', 'E', 16, 12, "Continuo: l'avversario non può usare le facce Stella.", { set: 'ED', code: 'ED-06', dice: true });
/* ---------- TIN DELLA FORNACE ---------- */
card('FO1', 'Uovo della Fenice', 'F', 'ag', 'C', 0, 10, 'Continuo: le tue facce Fenice valgono doppio. Abisso: +1 Fenice.', { set: 'FO', code: 'FO-01', dice: true, cost: ['X'], onAbyss: (g, x) => addSym(g, x.owner, 'P', 1) });
card('FO2', 'Cenere che Rinasce', 'F', 'mg', 'R', 0, 0, "+1 Fenice. Se La Fenice Eterna è nel tuo Abisso, riprendila in mano.", { set: 'FO', code: 'FO-02', dice: true,
  play: (g, pi) => { const A = g.p[pi].abyss, k = A.lastIndexOf('G1'); if (k >= 0) { A.splice(k, 1); g.p[pi].hand.push('G1'); log(g, 'La Fenice Eterna torna in mano.'); } addSym(g, pi, 'P', 1); } });
card('FO3', 'Sacerdote della Fornace', 'F', 'ag', 'R', 12, 9, 'Ingresso: rilancia i tuoi dadi non usati che non sono Fuoco.', { set: 'FO', code: 'FO-03', dice: true, onEnter: (g, x) => rerollWorst(g, x.ctrl, 9, d => !'FSPD'.includes(d.f)) });
card('FO4', 'Rogo Sacro', 'F', 'tr', 'C', 0, 0, "Condizione: un tuo agente Fuoco va nell'Abisso. Effetto: +1 Fenice e infliggi 2 PV.", { set: 'FO', code: 'FO-04', dice: true,
  trap: { on: 'abyss', match: (g, ev, o) => ev.owner === o && hasT(ev, 'F') && BY[ev.id].k === 'ag', fire: (g, ev, o) => { addSym(g, o, 'P', 1); dmg(g, 1 - o, 2, 'eff'); } } });
/* ---------- TIN DELLA TERRAFORMAZIONE ---------- */
card('TE1', 'Geomante', 'R', 'ag', 'R', 9, 13, '1/turno: un tuo dado Roccia non usato diventa Demone (+1 Demone; vale ancora come Roccia).', { set: 'TE', code: 'TE-01', dice: true, diceAct: true,
  act: { label: 'Roccia → Demone', can: (g, x) => unused(g.p[x.ctrl]).some(i => g.p[x.ctrl].pool[i].f === 'R'), fn: (g, x) => convertDie(g, x.ctrl, d => d.f === 'R', 'D', 'Geomante') }, aiAct: () => true });
const cultoT = (g, pi) => pickR(g, vis(g, pi).filter(x => hasT(C(x), 'R') && (C(x).r === 'C' || C(x).r === 'R')));
card('TE2', 'Culto del Demone di Pietra', 'R', 'mg', 'C', 0, 0, 'Un tuo agente Roccia Comune o Raro +2 ATK fino a fine turno per ogni Demone uscito nei tuoi dadi in questo turno.', { set: 'TE', code: 'TE-02', dice: true,
  can: (g, pi) => rolled(g.p[pi], 'D') > 0 && !!cultoT(g, pi), play: (g, pi) => { const x = cultoT(g, pi), n = 2 * rolled(g.p[pi], 'D'); x.atkTemp += n; log(g, `${C(x).n} +${n} ATK.`); }, ai: (g, pi) => !!attackReady(g, pi, 'R') });
card('TE3', 'Spaccatura', 'R', 'tr', 'R', 0, 0, "Condizione: nel tuo turno escono dai dadi almeno 2 Demoni. Effetto: all'inizio del turno avversario, manda nell'Abisso un suo agente.", { set: 'TE', code: 'TE-03', dice: true,
  trap: { on: 'roll', match: (g, ev, o) => ev.pi === o && rolled(g.p[o], 'D') >= 2, fire: (g, ev, o) => { g.p[1 - o].quake = (g.p[1 - o].quake || 0) + 1; log(g, 'La terra si spacca sotto i piedi dell’avversario…'); } } });
card('TE4', 'Sisma', 'R', 'mg', 'E', 0, 0, 'Tutti gli agenti −3 DEF (permanente). Se controlli Colui che divide la Terra, distruggi gli agenti avversari con DEF ≤ 6.', { set: 'TE', code: 'TE-04',
  can: (g, pi) => vis(g, 1 - pi).length > 0, play: (g, pi) => { [...vis(g, 0), ...vis(g, 1)].forEach(x => { if (onField(g, x)) shrinkDef(g, x, 3); }); if (vis(g, pi).some(x => x.id === 'G2')) vis(g, 1 - pi).filter(y => dfn(g, y) <= 6).forEach(y => destroyEff(g, y)); },
  ai: (g, pi) => { let s = 0; for (const y of vis(g, 1 - pi)) s += dfn(g, y) <= 3 ? val(g, y) : 2; for (const y of vis(g, pi)) s -= dfn(g, y) <= 3 ? val(g, y) : 2; return s > 6; } });
/* ---------- TIN DELL'INGRANAGGIO ---------- */
card('IN1', 'Orologiaio', 'X', 'ag', 'R', 10, 10, '1/turno: un tuo dado Neutrale non usato diventa Ingranaggio (+1 Ingranaggio).', { set: 'IN', code: 'IN-01', dice: true,
  act: { label: 'Neutrale → Ingranaggio', can: (g, x) => unused(g.p[x.ctrl]).some(i => g.p[x.ctrl].pool[i].f === 'X'), fn: (g, x) => convertDie(g, x.ctrl, d => d.f === 'X', 'G', 'Orologiaio') }, aiAct: () => true });
card('IN2', 'Cuore a Molla', 'X', 'mg', 'C', 0, 0, '+1 Ingranaggio (+2 se controlli una Marionetta).', { set: 'IN', code: 'IN-02', dice: true, play: (g, pi) => addSym(g, pi, 'G', vis(g, pi).some(x => isMar(x.id)) ? 2 : 1) });
card('IN3', "Officina dell'Automa", 'X', 'mg', 'R', 0, 0, 'Cerca nel mazzo una Marionetta e mettila in campo.', { set: 'IN', code: 'IN-03',
  can: (g, pi) => free(g.p[pi]) >= 0 && g.p[pi].deck.some(isMar), play: (g, pi) => { const P = g.p[pi]; const k = P.deck.findIndex(isMar); const [id] = P.deck.splice(k, 1); shuffle(g, P.deck); const y = placeNew(g, pi, id, choosePos(g, pi, BY[id])); log(g, `${P.name} assembla ${nm(id)}.`); afterEnter(g, pi, y, 'special'); } });
card('IN4', 'Bobina di Rame', 'X', 'tr', 'C', 0, 0, 'Condizione: fai uno Sviluppo su una Marionetta. Effetto: +1 Ingranaggio.', { set: 'IN', code: 'IN-04', dice: true,
  trap: { on: 'svil', match: (g, ev, o) => ev.pi === o && isMar(ev.base), fire: (g, ev, o) => addSym(g, o, 'G', 1) } });
/* ---------- CARTE GENERATE DAI DADI ---------- */
const genPatto = s => ({ label: `4 simboli ${SYMN[s]}`, can: (g, pi) => g.p[pi].sym[s] >= 4, pay: (g, pi) => { g.p[pi].sym[s] -= 4; fx(g, 'sym', { pi, s, n: -4, v: g.p[pi].sym[s] }); } });
card('G1', 'La Fenice Eterna', 'F', 'ag', 'L', 28, 20, "Generata dai dadi (4 Fenice). Ingresso: infliggi 8 PV. Abisso: il contatore Fenice riparte da 2.", { gen: 'P', set: 'FO', code: 'FO-00', dice: true, cost: [], patto: genPatto('P'),
  onEnter: (g, x) => dmg(g, 1 - x.ctrl, 8, 'eff'), onAbyss: (g, x) => { const P = g.p[x.owner]; P.sym.P = Math.max(P.sym.P, 2); log(g, 'Il contatore Fenice riparte da 2.'); } });
card('G2', 'Colui che divide la Terra', 'R', 'ag', 'L', 20, 26, "Generata dai dadi (4 Demone, una volta per duello). Continuo: finché è in campo, l'avversario lancia al massimo 4 dadi.", { gen: 'D', set: 'TE', code: 'TE-00', dice: true, cost: [], patto: genPatto('D'),
});
card('G3', "L'Androide", 'X', 'ag', 'L', 24, 24, "Generata dai dadi (4 Ingranaggio, una volta per duello). Continuo: le tue pile con una Marionetta alla base +3/+3. Non può essere occultato.", { gen: 'G', set: 'IN', code: 'IN-00', dice: true, cost: [], patto: genPatto('G') });

/* ---------- COSTI IN DADI: n° dadi = rarità (C1 R2 E3 L4) ---------- */
const RN = { C: 1, R: 2, E: 3, L: 4 };
const COST = { F01: 'FFFF', Z24: 'FFFC', Z21: 'S', Z22: 'S', Z23: 'S', C02: 'CCCF', X01: 'XXXC', X02: 'XXC', X15: 'XXXC', X21: 'XXXC', Z30: 'XXXC', TC4: 'XXXC', BY4: 'XXXC', Z29: 'XXC', Z28: 'XXX', Z25: 'RRRR', Z26: 'AAAC', Z27: 'NNNC', VU2: 'RRF', AN4: 'CF', F11: 'X', ED1: 'CCXX', ED6: 'CCF' };
for (const c of CARDS) {
  if (c.cost) continue; if (COST[c.id]) { c.cost = COST[c.id].split(''); continue; } if (c.token) { c.cost = []; continue; }
  const n = RN[c.r] || 2, t = c.t;
  c.cost = t === 'X' ? Array(n).fill('X') : n === 1 ? [t] : n === 2 ? [t, 'X'] : n === 3 ? [t, t, 'X'] : [t, t, t, c.t2 || t];
}

/* ======================= 0.19 · MARTIRE E RIFINITURE ======================= */
function canMartire(g, x) { const c = x && C(x); return !!(c && c.martire) && onField(g, x) && !isOcc(x) && x.ret == null && myMain(g, x.ctrl) && (!c.martire.can || c.martire.can(g, x)); }
function useMartire(g, x) {
  if (!canMartire(g, x)) return R(false, 'Martire non disponibile.');
  const c = C(x), pi = x.ctrl, P = g.p[pi], pre = c.martire.pre ? c.martire.pre(g, x) : null;
  fx(g, 'kw', { pi, z: P.zones.indexOf(x), id: x.id, kw: 'MARTIRE' }); log(g, `Martire: ${c.n}!`);
  toAbyss(g, x, 'martire'); if (g.ended) return R(true);
  withSrc(g, c.t, () => c.martire.fn(g, x, pi, pre)); if (g.ended) return R(true);
  for (const y of vis(g, pi)) {
    if (y.id === 'R03' && hasT(c, 'R')) { y.atkPerm += 2; log(g, 'La Sfinge +2 ATK.'); }
    if (y.id === 'X04') { log(g, 'Capitano dei Templari Neri: pesca 1.'); drawCard(g, pi); if (g.ended) return R(true); }
  }
  P.martiri = (P.martiri || 0) + 1;
  return R(true);
}
function aiWantsMartire(g, x) { const m = C(x).martire; return !!(m.ai && m.ai(g, x)); }
function pickDie(g, pi, i) {
  const P = g.p[pi], d = P.pool[i]; if (!P.pickDie || !d || d.used || d.lost) return R(false, 'Scegli un tuo dado non usato.');
  const who = P.pickDie; P.pickDie = null; const f = reroll(g, pi, i); fx(g, 'dice', { pi, idx: [i] }); log(g, `${who}: il dado diventa ${FACES[f]}.`); return R(true);
}
const upd = (id, f) => Object.assign(BY[id], f);
const fullBetter = (g, x) => { const P = g.p[x.ctrl]; return free(P) < 0 && P.hand.some(id => BY[id].k === 'ag' && BY[id].r !== 'L' && cval(id) > val(g, x) && !payErr(g, x.ctrl, id)); };
const human = (g, pi) => !!(g.human && g.human[pi]) && g.active === pi;

/* ---------- carte con Martire ---------- */
upd('R09', { a: 8, d: 5, text: "Ingresso: guarda le prime 3 carte del tuo mazzo e riordinale. Martire: Ziz, Re degli Uccelli può attaccare due volte in questo turno.",
  martire: { can: (g, x) => vis(g, x.ctrl).some(y => y.id === 'R06'),
    fn: (g, x, pi) => { vis(g, pi).filter(y => y.id === 'R06').forEach(y => { if (y.attacked) y.attacked = false; else y.twice = g.turn; log(g, `${C(y).n} può attaccare due volte.`); }); },
    ai: (g, x) => g.turn > 1 && vis(g, x.ctrl).some(y => y.id === 'R06' && y.pos === 'atk' && y.noAtk !== g.turn) } } );
upd('R07', { text: "Detriti: +2 DEF all'inizio del turno. Resilienza 1: infliggi 3 PV. Martire: infliggi PV pari a metà della sua DEF (max 8).",
  martire: { pre: (g, x) => Math.min(8, Math.floor(Math.max(0, dfn(g, x)) / 2)), fn: (g, x, pi, n) => dmg(g, 1 - pi, n, 'eff'),
    ai: (g, x) => { const n = Math.min(8, Math.floor(Math.max(0, dfn(g, x)) / 2)); return n >= 7 || g.p[1 - x.ctrl].hp <= n || (fullBetter(g, x) && n >= 4); } } });
upd('N10', { text: 'Abisso: pesca 1. Martire: un tuo dado già usato torna disponibile.',
  martire: { can: (g, x) => g.p[x.ctrl].pool.some(d => d.used && !d.lost),
    fn: (g, x, pi) => { const P = g.p[pi]; const i = bestBy(P.pool.map((d, k) => d.used && !d.lost ? k : -1).filter(k => k >= 0), k => dieVal(g, pi, k)); if (i == null) return; P.pool[i].used = false; fx(g, 'dice', { pi, idx: [i] }); log(g, `Un dado ${FACES[P.pool[i].f]} torna disponibile.`); },
    ai: (g, x) => { const P = g.p[x.ctrl]; return P.hand.some(id => !!payErr(g, x.ctrl, id) && BY[id].r !== 'L') && (free(P) < 0 || P.hand.length >= 3); } } });
upd('A02', { text: 'Ingresso: recuperi 5 PV. Martire: i tuoi agenti Acqua +3 ATK (permanente).', preg: undefined,
  martire: { fn: (g, x, pi) => { const t = vis(g, pi).filter(y => hasT(C(y), 'A')); t.forEach(y => y.atkPerm += 3); log(g, `Gli agenti Acqua +3 ATK (${t.length}).`); },
    ai: (g, x) => g.turn > 1 && vis(g, x.ctrl).filter(y => y !== x && hasT(C(y), 'A')).length >= 2 } });
upd('F11', { text: "Abisso: infliggi 3 PV. Martire: un altro tuo agente Fuoco +4 ATK fino a fine turno.",
  martire: { fn: (g, x, pi) => { const t = pickR(g, vis(g, pi).filter(y => hasT(C(y), 'F'))); if (t) { t.atkTemp += 4; log(g, `${C(t).n} +4 ATK.`); } },
    ai: (g, x) => g.p[1 - x.ctrl].hp <= 3 || fullBetter(g, x) || vis(g, x.ctrl).some(y => y !== x && hasT(C(y), 'F') && y.pos === 'atk' && !y.attacked && g.turn > 1) } } );
upd('X11', { a: 7, d: 7, text: 'Ingresso: se controlli agenti di 2 tipi diversi, pesca 1. Martire: un tuo dado non usato diventa Celeste.',
  martire: { can: (g, x) => unused(g.p[x.ctrl]).some(i => !'CSM'.includes(g.p[x.ctrl].pool[i].f)),
    fn: (g, x, pi) => convertDie(g, pi, d => !'CSM'.includes(d.f), 'C', 'Superstite della Diaspora'),
    ai: (g, x) => { const P = g.p[x.ctrl]; return demand(g, x.ctrl).C > 0 && !unused(P).some(i => 'CS'.includes(P.pool[i].f)); } } });

/* ---------- carte che si legano a Martire ---------- */
upd('R03', { text: 'Continuo: +1 ATK (permanente) ogni volta che un tuo agente Roccia attiva Resilienza; +2 ATK quando un tuo agente Roccia usa Martire.' });
upd('X04', { text: 'Continuo: gli altri tuoi agenti Neutrali +2 ATK. Quando un altro tuo agente usa Martire, pesca 1.' });
upd('F19', { text: "Condizione: un tuo agente va nell'Abisso in battaglia o con Martire. Effetto: infliggi 4 PV.",
  trap: { on: 'abyss', match: (g, ev, o) => ev.owner === o && (ev.cause === 'battle' || ev.cause === 'martire'), fire: (g, ev, o) => dmg(g, 1 - o, 4, 'eff') } });

/* ---------- modifiche di bilanciamento 0.19 ---------- */
upd('F12', { a: 13 });
upd('F04', { cost: ['F', 'F'], text: 'Continuo: non può stare in difesa.' });
upd('F10', { a: 6, d: 3, text: 'Ingresso: cambia la posizione di un agente avversario. Sequenza (dopo un Evento): di due agenti avversari.' });
upd('F06', { a: 10, cost: ['F', 'F'], text: "Ingresso: prendi il controllo di un agente avversario Comune fino a fine turno; può attaccare. Sviluppo (su una Marionetta Operaia): non può essere attaccato da agenti Neutrali.",
  svil: { cond: (g, pi, t) => t.ctrl === pi && isMar(t.id), fn: (g, x) => { x.noNeutralAtk = true; log(g, `${C(x).n} non può essere attaccato da agenti Neutrali.`); } }, svilBase: c => isMar(c.id) });
upd('FO1', { r: 'R', cost: ['F', 'X'] });
upd('FO4', { r: 'R', cost: ['F', 'X'] });
upd('D19', { a: 6, d: 6, text: 'Ingresso: rilancia un tuo dado non usato, a tua scelta.',
  onEnter: (g, x) => { const pi = x.ctrl; if (!unused(g.p[pi]).length) return; if (human(g, pi)) { g.p[pi].pickDie = 'Il Baro'; log(g, 'Il Baro: scegli un dado da rilanciare.'); } else rerollWorst(g, pi, 1); } });
upd('ED3', { onEnter: (g, x) => { const pi = x.ctrl, P = g.p[pi];
  if (vis(g, pi).some(y => y.id === 'ED2')) { if (human(g, pi)) { P.faceOne = { idx: null }; log(g, 'Eva: scegli la faccia di un tuo dado non usato.'); return; }
    const i = bestBy(unused(P), k => -dieVal(g, pi, k)); if (i == null) return; const f = bestBy([...new Set(DICE[P.pool[i].d].f)].filter(z => !'QHIKM'.includes(z)), z => faceVal(g, pi, z)) || 'S'; P.pool[i].f = f; fx(g, 'dice', { pi, idx: [i] }); log(g, `Eva sceglie: ${FACES[f]}.`); }
  else rerollWorst(g, pi, 2); } });
upd('G1', { a: 26 });
upd('TC2', { mario: true, text: "Vale come Marionetta Operaia. Sviluppo (su un automa, una Marionetta Operaia o l'Automa del Laboratorio Segreto): pesca 1." });
upd('A13', { text: "Preghiera (PV ≤ 10): Occulta per un turno tanti agenti avversari quante Preghiere si sono attivate dall'inizio della partita, questa compresa. Perdi 5 PV.",
  can: (g, pi) => g.p[pi].hp <= 10 && g.p[pi].hp > 5 && vis(g, 1 - pi).some(canOcc),
  play: (g, pi) => { g.pregCount = (g.pregCount || 0) + 1; const n = g.pregCount; sampleR(g, vis(g, 1 - pi).filter(canOcc), n).forEach(y => occult(g, y, 1)); const P = g.p[pi]; P.hp -= 5; fx(g, 'dmg', { pi, n: 5, src: 'cost' }); log(g, `${P.name} perde 5 PV.`); checkWin(g); } });
upd('D04', { text: 'Un tuo agente Acqua o Natura +1 ATK (permanente) per ogni dado Acqua del tuo lancio.',
  can: (g, pi) => vis(g, pi).some(x => hasT(C(x), 'A') || hasT(C(x), 'N')) && rolled(g.p[pi], 'A') > 0,
  play: (g, pi) => { const x = pickR(g, vis(g, pi).filter(y => hasT(C(y), 'A') || hasT(C(y), 'N'))); const n = rolled(g.p[pi], 'A'); x.atkPerm += n; log(g, `${C(x).n} +${n} ATK.`); } });
upd('A17', { text: 'Un tuo agente Acqua o Roccia torna alla DEF originale, poi +2 DEF (permanente).' });
upd('X05', { a: 10, text: "Continuo: può attaccare direttamente i PV anche se l'avversario ha agenti, con metà danno." });
upd('X13', { a: 10, d: 8, text: 'Ingresso: prendi dal mazzo un altro Soldato del Terzo Regno e mettilo in mano.', onEnter: (g, x) => { if (!searchDeck(g, x.ctrl, c => c.id === 'X13')) log(g, 'Nessun altro Soldato nel mazzo.'); } });
upd('X12', { text: "Abisso: l'avversario recupera 5 PV.", onAbyss: (g, x) => heal(g, 1 - x.owner, 5) });
upd('X07', { text: "Resilienza 1: infliggi 4 PV. Abisso (in battaglia): Occulta l'agente che l'ha distrutta.",
  onAbyss: (g, x, cause) => { const k = g.killer; if (cause === 'battle' && k && onField(g, k) && canOcc(k)) { log(g, `La Sentinella del Cubo trascina ${C(k).n} fuori dal tempo.`); occult(g, k, 1); } } });
upd('X02', { cost: ['X', 'X', 'X'] });
upd('N12', { d: 4 });
upd('C01', { text: "Patto: almeno 2 agenti occultati in campo. Ingresso: manda nell'Abisso tutti gli agenti occultati in campo." });
upd('C04', { d: 19, cost: ['C', 'C', 'C'], text: "1/turno: Occulta un agente avversario Comune o Raro; poi Ofanim passa in difesa e resta così fino al tuo prossimo turno. Non può essere occultato.",
  aiAct: (g, x) => !!ofanimT(g, x) });
upd('C09', { text: "Continuo: quando attacca un agente Neutrale in difesa, quell'agente va nell'Abisso prima del calcolo dei danni.", onEnter: undefined });
upd('M4', { text: "Vale come Marionetta Operaia. Ingresso: puoi Occultare un tuo agente. Continuo: se è alla base di una pila, l'agente in cima +3 ATK." });

/* ---------- testi più chiari ---------- */
const TXT = {
  F01: "Patto: manda nell'Abisso 2 Cavalieri del tuo campo. Continuo: quando distrugge un agente in battaglia, infliggi 3 PV.",
  F03: 'Continuo: quando distrugge un agente in battaglia, può attaccare di nuovo (una volta per turno).',
  F05: "1/turno: manda nell'Abisso 1 carta della tua mano e infliggi 4 PV.",
  F09: 'Continuo: quando attacca un agente in difesa, gli toglie 3 DEF in più (5 se è Natura).',
  F15: 'Perdi 5 PV e pesca 2.',
  A01: 'Patto: hai recuperato almeno 10 PV in questa partita. Continuo: ogni volta che recuperi PV, infliggi lo stesso numero di PV.',
  A06: 'Continuo: +5 ATK quando combatte contro un agente Fuoco.',
  A10: 'Continuo: un agente Fuoco che lo attacca ha −3 ATK nel calcolo.',
  A18: "Condizione (all'attacco): un agente Fuoco avversario dichiara un attacco. Effetto: rimandalo in mano al proprietario; l'attacco è annullato.",
  N15: "Prendi dall'Abisso un agente Natura e mettilo in mano.",
  N16: 'Prendi dal mazzo un agente Natura Comune e mettilo in mano. Sequenza (dopo uno Sviluppo): due.',
  R06: 'Continuo: +5 ATK quando combatte contro un agente Fuoco.',
  R13: 'I tuoi agenti Roccia tornano alla DEF originale +3. Un tuo agente Roccia conta un attacco subito in più per la Resilienza.',
  C07: 'Continuo: se controlli un agente Fuoco, quando distrugge un agente in battaglia infliggi 3 PV.',
  C10: 'Occulta x2 un agente avversario. Rilancia 1 tuo dado non usato per ogni agente occultato in campo.',
  C13: 'Occulta un agente avversario. Sequenza (dopo un agente Celeste): Occulta x2.',
  X03: 'Continuo: non può essere occultato.',
  X09: 'Ingresso: rilancia un tuo dado non usato.',
  X10: 'Ingresso: recuperi 3 PV. Continuo: se è in attacco e lo attacca un agente Natura, subisci il danno ma resta in campo.',
  AN3: "Continuo: l'avversario non può occultare i tuoi Emissari. 1/turno: Occulta un tuo Emissario.",
  D16: "Manda nell'Abisso un tuo Joker: un altro tuo agente guadagna metà del suo ATK fino a fine turno.",
  D18: "Se il Dado Maledetto mostra la Morte, l'Amuleto va nell'Abisso al posto tuo: il duello continua e quel dado diventa Stella."
};
for (const id in TXT) BY[id].text = TXT[id];

/* ---------- glossario delle parole chiave ---------- */
const KW = [
  ['Patto', /Patto/, "Condizione in più per giocare una Leggendaria, oltre al costo in dadi."],
  ['Ingresso', /Ingresso/, "Scatta quando l'agente entra in campo."],
  ['Abisso', /Abisso:|Abisso \(/, "Scatta quando la carta va dal campo all'Abisso (il cimitero)."],
  ['Continuo', /Continuo/, "Sempre attivo finché la carta è in campo e non è occultata."],
  ['1/turno', /1\/turno/, "Abilità che attivi tu una volta per turno, nella fase Azioni, senza dadi."],
  ['Martire', /Martire/, "Abilità: nella fase Azioni mandi questa carta dal campo nell'Abisso e ottieni l'effetto. Senza dadi, anche nel turno in cui è entrata. Fa scattare i suoi effetti Abisso."],
  ['Preghiera', /Preghiera \(/, "Scatta da sola quando i tuoi PV arrivano alla soglia indicata, una volta sola."],
  ['Sviluppo', /Sviluppo \(/, "Giochi la carta sopra la pila indicata pagandone il costo in dadi; 1 Sviluppo per turno. La pila va nell'Abisso tutta insieme."],
  ['Jolly Sviluppo', /Jolly Sviluppo/, "Vale come base per lo Sviluppo di qualsiasi carta Comune o Rara."],
  ['Resilienza', /Resilienza/, "L'agente conta gli attacchi subiti in difesa; raggiunto il numero, l'effetto scatta all'inizio del tuo turno, una volta."],
  ['Detriti', /Detriti/, "+2 DEF permanente all'inizio di ogni turno, tuo e avversario."],
  ['Occulta', /Occult/, "L'agente non esiste per N turni: niente effetti, non attacca e non può essere attaccato, ma occupa la zona."],
  ['Sequenza', /Sequenza/, "Bonus se la carta giocata subito prima, nello stesso turno, è quella indicata."],
  ['Condizione', /Condizione/, "Il Presagio si posa coperto e scatta da solo quando succede la Condizione. Ordine delle zone: 1, 2, 3."],
  ['Marionetta Operaia', /Marionett/, "Le carte che \"valgono come Marionetta Operaia\" contano come lei per Sviluppi ed effetti."],
  ['Generata dai dadi', /Generata dai dadi/, "Non va nel mazzo: arriva in mano quando il contatore del suo simbolo arriva a 4 e si gioca spendendo 4 simboli."],
  ['Sigillo', /Sigillo/, "Presagio che non scatta mai: conta solo per l'effetto descritto."],
  ['Stella', /Stella/, "Faccia jolly: paga qualsiasi costo."]
];
function glossaryOf(c) { const t = (c && c.text) || ''; return KW.filter(([, re]) => re.test(t)).map(([k, , d]) => ({ k, d })); }
/* ======================= 0.20 · NUOVE CARTE SET BASE ======================= */
const isMonk = c => !!c && /^Monaco/.test(c.n);
card('A21', 'Monaco Penitente', 'A', 'ag', 'C', 6, 11, "1/turno: perdi 4 PV e pesca 1. Se dopo hai 20 PV o meno, pesca 2.", { cost: ['A'],
  act: { label: 'Penitenza: −4 PV, pesca', can: (g, x) => g.p[x.ctrl].hp > 4,
    fn: (g, x) => { const pi = x.ctrl, P = g.p[pi]; P.hp -= 4; fx(g, 'dmg', { pi, n: 4, src: 'cost' }); log(g, `${P.name} perde 4 PV (penitenza).`); const n = P.hp <= 20 ? 2 : 1; for (let i = 0; i < n; i++) drawCard(g, pi); checkPreg(g, pi); } },
  aiAct: (g, x) => { const P = g.p[x.ctrl]; return P.hp >= 16 && P.hp > g.p[1 - x.ctrl].hp - 25; } });
card('A22', 'La Custode del Pozzo', 'A', 'ag', 'R', 5, 14, "Resilienza 1: i Monaci nella tua mano +2 DEF (permanente).", { cost: ['A', 'X'],
  resil: { n: 1, fn: (g, x) => { const P = g.p[x.ctrl]; const ms = P.hand.filter(id => isMonk(BY[id])); P.monkBuf = (P.monkBuf || []).concat(ms); log(g, ms.length ? `${ms.length} Monaci in mano +2 DEF.` : 'Nessun Monaco in mano.'); } } });
card('N21', 'Semi di Luce', 'N', 'mg', 'C', 0, 0, "Pesca 1 per ogni agente occultato in campo (max 3). Sequenza (dopo un'Occulta): puoi fare uno Sviluppo in più in questo turno.", { cost: ['N'],
  can: (g, pi) => allOcc(g) > 0 || seqAfter(g, l => l.occ),
  play: (g, pi) => { const s = seqAfter(g, l => l.occ); if (s) { seqLog(g, BY.N21); g.p[pi].svilMax = (g.p[pi].svilMax || 1) + 1; } const n = Math.min(3, allOcc(g)); for (let i = 0; i < n; i++) drawCard(g, pi); } });
card('C16', 'Kerub delle Radici', 'C', 'ag', 'C', 8, 10, "Ingresso: se controlli un agente Natura, Occulta un agente avversario Comune. Jolly Sviluppo (Natura): vale come base per lo Sviluppo di un agente Natura fino a Raro; quella pila non può essere occultata.", { cost: ['C'], jollyN: true,
  onEnter: (g, x) => { if (!vis(g, x.ctrl).some(y => y !== x && hasT(C(y), 'N'))) return; const t = pickR(g, vis(g, 1 - x.ctrl).filter(y => C(y).r === 'C' && canOcc(y))); if (t) occult(g, t, 1); } });
card('X26', 'Il Disertore', 'X', 'ag', 'L', 16, 14, "Patto: almeno 4 agenti Neutrali nel tuo Abisso. Ingresso: riprendi in mano un Templare o un Soldato dal tuo Abisso. Continuo: +2 ATK per ogni agente Neutrale nel tuo Abisso (max +12).", { cost: ['X', 'X', 'X', 'X'], cap: 12,
  patto: { label: '4 agenti Neutrali nell\'Abisso', can: (g, pi) => g.p[pi].abyss.filter(id => BY[id].k === 'ag' && BY[id].t === 'X').length >= 4 },
  onEnter: (g, x) => { if (!recover(g, x.ctrl, c => /Templar|Soldato/.test(c.n))) log(g, "Nessun Templare o Soldato nell'Abisso."); } });
/* ---------- carte modificate 0.20 ---------- */
upd('SS2', { r: 'R', cost: ['X', 'X'], text: "Condizione: viene rivelato da Gli Uomini in Nero dell'avversario. Effetto: manda nell'Abisso un agente avversario fino a Epico." });
upd('Z30', { text: "Patto: manda nell'Abisso 2 tuoi agenti Neutrali. Ingresso: prendi il controllo definitivo di un agente avversario fino a Epico (non attacca in questo turno)." });
KW.push(['Pila', /pila/, "Le carte una sopra l'altra dopo uno Sviluppo; in campo conta la carta in cima. Gli effetti che parlano della pila valgono anche se la carta è sotto."]);
KW.push(['Fino a Epico', /fino a Epic/, "Vale per le carte Comuni, Rare ed Epiche: non per le Leggendarie."]);
upd('F03', { a: 18 });
upd('G3', { text: "Generata dai dadi (4 Ingranaggio, una volta per duello). Continuo: le tue pile con una Marionetta alla base +4/+4. Non può essere occultato." });
BY.A21.aiAct = (g, x) => { const P = g.p[x.ctrl]; const rot = (P.orig || []).includes('Z21'); return rot ? P.hp > 6 : P.hp >= 16 && P.hp > g.p[1 - x.ctrl].hp - 25; };

const PRECON = [{"code": "SD01", "tier": "S", "name": "Starter Deck – Fuoco", "t": "F", "dice": ["dF", "dF", "dF", "dF", "dF"], "cards": {"F01": 1, "F07": 2, "F08": 2, "F09": 2, "F12": 2, "F10": 2, "F17": 1, "F16": 2, "F19": 1, "X13": 2, "X14": 1, "X20": 1, "X19": 1}, "desc": "Il primo mazzo Fuoco: Cavalieri che si danno forza a vicenda e il Patto del Drago Rosso.", "img": "DECK_SD01"}, {"code": "SD02", "tier": "S", "name": "Starter Deck – Acqua", "t": "A", "dice": ["dA", "dA", "dA", "dA", "dA"], "cards": {"A01": 1, "A07": 2, "A06": 1, "A09": 1, "A10": 2, "A11": 2, "A12": 3, "A16": 2, "A19": 2, "X10": 2, "X13": 2}, "desc": "Il primo mazzo Acqua: cure continue, Ondine contro il Fuoco e il Patto di Danu.", "img": "DECK_SD02"}, {"code": "SD03", "tier": "S", "name": "Starter Deck – Natura", "t": "N", "dice": ["dN", "dN", "dN", "dN", "dN"], "cards": {"N01": 1, "N11": 3, "N07": 3, "N08": 2, "N12": 3, "N10": 2, "N16": 2, "N17": 2, "N09": 2}, "desc": "Il primo mazzo Natura: Marionette Operaie, Sviluppi che pescano e il Maestro Hiram.", "img": "DECK_SD03"}, {"code": "SD04", "tier": "S", "name": "Starter Deck – Roccia", "t": "R", "dice": ["dR", "dR", "dR", "dR", "dR"], "cards": {"R01": 1, "R07": 3, "R08": 2, "R11": 2, "R12": 3, "R04": 1, "X14": 1, "R19": 2, "R20": 2, "X07": 1, "X13": 2}, "desc": "Il primo mazzo Roccia: muri con Detriti, Resilienza che colpisce e Atlante.", "img": "DECK_SD04"}, {"code": "AD01", "tier": "A", "name": "I Cavalieri dell'Apocalisse", "t": "F", "dice": ["dF", "dF", "dF", "dF", "dF"], "cards": {"F01": 1, "F02": 1, "F07": 3, "F08": 3, "F09": 3, "F10": 3, "F17": 2, "F19": 2, "F20": 1, "X19": 1}, "desc": "Tre Cavalieri per tipo: si potenziano, fanno scartare, abbattono i difensori. Il Drago Rosso chiude.", "img": "DECK_AD01"}, {"code": "AD02", "tier": "A", "name": "La Fornace di Zolfo", "t": "F", "dice": ["dF", "dF", "dF", "dF", "dF"], "cards": {"F05": 1, "F11": 3, "F16": 3, "D06": 2, "D05": 1, "F19": 3, "F18": 1, "F12": 2, "F15": 1, "F20": 2, "F10": 1}, "desc": "Danni dai dadi Fuoco: Pioggia di Zolfo, Lancio di Brace, Prometeo. Ifrit si sacrifica per spingere.", "img": "DECK_AD02"}, {"code": "AD03", "tier": "A", "name": "I Protettori del Monastero", "t": "A", "dice": ["dA", "dA", "dA", "dA", "dA"], "cards": {"A21": 3, "A22": 2, "A05": 2, "D01": 3, "A04": 3, "A03": 2, "A02": 2, "A06": 2, "X19": 1}, "desc": "I Monaci scendono di PV di proposito per far scattare le Preghiere; la Custode del Pozzo li rende muri.", "img": "DECK_AD03"}, {"code": "AD04", "tier": "A", "name": "Le Acque che Guariscono", "t": "A", "dice": ["dA", "dA", "dA", "dA", "dA"], "cards": {"A01": 1, "A02": 2, "A07": 3, "A09": 2, "A11": 2, "A16": 3, "A20": 2, "A15": 2, "X10": 2, "X20": 1}, "desc": "Ogni cura conta: Naiadi, Piogge e Marea che Restituisce aprono il Patto di Danu.", "img": "DECK_AD04"}, {"code": "AD05", "tier": "A", "name": "I Primi Costruttori", "t": "N", "dice": ["dN", "dN", "dN", "dN", "dN"], "cards": {"N01": 1, "N11": 3, "N05": 2, "N07": 3, "N04": 2, "N02": 2, "N03": 1, "N16": 2, "N12": 2, "M1": 2}, "desc": "Marionette alla base, Carpentieri e Costruttori sopra: pile che pescano fino al Maestro Hiram.", "img": "DECK_AD05"}, {"code": "AD06", "tier": "A", "name": "Il Bosco Antico", "t": "N", "dice": ["dN", "dN", "dN", "dN", "dN"], "cards": {"N01": 1, "N10": 3, "N07": 3, "N08": 2, "N09": 2, "N18": 2, "N15": 1, "N17": 2, "N20": 1, "N12": 3}, "desc": "Kodama che si sacrificano, Giuramento del Porto che li riporta, Carpentieri che pescano sulle loro pile fino a Hiram.", "img": "DECK_AD06"}, {"code": "AD07", "tier": "A", "name": "La Montagna che Resiste", "t": "R", "dice": ["dR", "dR", "dR", "dR", "dR"], "cards": {"R01": 1, "R03": 1, "R04": 2, "R05": 2, "R07": 3, "R08": 2, "R13": 1, "R19": 2, "R20": 3, "R12": 3}, "desc": "Il muro di Roccia: Detriti, Resilienza e Sfinge. Atlante arriva dopo tre Resilienze.", "img": "DECK_AD07"}, {"code": "AD08", "tier": "A", "name": "Il Volo di Ziz", "t": "R", "dice": ["dR", "dR", "dR", "dR", "dR"], "cards": {"R06": 3, "R09": 3, "R07": 3, "R03": 2, "R02": 1, "R12": 2, "R15": 2, "R17": 2, "X04": 2}, "desc": "La Civetta si sacrifica e Ziz attacca due volte; Troll e Sfinge completano il volo.", "img": "DECK_AD08"}, {"code": "AD09", "tier": "A", "name": "I Templari Neri", "t": "X", "dice": ["dG", "dG", "dG", "dG", "dG"], "cards": {"X26": 1, "X04": 1, "X14": 3, "X13": 3, "X12": 2, "X10": 2, "X08": 2, "X18": 1, "X19": 2, "X23": 2, "X24": 1}, "desc": "Soldati e Templari Neri in massa. Il Disertore cresce con ogni compagno caduto.", "img": "DECK_AD09"}, {"code": "UD01", "tier": "U", "name": "Union – Vapore (Fuoco/Acqua)", "t": "A", "dice": ["dCen", "dCen", "dCen", "dCen", "dCen"], "cards": {"A01": 1, "A07": 2, "A09": 2, "A16": 2, "A20": 2, "A06": 2, "F16": 2, "F11": 2, "F19": 1, "X10": 2, "A02": 1, "A12": 1}, "desc": "Fuoco e Acqua: Danu trasforma ogni cura in danno, mentre Ifrit e Zolfo bruciano.", "img": "DECK_UD01"}, {"code": "UD02", "tier": "U", "name": "Union – Cuore del Vulcano (Fuoco/Roccia)", "t": "R", "dice": ["dMag", "dMag", "dMag", "dMag", "dMag"], "cards": {"R04": 2, "R07": 3, "R15": 2, "R20": 2, "F18": 2, "F19": 2, "F11": 2, "R08": 2, "F12": 1, "R05": 1, "R03": 1}, "desc": "Fuoco e Roccia: muri che reggono e restituiscono con Fuoco Greco, Valanga ed Eco tra le Vette.", "img": "DECK_UD02"}, {"code": "UD03", "tier": "U", "name": "Union – Mura di Cristallo (Acqua/Roccia)", "t": "R", "dice": ["dCri", "dCri", "dCri", "dCri", "dCri"], "cards": {"R01": 1, "A03": 1, "A17": 2, "R19": 2, "A06": 2, "A04": 3, "R07": 3, "R04": 2, "R10": 1, "R13": 1, "R14": 2}, "desc": "Acqua e Roccia: Chesed ripara le difese, Atlante e Maria delle Grazie chiudono.", "img": "DECK_UD03"}, {"code": "UD04", "tier": "U", "name": "Union – La Palude (Natura/Acqua)", "t": "N", "dice": ["dPal", "dPal", "dPal", "dPal", "dPal"], "cards": {"D04": 3, "M2": 3, "N12": 3, "A04": 3, "N07": 2, "N01": 1, "A12": 3, "N09": 2}, "desc": "Natura e Acqua: Frutti della Terra e Marionette di Corallo crescono a ogni lancio.", "img": "DECK_UD04"}, {"code": "UD05", "tier": "U", "name": "Union – Radici della Montagna (Natura/Roccia)", "t": "N", "dice": ["dRad", "dRad", "dRad", "dRad", "dRad"], "cards": {"R10": 2, "M3": 3, "N03": 2, "N07": 2, "N02": 1, "R07": 3, "N10": 2, "R04": 2, "N01": 1, "R05": 2}, "desc": "Natura e Roccia: Tartarughe e Marionette di Granito come base, Carpentieri e Dedalo sopra, Hiram in cima.", "img": "DECK_UD05"}, {"code": "UD06", "tier": "U", "name": "Union – Bosco in Fiamme (Fuoco/Natura)", "t": "F", "dice": ["dInc", "dInc", "dInc", "dInc", "dInc"], "cards": {"M1": 3, "N11": 2, "F06": 2, "N05": 1, "F12": 3, "F17": 2, "N17": 2, "N07": 2, "F03": 1, "N02": 1, "F14": 1}, "desc": "Fuoco e Natura: Marionette di Brace e l'Ombra dietro il Trono, con Pazuzu che spinge.", "img": "DECK_UD06"}, {"code": "AS01", "tier": "C", "name": "Apocalisse Ascesa (Fuoco/Celeste)", "t": "F", "dice": ["dGiu", "dGiu", "dGiu", "dGiu", "dGiu"], "cards": {"C02": 1, "F01": 1, "F07": 2, "F08": 2, "F02": 1, "C07": 1, "F20": 1, "C05": 2, "C13": 2, "F17": 1, "F10": 2, "F09": 2, "C09": 2}, "desc": "Fuoco e Celeste: i Cavalieri preparano il Patto dell'Angelo della Settima Tromba, Gavri'El brucia a ogni uccisione.", "img": "DECK_AS01"}, {"code": "AS02", "tier": "C", "name": "Acque Ascese (Acqua/Celeste)", "t": "A", "dice": ["dBen", "dBen", "dBen", "dBen", "dBen"], "cards": {"C01": 1, "C03": 2, "C08": 3, "C12": 1, "A02": 2, "A03": 1, "A04": 2, "C05": 2, "C13": 2, "A12": 2, "A19": 1, "C15": 1}, "desc": "Acqua e Celeste: Valchiria pesca, Annunaki riporta gli Acqua, Metatron spazza via gli occultati.", "img": "DECK_AS02"}, {"code": "AS03", "tier": "C", "name": "Vetta Ascesa (Roccia/Celeste)", "t": "R", "dice": ["dVet", "dVet", "dVet", "dVet", "dVet"], "cards": {"R01": 1, "C04": 1, "C03": 2, "C08": 3, "C12": 1, "R07": 2, "R05": 2, "R04": 2, "C13": 2, "C05": 2, "C06": 1, "R12": 1}, "desc": "Roccia e Celeste: Ofanim occulta, Annunaki richiama i giganti, Atlante chiude.", "img": "DECK_AS03"}, {"code": "AS04", "tier": "C", "name": "Ingegneri della Luce (Natura/Celeste)", "t": "N", "dice": ["dEde", "dEde", "dEde", "dEde", "dEde"], "cards": {"C16": 3, "N21": 1, "N12": 3, "N09": 3, "N03": 2, "N02": 1, "C05": 2, "C13": 2, "C11": 1, "N08": 2}, "desc": "Natura e Celeste: il Kerub delle Radici occulta e protegge le pile, Dedalo si sviluppa su Yggdrasil, i Semi di Luce pescano.", "img": "DECK_AS04"}, {"code": "PD01", "tier": "P", "name": "La Fenice Eterna", "t": "F", "dice": ["dFrn", "dFrn", "dF", "dF", "dApo"], "cards": {"FO1": 3, "FO2": 3, "FO3": 3, "FO4": 3, "D05": 2, "D06": 3, "F16": 2, "F11": 3, "F12": 3, "M1": 2, "F19": 1}, "desc": "La Forgia: Fenici dal dado della Fornace, Rogo Sacro e Cenere che Rinasce fino alla Fenice Eterna.", "img": "DECK_PD01"}, {"code": "PD02", "tier": "P", "name": "Le Sette Corone", "t": "F", "dice": ["dApo", "dApo", "dGiu", "dF", "dF"], "cards": {"Z24": 1, "F01": 1, "F02": 2, "F07": 3, "F08": 3, "F03": 1, "D05": 2, "F17": 2, "C07": 2, "F19": 2, "F13": 1}, "desc": "I Cavalieri preparano il Drago Rosso, che si sviluppa nel Drago dalle Sette Corone.", "img": "DECK_PD02"}, {"code": "PD03", "tier": "P", "name": "Il Signore della Terra", "t": "R", "dice": ["dTer", "dTer", "dTer", "dMag", "dMag"], "cards": {"TE1": 3, "TE2": 3, "TE3": 3, "TE4": 2, "D09": 2, "D10": 2, "R07": 3, "R04": 2, "R12": 3, "Z25": 1}, "desc": "Demoni dai dadi della Terraformazione: Colui che divide la Terra e Colui che Unisce la Terra.", "img": "DECK_PD03"}, {"code": "PD04", "tier": "P", "name": "Androidi Antichi", "t": "X", "dice": ["dIng", "dIng", "dIng", "dN", "dPri"], "cards": {"IN1": 3, "IN2": 2, "IN3": 2, "IN4": 2, "N11": 3, "TC2": 2, "M4": 2, "N07": 1, "X03": 2, "Z27": 1}, "desc": "Ingranaggi e Marionette fino all'Androide; se non arriva, attaccano gli Automi del Laboratorio Segreto.", "img": "DECK_PD04"}, {"code": "PD05", "tier": "P", "name": "Il Cubo si Chiude", "t": "C", "dice": ["dAnt", "dCel", "dCel", "dVet", "dBen"], "cards": {"C01": 1, "X21": 1, "C04": 2, "C05": 3, "C06": 3, "C13": 3, "C14": 2, "C10": 2, "X07": 2, "X03": 2, "C15": 1}, "desc": "Controllo Celeste: tutto viene occultato, le Sentinelle del Cubo puniscono chi attacca, poi Metatron e Il Cubo si Chiude.", "img": "DECK_PD05"}, {"code": "PD06", "tier": "P", "name": "Tradimento", "t": "X", "dice": ["dGiu", "dG", "dG", "dCel", "dPri"], "cards": {"Z30": 1, "X26": 1, "X02": 2, "X04": 2, "X13": 3, "X14": 2, "X03": 2, "X22": 2, "X18": 2, "X06": 2, "X05": 2, "X19": 1}, "desc": "Neutrali che cadono uno dopo l'altro: il Disertore cresce, Tradimento ruba la carta migliore.", "img": "DECK_PD06"}, {"code": "MD01", "tier": "M", "name": "I Tre Rotoli", "t": "C", "dice": ["dAnt", "dAnt", "dMal", "dCri", "dR"], "cards": {"Z21": 1, "Z22": 1, "Z23": 1, "Z26": 1, "A21": 3, "F15": 2, "X17": 2, "R17": 2, "R08": 3, "R11": 2, "R19": 1, "D18": 1}, "desc": "Ti difendi con muri di Roccia e intanto peschi tanto, perdendo PV di proposito: sotto i 10 PV, con i tre Rotoli posati in ordine, vinci.", "img": "DECK_MD01"}, {"code": "MD02", "tier": "M", "name": "La Talpa", "t": "X", "dice": ["dG", "dG", "dG", "dG", "dPri"], "cards": {"SS1": 3, "SS4": 3, "SS3": 3, "X25": 2, "X14": 3, "X22": 2, "X23": 2, "X24": 2}, "desc": "Riempi il mazzo avversario di Talpe infiltrate e falle esplodere col Doppiogiochista. Gli Uomini in Nero spiano i Presagi.", "img": "DECK_MD02"}, {"code": "MD03", "tier": "M", "name": "L'Invasione dei Byffo", "t": "X", "dice": ["dG", "dG", "dG", "dCel", "dPri"], "cards": {"BY1": 3, "BY2": 3, "BY3": 3, "BY4": 1, "X18": 3, "X14": 3, "X20": 2, "X23": 2}, "desc": "Un'invasione di Byffo che tornano dall'Abisso, fino al Capro che Ride.", "img": "DECK_MD03"}, {"code": "MD04", "tier": "M", "name": "Il Circo del Clown", "t": "X", "dice": ["dClo", "dMim", "dFor", "dInc", "dPri"], "cards": {"D13": 1, "D14": 1, "D15": 1, "D16": 3, "D17": 3, "D19": 3, "X09": 2, "X13": 3, "X19": 3}, "desc": "Joker, Clown, Mimo e Fortuna: il Baro e il Saggio del Cubo rilanciano i dadi finché i Joker non esplodono.", "img": "DECK_MD04"}, {"code": "MD05", "tier": "M", "name": "Non Si Passa", "t": "R", "dice": ["dR", "dR", "dCri", "dCri", "dA"], "cards": {"R01": 1, "R03": 1, "R08": 3, "R10": 3, "R11": 3, "R19": 3, "A19": 2, "X20": 2, "A15": 2}, "desc": "Zero attacco, solo muri e cure: vinci quando il mazzo finisce e hai più PV.", "img": "DECK_MD05"}];
const PRECON_TIERS = { S: 'Starter', A: 'Advance', U: 'Union', C: 'Ascended', P: 'Pro', M: 'Meme' };
const LORE = { // segnalini per il catalogo
  seq: ['F10', 'F17', 'A16', 'N13', 'N16', 'R17', 'C11', 'C13', 'X18', 'X19'],
  egg: ['N14', 'C06', 'X03', 'X25']
};

/* ======================= REGOLE DI GIOCO ======================= */
function newGame(deckA, deckB, opts) {
  opts = opts || {};
  const g = { p: [], turn: 1, active: opts.first || 0, phase: 'main', log: [], ended: false, winner: null, reason: '', last: null, prevLast: null, uid: 1, rand: rng(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9)), occFlag: false, onLog: opts.onLog, onHit: opts.onHit, onTrap: opts.onTrap, onFx: opts.onFx };
  const dice = opts.dice || []; g.human = opts.human || [false, false];
  for (let i = 0; i < 2; i++) { const P = { i, name: (opts.names && opts.names[i]) || ('Giocatore ' + (i + 1)), orig: [...(i ? deckB : deckA)], dice: fixDice(dice[i], i ? deckB : deckA), gold: 0 }; initPlayer(g, P); g.p.push(P); }
  for (const P of g.p) for (let k = 0; k < 5; k++) drawCard(g, P.i, true);
  startTurn(g); return g;
}
function initPlayer(g, P) {
  Object.assign(P, { hp: CFG.hp, deck: shuffle(g, P.orig.filter(id => BY[id] && !BY[id].token && !BY[id].gen)), hand: [], zones: [null, null, null], traps: [null, null, null], abyss: [], healed: 0, resil: 0, normalUsed: false, extraNormal: 0, svilUsed: false, once: new Set(), skipAtk: 0, stats: { legend: 0, traps: 0, seq: 0 }, pool: [], sym: { D: 0, G: 0, P: 0 }, kept: null, lessDice: 0, chooseTurn: 0, moles: [], arca: 0, gear: false, svilMax: 1, genDone: {}, quake: 0 });
  P.heart = heartType(P.orig);
}
function startTurn(g) {
  const P = g.p[g.active]; P.normalUsed = false; P.extraNormal = 0; P.svilUsed = 0; P.svilMax = 1; P.once = new Set(); g.phase = 'roll'; g.last = null; g.prevLast = null; P.pool = [];
  for (const x of P.zones) if (x) { x.attacked = false; x.changed = false; }
  fx(g, 'turn', { pi: g.active, turn: g.turn }); log(g, `— Turno ${g.turn}: ${P.name} —`);
  for (const x of [...g.p[0].zones, ...g.p[1].zones]) if (x && !isOcc(x) && detr(x)) { const n = detr(x); x.defPerm += n; x.cur += n; log(g, `Detriti: ${C(x).n} +${n} DEF.`); }
  for (const x of P.zones) if (x && !isOcc(x) && !g.ended) resilCheck(g, x);
  if (!g.ended && P.hp <= 10) { const tr = id => P.traps.find(t => t && t.id === id); const a = tr('Z21'), b = tr('Z22'), c = tr('Z23'); if (a && b && c && a.set < b.set && b.set < c.set) { log(g, `I tre Rotoli si aprono: l'Alba, la Lacrima, la Stella.`); endGame(g, g.active, 'I tre Rotoli'); return; } }
  if (g.turn > 1 && !g.ended) drawCard(g, g.active);
}
const detr = x => (CFG.detriti && CFG.detriti[x.id] != null) ? CFG.detriti[x.id] : (C(x).detriti || 0);
const canNormal = P => true;
function useNormal(P) { if (!P.normalUsed) P.normalUsed = true; else P.extraNormal--; }
const R = (ok, msg) => ({ ok, msg });
function myMain(g, pi) { return !g.ended && g.active === pi && g.phase === 'main'; }
const payErr = (g, pi, id, pay) => { const c = BY[id]; if (!c.cost || !c.cost.length) return null; if (pay) return payValid(g, pi, c.cost, pay) ? null : 'Dadi scelti non validi.'; return payOptions(g, pi, c.cost).length ? null : 'Dadi insufficienti (' + costLabel(c.cost) + ').'; };
function doPay(g, pi, id, pay) { const c = BY[id]; if (!c.cost || !c.cost.length) return; const idx = pay || autoPay(g, pi, c.cost, id); for (const i of idx) g.p[pi].pool[i].used = true; fx(g, 'pay', { pi, idx, id }); }

function summon(g, pi, hi, pos, zi, pay) {
  const P = g.p[pi], id = P.hand[hi], c = BY[id];
  if (!c || c.k !== 'ag') return R(false, 'Non è un agente.');
  if (!myMain(g, pi)) return R(false, 'Puoi evocare solo nella fase Azioni.');
  if (!canNormal(P)) return R(false, 'Hai già evocato un agente in questo turno.');
  if (c.r === 'L') { if (c.svilOnly) return R(false, 'Si evoca solo tramite Sviluppo (' + c.patto.label + ').'); if (!c.patto.can(g, pi)) return R(false, 'Patto non soddisfatto: ' + c.patto.label + '.'); }
  if (free(P) < 0 && !(c.r === 'L' && c.patto.pay)) return R(false, 'Le zone agente sono piene.');
  { const e = payErr(g, pi, id, pay); if (e) return R(false, e); }
  doPay(g, pi, id, pay); P.hand.splice(hi, 1); useNormal(P);
  if (c.r === 'L') { fx(g, 'patto', { pi, id }); log(g, `${P.name} compie il Patto di ${c.n}!`); if (c.patto.pay) c.patto.pay(g, pi); P.stats.legend++; if (g.ended) return R(true); }
  if (free(P) < 0) { P.hand.push(id); return R(false, 'Le zone agente sono piene.'); }
  const x = placeNew(g, pi, id, c.noDef || c.r === 'L' ? 'atk' : pos, zi);
  log(g, `${P.name} evoca ${c.n} in ${x.pos === 'atk' ? 'attacco' : 'difesa'}.`);
  g.prevLast = g.last; g.occFlag = false; afterEnter(g, pi, x, 'normal');
  g.last = { k: 'ag', t: c.t, id: c.id, byffo: !!c.byffo, pos: x.pos, occ: g.occFlag, svil: false };
  return R(true);
}
function svilTargets(g, pi, hi) {
  const c = BY[g.p[pi].hand[hi]]; if (!c || !c.svil || (g.p[pi].svilUsed || 0) >= (g.p[pi].svilMax || 1) || !myMain(g, pi)) return [];
  if (c.svil.steal && free(g.p[pi]) < 0) return [];
  const jolly = x => x.ctrl === pi && (C(x).jolly || (C(x).jollyN && hasT(c, 'N'))) && !c.svil.steal && (c.r === 'C' || c.r === 'R');
  const res = []; for (const s of [pi, 1 - pi]) for (const x of g.p[s].zones) if (x && !isOcc(x) && x.ret == null && (c.svil.cond(g, pi, x) || jolly(x))) res.push(x);
  return res;
}
function sviluppo(g, pi, hi, t, pos, pay) {
  const P = g.p[pi], id = P.hand[hi], c = BY[id];
  if (!svilTargets(g, pi, hi).includes(t)) return R(false, 'Bersaglio di Sviluppo non valido.');
  { const e = payErr(g, pi, id, pay); if (e) return R(false, e); }
  doPay(g, pi, id, pay); P.hand.splice(hi, 1); P.svilUsed = (P.svilUsed || 0) + 1; if (c.svilOnly) { fx(g, 'patto', { pi, id }); useNormal(P); P.stats.legend++; log(g, `${P.name} compie il Patto di ${c.n}!`); }
  const side = t.ctrl, zi = g.p[side].zones.indexOf(t);
  const x = mk(g, id, pi, c.noDef || c.r === 'L' ? 'atk' : pos); x.under = [...t.under, t.id]; if (t.pileDef) { x.pileDef = t.pileDef; x.defPerm += t.pileDef; x.cur += t.pileDef; } if (t.pileNoOcc) { x.pileNoOcc = true; x.noOcc = true; }
  if (side === pi) P.zones[zi] = x; else { g.p[side].zones[zi] = null; P.zones[free(P)] = x; }
  fx(g, 'svil', { pi, z: P.zones.indexOf(x), id, base: t.id }); log(g, `${P.name} sviluppa ${c.n} su ${C(t).n} (pila di ${x.under.length + 1}).`);
  g.prevLast = g.last; g.occFlag = false;
  if (c.svil.fn) withSrc(g, c.t, () => c.svil.fn(g, x));
  afterEnter(g, pi, x, 'svil'); if (!g.ended) emit(g, { type: 'svil', x, base: x.under[x.under.length - 1], pi, side: pi });
  g.last = { k: 'ag', t: c.t, id: c.id, byffo: !!c.byffo, pos: x.pos, occ: g.occFlag, svil: true };
  return R(true);
}
function spellCheck(g, pi, hi) {
  const P = g.p[pi], c = BY[P.hand[hi]];
  if (!c || c.k !== 'mg') return 'Non è un Evento.';
  if (!myMain(g, pi)) return 'Gli Eventi si giocano solo nella fase Azioni.';
  if (c.once && P.once.has(c.id)) return 'Puoi giocarla una sola volta per turno.';
  if (c.patto && !c.patto.can(g, pi)) return 'Patto non soddisfatto: ' + c.patto.label + '.';
  if (c.can && !c.can(g, pi)) return 'Requisiti non soddisfatti.';
  return payErr(g, pi, P.hand[hi]);
}
function playSpell(g, pi, hi, pay) {
  const err = spellCheck(g, pi, hi); if (err) return R(false, err);
  const P = g.p[pi], id = P.hand[hi], c = BY[id];
  { const e = payErr(g, pi, id, pay); if (e) return R(false, e); }
  doPay(g, pi, id, pay); P.hand.splice(hi, 1); P.abyss.push(id); fx(g, 'spell', { pi, id }); log(g, `${P.name} attiva ${c.n}.`);
  if (c.r === 'L') P.stats.legend++;
  g.prevLast = g.last; g.occFlag = false; g.spellNow = pi; try { withSrc(g, c.t, () => c.play(g, pi)); } finally { g.spellNow = null; } P.once.add(c.id);
  g.last = { k: 'mg', t: c.t, occ: g.occFlag };
  return R(true);
}
function setTrap(g, pi, hi, zi, pay) {
  const P = g.p[pi], id = P.hand[hi], c = BY[id];
  if (!c || c.k !== 'tr') return R(false, 'Non è un Presagio.');
  if (!myMain(g, pi)) return R(false, 'I Presagi si posano nella fase Azioni.');
  const z = zi == null ? freeT(P) : zi; if (z < 0 || z > 2 || P.traps[z]) return R(false, 'Zona Presagio non disponibile.');
  { const e = payErr(g, pi, id, pay); if (e) return R(false, e); }
  doPay(g, pi, id, pay); P.hand.splice(hi, 1); P.traps[z] = { id, set: g.turn }; fx(g, 'set', { pi, z, id }); log(g, `${P.name} posiziona un Presagio.`);
  g.last = { k: 'tr', t: c.t };
  emit(g, { type: 'setTrap', pi, z });
  return R(true);
}
function canActive(g, x) { const c = C(x); return !!c.act && onField(g, x) && !isOcc(x) && x.actUsed !== g.turn && myMain(g, x.ctrl) && c.act.can(g, x); }
function useActive(g, x) { if (!canActive(g, x)) return R(false, 'Abilità non disponibile.'); x.actUsed = g.turn; fx(g, 'kw', { pi: x.ctrl, z: g.p[x.ctrl].zones.indexOf(x), id: x.id, kw: 'ABILITÀ' }); log(g, `${C(x).n}: ${C(x).act.label}.`); withSrc(g, C(x).t, () => C(x).act.fn(g, x)); return R(true); }
function canChange(g, x) { return onField(g, x) && myMain(g, x.ctrl) && x.entered < g.turn && !x.changed && !x.attacked && !isOcc(x) && !C(x).noDef && x.ret == null; }
function changePos(g, x) { if (!canChange(g, x)) return R(false, 'Non puoi cambiare posizione ora.'); x.pos = x.pos === 'atk' ? 'def' : 'atk'; x.changed = true; log(g, `${C(x).n} passa in ${x.pos === 'atk' ? 'attacco' : 'difesa'}.`); return R(true); }
function enterBattle(g) { if (g.phase === 'main' && !g.ended) { g.phase = 'battle'; fx(g, 'battle', { pi: g.active }); log(g, 'Fase Attacco.'); } }
function canAttack(g, x) { if (g.p[x.ctrl].arca && g.turn < g.p[x.ctrl].arca) return false; if (CFG.sick && x.entered === g.turn) return false; if (CFG.oneDirect && g.directUsed === g.turn && !targets(g, x).length && x.id !== 'X05') return false; return !g.ended && onField(g, x) && g.active === x.ctrl && (g.phase === 'main' || g.phase === 'battle') && x.pos === 'atk' && !isOcc(x) && !x.attacked && g.turn > 1 && x.noAtk !== g.turn && g.p[x.ctrl].skipAtk !== g.turn; }
function targets(g, x) { let t = vis(g, 1 - x.ctrl); if (hasT(C(x), 'X')) t = t.filter(y => !y.noNeutralAtk); return t; }
const canDirect = (g, x) => targets(g, x).length === 0 || x.id === 'X05';
function resilCheck(g, y) {
  const c = C(y); if (!c.resil || y.resilDone || y.resil < c.resil.n) return;
  y.resilDone = true; const P = g.p[y.ctrl]; P.resil++; fx(g, 'kw', { pi: y.ctrl, z: P.zones.indexOf(y), id: y.id, kw: 'RESILIENZA' }); log(g, `Resilienza: ${c.n}!`);
  withSrc(g, c.t, () => c.resil.fn(g, y)); if (g.ended) return;
  if (hasT(c, 'R')) for (const s of vis(g, y.ctrl)) if (s.id === 'R03') { s.atkPerm += 1; log(g, 'La Sfinge +1 ATK.'); }
  emit(g, { type: 'resil', x: y, pi: y.ctrl, side: y.ctrl });
}
function killed(g, killer) { const c = C(killer); if (c.onKill && onField(g, killer) && !isOcc(killer)) withSrc(g, c.t, () => c.onKill(g, killer)); }
function attack(g, x, t) {
  if (!canAttack(g, x)) return R(false, 'Questo agente non può attaccare.');
  if (t) { if (!targets(g, x).includes(t)) return R(false, 'Bersaglio non valido.'); }
  else if (!canDirect(g, x)) return R(false, "Devi attaccare un agente avversario.");
  enterBattle(g); x.attacked = true;
  const pi = x.ctrl, oi = 1 - pi;
  fx(g, 'attack', { pi, z: g.p[pi].zones.indexOf(x), tz: t ? g.p[oi].zones.indexOf(t) : -1, id: x.id }); log(g, `${C(x).n} attacca ${t ? C(t).n : 'direttamente'}!`);
  const ev0 = { type: 'declare', att: x, tgt: t, pi }; emit(g, ev0);
  if (g.ended) return R(true); if (ev0.negated || !onField(g, x) || isOcc(x)) return R(true);
  if (t && x.id === 'C09' && !isOcc(x) && t.pos === 'def' && hasT(C(t), 'X') && onField(g, t)) { log(g, `${C(x).n}: ${C(t).n} va nell'Abisso prima del calcolo dei danni.`); toAbyss(g, t, 'effect'); if (!g.ended) emit(g, { type: 'attack', att: x, tgt: t, tgtDef: true, tgtCtrl: 1 - x.ctrl, attAtk: atkC(g, x), pi: x.ctrl }); checkWin(g); return R(true); }
  if (t) t.hits = (t.hits || 0) + 1;
  const attAtk = atkC(g, x, t, 'att'); const tgtDef = t ? t.pos === 'def' : false; const tgtCtrl = t ? t.ctrl : null;
  if (!t) {
    let n = attAtk; if (x.id === 'X05' && targets(g, x).length) n = Math.floor(n / 2); if (CFG.directHalf) n = Math.ceil(n / 2); g.directUsed = g.turn;
    dmg(g, oi, n, 'battle'); if (g.ended) return R(true);
    emit(g, { type: 'direct', att: x, to: oi });
  } else if (t.pos === 'atk') {
    const a = attAtk, b = atkC(g, t, x, 'def');
    if (a > b && t.shield) { t.shield = false; log(g, `La Corazza assorbe l'attacco su ${C(t).n}.`); }
    else if (a > b) { dmg(g, oi, a - b, 'battle'); if (!g.ended) { if (t.id === 'X10' && hasT(C(x), 'N') && !isOcc(t)) log(g, `${C(t).n} resiste: non va nell'Abisso.`); else { g.killer = x; toAbyss(g, t, 'battle'); g.killer = null; killed(g, x); } } }
    else if (b > a) { dmg(g, pi, b - a, 'battle'); if (!g.ended) { g.killer = t; toAbyss(g, x, 'battle'); g.killer = null; killed(g, t); } }
    else log(g, 'Pareggio: nessun agente distrutto.');
  } else {
    let red = attAtk; if (x.id === 'F09') red += hasT(C(t), 'N') ? 5 : 3;
    t.resil++; if (t.shield) { t.shield = false; log(g, `La Corazza assorbe l'attacco su ${C(t).n}.`); } else { t.cur -= red; log(g, `${C(t).n} perde ${red} DEF.`); }
    if (!g.ended && onField(g, t) && dfn(g, t) <= 0) { g.killer = x; toAbyss(g, t, 'battle'); g.killer = null; killed(g, x); }
  }
  if (!g.ended) emit(g, { type: 'attack', att: x, tgt: t, tgtDef, tgtCtrl, attAtk, pi });
  if (x.twice === g.turn && onField(g, x)) { x.twice = 0; x.attacked = false; log(g, `${C(x).n} può attaccare ancora.`); }
  checkWin(g); return R(true);
}
function endTurn(g) {
  if (g.ended) return; const pi = g.active, P = g.p[pi];
  if (g.phase === 'roll') roll(g);
  if (g.ended) return; g.phase = 'end';
  P.pickDie = null; P.faceOne = null;
  if ((P.pool || []).some(d => !d.used)) emit(g, { type: 'endTurn', pi, side: pi }); if (g.ended) return;
  { let n = 0; for (const d of P.pool || []) if (!d.used && !d.kept) { d.lost = true; n++; } if (n) { log(g, `${P.name} perde ${n} ${n === 1 ? 'dado non usato' : 'dadi non usati'}.`); fx(g, 'lost', { pi }); } }
  while (P.hand.length > 7) { let bi = 0, bv = 1e9; P.hand.forEach((id, i) => { if (cval(id) < bv) { bv = cval(id); bi = i; } }); const [id] = P.hand.splice(bi, 1); P.abyss.push(id); log(g, `${P.name} scarta ${nm(id)} (limite mano).`); }
  for (const Q of g.p) for (const x of Q.zones) if (x) { x.atkTemp = 0; x.defTemp = 0; }
  for (const Q of g.p) for (let i = 0; i < 3; i++) { const x = Q.zones[i]; if (x && x.ret != null && x.hug) { Q.zones[i] = null; g.p[x.owner].abyss.push(...x.under, x.id); log(g, `${C(x).n} non è più tornato: va nell'Abisso.`); continue; } if (x && x.ret != null) { Q.zones[i] = null; x.ctrl = x.ret; x.ret = null; const O = g.p[x.ctrl]; const f = free(O); if (f >= 0) { O.zones[f] = x; log(g, `${C(x).n} torna al suo proprietario.`); } else { O.abyss.push(...x.under, x.id); log(g, `${C(x).n} va nell'Abisso.`); } } }
  for (const Q of g.p) for (const x of Q.zones) if (x && x.occEnd && x.occEnd <= g.turn) { x.occEnd = 0; log(g, `${C(x).n} riappare.`); if (x.merk) { x.merk = false; x.atkPerm += 6; log(g, `${C(x).n} torna dal Carro: +6 ATK.`); } }
  if (g.p.every(Q => !Q.deck.length && !Q.hand.length && !Q.zones.some(Boolean))) return endGame(g, g.p[0].hp === g.p[1].hp ? -1 : g.p[0].hp > g.p[1].hp ? 0 : 1, 'Nessuno può più giocare: vince chi ha più PV');
  if (g.turn >= MAXT) return endGame(g, g.p[0].hp === g.p[1].hp ? -1 : g.p[0].hp > g.p[1].hp ? 0 : 1, 'Limite di turni: vince chi ha più PV');
  g.active = 1 - pi; g.turn++; startTurn(g);
}

/* ======================= IA ======================= */
function choosePos(g, pi, c) {
  if (c.noDef || c.r === 'L') return 'atk';
  if (c.resil && c.d >= c.a) return 'def';
  const om = Math.max(0, ...vis(g, 1 - pi).map(y => atkC(g, y)));
  return c.a > om ? 'atk' : 'def';
}
function resilPen(g, x, y) { const c = C(y); if (!c.resil || y.resilDone || y.resil + 1 < c.resil.n) return 0; if (y.id === 'R01') return 100; if (y.id === 'R02') return atkC(g, x) <= 12 ? 40 : 6; return 7; }
function bestAttack(g, x) {
  const T = targets(g, x); if (!T.length) return { t: null, s: 100 + atkC(g, x) };
  let best = null;
  for (const y of T) {
    const a = atkC(g, x, y, 'att'); let s;
    if (y.pos === 'atk') { const b = atkC(g, y, x, 'def'); if (a <= b) continue; s = val(g, y) + (a - b) + 5; }
    else { let red = a; if (x.id === 'F09') red += hasT(C(y), 'N') ? 5 : 3; s = (red >= dfn(g, y) ? val(g, y) + 3 : 1 + red / 10) - resilPen(g, x, y); }
    if (!best || s > best.s) best = { t: y, s };
  }
  if (x.id === 'X05') { const d = Math.floor(atkC(g, x) / 2); if (!best || best.s < d) best = { t: null, s: d }; }
  return best && best.s > 0 ? best : null;
}
const canAfford = (g, pi, id) => !payErr(g, pi, id);
function aiStep(g, pi) {
  if (!myMain(g, pi)) return false; const P = g.p[pi];
  for (const x of vis(g, pi)) if (C(x).diceAct && canActive(g, x) && (!C(x).aiAct || C(x).aiAct(g, x)) && useActive(g, x).ok) return true;
  for (const x of vis(g, pi)) if (canMartire(g, x) && aiWantsMartire(g, x) && useMartire(g, x).ok) return true;
  if (free(P) >= 0) for (let i = 0; i < P.hand.length; i++) { const c = BY[P.hand[i]]; if (c.k === 'ag' && c.r !== 'L' && !c.cost.length && (c.id !== 'D02' || !P.pool.some(d => d.used))) { if (summon(g, pi, i, choosePos(g, pi, c)).ok) return true; } }
  for (let i = 0; i < P.hand.length; i++) { const c = BY[P.hand[i]]; if (c.k === 'ag' && c.r === 'L' && !c.svilOnly && c.patto.can(g, pi) && canAfford(g, pi, c.id)) { if (summon(g, pi, i, 'atk').ok) return true; } }
  if ((P.svilUsed || 0) < (P.svilMax || 1)) {
    let best = null;
    P.hand.forEach((id, i) => { const c = BY[id]; if (!c.svil || !canAfford(g, pi, id)) return; for (const t of svilTargets(g, pi, i)) { const s = cval(id) + (c.svilOnly ? 40 : 0) + (t.ctrl === pi ? -val(g, t) * 0.3 : val(g, t)); if (!best || s > best.s) best = { i, t, s, c }; } });
    if (best && sviluppo(g, pi, best.i, best.t, choosePos(g, pi, best.c)).ok) return true;
  }
  if (free(P) >= 0) {
    const cand = P.hand.map((id, i) => ({ i, c: BY[id] })).filter(z => z.c.k === 'ag' && z.c.r !== 'L' && canAfford(g, pi, z.c.id) && !(z.c.joker && rolled(P, z.c.jok) < 2));
    const want = c => P.hand.some(id => BY[id].svilBase && (BY[id].svilBase(c) || ((c.jolly || (c.jollyN && hasT(BY[id], 'N'))) && !BY[id].svil.steal && (BY[id].r === 'C' || BY[id].r === 'R'))));
    const b = bestBy(cand, z => cval(z.c.id) + (want(z.c) ? 8 : 0) + (z.c.joker ? 4 * rolled(P, z.c.jok) : 0));
    if (b && summon(g, pi, b.i, choosePos(g, pi, b.c)).ok) return true;
  }
  for (const x of vis(g, pi)) if (canActive(g, x) && (!C(x).aiAct || C(x).aiAct(g, x)) && useActive(g, x).ok) return true;
  for (let i = 0; i < P.hand.length; i++) { const c = BY[P.hand[i]]; if (c.k !== 'mg' || spellCheck(g, pi, i)) continue; if (c.ai && !c.ai(g, pi)) continue; if (playSpell(g, pi, i).ok) return true; }
  if (freeT(P) >= 0) { const SEQ = ['Z21', 'Z22', 'Z23']; const setR = SEQ.filter(id => P.traps.some(t => t && t.id === id)); const nextR = SEQ[setR.length]; const lastSet = Math.max(-1, ...P.traps.filter(t => t && SEQ.includes(t.id)).map(t => t.set));
    const holdsR = SEQ.some(id => P.hand.includes(id)); const roomForR = P.traps.filter(t => !t).length > (3 - setR.length - 1);
    const i = P.hand.findIndex(id => BY[id].k === 'tr' && canAfford(g, pi, id) && (SEQ.includes(id) ? id === nextR && lastSet < g.turn && setR.every((r, k) => r === SEQ[k]) : (!holdsR || roomForR)));
    if (i >= 0 && setTrap(g, pi, i).ok) return true; }
  for (const x of vis(g, pi)) {
    if (!canChange(g, x)) continue; const om = oppMaxAtk(g, pi), a = atkC(g, x);
    if (x.pos === 'def' && (a > om || !vis(g, 1 - pi).length) && !(C(x).resil && !x.resilDone) && a >= 8) { changePos(g, x); return true; }
    if (x.pos === 'atk' && a < om && !bestAttack(g, x)) { changePos(g, x); return true; }
  }
  return false;
}
function aiAttackStep(g, pi) {
  if (g.ended || g.active !== pi) return false;
  const ats = vis(g, pi).filter(x => canAttack(g, x)).sort((a, b) => atkC(g, b) - atkC(g, a));
  for (const x of ats) { const b = bestAttack(g, x); if (b) { attack(g, x, b.t); return true; } }
  return false;
}
function aiTurn(g) { const pi = g.active; if (g.phase === 'roll') roll(g); if (g.ended || g.active !== pi || g.phase !== 'main') return; let k = 0; while (k++ < 40 && aiStep(g, pi)); if (g.ended) return; enterBattle(g); k = 0; while (k++ < 12 && aiAttackStep(g, pi)); if (!g.ended) endTurn(g); }
function playAI(g) { let k = 0; while (!g.ended && k++ < 600) aiTurn(g); return g; }

/* ======================= STARTER E AVVERSARI ======================= */
const STARTERS = [
  { t: 'F', duelist: "L'Emissario dell'Est", deck: "Fiamme dell'Ultimo Giorno", place: 'Grande Regno dell’Est', desc: 'Cavalieri dell’Apocalisse, danni diretti e il Drago Rosso.', ace: 'F01', dice: ['dF','dF','dF','dF','dF'],
    cards: { F01: 1, F02: 1, F07: 2, F08: 2, F09: 2, F12: 2, F11: 1, F10: 1, F16: 2, F17: 2, F14: 1, F19: 2, F20: 1 } },
  { t: 'A', duelist: 'La Sorella del Lago', deck: 'Preghiera delle Acque', place: 'Laghi dell’Alleanza del Sud', desc: 'Cure continue, Preghiera e la Madre delle Acque.', ace: 'A01', dice: ['dA','dA','dA','dA','dA'],
    cards: { A01: 1, A02: 1, A07: 2, A08: 2, A09: 2, A12: 2, A10: 1, A11: 1, A16: 2, A17: 1, A15: 1, A13: 1, A20: 2, A19: 1 } },
  { t: 'N', duelist: 'Il Capomastro del Porto', deck: 'Cantieri dello Stretto', place: 'Cittadella-Porto', desc: 'Pile di Sviluppo, pesca e il Maestro Hiram.', ace: 'N01', dice: ['dN','dN','dN','dN','dN'],
    cards: { N01: 1, N02: 1, N11: 3, N10: 2, N07: 2, N12: 2, N04: 1, N16: 2, N17: 1, N13: 1, N15: 1, N19: 2, N20: 1 } },
  { t: 'R', duelist: 'Il Viandante delle Cime', deck: 'Memoria della Montagna', place: 'Montagne del Nord', desc: 'Muri di DEF, Resilienza che colpisce, resistenza al Fuoco e Atlante.', ace: 'R01', dice: ['dR','dR','dR','dR','dR'],
    cards: { R01: 1, R03: 1, R07: 2, R08: 2, R10: 2, R12: 1, R11: 1, R04: 1, R06: 1, R16: 1, R17: 2, R14: 1, R15: 1, R18: 1, R19: 1, R20: 1 } },
  { t: 'C', duelist: 'La Veggente del Cubo', deck: 'Voci degli Antichi', place: 'Terzo Regno, ai piedi del Cubo', desc: 'Occulta, ritorni dall’Abisso e Metatron. Misto con Acqua e Roccia.', ace: 'C01', dice: ['dCel','dCel','dCel','dCel','dCri'],
    cards: { C01: 1, C04: 1, C05: 1, C08: 2, C09: 2, C06: 1, A12: 2, R11: 2, C13: 2, C11: 1, C12: 1, A16: 1, C15: 2, C14: 1 } },
  { t: 'X', duelist: 'Il Capitano della Corona', deck: 'Guardia del Terzo Regno', place: 'Capitale del Terzo Regno', desc: 'Soldati, Templari Neri e rinforzi. Nessun Leggendario.', ace: 'X02', dice: ['dG','dG','dG','dG','dCel'],
    cards: { X02: 1, X04: 1, X13: 3, X14: 2, X10: 2, X11: 1, X12: 2, X19: 2, X20: 1, X18: 1, X17: 1, X22: 1, X23: 1, X25: 1 } }
];

/* ---------- mazzi costruiti (archetipi) ---------- */
const ARCHETYPES = [
  { t: 'F', deck: 'Fuoco Aggressivo', desc: 'Fenrir, Surtr e danni rapidi.', ace: 'F03', cards: { F01: 1, F02: 1, F03: 1, F04: 2, F07: 2, F08: 2, F12: 3, F16: 2, F17: 2, F15: 1, F19: 1, F20: 1, F18: 1 } },
  { t: 'A', deck: 'Acqua Preghiera', desc: 'Preghiere, anti-Fuoco e Danu.', ace: 'A03', cards: { A01: 1, A02: 1, A03: 1, A04: 2, A06: 2, A10: 2, A07: 2, A09: 1, A16: 2, A14: 1, A13: 1, A17: 1, A18: 1, A20: 1, A19: 1 } },
  { t: 'N', deck: 'Natura Sviluppo', desc: 'Pile alte, Yggdrasil e Hiram.', ace: 'N03', cards: { N01: 1, N02: 1, N03: 1, N04: 2, N07: 2, N11: 3, N10: 2, N16: 2, N13: 1, N15: 1, N17: 1, N18: 1, N19: 1, N20: 1 } },
  { t: 'R', deck: 'Roccia Valanga', desc: 'Resilienza offensiva e Valanga.', ace: 'R02', cards: { R01: 1, R02: 1, R03: 1, R04: 2, R05: 1, R06: 1, R07: 2, R10: 2, R08: 1, R13: 1, R15: 2, R16: 1, R17: 1, R18: 1, R20: 2 } },
  { t: 'C', deck: 'Celeste Occulta', desc: 'Celeste puro: Occulta e l’Occhio.', ace: 'C06', cards: { C01: 1, C04: 1, C05: 2, C06: 2, C08: 2, C09: 2, C03: 1, C07: 1, C10: 1, C13: 2, C11: 1, C12: 1, C14: 1, C15: 2 } },
  { t: 'C', deck: 'Divini dell’Apocalisse', desc: 'Celeste + Fuoco: Settima Tromba e Drago.', ace: 'C02', cards: { C02: 1, F01: 1, F07: 2, F08: 1, F12: 2, C07: 2, C05: 1, C08: 1, F02: 1, F17: 2, C13: 1, F16: 2, F19: 1, C15: 1, F20: 1 } },
  { t: 'C', deck: 'Acque e Monti Celesti', desc: 'Celeste + Acqua + Roccia, Sefirot.', ace: 'C03', cards: { C01: 1, C03: 1, C08: 2, A12: 2, R11: 2, A07: 1, R04: 1, C06: 1, C05: 1, C12: 2, A16: 1, C13: 2, C15: 1, R19: 1, A20: 1 } },
  { t: 'A', deck: 'Monaci della Pioggia', desc: 'Dadi Acqua: Monaci, Danza della Pioggia e Frutti della Terra.', ace: 'D01', dice: ['dA', 'dA', 'dA', 'dCen', 'dBen'], cards: { D01: 3, D02: 3, D03: 2, D04: 3, A07: 2, A12: 2, A02: 1, A04: 2, A16: 2, A20: 2, A05: 1, M2: 2 } },
  { t: 'X', deck: 'Joker della Sorte', desc: 'Tre Joker, Cappello, Bastone e dadi misti.', ace: 'D13', dice: ['dCen', 'dInc', 'dPal', 'dCen', 'dEde'], cards: { D13: 1, D14: 1, D15: 1, D16: 2, D17: 2, D18: 1, D19: 3, D12: 1, X13: 3, X14: 2, X11: 2, X19: 2, X20: 1, X22: 1, X23: 1 } },
  { t: 'F', deck: 'Forgia della Fenice', desc: 'Fornace: contatore Fenice e La Fenice Eterna.', ace: 'FO1', dice: ['dFrn', 'dFrn', 'dF', 'dF', 'dApo'], cards: { FO1: 3, FO2: 3, FO3: 3, FO4: 3, D05: 2, D06: 3, F16: 2, F11: 3, F12: 3, M1: 2, F19: 1 } },
  { t: 'R', deck: 'Terraformazione', desc: 'Demoni di pietra, Sisifo e Colui che divide la Terra.', ace: 'TE1', dice: ['dTer', 'dTer', 'dR', 'dR', 'dMag'], cards: { TE1: 3, TE2: 3, TE3: 3, TE4: 2, D09: 3, D10: 2, R07: 3, R08: 2, R11: 2, M3: 2, R15: 1 } },
  { t: 'X', deck: "Officina dell'Ingranaggio", desc: "Marionette di ogni tipo, Ingranaggi e L'Androide.", ace: 'IN1', dice: ['dIng', 'dIng', 'dN', 'dG', 'dPri'], cards: { IN1: 3, IN2: 3, IN3: 2, IN4: 2, N11: 3, M1: 1, M2: 1, M3: 1, M4: 1, N05: 1, N07: 2, X08: 2, N04: 1, X13: 2 } },
  { t: 'N', deck: "Giardino dell'Eden", desc: 'Adamo ed Eva, il Serpente e il Libero Arbitrio.', ace: 'ED2', dice: ['dEde', 'dEde', 'dEde', 'dN', 'dCel'], cards: { ED1: 1, ED2: 3, ED3: 3, ED4: 2, ED5: 3, ED6: 2, D07: 2, D11: 1, D12: 1, C08: 2, N10: 2, N12: 2, C05: 1 } },
  { t: 'X', deck: 'Campione dei Cinque Regni', desc: 'Neutrale con tre tipi, Campione e Rotoli.', ace: 'X01', cards: { X01: 1, X02: 1, X04: 1, X06: 1, X13: 2, X11: 2, A12: 1, F12: 1, R12: 1, X10: 1, X16: 2, X19: 1, X18: 1, X15: 1, X22: 1, X23: 1, X25: 1 } }
];
/* mazzo casuale legale: 12 agenti, 5 magie, 3 trappole dai tipi indicati */
function randomDeck(rand, types) {
  const pool = CARDS.filter(c => types.includes(c.t)); const out = [], cnt = {}; let legs = 0;
  const pick = (k, n) => { const cands = pool.filter(c => c.k === k); let guard = 0; while (n > 0 && guard++ < 500) { const c = cands[Math.floor(rand() * cands.length)]; if (!c) break; const lim = c.r === 'L' || c.fs ? 1 : c.r === 'E' ? 2 : 3; if (c.fs || c.set || c.token || c.gen) continue; if ((cnt[c.id] || 0) >= lim) continue; if (c.r === 'L' && legs >= 2) continue; if (c.id === 'N01' && !out.some(id => BY[id].svil)) continue; cnt[c.id] = (cnt[c.id] || 0) + 1; if (c.r === 'L') legs++; out.push(c.id); n--; } };
  pick('ag', 12); pick('mg', 5); pick('tr', 3); return out;
}
const BSN = {}; (() => { const ord = { ag: 0, mg: 1, tr: 2 }, ro = { L: 0, E: 1, R: 2, C: 3, U: 4 }; let n = 0;
  for (const t of ['F', 'A', 'N', 'R', 'C', 'X']) CARDS.filter(c => c.t === t && !c.fs && !c.set && !c.token && !c.gen).sort((a, b) => ord[a.k] - ord[b.k] || ro[a.r] - ro[b.r] || a.id.localeCompare(b.id)).forEach(c => { BSN[c.id] = ++n; });
  CARDS.filter(c => c.fs).sort((a, b) => a.id.localeCompare(b.id)).forEach(c => { BSN[c.id] = ++n; });
  for (const st of ['TC', 'AN', 'VU', 'SS', 'BY', 'ED', 'FO', 'TE', 'IN']) CARDS.filter(c => c.set === st).sort((a, b) => (b.gen ? 1 : 0) - (a.gen ? 1 : 0)).forEach(c => { BSN[c.id] = ++n; }); CARDS.filter(c => c.token).forEach(c => { BSN[c.id] = 999; }); })();
const bsCode = id => BY[id].code || 'BS-' + String(BSN[id]).padStart(3, '0');
const deckList = s => Object.entries(s.cards).flatMap(([id, n]) => Array(n).fill(id));
function validateDeck(list) {
  const err = []; if (list.length < 20 || list.length > 30) err.push('Il mazzo deve avere 20–30 carte (' + list.length + ').');
  const cnt = {}; list.forEach(id => cnt[id] = (cnt[id] || 0) + 1);
  for (const id in cnt) { if (!BY[id] || BY[id].token || BY[id].gen) err.push('Carta non valida ' + (BY[id] ? BY[id].n : id)); else if (BY[id].r === 'L' && cnt[id] > 1) err.push(BY[id].n + ': 1 copia max.'); else if ((BY[id].fs || BY[id].r === 'U') && cnt[id] > 1) err.push(BY[id].n + ': fuoriserie, 1 copia.'); else if (BY[id].r === 'E' && cnt[id] > 2) err.push(BY[id].n + ': 2 copie max (Epica).'); else if (cnt[id] > 3) err.push(BY[id].n + ': 3 copie max.'); }
  if (Object.keys(cnt).filter(id => BY[id] && BY[id].r === 'L').length > 2) err.push('Massimo 2 Leggendarie.');
  return err;
}

const API = { PRECON, PRECON_TIERS, canMartire, useMartire, pickDie, glossaryOf, KW, FACES, DICE, DICE_ORDER, TIERS, GEN, SYMN, roll, payOptions, payValid, autoPay, autoDice, unused, rolled, setFace, faceOk, costLabel, payErr, canAfford, heartType, detr, BSN, bsCode, hasT, CFG, TYPES, RAR, CARDS, BY, LORE, STARTERS, ARCHETYPES, randomDeck, rng, deckList, validateDeck, newGame, startTurn, endTurn, summon, sviluppo, svilTargets, playSpell, spellCheck, setTrap, useActive, canActive, changePos, canChange, enterBattle, canAttack, attack, targets, canDirect, atkC, dfn, maxDef, isOcc, vis, onField, free, freeT, canNormal, choosePos, aiStep, aiAttackStep, aiTurn, playAI, bestAttack, MAXT };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.NWO = API;
})(typeof window !== 'undefined' ? window : globalThis);
