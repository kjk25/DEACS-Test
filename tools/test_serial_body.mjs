// No browser or serial device required. Run with: node tools/test_serial_body.mjs
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Blob} from 'node:buffer';
import {TextEncoder,TextDecoder} from 'node:util';
import {URLSearchParams} from 'node:url';
import assert from 'node:assert/strict';

const source=await readFile(new URL('../data/web-serial.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('class SerialByteReader'),source.indexOf('class SerialWebSocket'));
class TestHeaders extends Map{
  constructor(values={}){super();for(const [key,value] of values instanceof Map?values:Object.entries(values))this.set(key,value);}
  set(key,value){return super.set(key.toLowerCase(),String(value));}
  get(key){return super.get(key.toLowerCase())??null;}
  has(key){return super.has(key.toLowerCase());}
  append(key,value){this.set(key,this.has(key)?this.get(key)+', '+value:value);}
}
class TestRequest{
  constructor(url,options){this.method=options.method||'GET';this.headers=new TestHeaders(options.headers);this.bytes=new TextEncoder().encode(String(options.body??''));}
  get body(){return null;} // Stream getter unavailable, while arrayBuffer works.
  async arrayBuffer(){return this.bytes.buffer;}
}
class TestResponse{
  constructor(body,options){this.body=body;this.status=options.status;}
  async json(){return JSON.parse(await this.body.text());}
}
const results=[];
for(const [name,path,options] of [
  ['simulator form','/api/sim/add',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id:'123',data:'0011223344556677',interval:100})}],
  ['multipart upload','/api/dbc/upload',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=deacs'},body:'--deacs\r\nContent-Disposition: form-data; name="file"; filename="test.dbc"\r\n\r\nVERSION "test";\r\n--deacs--\r\n'}],
  ['empty stop command','/api/sim/stop',{method:'POST'}]
]){
  const chunks=[];let sent=false,wire;
  const channel={write:async data=>chunks.push(data),close(){},async read(){
    if(sent)return null;sent=true;
    wire=chunks.map(data=>new TextDecoder().decode(data)).join('');
    return new TextEncoder().encode('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{"ok":true}');
  }};
  const context=vm.createContext({Request:TestRequest,Response:TestResponse,Headers:TestHeaders,Blob,TextEncoder,TextDecoder,URLSearchParams,DOMException:Error,SerialWire:{MAX:512},uiText:text=>text});
  vm.runInContext(code,context);
  const response=await context.serialHttpFetch({open:async()=>channel},path,options);
  assert.equal(response.status,200);
  const end=wire.indexOf('\r\n\r\n'),header=wire.slice(0,end),body=wire.slice(end+4);
  assert.equal(body,String(options.body??''));
  assert.equal(Number(/content-length: (\d+)/i.exec(header)[1]),new TextEncoder().encode(body).length);
  results.push(name);
}
console.log(JSON.stringify({ok:true,results}));
