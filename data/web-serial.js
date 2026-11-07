'use strict';
// Direct Web Serial transport for the firmware's CRC-protected TCP tunnel.
// No commands are replayed when a transport fails or changes.
const SerialWire={HELLO:1,READY:2,OPEN:3,OPENED:4,DATA:5,ACK:6,CLOSE:7,PING:8,PONG:9,MAX:512};
function serialCrc(bytes){let crc=65535;for(const b of bytes){crc^=b<<8;for(let n=0;n<8;n++)crc=(crc&32768?(crc<<1)^0x1021:crc<<1)&65535;}return crc;}
function serialPacket(kind,id=0,data=new Uint8Array()){
  if(data.length>512)throw new Error(uiText('USB-Paket zu groß'));
  const out=new Uint8Array(data.length+10);out.set([68,85,83,66,kind,id,data.length&255,data.length>>8]);out.set(data,8);
  const crc=serialCrc(out.subarray(4,out.length-2));out[out.length-2]=crc&255;out[out.length-1]=crc>>8;return out;
}
class SerialDecoder{
  constructor(){this.buffer=new Uint8Array();}
  feed(data){
    const merged=new Uint8Array(this.buffer.length+data.length);merged.set(this.buffer);merged.set(data,this.buffer.length);this.buffer=merged;
    const packets=[];
    while(this.buffer.length>=4){
      let start=0;while(start<=this.buffer.length-4&&!(this.buffer[start]===68&&this.buffer[start+1]===85&&this.buffer[start+2]===83&&this.buffer[start+3]===66))start++;
      this.buffer=this.buffer.slice(start);if(this.buffer.length<8)break;
      const size=this.buffer[6]|this.buffer[7]<<8;
      if(size>512){this.buffer=this.buffer.slice(1);continue;}
      if(this.buffer.length<size+10)break;
      const crc=this.buffer[size+8]|this.buffer[size+9]<<8;
      if(serialCrc(this.buffer.subarray(4,size+8))!==crc){this.buffer=this.buffer.slice(1);continue;}
      packets.push({kind:this.buffer[4],id:this.buffer[5],data:this.buffer.slice(8,size+8)});this.buffer=this.buffer.slice(size+10);
    }
    return packets;
  }
}
function serialWait(ms=4000){
  let done=false,resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=value=>{if(!done){done=true;clearTimeout(timer);yes(value);}};reject=error=>{if(!done){done=true;clearTimeout(timer);no(error);}};});
  const timer=setTimeout(()=>reject(new Error(uiText('USB-Zeitüberschreitung'))),ms);
  // A cancellation may happen before the caller starts awaiting this waiter.
  promise.catch(()=>{});return {promise,resolve,reject};
}
class SerialChannel{
  constructor(link,id){this.link=link;this.id=id;this.opened=serialWait();this.closed=false;this.queue=[];this.bytes=0;this.reader=null;this.ack=null;this.writeChain=Promise.resolve();}
  write(data){
    const work=this.writeChain.then(async()=>{
      for(let i=0;i<data.length;i+=512){
        if(this.closed)throw new Error(uiText('USB-Kanal getrennt'));
        this.ack=serialWait();await this.link.send(SerialWire.DATA,this.id,data.subarray(i,i+512));await this.ack.promise;this.ack=null;
      }
    });this.writeChain=work.catch(()=>{});return work;
  }
  receive(data){
    if(this.reader){const reader=this.reader;this.reader=null;reader.resolve(data);}
    else {if(this.bytes+data.length>32768){this.close(new Error(uiText('USB-Empfangspuffer voll')));return;}this.queue.push(data);this.bytes+=data.length;}
    this.link.send(SerialWire.ACK,this.id).catch(error=>this.close(error));
  }
  async read(){
    if(this.queue.length){const data=this.queue.shift();this.bytes-=data.length;return data;}
    if(this.closed){if(this.error)throw this.error;return null;}
    this.reader=serialWait(15000);try{return await this.reader.promise;}finally{this.reader=null;}
  }
  remoteClose(error){
    this.closed=true;this.error=error;
    this.opened.reject(error||new Error(uiText('USB-Kanal geschlossen')));
    if(this.ack)this.ack.reject(error||new Error(uiText('USB-Schreiben abgebrochen; Befehl wird nicht wiederholt')));
    if(this.reader){error?this.reader.reject(error):this.reader.resolve(null);this.reader=null;}
  }
  close(error){
    if(!this.closed)this.link.send(SerialWire.CLOSE,this.id).catch(()=>{});
    this.remoteClose(error);this.link.channels.delete(this.id);
  }
}
class BrowserSerialLink{
  constructor(port){this.port=port;this.channels=new Map();this.generations=[-1,-1,-1,-1];this.ready=false;this.closed=false;this.writeChain=Promise.resolve();this.httpChain=Promise.resolve();this.httpPending=0;this.handshake=serialWait(5000);this.lastReply=performance.now();}
  fetch(path,options={}){
    if(this.httpPending>=32)return Promise.reject(new Error(uiText('Zu viele wartende USB-Anfragen. Bitte laufenden Vorgang abwarten.')));
    this.httpPending++;
    // The firmware WebServer handles one HTTP request at a time. Preserve one
    // USB channel for it; concurrent file/diagnostic requests must queue, not
    // consume every channel beside the persistent WebSocket.
    const work=this.httpChain.then(()=>serialHttpFetch(this,path,options)).finally(()=>{this.httpPending--;});
    this.httpChain=work.catch(()=>{});return work;
  }
  async start(){
    try{
      await this.port.open({baudRate:921600,bufferSize:16384,flowControl:'none'});
      if(this.port.setSignals)await this.port.setSignals({dataTerminalReady:false,requestToSend:false});
      this.writer=this.port.writable.getWriter();this.reader=this.port.readable.getReader();
      this.readTask=this.readLoop();
      await this.send(SerialWire.HELLO,0,new Uint8Array([1]));
      this.heartbeat=setInterval(()=>{
        if(performance.now()-this.lastReply>5000){this.close(new Error(uiText('USB antwortet nicht')));return;}
        this.send(this.ready?SerialWire.PING:SerialWire.HELLO,0,this.ready?new Uint8Array():new Uint8Array([1])).catch(error=>this.close(error));
      },1000);
      await this.handshake.promise;this.ready=true;
    }catch(error){await this.close(error);throw error;}
  }
  send(kind,id=0,data=new Uint8Array()){
    const work=this.writeChain.then(async()=>{if(this.closed||!this.writer)throw new Error(uiText('USB getrennt'));await this.writer.write(serialPacket(kind,id,data));});
    this.writeChain=work.catch(()=>{});return work;
  }
  async readLoop(){
    const decoder=new SerialDecoder();
    try{
      while(!this.closed){const {value,done}=await this.reader.read();if(done)break;
        for(const {kind,id,data} of decoder.feed(value)){
          this.lastReply=performance.now();
          if(id===0&&kind===SerialWire.READY){this.version=new TextDecoder().decode(data);this.lastReply=performance.now();this.handshake.resolve();}
          if(kind===SerialWire.PONG)this.lastReply=performance.now();
          const channel=this.channels.get(id);if(!channel)continue;
          if(kind===SerialWire.OPENED)channel.opened.resolve();
          else if(kind===SerialWire.ACK)channel.ack?.resolve();
          else if(kind===SerialWire.DATA)channel.receive(data);
          else if(kind===SerialWire.CLOSE)channel.remoteClose();
        }
      }
      if(!this.closed)this.close(new Error(uiText('USB getrennt')));
    }catch(error){if(!this.closed)this.close(error);}
    finally{try{this.reader.releaseLock();}catch(_){}}
  }
  async open(port){
    if(!this.ready||this.closed)throw new Error(uiText('USB nicht bereit'));
    let slot=0;for(let i=1;i<4;i++)if(![...this.channels.keys()].some(id=>(id&3)===i)){slot=i;break;}
    if(!slot)throw new Error(uiText('USB-Kanäle belegt. Bitte Vorgang erneut starten.'));
    this.generations[slot]=(this.generations[slot]+1)%64;
    const channel=new SerialChannel(this,this.generations[slot]*4+slot);this.channels.set(channel.id,channel);
    try{await this.send(SerialWire.OPEN,channel.id,new Uint8Array([port&255,port>>8]));await channel.opened.promise;return channel;}
    catch(error){channel.close(error);throw error;}
  }
  close(error=new Error(uiText('USB getrennt'))){
    if(this.closing)return this.closing;
    this.closed=true;this.ready=false;clearInterval(this.heartbeat);this.handshake.reject(error);
    for(const channel of this.channels.values())channel.remoteClose(error);this.channels.clear();
    this.onclose?.(error);
    this.closing=(async()=>{
      try{await this.reader?.cancel();}catch(_){}
      try{await this.readTask;}catch(_){}
      try{await this.writer?.abort(error);}catch(_){}
      try{this.writer?.releaseLock();}catch(_){}
      try{await this.port.close();}catch(_){}
    })();return this.closing;
  }
}
class SerialByteReader{
  constructor(channel){this.channel=channel;this.buffer=new Uint8Array();}
  async fill(){const data=await this.channel.read();if(!data)return false;const merged=new Uint8Array(this.buffer.length+data.length);merged.set(this.buffer);merged.set(data,this.buffer.length);this.buffer=merged;return true;}
  async exact(n){while(this.buffer.length<n)if(!await this.fill())throw new Error(uiText('USB-Antwort unvollständig'));const data=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n);return data;}
  async line(){
    for(;;){for(let i=0;i<this.buffer.length-1;i++)if(this.buffer[i]===13&&this.buffer[i+1]===10){const data=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+2);return new TextDecoder().decode(data);}
      if(this.buffer.length>16384)throw new Error(uiText('USB-HTTP-Header zu groß'));if(!await this.fill())throw new Error(uiText('USB-HTTP-Header unvollständig'));}
  }
  async headers(){const first=await this.line(),headers=new Headers();let total=first.length;
    for(;;){const line=await this.line();if(!line)break;total+=line.length;if(total>32768)throw new Error(uiText('USB-Header zu groß'));const i=line.indexOf(':');if(i>0)headers.append(line.slice(0,i),line.slice(i+1).trim());}return {first,headers};}
}
async function serialHttpFetch(link,path,options={}){
  if(options.signal?.aborted)throw new DOMException(uiText('Anfrage abgebrochen'),'AbortError');
  const channel=await link.open(80),encoder=new TextEncoder();
  let abort=()=>channel.close(new DOMException(uiText('Anfrage abgebrochen'),'AbortError'));
  try{
    if(options.signal?.aborted)throw new DOMException(uiText('Anfrage abgebrochen'),'AbortError');
    options.signal?.addEventListener('abort',abort,{once:true});
    const request=new Request('http://deacs'+path,options),headers=new Headers(request.headers);
    // Some browser contexts do not expose Request.body as a readable stream.
    // arrayBuffer() is the source of truth; a falsy stream getter must never
    // silently turn a POST with form data (or a DBC upload) into an empty POST.
    const body=await request.arrayBuffer();
    if(options.body!=null&&body.byteLength===0&&String(options.body)!=='')throw new Error(uiText('USB-Anfragedaten konnten nicht gelesen werden.'));
    headers.set('Host','deacs');headers.set('Connection','close');if(body.byteLength||request.method==='POST')headers.set('Content-Length',String(body.byteLength));
    let head=`${request.method} ${path} HTTP/1.1\r\n`;for(const [key,value] of headers)head+=`${key}: ${value}\r\n`;
    // Keep small form requests in one tunnel packet. Do not wait for a serial
    // round trip between the HTTP headers and the body the ESP is parsing.
    const header=encoder.encode(head+'\r\n'),initialBody=Math.min(body.byteLength,Math.max(0,SerialWire.MAX-header.length));
    const first=new Uint8Array(header.length+initialBody);first.set(header);first.set(new Uint8Array(body,0,initialBody),header.length);
    await channel.write(first);if(initialBody<body.byteLength)await channel.write(new Uint8Array(body,initialBody));
    const reader=new SerialByteReader(channel),response=await reader.headers();
    const match=/^HTTP\/1\.[01] (\d{3})/.exec(response.first);if(!match)throw new Error(uiText('Ungültige USB-HTTP-Antwort'));
    const parts=[];let size=0;
    // The UI reserve must keep small status/control replies usable even when
    // the monitor is full (in particular simulator stop and clear commands).
    const append=data=>{if(size+data.length>65536&&typeof admitBrowserBytes==='function'&&!admitBrowserBytes(data.length*2,false))throw new Error(uiText('80-%-Speichergrenze beim USB-Empfang erreicht'));parts.push(data);size+=data.length;};
    if(response.headers.get('transfer-encoding')?.toLowerCase().includes('chunked')){
      for(;;){const line=await reader.line();if(!/^[0-9a-f]+(?:;.*)?$/i.test(line))throw new Error(uiText('Ungültiger USB-HTTP-Chunk'));let n=parseInt(line,16);if(!n){while(await reader.line()){}break;}
        while(n){const count=Math.min(n,4096);append(await reader.exact(count));n-=count;}if(await reader.line()!=='')throw new Error(uiText('USB-Chunk unvollständig'));}
    }else if(response.headers.has('content-length')){
      let remaining=Number(response.headers.get('content-length'));if(!Number.isSafeInteger(remaining)||remaining<0)throw new Error(uiText('Ungültige USB-Antwortlänge'));
      while(remaining){const n=Math.min(4096,remaining);append(await reader.exact(n));remaining-=n;}
    }else{
      if(reader.buffer.length)append(reader.buffer);for(;;){const data=await channel.read();if(!data)break;append(data);}
    }
    response.headers.delete('transfer-encoding');response.headers.delete('content-encoding');response.headers.set('content-length',String(size));
    return new Response(new Blob(parts),{status:Number(match[1]),headers:response.headers});
  }finally{options.signal?.removeEventListener('abort',abort);channel.close();}
}
class SerialWebSocket{
  constructor(link){this.readyState=0;this.link=link;this.outbound=0;this.writeChain=Promise.resolve();this.run();}
  async run(){
    try{
      const channel=await this.link.open(81);this.channel=channel;if(this.readyState===3){channel.close();return;}
      const key=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      await channel.write(new TextEncoder().encode(`GET / HTTP/1.1\r\nHost: deacs\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      const reader=new SerialByteReader(channel),response=await reader.headers();
      const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'));
      const accept=btoa(String.fromCharCode(...new Uint8Array(digest)));
      if(!/^HTTP\/1\.[01] 101\b/.test(response.first)||response.headers.get('sec-websocket-accept')!==accept)throw new Error(uiText('USB-WebSocket-Handshake fehlgeschlagen'));
      if(this.readyState===3)return;this.readyState=1;this.onopen?.();
      let fragments=[],fragmentBytes=0,fragmentOpcode=0,lastYield=performance.now();
      while(this.readyState===1){
        const head=await reader.exact(2),fin=!!(head[0]&128),opcode=head[0]&15;
        if(head[0]&112||head[1]&128)throw new Error(uiText('Ungültiger USB-WebSocket-Frame'));
        let size=head[1]&127;
        if(size===126){const b=await reader.exact(2);size=b[0]*256+b[1];}
        else if(size===127){const b=await reader.exact(8);size=0;for(const n of b)size=size*256+n;}
        if(!Number.isSafeInteger(size)||size>1024*1024||size+fragmentBytes>1024*1024)throw new Error(uiText('USB-WebSocket-Nachricht zu groß'));
        if(opcode>=8&&(!fin||size>125))throw new Error(uiText('Ungültiger USB-WebSocket-Kontrollframe'));
        const payload=await reader.exact(size);
        if(opcode===8)break;
        if(opcode===9){await this.writeFrame(10,payload);continue;}
        if(opcode===10)continue;
        if(opcode===1||opcode===2){if(fragmentOpcode)throw new Error(uiText('Ungültige USB-WebSocket-Fortsetzung'));fragmentOpcode=opcode;}
        else if(opcode!==0||!fragmentOpcode)throw new Error(uiText('Unbekannter USB-WebSocket-Frame'));
        fragments.push(payload);fragmentBytes+=payload.length;
        if(fin){const whole=new Uint8Array(fragmentBytes);let offset=0;for(const part of fragments){whole.set(part,offset);offset+=part.length;}
          this.onmessage?.({data:fragmentOpcode===1?new TextDecoder('utf-8',{fatal:true}).decode(whole):whole.buffer});fragments=[];fragmentBytes=0;fragmentOpcode=0;
          // Already buffered serial data can otherwise create an endless chain
          // of resolved promises, starving clicks, timers and frame processing.
          if(performance.now()-lastYield>=4){await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}}
      }
    }catch(error){if(this.readyState!==3)this.onerror?.(error);}
    finally{this.close();}
  }
  writeFrame(opcode,data){
    if(data.length>65535)return Promise.reject(new Error(uiText('USB-WebSocket-Sendung zu groß')));
    if(this.outbound+data.length>16384)return Promise.reject(new Error(uiText('USB-Sendepuffer voll')));
    this.outbound+=data.length;
    const work=this.writeChain.then(async()=>{
      const extended=data.length>=126,header=new Uint8Array((extended?4:2)+4),mask=crypto.getRandomValues(new Uint8Array(4));header[0]=128|opcode;header[1]=128|(extended?126:data.length);
      if(extended){header[2]=data.length>>8;header[3]=data.length&255;}header.set(mask,header.length-4);
      const packet=new Uint8Array(header.length+data.length);packet.set(header);for(let i=0;i<data.length;i++)packet[header.length+i]=data[i]^mask[i%4];await this.channel.write(packet);
    }).finally(()=>{this.outbound-=data.length;});this.writeChain=work.catch(()=>{});return work;
  }
  send(text){if(this.readyState!==1)throw new Error(uiText('USB-WebSocket nicht verbunden'));this.writeFrame(1,new TextEncoder().encode(text)).catch(error=>{this.onerror?.(error);this.close();});}
  close(){if(this.readyState===3)return;this.readyState=3;this.channel?.close();this.onclose?.();}
}

const browserUsb={link:null,port:null,opening:false,manualDisconnect:false};
const originalDeviceFetch=window.fetch.bind(window);
function deviceFetch(url,options={}){
  if(String(url).startsWith('/api/')){
    if(browserUsb.link?.ready)return browserUsb.link.fetch(String(url),options);
    if(location.protocol==='file:')return originalDeviceFetch('http://192.168.4.1'+url,options);
  }
  return originalDeviceFetch(url,options);
}
function deviceWebSocket(){return browserUsb.link?.ready?new SerialWebSocket(browserUsb.link):new WebSocket(`ws://${location.hostname||'192.168.4.1'}:81/`);}
function usbPortSignature(port){const info=port.getInfo();return JSON.stringify([info.usbVendorId,info.usbProductId]);}
function updateUsbButton(){const button=document.getElementById('usbConnect');if(!button)return;
  button.textContent=browserUsb.link?.ready?uiText('USB trennen'):browserUsb.opening?uiText('USB verbinden…'):uiText('USB verbinden');button.disabled=browserUsb.opening||!navigator.serial||!window.isSecureContext;
  button.dataset.tooltip=button.disabled&&!browserUsb.opening?uiText('USB-Oberfläche speichern und lokal in Chrome oder Edge öffnen.'):browserUsb.link?.ready?uiText('Serielle USB-Verbindung trennen.'):browserUsb.opening?uiText('Verbindung zum seriellen DEACS-Port wird aufgebaut.'):uiText('Seriellen DEACS-Port direkt im Browser verwenden.');
}
async function openBrowserUsb(port,quiet=false){
  if(browserUsb.opening||browserUsb.link?.ready)return;
  browserUsb.opening=true;updateUsbButton();const link=new BrowserSerialLink(port);browserUsb.link=link;browserUsb.port=port;
  link.onclose=()=>{if(browserUsb.link!==link)return;browserUsb.link=null;updateUsbButton();if(typeof connect==='function')connect();};
  try{
    await link.start();browserUsb.manualDisconnect=false;
    try{localStorage.setItem('deacsUsbPort',usbPortSignature(port));}catch(_){}
    updateUsbButton();if(typeof connect==='function')connect();
    document.dispatchEvent(new Event('deacs-usb-connected'));
  }catch(error){if(!quiet&&error.name!=='NotFoundError')showNotice(uiText('USB-Verbindung fehlgeschlagen: ')+error.message,'error',6000);}
  finally{browserUsb.opening=false;updateUsbButton();}
}
async function reconnectBrowserUsb(){
  if(browserUsb.manualDisconnect||browserUsb.opening||browserUsb.link?.ready||!navigator.serial)return;
  try{
    const signature=localStorage.getItem('deacsUsbPort');if(!signature)return;
    const ports=(await navigator.serial.getPorts()).filter(port=>usbPortSignature(port)===signature);
    if(ports.length===1)await openBrowserUsb(ports[0],true);
  }catch(_){}
}
function initBrowserUsb(){
  updateUsbButton();const button=document.getElementById('usbConnect');
  if(button)button.onclick=async()=>{
    if(browserUsb.link?.ready){browserUsb.manualDisconnect=true;await browserUsb.link.close();return;}
    try{const port=await navigator.serial.requestPort();await openBrowserUsb(port);}catch(error){if(error.name!=='NotFoundError')showNotice(uiText('USB-Auswahl fehlgeschlagen: ')+error.message,'error');}
  };
  const download=document.getElementById('usbPageDownload');if(download){download.hidden=location.protocol==='file:';download.onclick=()=>{location.href='/usb.html';};}
  if(navigator.serial){navigator.serial.addEventListener('connect',()=>reconnectBrowserUsb());navigator.serial.addEventListener('disconnect',event=>{if(event.target===browserUsb.port||event.port===browserUsb.port)browserUsb.link?.close(new Error(uiText('USB-Kabel getrennt')));});}
  reconnectBrowserUsb();
  if(navigator.serial)setInterval(()=>reconnectBrowserUsb(),3000);
}
