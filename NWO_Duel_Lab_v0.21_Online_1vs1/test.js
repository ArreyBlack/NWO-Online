'use strict';
const assert=require('assert');
const {server,decks}=require('./server');
const E=require('./engine');
const {WebSocket}=globalThis;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function peer(url){const ws=new WebSocket(url);const inbox=[];let wake=null;ws.addEventListener('message',e=>{const m=JSON.parse(e.data);inbox.push(m);if(wake){wake();wake=null;}});return {ws,inbox,send:x=>ws.send(JSON.stringify(x)),async wait(type,timeout=3000){const end=Date.now()+timeout;while(Date.now()<end){const idx=inbox.findIndex(x=>x.type===type);if(idx>=0)return inbox.splice(idx,1)[0];await Promise.race([new Promise(r=>wake=r),delay(100)]);}throw Error('Timeout waiting '+type);}};}
async function run(){await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;const a=peer('ws://127.0.0.1:'+port+'/ws'),b=peer('ws://127.0.0.1:'+port+'/ws');
 await a.wait('hello');await b.wait('hello');
 a.send({type:'create',name:'Alice'});const room=await a.wait('joined');assert.match(room.code,/^[A-Z2-9]{6}$/);await a.wait('room');
 b.send({type:'join',code:room.code,name:'Bob'});await b.wait('joined');await b.wait('room');await a.wait('room');
 a.send({type:'select',deck:'s0'});await a.wait('room');await b.wait('room');
 b.send({type:'select',deck:'s1'});await a.wait('room');await b.wait('room');
 a.send({type:'ready',ready:true});await a.wait('room');await b.wait('room');
 b.send({type:'ready',ready:true});await a.wait('room');await b.wait('room');
 const g0=(await a.wait('state')).game,g1=(await b.wait('state')).game;
 assert.strictEqual(g0.p[0].hand.length,5);assert.strictEqual(g0.p[1].hand,5);assert.strictEqual(g1.p[0].hand,5);assert.strictEqual(g1.p[1].hand.length,5);
 assert.strictEqual(g0.active,g1.active);const actor=g0.active===0?a:b,other=g0.active===0?b:a;
 other.send({type:'action',action:{kind:'roll'}});const err=await other.wait('error');assert.match(err.message,/tuo turno/);
 actor.send({type:'action',action:{kind:'roll'}});const r0=(await actor.wait('state')).game,r1=(await other.wait('state')).game;assert.strictEqual(r0.phase,'main');assert.strictEqual(r1.phase,'main');
 actor.send({type:'action',action:{kind:'end'}});const e0=(await actor.wait('state')).game,e1=(await other.wait('state')).game;assert.strictEqual(e0.active,1-g0.active);assert.strictEqual(e0.active,e1.active);
 console.log('PASS: creazione stanza, ingresso, mazzi, ready, privacy mani, turni, dadi, sincronizzazione. '+decks.length+' mazzi disponibili; '+Object.keys(E.BY).length+' carte.');a.ws.close();b.ws.close();await delay(150);server.close();process.exit(0);}
run().catch(e=>{console.error(e);process.exit(1)});
