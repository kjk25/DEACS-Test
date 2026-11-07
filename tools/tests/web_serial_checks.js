addEventListener('load',()=>setTimeout(async()=>{
  const results=[];
  const check=(ok,name)=>{if(!ok)throw new Error(name);results.push(name);};
  async function until(test){for(let i=0;i<200;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('wait timed out');}
  try{
    check(serialCrc(new TextEncoder().encode('123456789'))===0x29b1,'CRC16 standard vector');
    const packet=serialPacket(5,2,new Uint8Array([0,255,1]));
    const decoder=new SerialDecoder();let packets=[];
    for(const b of joinFixture(new TextEncoder().encode('boot log\r\n'),packet))packets.push(...decoder.feed(new Uint8Array([b])));
    check(packets.length===1&&packets[0].data[1]===255,'fragmented serial parser preserves binary bytes');
    const damaged=packet.slice();damaged[8]^=1;
    check(new SerialDecoder().feed(joinFixture(damaged,packet)).length===1,'CRC failure resynchronizes to next frame');
    check(mockSerial.requests===0,'no unsolicited port chooser');
    check(!$('usbConnect').disabled,'Web Serial button enabled in secure context');
    $('usbConnect').click();await until(()=>browserUsb.link?.ready&&socket.readyState===1);
    check(mockSerial.requests===1,'USB button selects browser serial port');
    check(mockSerial.port.options.baudRate===921600&&mockSerial.port.signals.dataTerminalReady===false,'port configured without deliberate reset');
    check($('connection').textContent==='USB verbunden','USB preferred and shown in UI');
    check((await (await deviceFetch('/api/status')).json()).fw==='0.13.44','HTTP status over serial');
    const NativeRequest=window.Request;
    window.Request=class extends NativeRequest{get body(){return null;}};
    try{
      await post('/api/sim/add',{id:'123',data:'0011223344556677',interval:100});
      const request=mockSerial.port.requests.findLast(request=>request.path==='/api/sim/add');
      const values=new URLSearchParams(new TextDecoder().decode(request.body));
      check(values.get('id')==='123'&&values.get('data')==='0011223344556677'&&values.get('interval')==='100','POST form survives unavailable Request.body stream getter');
      const dbc=new FormData();dbc.append('file',new Blob(['VERSION "test";']),'body-getter.dbc');
      await deviceFetch('/api/dbc/upload',{method:'POST',body:dbc});
      const upload=mockSerial.port.requests.findLast(request=>request.path==='/api/dbc/upload');
      check(new TextDecoder().decode(upload.body).includes('VERSION "test";'),'DBC upload survives unavailable Request.body stream getter');
    }finally{window.Request=NativeRequest;}
    const budgetAdmission=admitBrowserBytes;admitBrowserBytes=()=>false;
    try{
      check((await (await deviceFetch('/api/status')).json()).fw==='0.13.44','small control responses remain available when monitor budget is exhausted');
    }finally{admitBrowserBytes=budgetAdmission;}
    const burst=await Promise.all(Array.from({length:12},()=>deviceFetch('/api/status')));
    check(burst.every(response=>response.ok),'concurrent HTTP requests queued beside live WebSocket');
    simBackend='esp32';
    simEntries.splice(0,simEntries.length,...Array.from({length:16},(_,i)=>({id:(0x100+i).toString(16),data:'1020304050607080',dlc:i===0?4:8,ms:100,enabled:i<14})));
    $('simRepeatMode').value='endless';
    const starting=startSim();await startSim();await starting;
    check(simRunning&&mockSerial.port.simEntries.length===14,'full simulator list starts over Web Serial without overlapping starts');
    check(mockSerial.port.simEntries[0].data==='10203040','serial simulator upload honors DLC');
    await stopSim();
    $('simRepeatMode').value='once';await startSim();
    const starts=mockSerial.port.requests.filter(request=>request.path==='/api/sim/start');
    check(starts.length===2&&new URLSearchParams(new TextDecoder().decode(starts[0].body)).get('loop')==='1'&&new URLSearchParams(new TextDecoder().decode(starts[1].body)).get('loop')==='0','both simulator repetition modes transmitted through serial');
    await stopSim();
    mockSerial.port.wrongSimAck=true;let mismatch='';
    try{await startEsp32Simulator(simEntries.filter(entry=>entry.enabled));}catch(error){mismatch=error.message;}
    mockSerial.port.wrongSimAck=false;
    check(mismatch.includes('abweichende Simulator-Daten'),'simulator rejects mismatched device acknowledgement');
    for(const status of [400,507]){
      mockSerial.port.failSimAdd=status;let message='';
      try{await startEsp32Simulator(simEntries.filter(entry=>entry.enabled));}catch(error){message=error.message;}
      check(message.includes('Frame 1/14')&&(status===507?message.includes('80-%-Speicherbudget'):message.includes('invalid frame')&&!message.includes('Speicherbudget')),'serial error identifies failed frame and distinguishes memory limit: '+status);
    }
    check(await (await deviceFetch('/api/chunked')).text()==='USB-CAN!','chunked HTTP with extensions and trailers');
    const binary=new Uint8Array(await (await deviceFetch('/api/binary')).arrayBuffer());
    check(binary.length===70000&&binary.every((value,i)=>value===i%256),'large binary response preserved across channel packets');
    const form=new FormData();form.append('file',new Blob([new Uint8Array([0,255,13,10,42])]),'test.dbc');
    await deviceFetch('/api/dbc/upload',{method:'POST',body:form});
    const upload=mockSerial.port.requests.findLast(request=>request.path==='/api/dbc/upload');
    check(upload.headers.includes('multipart/form-data; boundary=')&&upload.body.some((value,i)=>value===255&&upload.body[i-1]===0),'DBC multipart upload uses serial');
    socket.send('TX:123:0:0:00');await until(()=>mockSerial.port.messages.some(message=>message.text==='TX:123:0:0:00'));
    check(mockSerial.port.messages.some(message=>message.opcode===10&&message.text==='ping'),'WebSocket ping answered with masked pong');
    check(mockSerial.port.messages.some(message=>message.opcode===1&&message.text==='TX:123:0:0:00'),'live CAN command uses masked WebSocket frame');
    const websocketChannel=[...mockSerial.port.channels.values()].find(channel=>channel.port===81);
    const fragmented=new TextEncoder().encode(JSON.stringify({type:'frame',id:'321',data:'00',dlc:1,us:1000,dir:'RX'}));
    mockSerial.port.websocketOutput(websocketChannel,1,fragmented.slice(0,30),false);
    mockSerial.port.websocketOutput(websocketChannel,9,new TextEncoder().encode('middle'));
    mockSerial.port.websocketOutput(websocketChannel,0,fragmented.slice(30),true);
    await until(()=>frames.some(frame=>frame.id==='321'));
    check(mockSerial.port.messages.some(message=>message.opcode===10&&message.text==='middle'),'fragmented WebSocket message survives interleaved ping');
    socket.send('x'.repeat(500));await until(()=>mockSerial.port.messages.some(message=>message.text==='x'.repeat(500)));
    check(mockSerial.port.messages.some(message=>message.text.length===500),'extended masked WebSocket payload preserved');
    const beforeAbort=mockSerial.port.requests.length,controller=new AbortController();controller.abort();
    let aborted=false;try{await deviceFetch('/api/send',{method:'POST',body:'id=123',signal:controller.signal});}catch(error){aborted=error.name==='AbortError';}
    check(aborted&&mockSerial.port.requests.length===beforeAbort,'already aborted command is never transmitted');
    const opened=mockSerial.port.openCount,wlanBefore=wlanFetchCount;
    mockSerial.port.failAfterCommand=true;let rejected=false;
    try{await deviceFetch('/api/send',{method:'POST',body:new URLSearchParams({id:'123',data:'00'})});}catch(_){rejected=true;}
    check(rejected&&wlanFetchCount===wlanBefore,'ambiguous serial command is rejected without WLAN replay');
    check(mockSerial.port.requests.filter(request=>request.path==='/api/send').length===1,'CAN command transmitted once');
    await until(()=>!browserUsb.link&&mockSerial.port.cleanClose);
    check(!mockSerial.port.readable.locked&&!mockSerial.port.writable.locked,'disconnect releases stream locks');
    await deviceFetch('/api/status');check(wlanFetchCount===wlanBefore+1,'subsequent request uses WLAN fallback');
    mockSerial.port.connected=true;mockSerial.dispatchEvent(new Event('connect'));
    await until(()=>browserUsb.link?.ready&&socket.readyState===1);
    check(mockSerial.port.openCount===opened+1&&mockSerial.requests===1,'authorized port reconnects without new chooser');
    $('usbConnect').click();await until(()=>!browserUsb.link&&mockSerial.port.cleanClose);
    check(browserUsb.manualDisconnect,'manual USB disconnect disables automatic takeover');
    await reconnectBrowserUsb();check(!browserUsb.link,'manual disconnect respected');
    check(serialTestErrors.length===0,'no browser runtime errors: '+serialTestErrors.join(';'));
    await reportFetch(window.serialReportURL,{method:'POST',body:JSON.stringify({ok:true,results})});
  }catch(error){await reportFetch(window.serialReportURL,{method:'POST',body:JSON.stringify({ok:false,error:error.stack,results,errors:serialTestErrors})});}
},100));
