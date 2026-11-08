// Test-only, loopback Nostr relay. Production uses the vendored Nostr transport.
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
export async function localRelay(port=4182){
 const clients=new Set(),events=[]
 const server=createServer((_request,response)=>{response.writeHead(404);response.end()})
 const frame=(socket,value,opcode=1)=>{const data=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));let header;if(data.length<126)header=Buffer.from([0x80|opcode,data.length]);else if(data.length<65536){header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(data.length,2)}else{header=Buffer.alloc(10);header[0]=0x80|opcode;header[1]=127;header.writeBigUInt64BE(BigInt(data.length),2)}socket.write(Buffer.concat([header,data]))}
 const match=(event,filters)=>filters.some(filter=>(!filter.kinds||filter.kinds.includes(event.kind))&&(!filter.authors||filter.authors.includes(event.pubkey))&&(!filter.ids||filter.ids.includes(event.id))&&Object.entries(filter).every(([key,values])=>!key.startsWith('#')||event.tags?.some(tag=>tag[0]===key.slice(1)&&values.includes(tag[1]))))
 const message=(client,text)=>{const input=JSON.parse(text);if(input[0]==='REQ'){const [,id,...filters]=input;client.subscriptions.set(id,filters);for(const event of events)if(match(event,filters))frame(client.socket,['EVENT',id,event]);frame(client.socket,['EOSE',id])}else if(input[0]==='CLOSE')client.subscriptions.delete(input[1]);else if(input[0]==='EVENT'){const event=input[1];events.push(event);if(events.length>500)events.shift();for(const peer of clients)for(const [id,filters]of peer.subscriptions)if(match(event,filters))frame(peer.socket,['EVENT',id,event]);frame(client.socket,['OK',event.id,true,''])}}
 server.on('upgrade',(request,socket)=>{
   const key=request.headers['sec-websocket-key'];if(!key){socket.destroy();return}
   socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n')
   const client={socket,subscriptions:new Map(),buffer:Buffer.alloc(0),parts:[],opcode:0};clients.add(client)
   socket.on('data',chunk=>{try{client.buffer=Buffer.concat([client.buffer,chunk]);if(client.buffer.length>2*1024*1024)throw Error('Oversized relay frame');while(client.buffer.length>=2){const data=client.buffer,opcode=data[0]&15,final=!!(data[0]&128),masked=!!(data[1]&128);let size=data[1]&127,offset=2;if(size===126){if(data.length<4)return;size=data.readUInt16BE(2);offset=4}else if(size===127){if(data.length<10)return;size=Number(data.readBigUInt64BE(2));offset=10}if(size>1024*1024)throw Error('Oversized relay message');if(data.length<offset+(masked?4:0)+size)return;const mask=masked?data.subarray(offset,offset+4):undefined;if(masked)offset+=4;const payload=Buffer.from(data.subarray(offset,offset+size));client.buffer=data.subarray(offset+size);if(mask)for(let index=0;index<payload.length;index++)payload[index]^=mask[index%4];if(opcode===8){socket.end();return}if(opcode===9){frame(socket,payload,10);continue}if(opcode===1)client.opcode=1;if(opcode===1||opcode===0){client.parts.push(payload);if(final){const body=Buffer.concat(client.parts);client.parts=[];if(client.opcode===1)message(client,body.toString())}}}}catch{socket.destroy()}})
   socket.on('close',()=>clients.delete(client));socket.on('error',()=>clients.delete(client))
 })
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve))
 return {close:()=>new Promise(resolve=>{for(const client of clients)client.socket.destroy();server.close(resolve)}),eventCount:()=>events.length}
}
