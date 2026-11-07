// Hardware-free Web Serial peer. Uses independent framing/CRC implementation.
window.serialTestErrors=[];
addEventListener('error',event=>serialTestErrors.push(event.message));
addEventListener('unhandledrejection',event=>serialTestErrors.push(String(event.reason)));
const reportFetch=window.fetch.bind(window);
const serialFixture={fw:'0.13.44',canRunning:true,listenOnly:true,bitrate:500000,heapTotal:300000,freeHeap:180000,psramTotal:8388608,psramFree:8388608,fsTotal:3500000,fsUsed:200000};
let wlanFetchCount=0;
window.fetch=async(url,options)=>{
  if(String(url).includes('/api/')){wlanFetchCount++;return new Response(JSON.stringify(String(url).includes('dbc/list')?{files:[],maxSize:2800000}:serialFixture),{headers:{'Content-Type':'application/json'}});}
  return reportFetch(url,options);
};
window.WebSocket=class{static OPEN=1;static CLOSED=3;constructor(url){this.url=url;this.readyState=0;}close(){this.readyState=3;}send(){}};
function fixtureCrc(bytes){let value=0xffff;for(const b of bytes){value^=b*256;for(let i=0;i<8;i++)value=((value*2)^(value>=32768?4129:0))&65535;}return value;}
function fixturePacket(type,id,data=new Uint8Array()){
  const packet=new Uint8Array(data.length+10);packet.set([68,85,83,66,type,id,data.length%256,Math.floor(data.length/256)]);packet.set(data,8);
  const crc=fixtureCrc(packet.subarray(4,packet.length-2));packet[packet.length-2]=crc%256;packet[packet.length-1]=Math.floor(crc/256);return packet;
}
function joinFixture(a,b){const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;}
class MockSerialPort{
  constructor(){this.connected=true;this.openCount=0;this.channels=new Map();this.requests=[];this.messages=[];this.failAfterCommand=false;this.auth=false;}
  getInfo(){return {usbVendorId:0x303a,usbProductId:0x1001};}
  async open(options){
    if(!this.connected||this.opened)throw new Error('Port nicht verfügbar');
    this.options=options;this.opened=true;this.openCount++;this.channels.clear();this.input=new Uint8Array();
    this.readable=new ReadableStream({start:controller=>{this.controller=controller;},cancel:()=>{this.controller=null;}});
    this.writable=new WritableStream({write:bytes=>this.write(bytes),abort:()=>{}});
  }
  async setSignals(signals){this.signals=signals;}
  async close(){if(this.readable?.locked||this.writable?.locked)throw new Error('Streams noch gesperrt');this.opened=false;this.cleanClose=true;}
  disconnect(){this.connected=false;try{this.controller?.close();}catch(_){}this.controller=null;}
  send(type,id,data=new Uint8Array()){
    if(!this.controller)return;
    const packet=fixturePacket(type,id,data);
    // Deliberately split packet headers/payloads across multiple stream reads.
    for(let i=0;i<packet.length;i+=37)this.controller.enqueue(packet.slice(i,i+37));
  }
  next(channel){if(!channel.waiting&&channel.output.length){channel.waiting=true;this.send(5,channel.id,channel.output.shift());}else if(!channel.waiting&&channel.finished)this.send(7,channel.id);}
  output(channel,bytes,finished=false){for(let i=0;i<bytes.length;i+=512)channel.output.push(bytes.slice(i,i+512));channel.finished=finished;this.next(channel);}
  async write(bytes){
    this.input=joinFixture(this.input,bytes);
    while(this.input.length>=8){
      if(new TextDecoder().decode(this.input.slice(0,4))!=='DUSB')throw new Error('magic');
      const n=this.input[6]+256*this.input[7];if(this.input.length<n+10)return;
      const raw=this.input.slice(0,n+10);this.input=this.input.slice(n+10);
      if(fixtureCrc(raw.subarray(4,n+8))!==raw[n+8]+256*raw[n+9])throw new Error('CRC');
      const type=raw[4],id=raw[5],data=raw.slice(8,n+8);
      if(type===1){this.send(2,0,new TextEncoder().encode(serialFixture.fw));continue;}
      if(type===8){this.send(9,0);continue;}
      if(type===3){const channel={id,port:data[0]+256*data[1],input:new Uint8Array(),output:[],waiting:false,finished:false};this.channels.set(id,channel);this.send(4,id);continue;}
      const channel=this.channels.get(id);if(!channel)continue;
      if(type===6){channel.waiting=false;this.next(channel);continue;}
      if(type===7){this.channels.delete(id);continue;}
      if(type!==5)continue;
      channel.input=joinFixture(channel.input,data);this.send(6,id);
      if(channel.websocket){this.websocketInput(channel);continue;}
      const text=new TextDecoder().decode(channel.input),headerEnd=text.indexOf('\r\n\r\n');if(headerEnd<0)continue;
      const headers=text.slice(0,headerEnd),length=Number(/content-length:\s*(\d+)/i.exec(headers)?.[1]||0);
      if(headers.startsWith('POST /api/sim/add ')&&channel.input.length<headerEnd+4+length)throw new Error('Simulator form split after HTTP headers');
      if(channel.input.length<headerEnd+4+length)continue;
      if(channel.port===81){
        channel.websocket=true;channel.input=new Uint8Array();
        const key=/sec-websocket-key:\s*([^\r\n]+)/i.exec(headers)[1];
        const hash=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'));
        const accept=btoa(String.fromCharCode(...new Uint8Array(hash)));
        this.output(channel,new TextEncoder().encode('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n'));
        this.websocketOutput(channel,1,new TextEncoder().encode(JSON.stringify({type:'status',value:serialFixture})));
        this.websocketOutput(channel,9,new TextEncoder().encode('ping'));
      }else{
        const [method,path]=headers.split('\r\n')[0].split(' '),body=channel.input.slice(headerEnd+4,headerEnd+4+length);
        this.requests.push({method,path,body,headers});
        if(path==='/api/sim/add'&&this.failSimAdd){
          const status=this.failSimAdd;this.failSimAdd=0;
          const error=new TextEncoder().encode(JSON.stringify({ok:false,error:status===507?'80% memory budget reached':'invalid frame'}));
          this.output(channel,joinFixture(new TextEncoder().encode(`HTTP/1.1 ${status} Error\r\nContent-Type: application/json\r\nContent-Length: ${error.length}\r\n\r\n`),error),true);continue;
        }
        if(this.failAfterCommand&&path==='/api/send'){this.failAfterCommand=false;queueMicrotask(()=>this.disconnect());continue;}
        let answer,type='application/json';
        if(path==='/api/sim/clear')this.simEntries=[];
        if(path==='/api/sim/add')(this.simEntries??=[]).push(Object.fromEntries(new URLSearchParams(new TextDecoder().decode(body))));
        if(path==='/api/binary'){answer=Uint8Array.from({length:70000},(_,i)=>i%256);type='application/octet-stream';}
        else if(path==='/api/dbc/upload'){answer=new TextEncoder().encode(JSON.stringify({ok:true,size:body.length}));}
        else if(path==='/api/chunked'){
          this.output(channel,new TextEncoder().encode('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: text/plain\r\n\r\n3\r\nUSB\r\n5;foo=bar\r\n-CAN!\r\n0\r\nX-Test: yes\r\n\r\n'),true);continue;
        }else if(path==='/api/sim/add'){
          const entry=this.simEntries.at(-1);
          answer=new TextEncoder().encode(JSON.stringify({ok:true,id:this.wrongSimAck?'0':entry.id,dlc:entry.data.length/2,interval:Number(entry.interval)}));
        }else answer=new TextEncoder().encode(JSON.stringify({ok:true,...serialFixture,...(path==='/api/sim/start'?{simulator:true,simRunId:1}: {})}));
        const header=new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Type: ${type}\r\nContent-Length: ${answer.length}\r\nConnection: close\r\n\r\n`);
        this.output(channel,joinFixture(header,answer),true);
      }
    }
  }
  websocketOutput(channel,opcode,payload,fin=true){
    const first=(fin?128:0)|opcode;
    let header;if(payload.length>=126)header=new Uint8Array([first,126,payload.length>>8,payload.length&255]);else header=new Uint8Array([first,payload.length]);
    this.output(channel,joinFixture(header,payload));
  }
  websocketInput(channel){
    for(;;){const bytes=channel.input;if(bytes.length<6)return;let size=bytes[1]&127,offset=2;
      if(size===126){if(bytes.length<8)return;size=bytes[2]*256+bytes[3];offset=4;}
      if(!(bytes[1]&128))throw new Error('Client frame not masked');if(bytes.length<offset+4+size)return;
      const mask=bytes.slice(offset,offset+4),data=bytes.slice(offset+4,offset+4+size);for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
      this.messages.push({opcode:bytes[0]&15,text:new TextDecoder().decode(data)});channel.input=bytes.slice(offset+4+size);
    }
  }
}
const mockSerial=new EventTarget();mockSerial.port=new MockSerialPort();mockSerial.requests=0;
mockSerial.requestPort=async()=>{mockSerial.requests++;mockSerial.port.auth=true;return mockSerial.port;};
mockSerial.getPorts=async()=>mockSerial.port.auth&&mockSerial.port.connected?[mockSerial.port]:[];
Object.defineProperty(navigator,'serial',{configurable:true,value:mockSerial});
