'use strict';
// WebSocket RFC6455 minimale, senza dipendenze, per stanze 1vs1.
const crypto=require('crypto');
const EventEmitter=require('events');
class Socket extends EventEmitter {
 constructor(socket,head){super();this.socket=socket;this.readyState=1;this.buffer=Buffer.alloc(0);this.fragment=null;socket.on('data',data=>this.consume(data));socket.on('close',()=>{this.readyState=3;this.emit('close')});socket.on('error',()=>socket.destroy());if(head?.length)this.consume(head);}
 send(data){if(this.readyState!==1)return;this.frame(1,Buffer.from(data));}
 frame(op,payload){const n=payload.length;let header;if(n<126){header=Buffer.from([0x80|op,n]);}else if(n<65536){header=Buffer.alloc(4);header[0]=0x80|op;header[1]=126;header.writeUInt16BE(n,2);}else{header=Buffer.alloc(10);header[0]=0x80|op;header[1]=127;header.writeBigUInt64BE(BigInt(n),2);}this.socket.write(Buffer.concat([header,payload]));}
 consume(data){this.buffer=Buffer.concat([this.buffer,data]);while(this.buffer.length>=2){const b=this.buffer;const fin=!!(b[0]&128),op=b[0]&15,masked=!!(b[1]&128);let len=b[1]&127,off=2;if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4;}else if(len===127){if(b.length<10)return;const v=b.readBigUInt64BE(2);if(v>BigInt(16000))return this.socket.destroy();len=Number(v);off=10;}if(!masked||len>16000)return this.socket.destroy();if(b.length<off+4+len)return;const mask=b.subarray(off,off+4),payload=Buffer.from(b.subarray(off+4,off+4+len));for(let i=0;i<len;i++)payload[i]^=mask[i%4];this.buffer=b.subarray(off+4+len);if(op===8){this.socket.end();return;}if(op===9){this.frame(10,payload);continue;}if(op===10)continue;if(op===1||op===0){if(op===1)this.fragment=[];if(!this.fragment)return this.socket.destroy();this.fragment.push(payload);if(fin){const full=Buffer.concat(this.fragment);this.fragment=null;this.emit('message',full);}}else return this.socket.destroy();}}
}
class WebSocketServer extends EventEmitter{
 constructor({server}){super();server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||!req.headers['sec-websocket-key']){socket.destroy();return;}const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');this.emit('connection',new Socket(socket,head));});}
}
const WebSocket={OPEN:1};module.exports={WebSocketServer,WebSocket};
