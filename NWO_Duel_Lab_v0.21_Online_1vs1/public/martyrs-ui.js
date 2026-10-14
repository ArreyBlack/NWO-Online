'use strict';
/* MARTYRS DUEL HUD: server remains the only gameplay authority. */
(function(){
const ICON={F:'🔥',A:'💧',N:'🌿',R:'🪨',C:'✨',X:'⚙️',S:'⭐'};
const esc=s=>safe(s);
const label=(c)=>({ag:'AGENTE',mg:'MAGIA',tr:'PRESAGIO'})[c?.k]||'CARTA';
const el=(tag,className,html)=>{const e=document.createElement(tag);if(className)e.className=className;if(html!==undefined)e.innerHTML=html;return e};
const pill=(title,value)=>'<span class="m-pill"><strong>'+esc(title)+'</strong> '+esc(value)+'</span>';
const card=(id)=>state.cards[id]||{n:id};
const image=(id)=>typeof SPR!=='undefined'&&SPR[id]?'<img src="'+SPR[id]+'" alt="" loading="lazy">':'<div class="m-fallback">'+(ICON[card(id).t]||'✦')+'</div>';
const htm=(id,entry=null)=>{
 const c=card(id),stats=entry?'<p><b>Posizione:</b> '+(entry.pos==='atk'?'Attacco':'Difesa')+' · <b>Attacchi:</b> '+(entry.attacked?'usato':'pronto')+'</p>':'';
 return '<div class="m-detail-art">'+image(id)+'</div><div class="m-detail-content"><div class="m-tag">'+esc(label(c))+' · '+esc(c.r||'')+' '+(ICON[c.t]||'')+'</div><h2>'+esc(c.n||id)+'</h2><p class="m-card-id">'+esc(id)+'</p>'+stats+'<div class="m-attributes">'+pill('ATK',c.a??'—')+pill('DEF',c.d??'—')+pill('COSTO',(c.cost||[]).join(' · ')||'0')+'</div><div class="m-effect">'+esc(c.text||'Nessuna descrizione disponibile.')+'</div></div>'
};
let modal;
function openCard(id,entry){if(!id||id==='?')return;if(!modal){modal=el('div','m-overlay');modal.innerHTML='<div class="m-modal" role="dialog" aria-modal="true" aria-label="Dettaglio carta"><button type="button" class="m-close" aria-label="Chiudi">✕</button><div class="m-modal-body"></div></div>';document.body.append(modal);modal.querySelector('.m-close').onclick=()=>modal.classList.remove('visible');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('visible')});window.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.remove('visible')})}modal.querySelector('.m-modal-body').innerHTML=htm(id,entry);modal.classList.add('visible');modal.querySelector('.m-close').focus();}
function build(){
 const arena=document.getElementById('duel');if(!arena||document.getElementById('m-statbar'))return;
 const bar=el('div','m-statbar panel');bar.id='m-statbar';bar.innerHTML='<div><span class="label">NWO · MARTYRS</span><div class="m-game-sub">Duello multigiocatore · campo condiviso</div></div><div class="m-stats" id="m-stats"></div>';arena.insertBefore(bar,arena.firstChild);
 const battle=document.getElementById('actions');if(battle){const controls=el('div','m-toolbar');controls.innerHTML='<button type="button" id="m-guide" class="alt">? COMANDI</button><button type="button" id="m-graves" class="alt">☠ ABISSO</button><button type="button" id="m-info" class="alt">📜 REGISTRO</button>';battle.parentElement.insertBefore(controls,battle);document.getElementById('m-guide').onclick=()=>showHelp();document.getElementById('m-graves').onclick=showGraves;document.getElementById('m-info').onclick=()=>document.getElementById('log').scrollIntoView({behavior:'smooth'});}
 const source=document.getElementById('dice');if(source){const parent=source.parentElement;const opp=el('div','m-oppdice');opp.id='m-oppdice';parent.insertBefore(opp,source);}
}
function showHelp(){
 const message='Seleziona una carta nella tua mano: sotto appaiono EVOCa, MAGIA, PRESAGIO o SVILUPPO.\nSeleziona un tuo agente sul campo per cambiare posizione, usare abilità, attaccare.\nPer attaccare scegli ATTACCA e poi un bersaglio avversario, oppure ATTACCO DIRETTO.\nI dadi sono selezionabili per ritirare o cambiare faccia quando la regola lo permette.\nTasto destro o doppio click su una carta: scheda dettagliata.';
 alert(message);
}
function showGraves(){const g=state.game;if(!g)return;const me=g.p[state.you],op=g.p[1-state.you];let html='<div class="m-graves"><h2>☠ ABISSO</h2>';for(const [name,p] of [['IL TUO ABISSO',me],['ABISSO AVVERSARIO',op]]){html+='<h3>'+name+'</h3><div class="m-grave-grid">'+(p.abyss?.length?p.abyss.map(id=>'<button class="m-grave-card" data-detail="'+esc(id)+'">'+esc(card(id).n||id)+'</button>').join(''):'<span class="muted">Nessuna carta</span>')+'</div>';}html+='</div>';const wrapper=el('div','m-overlay visible');wrapper.innerHTML='<div class="m-modal m-wide"><button class="m-close" aria-label="Chiudi">✕</button>'+html+'</div>';document.body.append(wrapper);wrapper.querySelector('.m-close').onclick=()=>wrapper.remove();wrapper.addEventListener('click',e=>{if(e.target===wrapper)wrapper.remove();const id=e.target.closest('[data-detail]')?.dataset.detail;if(id)openCard(id)});}
function enhance(){
 if(!state.game)return;build();const g=state.game,me=g.p[state.you],op=g.p[1-state.you];const stats=document.getElementById('m-stats');if(!stats)return;
 stats.innerHTML=pill('TURNO',g.turn)+pill('FASE',g.phase.toUpperCase())+pill('ABISSO TU',me.abyss?.length||0)+pill('ABISSO RIVALE',op.abyss?.length||0);
 const oppdice=document.getElementById('m-oppdice');oppdice.innerHTML='<span class="label">Dadi avversari</span> '+(op.pool?.length?op.pool.map(d=>'<span class="m-small-die '+(d.used||d.lost?'inactive':'')+'">'+esc(d.f)+'<small>'+esc(d.d)+'</small></span>').join(''):'<span class="muted">In attesa del lancio</span>');
 const yourTurn=g.active===state.you&&!g.ended;
 const dice=document.getElementById('dice');dice.querySelectorAll('.die').forEach((die,i)=>{const d=me.pool[i];if(!d)return;die.title='Dado '+(i+1)+' ('+d.d+')'+(d.used?' — utilizzato':'');if(yourTurn&&me.pickDie&&!d.used&&!d.lost){die.classList.add('m-pickable');die.onclick=()=>act('reroll',{die:i})}else if(yourTurn&&me.chooseTurn===g.turn&&g.phase==='main'){die.classList.add('m-pickable');die.onclick=()=>{const face=prompt('Faccia desiderata: F (Fuoco), A (Acqua), N (Natura), R (Roccia), C (Celeste), X (Neutrale), S (speciale)');if(face&&/^[FANRCXS]$/i.test(face.trim()))act('face',{die:i,face:face.trim().toUpperCase()});else if(face)toast('Inserisci una faccia valida.')}}});
 const mark=document.getElementById('m-card-hint')||el('div','m-hint');mark.id='m-card-hint';mark.textContent='✦ Click: seleziona la carta · Doppio click o click destro: dettagli';const hand=document.getElementById('hand');hand.before(mark);
 document.querySelectorAll('[data-hand]').forEach(div=>{const i=Number(div.dataset.hand),id=me.hand[i];div.title='Doppio click o click destro per informazioni';div.ondblclick=e=>{e.stopPropagation();openCard(id)};div.oncontextmenu=e=>{e.preventDefault();openCard(id)}});
 document.querySelectorAll('[data-side][data-zone]').forEach(div=>{const s=div.dataset.side,i=Number(div.dataset.zone),entry=(s==='me'?me:op).zones[i];if(!entry)return;div.title='Doppio click o click destro per informazioni';div.ondblclick=e=>{e.stopPropagation();openCard(entry.id,entry)};div.oncontextmenu=e=>{e.preventDefault();openCard(entry.id,entry)};});
 const handTitle=hand.previousElementSibling;if(handTitle?.tagName==='H3')handTitle.textContent='LA TUA MANO · '+me.hand.length+' CARTE';
}
const prev=renderGame;renderGame=function(){prev();enhance()};
build();
})();
