'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {WebSocketServer, WebSocket} = require('./socket');
const E = require('./engine');
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const sessions = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from(crypto.randomBytes(6), x => alphabet[x % alphabet.length]).join('');
const send = (ws, data) => {if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data));};
const player = (room, ws) => room.players.findIndex(p => p && p.ws===ws);
const cardList = d => E.deckList(d);
const decks = [
 ...E.STARTERS.map((d,i)=>({id:'s'+i,name:d.deck||d.duelist,description:d.desc||'',cards:cardList(d),dice:d.dice})),
 ...E.ARCHETYPES.map((d,i)=>({id:'a'+i,name:d.deck||d.name||('Archetipo '+(i+1)),description:d.desc||'',cards:cardList(d),dice:d.dice}))
];
function roomSummary(room) {return {type:'room',code:room.code,phase:room.phase,players:room.players.map(p=>p?{name:p.name,ready:p.ready,connected:!!p.ws,deckName:decks.find(d=>d.id===p.deck)?.name||'—'}:null)};}
function broadcast(room) {room.players.forEach(p=>p&&send(p.ws,roomSummary(room)));}
function snapshot(g, pi) {
 const opp=1-pi;
 const mapP=(P,i)=>({i,name:P.name,hp:P.hp,hand:i===pi?P.hand:P.hand.length,deckCount:P.deck.length,abyss:P.abyss.slice(-18),zones:P.zones.map(x=>x?{id:x.id,pos:x.pos,cur:x.cur,atkPerm:x.atkPerm,defPerm:x.defPerm,atkTemp:x.atkTemp,defTemp:x.defTemp,attacked:!!x.attacked,changed:!!x.changed,entered:x.entered,under:x.under?.length||0,ctrl:x.ctrl,owner:x.owner,actUsed:x.actUsed,ret:x.ret}:null),traps:P.traps.map(t=>t?(i===pi?t.id:'?'):null),pool:(P.pool||[]).map(d=>({d:d.d,f:d.f,used:!!d.used,lost:!!d.lost,kept:!!d.kept})),dice:P.dice,normalUsed:P.normalUsed,svilUsed:P.svilUsed,svilMax:P.svilMax,chooseTurn:P.chooseTurn,pickDie:P.pickDie,faceOne:P.faceOne?{idx:P.faceOne.idx}:null,sym:P.sym});
 return {turn:g.turn,active:g.active,phase:g.phase,ended:g.ended,winner:g.winner,reason:g.reason,log:g.log.slice(-35),p:g.p.map(mapP),you:pi};
}
function sync(room) {if(!room.game)return;room.players.forEach((p,i)=>p&&send(p.ws,{type:'state',game:snapshot(room.game,i)}));}
function start(room) {
 const ds=room.players.map(p=>decks.find(d=>d.id===p.deck));
 if(ds.some(d=>!d))throw Error('Mazzo non valido');
 room.game=E.newGame(ds[0].cards,ds[1].cards,{names:room.players.map(p=>p.name),dice:ds.map(d=>d.dice),human:[true,true],first:crypto.randomInt(2),seed:crypto.randomInt(1e9)});
 room.phase='playing';broadcast(room);sync(room);
}
function action(g, pi, a) {
 if(g.ended)return {ok:false,msg:'La partita è finita'};
 if(g.active!==pi)return {ok:false,msg:'Non è il tuo turno'};
 const P=g.p[pi], x=P.zones[Number(a.zone)], target=g.p[1-pi].zones[Number(a.target)];
 const hi=Number(a.hand), id=P.hand[hi], c=E.BY[id];
 const pay=()=>E.autoPay(g,pi,c.cost||[],id);
 switch(a.kind){
 case 'roll':return E.roll(g);
 case 'face':return E.setFace(g,pi,Number(a.die),String(a.face));
 case 'reroll':return E.pickDie(g,pi,Number(a.die));
 case 'summon':if(!c)return {ok:false,msg:'Carta non valida'};return E.summon(g,pi,hi,a.pos==='def'?'def':'atk',null,pay());
 case 'spell':if(!c)return {ok:false,msg:'Carta non valida'};return E.playSpell(g,pi,hi,pay());
 case 'trap':if(!c)return {ok:false,msg:'Carta non valida'};return E.setTrap(g,pi,hi,null,pay());
 case 'svil':if(!c)return {ok:false,msg:'Carta non valida'};{const t=g.p[Number(a.side)]?.zones[Number(a.target)];if(!t)return {ok:false,msg:'Bersaglio non valido'};return E.sviluppo(g,pi,hi,t,a.pos==='def'?'def':'atk',pay());}
 case 'active':return x?E.useActive(g,x):{ok:false,msg:'Agente non valido'};
 case 'martyr':return x?E.useMartire(g,x):{ok:false,msg:'Agente non valido'};
 case 'position':return x?E.changePos(g,x):{ok:false,msg:'Agente non valido'};
 case 'battle':E.enterBattle(g);return {ok:true};
 case 'attack':return x?E.attack(g,x,a.target===null?null:target):{ok:false,msg:'Agente non valido'};
 case 'end':E.endTurn(g);return {ok:true};
 default:return {ok:false,msg:'Azione sconosciuta'};
 }
}
function handle(ws,msg){
 if(!msg||typeof msg!=='object')return;
 const s=sessions.get(ws);
 if(msg.type==='create'){
  if(s)return send(ws,{type:'error',message:'Sei già in una stanza'});
  let c;do{c=code()}while(rooms.has(c));
  const p={name:String(msg.name||'Giocatore 1').trim().slice(0,25)||'Giocatore 1',ws,ready:false,deck:decks[0].id};
  const room={code:c,players:[p,null],phase:'lobby',game:null,created:Date.now()};rooms.set(c,room);sessions.set(ws,{room,pi:0});send(ws,{type:'joined',code:c,you:0});broadcast(room);return;
 }
 if(msg.type==='join'){
  if(s)return send(ws,{type:'error',message:'Sei già in una stanza'});
  const room=rooms.get(String(msg.code||'').trim().toUpperCase());
  if(!room)return send(ws,{type:'error',message:'Stanza non trovata'});
  if(room.phase!=='lobby'||room.players[1])return send(ws,{type:'error',message:'Stanza piena o partita già iniziata'});
  room.players[1]={name:String(msg.name||'Giocatore 2').trim().slice(0,25)||'Giocatore 2',ws,ready:false,deck:decks[1].id};sessions.set(ws,{room,pi:1});send(ws,{type:'joined',code:room.code,you:1});broadcast(room);return;
 }
 if(!s)return send(ws,{type:'error',message:'Crea o entra in una stanza'});
 const {room,pi}=s;
 if(msg.type==='select'&&room.phase==='lobby'){
  if(!decks.some(d=>d.id===msg.deck))return send(ws,{type:'error',message:'Mazzo sconosciuto'});
  room.players[pi].deck=msg.deck;room.players[pi].ready=false;broadcast(room);
 } else if(msg.type==='ready'&&room.phase==='lobby'){
  room.players[pi].ready=!!msg.ready;broadcast(room);
  if(room.players.every(p=>p&&p.ready)){try{start(room)}catch(e){room.players.forEach(p=>p&&(p.ready=false));broadcast(room);send(ws,{type:'error',message:e.message});}}
 } else if(msg.type==='action'&&room.phase==='playing'){
  const a=msg.action||{};
  try {const r=action(room.game,pi,a);if(r?.ok===false)send(ws,{type:'error',message:r.msg||'Azione non consentita'});else sync(room);}catch(e){console.error('Action error',e);send(ws,{type:'error',message:'Errore azione: '+e.message});}
 } else if(msg.type==='resign'&&room.phase==='playing'){
  room.game.ended=true;room.game.winner=1-pi;room.game.reason='Resa';sync(room);
 }
}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const rel=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','client.js','art.js'].includes(rel)){res.writeHead(404);return res.end('Not found');}
 const file=path.join(__dirname,'public',rel);
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':rel.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);});
});
const wss=new WebSocketServer({server,maxPayload:16000});
wss.on('connection',ws=>{
 send(ws,{type:'hello',decks:decks.map(d=>({id:d.id,name:d.name,description:d.description,count:d.cards.length})),cards:Object.fromEntries(Object.entries(E.BY).map(([id,c])=>[id,{n:c.n,k:c.k,r:c.r,t:c.t,a:c.a,d:c.d,cost:c.cost,text:c.text,svil:!!c.svil,act:!!c.act,martire:!!c.martire}]))});
 ws.on('message',raw=>{try{handle(ws,JSON.parse(raw))}catch(e){send(ws,{type:'error',message:'Richiesta non valida'})}});
 ws.on('close',()=>{const s=sessions.get(ws);sessions.delete(ws);if(!s)return;const {room,pi}=s;room.players[pi].ws=null;room.players[pi].ready=false;
   if(room.phase==='playing'&&!room.game.ended){room.game.ended=true;room.game.winner=1-pi;room.game.reason='Avversario disconnesso';sync(room);}
   broadcast(room);setTimeout(()=>{if(rooms.get(room.code)===room&&room.players.every(p=>!p?.ws))rooms.delete(room.code)},60000);
 });
});
setInterval(()=>{for(const [c,r] of rooms)if(Date.now()-r.created>6*3600000)rooms.delete(c)},3600000).unref();
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log('NWO Online v0.21 http://localhost:'+PORT));
module.exports={server,rooms,decks,action,snapshot,start};
