'use strict';
const $=id=>document.getElementById(id);
const state={ws:null,code:'',you:null,room:null,game:null,decks:[],cards:{},selected:null,selZone:null,mode:null,ready:false};
const typeIcon={F:'🔥',A:'💧',N:'🌿',R:'⛰',C:'✦',X:'⚙'};
const safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function show(id){for(const s of ['home','lobby','duel'])$(s).classList.toggle('hidden',s!==id);}
function toast(s){$('toast').textContent=s;$('toast').classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
function send(m){if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify(m));else toast('Non sei connesso al server.');}
function connect(){const ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws');state.ws=ws;ws.onopen=()=>{$('connection').textContent='● Connesso';$('connection').style.color='#9ee4a9';};ws.onclose=()=>{$('connection').textContent='● Disconnesso';$('connection').style.color='#ff8989';toast('Connessione interrotta. Ricarica la pagina per rientrare in una nuova stanza.');};ws.onerror=()=>toast('Server non raggiungibile.');ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='hello'){state.decks=m.decks;state.cards=m.cards;const sel=$('deckSelect');sel.innerHTML=m.decks.map(d=>`<option value="${safe(d.id)}">${safe(d.name)}</option>`).join('');renderDeck();}if(m.type==='joined'){state.code=m.code;state.you=m.you;$('roomCode').textContent=m.code;show('lobby');}if(m.type==='room'){state.room=m;renderRoom();}if(m.type==='state'){state.game=m.game;state.selected=null;state.selZone=null;state.mode=null;show('duel');renderGame();}if(m.type==='error')toast(m.message);};}
$('create').onclick=()=>send({type:'create',name:$('nameCreate').value});
$('join').onclick=()=>send({type:'join',name:$('nameJoin').value,code:$('codeInput').value.toUpperCase()});
$('codeInput').oninput=e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);toast('Codice copiato: '+state.code)}catch{toast('Il codice è '+state.code)}};
$('deckSelect').onchange=()=>{renderDeck();send({type:'select',deck:$('deckSelect').value});};
$('ready').onclick=()=>{state.ready=!state.ready;send({type:'ready',ready:state.ready});};
$('resign').onclick=()=>{if(confirm('Vuoi arrenderti?'))send({type:'resign'});};
function renderDeck(){const d=state.decks.find(x=>x.id===$('deckSelect').value);$('deckInfo').textContent=d?`${d.count} carte · ${d.description||'Mazzo precostruito NWO'}`:'';}
function renderRoom(){const r=state.room;if(!r)return;state.ready=!!r.players[state.you]?.ready;$('ready').textContent=state.ready?'ANNULLA PRONTO':'SONO PRONTO';$('players').innerHTML=r.players.map((p,i)=>`<div><b>${i===state.you?'TU':`Giocatore ${i+1}`}</b> — ${p?safe(p.name):'In attesa…'} <span class="status">${p?(p.ready?'✓ Pronto':'Selezione mazzo'):'Non connesso'}</span></div>`).join('');}
function act(kind,other={}){send({type:'action',action:{kind,...other}});}
function cardHTML(id,extra='',style=''){const c=state.cards[id]||{};const img=(typeof SPR!=='undefined'&&SPR[id])?`<img src="${SPR[id]}" alt="">`:`<div style="font-size:2rem">${typeIcon[c.t]||'✦'}</div>`;return `<div class="card ${extra}" style="${style}">${img}<div class="name">${safe(c.n||id)}</div><small>${safe(c.r||'')} ${c.a!=null?'· ATK '+c.a:''} ${c.d!=null?'· DEF '+c.d:''}</small></div>`;}
function fieldCard(x,side,i){if(!x)return `<div class="zone ${side==='me'?'mine':''}"><span class="muted">Zona vuota</span></div>`;return `<div class="zone ${side==='me'?'mine':''}" data-side="${side}" data-zone="${i}">${cardHTML(x.id,state.selZone===side+':'+i?'sel':'')}<div class="muted" style="font-size:.72rem">${x.pos==='atk'?'⚔ ATT':'🛡 DIF'}${x.attacked?' · Ha attaccato':''}${x.under?' · Sviluppo '+x.under:''}</div></div>`;}
function setActions(actions){$('actions').innerHTML=actions.map(a=>`<button class="${a.alt?'alt':''}" data-act="${a.id}" ${a.disabled?'disabled':''}>${a.label}</button>`).join('');$('actions').querySelectorAll('button').forEach(b=>b.onclick=()=>actions.find(a=>a.id===b.dataset.act)?.fn());}
function renderGame(){const g=state.game;if(!g)return;const me=g.p[state.you],op=g.p[1-state.you],turn=g.active===state.you&&!g.ended;
 $('myName').textContent=me.name;$('oppName').textContent=op.name;$('myHp').textContent='♥ '+me.hp;$('oppHp').textContent='♥ '+op.hp;$('oppHand').textContent='Mano: '+op.hand+' carte';
 $('turnLabel').textContent=g.ended?'PARTITA TERMINATA':turn?'IL TUO TURNO':'TURNO AVVERSARIO';$('phaseLabel').textContent=({roll:'Lancio dadi',main:'Fase azioni',battle:'Fase attacco',end:'Fine turno'})[g.phase]||g.phase;$('deckCounts').textContent=`Mazzo: ${me.deckCount} · Avversario: ${op.deckCount}`;
 $('myZones').innerHTML=me.zones.map((x,i)=>fieldCard(x,'me',i)).join('');$('oppZones').innerHTML=op.zones.map((x,i)=>fieldCard(x,'opp',i)).join('');
 $('myTraps').textContent=me.traps.map(x=>x?'🂠 '+(state.cards[x]?.n||x):'—').join(' · ');$('oppTraps').textContent=op.traps.map(x=>x?'🂠':'—').join(' · ');
 $('dice').innerHTML=me.pool.map((d,i)=>`<div class="die ${d.used||d.lost?'used':''}" title="Dado ${i+1}"><b>${safe(d.f)}</b><div style="font-size:.7rem">${safe(d.d)}</div></div>`).join('')||'<span class="muted">Dadi non ancora lanciati</span>';
 $('hand').innerHTML=me.hand.map((id,i)=>`<div data-hand="${i}">${cardHTML(id,state.selected===i?'sel':'')}</div>`).join('');
 $('hand').querySelectorAll('[data-hand]').forEach(el=>el.onclick=()=>{state.selected=Number(el.dataset.hand);state.selZone=null;state.mode=null;renderGame();});
 document.querySelectorAll('[data-side][data-zone]').forEach(el=>el.onclick=()=>zoneClick(el.dataset.side,Number(el.dataset.zone)));
 $('log').innerHTML=(g.log||[]).map(x=>`<div>${safe(typeof x==='string'?x:JSON.stringify(x))}</div>`).join('');$('log').scrollTop=$('log').scrollHeight;
 const actions=[];if(g.ended){$('gameNotice').textContent=(g.winner===state.you?'🏆 HAI VINTO!':'Hai perso.')+' '+(g.reason||'');$('cardActions').innerHTML='';setActions([]);return;}
 if(!turn){$('gameNotice').textContent='Attendi che il tuo avversario completi il turno.';$('cardActions').innerHTML='';setActions([]);return;}
 $('gameNotice').textContent=state.mode==='svil'?'Seleziona sul campo il bersaglio dello Sviluppo.':state.mode==='attack'?'Seleziona un agente avversario come bersaglio, oppure attacca direttamente.':'Seleziona una carta della tua mano o un agente sul campo per vedere le azioni disponibili.';
 if(g.phase==='roll')actions.push({id:'roll',label:'🎲 LANCIA DADI',fn:()=>act('roll')});
 if(g.phase==='main'||g.phase==='battle'){
 if(g.phase==='main')actions.push({id:'battle',label:'⚔ FASE ATTACCO',fn:()=>act('battle')});
 actions.push({id:'end',label:'PASSA TURNO →',alt:true,fn:()=>act('end')});
 }
 if(me.pickDie)actions.push({id:'reroll',label:'Ritira un dado (scegli il numero)',fn:()=>{const i=Number(prompt('Numero dado da ritirare (1-'+me.pool.length+')'))-1;if(Number.isInteger(i)&&i>=0&&i<me.pool.length)act('reroll',{die:i});}});
 if(me.chooseTurn===g.turn&&g.phase==='main')actions.push({id:'face',label:'Scegli faccia dado',alt:true,fn:()=>{const die=Number(prompt('Numero dado (1-'+me.pool.length+')'))-1,face=prompt('Faccia desiderata (F/A/N/R/C/X/S)');if(Number.isInteger(die)&&face)act('face',{die,face:face.toUpperCase()});}});
 if(state.mode==='attack')actions.unshift({id:'direct',label:'⚔ ATTACCO DIRETTO',fn:()=>act('attack',{zone:state.selZone?.split(':')[1],target:null})});
 setActions(actions);renderCardActions(me,g);
}
function renderCardActions(me,g){const host=$('cardActions');host.innerHTML='';if(state.selected!==null&&g.phase==='main'){
 const id=me.hand[state.selected],c=state.cards[id];if(!c)return;
 const title=document.createElement('div');title.className='notice';title.style.width='100%';title.innerHTML=`<b>${safe(c.n)}</b> — ${safe(c.text||'')}<br><span class="muted">Costo: ${(c.cost||[]).map(safe).join(' · ')||'Gratuito'}</span>`;host.append(title);
 const btn=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=fn;host.append(b);};
 if(c.k==='ag'){btn('Evoca in attacco',()=>act('summon',{hand:state.selected,pos:'atk'}));btn('Evoca in difesa',()=>act('summon',{hand:state.selected,pos:'def'}));if(c.svil)btn('Sviluppo (scegli bersaglio)',()=>{state.mode='svil';$('gameNotice').textContent='Seleziona il bersaglio sul campo.';});}
 if(c.k==='mg')btn('Gioca Magia',()=>act('spell',{hand:state.selected}));
 if(c.k==='tr')btn('Posiziona Presagio',()=>act('trap',{hand:state.selected}));
 }
 if(state.selZone?.startsWith('me:')){const zone=Number(state.selZone.split(':')[1]),x=me.zones[zone];if(!x)return;const c=state.cards[x.id]||{};const btn=(name,kind)=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>{if(kind==='attack'){state.mode='attack';renderGame()}else act(kind,{zone})};host.append(b);};if(g.phase==='main')btn('Cambia posizione','position');if(c.act)btn('Usa abilità','active');if(c.martire)btn('Attiva Martire','martyr');if(g.phase==='main'||g.phase==='battle')btn('Attacca','attack');}
}
function zoneClick(side,i){const g=state.game;if(!g||g.ended||g.active!==state.you)return;
 if(state.mode==='svil'&&state.selected!==null){act('svil',{hand:state.selected,side:side==='me'?state.you:1-state.you,target:i,pos:'atk'});return;}
 if(state.mode==='attack'&&side==='opp'){act('attack',{zone:Number(state.selZone?.split(':')[1]),target:i});return;}
 state.selected=null;state.mode=null;state.selZone=side+':'+i;renderGame();}
connect();
