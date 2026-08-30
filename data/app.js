'use strict';
const $=id=>document.getElementById(id), MAX_FRAMES=10000, MAX_ROWS=1200;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
const formatHexValue=value=>{const text=String(value??'').trim();return text&&!/^0x/i.test(text)?`0x${text.toUpperCase()}`:text;};
let socket,paused=false,renderPending=false,renderTimer=null,totalReceived=0,txTimer=null,simRunning=false,randomSimRunning=false,randomSimTimer=null,randomSimGenerated=0,randomSimAccumulator=0,randomSimConfig={type:'random',rate:50,idMin:0,idMax:0x7FF,dlc:'random',start:0,step:1,byte:0,period:32,seed:0xACE1,baseBytes:[0,0,0,0,0,0,0,0],mask:[true,false,false,false,false,false,false,false]},generatorState={counter:0,bit:0,phase:0,frame:0,lfsr:0xACE1},loadedSession=[],replayFrames=[],ageFilterEnabled=false,txHistory=[],txHistoryFlushTimer=null;
let browserSimTimers=[],browserSimGeneration=0,browserSimGenerated=0,browserSimActiveCount=0;
let replayTimer=null,replayRunning=false,replayIndex=0,replayStartedAt=0,replayBaseUs=0,replayGeneration=0,replayEmitted=0;
let wsConnected=false,simBackend='browser',activeTab='monitor';
const SIM_STORAGE_KEY='deacsSimulatorEntries';
const LIVE_TX_SETTING_IDS=['liveTxSimulator','liveTxGenerator','liveTxLog'];
function liveTxSetting(source){const id=source==='GEN'?'liveTxGenerator':source==='LOG'?'liveTxLog':'liveTxSimulator';return !!$(id)?.checked;}
function sendLiveSourceFrame(source,id,extended,data,rtr=false){if(!liveTxSetting(source)||txSendingBlocked||!socket||socket.readyState!==WebSocket.OPEN)return;const hex=Array.isArray(data)?data.map(v=>Number(v).toString(16).padStart(2,'0')).join(''):String(data||'').replace(/[^0-9A-F]/gi,'');if(hex.length<=16&&hex.length%2===0)socket.send(`TX:${String(id).replace(/^0x/i,'')}:${extended?1:0}:${rtr?1:0}:${hex.toUpperCase()}`);}
const DEFAULT_SIM_ENTRIES=[
  {id:'123',data:'00 11 22 33 44 55 66 77',ms:100,enabled:true,dynamic:true,dynamicIndex:0},
  {id:'230',data:'80 00 00 00 00 00 00 00',ms:500,enabled:true,dynamic:true,dynamicIndex:1},
  {id:'305',data:'10 20 30 40 50 60 70 80',ms:200,enabled:true,dynamic:false,dynamicIndex:0},
  {id:'405',data:'00 00 20 00 00 00 00 00',ms:1000,enabled:true,dynamic:false,dynamicIndex:0},
  {id:'520',data:'C0 C1 C2 C3 C4 C5 C6 C7',ms:100,enabled:true,dynamic:true,dynamicIndex:0},
  {id:'5A0',data:'01 00 7F FF',ms:2000,enabled:true,dynamic:false,dynamicIndex:0},
  {id:'6A5',data:'AA 55 AA 55 AA 55 AA 55',ms:500,enabled:true,dynamic:false,dynamicIndex:0},
  {id:'18DAF110',data:'03 22 F1 90 00 00 00 00',ms:1000,enabled:false,dynamic:false,dynamicIndex:0}
];
let selectedTxHistoryKey=null,highlightedTxHistoryKey=null,txHistoryHighlightTimer=null,txSendInFlight=false;
let monitorFrameSeq=0,selectedMonitorFrameUid=null,selectedSimIndex=null,selectedSimEdit=null,selectedCsvRow=null;
let overviewSort=(()=>{try{const saved=JSON.parse(localStorage.getItem('deacsOverviewSortV2')||'null');return saved&&['id','label','frames','age','fixed'].includes(saved.key)?saved:{key:'fixed',dir:1};}catch(_){return {key:'fixed',dir:1};}})();
let overviewChangeWindowSec=Math.max(0.5,Number(localStorage.getItem('deacsOverviewChangeWindowSec'))||2);
let txSendingBlocked=true;
let txEditorLocked=false;
let importedDataInfo=null;
let idDisplayFormat=localStorage.getItem('deacsIdDisplayFormat')==='DEC'?'DEC':'HEX';
const LOG_PART_LIMIT=5*1024*1024, LOG_FLUSH_INTERVAL_MS=1000, LOG_FLUSH_ROWS=1000;
const LOG_DB_NAME='DEACS_LogDB', LOG_DB_VERSION=1;
let logDb=null;
let browserLog={active:false,sessionId:null,totalBytes:0,totalFrames:0,persistedFrames:0,buffer:[],bufferBytes:0,flushTimer:null,lastError:'',startedAt:0,loaded:false};

let noticeTimer=null,dialogResolve=null;
function showNotice(message,type='info',timeout=3600){
  const box=$('appNotice');if(!box)return;
  clearTimeout(noticeTimer);
  box.className=`appNotice ${type} visible`;
  $('appNoticeText').textContent=String(message);
  noticeTimer=setTimeout(()=>box.classList.remove('visible'),timeout);
}
function closeNotice(){clearTimeout(noticeTimer);$('appNotice')?.classList.remove('visible');}
function askConfirm(message,title='Bitte bestätigen'){
  return new Promise(resolve=>{
    dialogResolve=resolve;
    $('appDialogTitle').textContent=title;
    $('appDialogText').textContent=String(message);
    $('appDialog').classList.add('visible');
    $('appDialogConfirm').focus();
  });
}
function closeDialog(result){
  $('appDialog')?.classList.remove('visible');
  const resolve=dialogResolve;dialogResolve=null;if(resolve)resolve(!!result);
}
function activateTab(id){
  activeTab=id;
  document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active'));
  const button=document.querySelector(`nav button[data-tab="${id}"]`);
  if(button)button.classList.add('active');
  $(id)?.classList.add('active');
  // Tabellen werden im Hintergrund nicht fortlaufend neu aufgebaut.
  // Beim Öffnen eines Tabs wird dessen aktueller Datenstand sofort gerendert.
  if(id==='monitor'){renderPending=false;requestAnimationFrame(()=>{updateCounts();render();});}
  else if(id==='decoder'){overviewPending=false;requestAnimationFrame(renderOverview);}
}
function resetMonitorViewFilters(){
  $('search').value='';$('direction').value='all';$('frameType').value='all';$('dlcFilter').value='all';
  $('idFrom').value='';$('idTo').value='';$('showIds').value='';$('hideIds').value='';$('hideIds').classList.remove('filterActive');
  hiddenIds.clear();ageFilterEnabled=false;$('ageToggle').classList.remove('activeToggle');$('ageToggle').setAttribute('aria-pressed','false');$('ageToggle').textContent='Ältere ausblenden';
}


function normalizeSimulatorEntry(entry){
  const id=String(entry?.id||'').trim().replace(/^0X/i,'').toUpperCase();
  const raw=String(entry?.data||'').replace(/[^0-9A-F]/gi,'').toUpperCase().slice(0,16);
  const data=(raw.match(/../g)||[]).join(' ');
  const ms=Math.max(10,Math.min(60000,Number(entry?.ms)||100));
  if(!/^[0-9A-F]{1,8}$/.test(id)||parseInt(id,16)>0x1FFFFFFF||!data)return null;
  return {id,data,ms,enabled:entry?.enabled!==false,dynamic:!!entry?.dynamic,dynamicIndex:Math.max(0,Math.min(7,Number(entry?.dynamicIndex)||0)),name:String(entry?.name||'').trim().slice(0,40),source:String(entry?.source||'SIM').toUpperCase().slice(0,8)};
}
function loadSimulatorEntries(){
  try{
    const saved=JSON.parse(localStorage.getItem(SIM_STORAGE_KEY)||'null');
    if(Array.isArray(saved))return saved.map(normalizeSimulatorEntry).filter(Boolean);
  }catch(e){console.warn('Simulator-Liste konnte nicht geladen werden.',e);}
  return [];
}
function saveSimulatorEntries(){
  try{localStorage.setItem(SIM_STORAGE_KEY,JSON.stringify(simEntries));}
  catch(e){console.warn('Simulator-Liste konnte nicht gespeichert werden.',e);}
}
const frames=[],overview=new Map(),previous=new Map(),simEntries=loadSimulatorEntries(),selectedIds=new Set(),hiddenIds=new Set();
let overviewSequence=0,filterInputEditing=false,filterInputDirty=false,monitorViewFrozen=false,canToggleBusy=false;
let filterDisplayText=localStorage.getItem('deacsFilterDisplayText')||'';
const frozenOverviewKeys=new Set(),latestOverviewLive=new Map();
let decodedRows=loadDecodedRows(), decodedFrameKeys=new Set(decodedRows.map(r=>`${r.ide?'E':'S'}:${r.id}`)), selectedDecodedRow=null, selectedDecodedByte=0, selectedLabelId=null;
let labels=JSON.parse(localStorage.getItem('deacsLabels')||'{}');
decodedRows.forEach(row=>{const id=String(row.id||'').toUpperCase(),label=String(row.label||'').trim();if(id&&label&&!labels[id])labels[id]=label;});
localStorage.setItem('deacsLabels',JSON.stringify(labels));

function makeDecodedRow(frame={}){
  const rawId=String(frame.id||'000').toUpperCase().replace(/^0X/,'');
  const data=Array.isArray(frame.bytes)?frame.bytes:bytes(String(frame.data||''));
  return {
    uid: frame.uid||(`d${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`),
    label:String(frame.label!==undefined?frame.label:labelFor(rawId)),
    id:rawId||'000', rtr:frame.rtr?1:0, ide:frame.ext||frame.ide?1:0,
    dlc:Math.max(0,Math.min(8,Number(frame.dlc!==undefined?frame.dlc:data.length)||0)),
    bytes:Array.from({length:8},(_,i)=>String(data[i]||'00').toUpperCase().padStart(2,'0').slice(-2))
  };
}
function loadDecodedRows(){
  try{const a=JSON.parse(localStorage.getItem('deacsDecodedRows')||'[]');return Array.isArray(a)?a.map(makeDecodedRow):[];}catch(_){return [];}
}
function rebuildDecodedFrameKeys(){decodedFrameKeys=new Set(decodedRows.map(r=>`${r.ide?'E':'S'}:${r.id}`));}
function saveDecodedRows(){rebuildDecodedFrameKeys();localStorage.setItem('deacsDecodedRows',JSON.stringify(decodedRows));}
function decodedRowByUid(uid){return decodedRows.find(r=>r.uid===uid);}
function sanitizeHex(value,max){return String(value||'').toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,max);}
function validateDecodedRow(r){
  r.id=sanitizeHex(r.id,r.ide?8:3)||'0'; r.rtr=r.rtr?1:0; r.ide=r.ide?1:0; r.dlc=Math.max(0,Math.min(8,Number(r.dlc)||0));
  const max=r.ide?0x1FFFFFFF:0x7FF;if(parseInt(r.id,16)>max)throw new Error(`ID außerhalb des Bereichs (${r.ide?'1FFFFFFF':'7FF'})`);
  r.bytes=Array.from({length:8},(_,i)=>sanitizeHex(r.bytes[i],2).padStart(2,'0')||'00');return r;
}
function updateDecodedField(uid,field,value,index){
  const r=decodedRowByUid(uid);if(!r)return;
  const oldId=r.id;
  if(field==='byte')r.bytes[index]=sanitizeHex(value,2);
  else if(field==='id')r.id=internalCanId(value).slice(0,r.ide?8:3);
  else if(field==='label')r.label=value;
  else if(field==='dlc')r.dlc=Math.max(0,Math.min(8,Number(value)||0));
  else r[field]=value==='1'?1:0;
  if(field==='label'||field==='id'){
    const id=String(r.id||'').toUpperCase();
    const label=String(r.label||'').trim();
    if(field==='id'&&oldId!==id&&labels[oldId]===label)delete labels[oldId];
    if(/^[0-9A-F]{1,8}$/.test(id)){
      if(label)labels[id]=label;else delete labels[id];
      localStorage.setItem('deacsLabels',JSON.stringify(labels));
      renderLabels();scheduleOverview();scheduleRender();
    }
  }
  saveDecodedRows();
}
function decodedInput(r,field,value,cls='',index=''){return `<input class="decodedInput ${cls}" data-uid="${r.uid}" data-field="${field}" ${index!==''?`data-index="${index}"`:''} value="${value}">`;}
function post(url,data={}){return fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)}).then(async r=>{const j=await r.json();if(!r.ok)throw j;return j;});}
let canSettingsDirty=false;
function fmtBytes(n){n=Number(n)||0;return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' kB':(n/1048576).toFixed(1)+' MB';}
function stopTxCycle(){
  if(txTimer){clearInterval(txTimer);txTimer=null;}
  const button=$('txCyclic');
  if(button){button.textContent='Zyklus starten';button.classList.remove('primary');button.setAttribute('aria-pressed','false');}
  setTxEditorLocked(false);
}
function setTxEditorLocked(locked){
  txEditorLocked=!!locked;
  ['txId','txDlc','txExt','txRtr','txInterval'].forEach(id=>{const el=$(id);if(el)el.disabled=txEditorLocked;});
  const status=$('txCycleStatus');
  if(status){status.hidden=!txEditorLocked;if(txEditorLocked)status.textContent=`Zyklisches Senden aktiv · ${$('txInterval').value} ms`;else status.textContent='';}
  updateTxEditor();
}
function updateTxAvailability(blocked){
  txSendingBlocked=!!blocked;
  const sendButton=$('send'),cyclicButton=$('txCyclic');
  if(sendButton)sendButton.disabled=txSendingBlocked;
  if(cyclicButton)cyclicButton.disabled=txSendingBlocked;
  const modeHint=$('txModeHint');
  if(modeHint)modeHint.hidden=!txSendingBlocked;
  document.querySelectorAll('.txHistorySend').forEach(button=>button.disabled=txSendingBlocked);
  if(txSendingBlocked&&txTimer)stopTxCycle();
}
function formatDiagnosticAge(ms){const n=Number(ms);if(!Number.isFinite(n)||n<=0)return '--';if(n<1000)return n+' ms';return (n/1000).toFixed(n<10000?1:0)+' s';}
let lastCanBusFault=false,lastCanStatus=null;
function updateCanLiveSourceStyle(s){
  const mode=$('canMode');if(!mode)return;
  const source=s?.canRunning&&!s?.listenOnly&&!s?.ackMissing?(
    replayRunning&&liveTxSetting('LOG')?'log':
    randomSimRunning&&liveTxSetting('GEN')?'generator':
    simRunning&&liveTxSetting('SIM')?'simulator':'idle'
  ):'idle';
  mode.dataset.liveSource=source;
  mode.classList.toggle('sourceAura',source!=='idle');
}function updateCanModeState(s){
  const mode=$('canMode'),state=String(s.twaiState||'').toUpperCase();
  const busFault=!!s.ackMissing||state==='BUS_OFF'||state==='RECOVERING';
  if(busFault){
    mode.textContent=state==='RECOVERING'?'CAN RECOVERING - KEIN ACK':'CAN BUS-OFF - KEIN ACK';
    mode.classList.add('offline');
    mode.title='Kein CAN-ACK. Teilnehmer, Bitrate, Verkabelung und 120-Ohm-Abschluss prüfen.';
    if(!lastCanBusFault)showNotice('Kein CAN-ACK: CAN-Teilnehmer, Bitrate, Verkabelung und 120-Ohm-Abschluss prüfen.','error',10000);
  }else{
    mode.textContent=s.canRunning?(s.listenOnly?'CAN LISTEN':'CAN LIVE'):'CAN DISCONNECTED';
    mode.classList.toggle('offline',!s.canRunning);
    mode.title=s.canRunning?'Klicken: CAN hardware-nah trennen':'Klicken: CAN wieder verbinden';
  }
  lastCanBusFault=busFault;
  updateCanLiveSourceStyle(s);
}function setStatus(s){lastCanStatus=s;$('fw').textContent=s.fw;$('headerVersion').textContent='V'+s.fw;$('footerVersion').textContent='V'+s.fw;$('rxRate').textContent=s.rxRate;$('ringWriteRate').textContent=s.ringWriteRate||0;$('ringReadRate').textContent=s.ringReadRate||0;$('wsFrameRate').textContent=s.wsFrameRate||0;$('filteredFrameRate').textContent=s.filteredFrameRate||0;$('txRate').textContent=s.txRate;$('errors').textContent=s.errors;$('busErrors').textContent=s.busErrors||0;$('rxQueueFullAlerts').textContent=s.rxQueueFullAlerts||0;$('maxRxBurst').textContent=s.maxRxBurst||0;$('queue').textContent=s.queue;$('drops').textContent=s.drops;$('twaiLost').textContent=(Number(s.twaiRxMissed)||0)+(Number(s.twaiRxOverrun)||0);$('queueHighWater').textContent=s.queueHighWater||0;$('diagQueue').textContent=s.queue||0;$('queueCapacity').textContent=s.queueCapacity||0;$('queueUtilization').textContent=s.queueUtilization||0;$('maxRxDrainUs').textContent=s.maxRxDrainUs||0;$('maxRxDrainFrames').textContent=s.maxRxDrainFrames||0;$('rxBacklogEvents').textContent=s.rxBacklogEvents||0;$('freeHeap').textContent=s.freeHeap||0;$('minFreeHeap').textContent=s.minFreeHeap||0;$('largestHeapBlock').textContent=s.largestHeapBlock||0;$('minLargestHeapBlock').textContent=s.minLargestHeapBlock||0;$('maxWsBatchBytes').textContent=s.maxWsBatchBytes||0;$('maxWsBroadcastUs').textContent=s.maxWsBroadcastUs||0;$('lastCanFrameAgo').textContent=formatDiagnosticAge(s.lastCanFrameAgoMs);$('lastWsPacketAgo').textContent=formatDiagnosticAge(s.lastWsPacketAgoMs);$('wsClients').textContent=s.wsClients||0;$('diagnosticEventCount').textContent=s.diagnosticEventCount||0;$('twaiState').textContent=s.twaiState||'--';$('rxErrorCounter').textContent=s.rxErrorCounter||0;$('txErrorCounter').textContent=s.txErrorCounter||0;$('driverBusErrors').textContent=s.driverBusErrors||0;$('driverBusErrorDelta').textContent=s.driverBusErrorDelta||0;$('alertReadCount').textContent=s.alertReadCount||0;$('lastAlertMaskHex').textContent=s.lastAlertMaskHex||'0x00000000';$('lastAlert').textContent=s.lastAlert||'NONE';$('rxPinLevel').textContent=Number(s.rxPinLevel)?'HIGH':'LOW';$('rxPinLowPercent').textContent=Number(s.rxPinLowPercent)||0;updateCanModeState(s);$('canBitrate').textContent=Math.round((s.bitrate||0)/1000)+' kbit/s';$('statusDump').textContent=JSON.stringify(s,null,2);if(!canSettingsDirty){$('bitrate').value=String(s.bitrate);$('mode').value=s.listenOnly?'listen':(s.noAck?'noack':'normal');}if(!filterInputEditing&&!filterInputDirty){$('filterIds').value=s.filterEnabled&&filterDisplayText?filterDisplayText:String(s.filterIds||'').toUpperCase();if($('filterMode'))$('filterMode').value=s.filterMode==='exclude'?'exclude':'include';}const filterActive=!!s.filterEnabled;$('filterIds').classList.toggle('filterActive',!filterInputDirty&&filterActive&&$('filterIds').value.trim().length>0);if(!filterInputDirty){$('applyFilter').textContent=filterActive?'Filter löschen':'Filter anwenden';$('applyFilter').classList.toggle('activeToggle',filterActive);$('applyFilter').dataset.active=filterActive?'1':'0';}updateTxAvailability(!s.canRunning||!!s.listenOnly);updateBrowserLogStatus();}
function bytes(data){return (String(data||'').match(/../g)||[]).slice(0,8);}
function key(f){return `${f.ext?'E':'S'}:${f.id}`;}
function dir(f){const source=String(f.source||'').toUpperCase();if(source==='GEN'||source==='SIM'||source==='RX'||source==='TX')return source;return f.sim?'SIM':String(f.dir||'RX').toUpperCase();}
function frameAscii(byteList,dlc=8){return (byteList||[]).slice(0,Math.max(0,Math.min(8,Number(dlc)||0))).map(x=>{const v=parseInt(x||'00',16);return v>=32&&v<=126?String.fromCharCode(v):'.';}).join('');}
function normalizeFrameModel(input={}){
  const frame={...input};
  frame.id=String(frame.id||'000').replace(/^0X/i,'').toUpperCase();
  frame.ext=Boolean(frame.ext||frame.ide||parseInt(frame.id||'0',16)>0x7FF);
  frame.rtr=Boolean(frame.rtr);
  frame.source=dir(frame);
  frame.dir=frame.source==='TX'?'TX':'RX';
  frame.sim=frame.source==='SIM'||frame.source==='GEN';
  frame.data=String(frame.data||'').replace(/[^0-9A-F]/gi,'').toUpperCase().slice(0,16);
  frame.bytes=bytes(frame.data);
  frame.dlc=Math.max(0,Math.min(8,Number(frame.dlc ?? frame.bytes.length)||0));
  while(frame.bytes.length<frame.dlc)frame.bytes.push('00');
  frame.data=frame.bytes.slice(0,frame.dlc).join('');
  frame.label=String(frame.label!==undefined?frame.label:labelFor(frame.id));
  frame.ascii=frameAscii(frame.bytes,frame.dlc);
  frame.us=Number.isFinite(Number(frame.us))?Number(frame.us):Math.round(performance.now()*1000);
  frame.count=Number(frame.count)||1;
  frame.favorite=Boolean(frame.favorite);
  return frame;
}
function idNumber(id){const clean=String(id??'0').trim().toUpperCase().replace(/^0X/,'');return Number.parseInt(clean||'0',16)||0;}
function formatCanId(id,extended=false){const n=idNumber(id);if(idDisplayFormat==='DEC')return String(n);return '0x'+n.toString(16).toUpperCase().padStart(extended?8:3,'0');}
function parseCanIdInput(value,format=idDisplayFormat){let text=String(value||'').trim();if(!text)return NaN;let base=format==='DEC'?10:16;if(/^0x/i.test(text)){text=text.slice(2);base=16;}else if(/h$/i.test(text)){text=text.slice(0,-1);base=16;}else if(/^dec:/i.test(text)){text=text.slice(4);base=10;}else if(/d$/i.test(text)){text=text.slice(0,-1);base=10;}return Number.parseInt(text,base);}
function internalCanId(value,format=idDisplayFormat){const n=parseCanIdInput(value,format);return Number.isFinite(n)?n.toString(16).toUpperCase():'';}
function convertIdField(value,from,to){return String(value||'').trim().split(/([\s,;]+)/).map(part=>{if(!part.trim()||/^[\s,;]+$/.test(part))return part;const n=parseCanIdInput(part,from);return Number.isFinite(n)?(to==='DEC'?String(n):'0x'+n.toString(16).toUpperCase()):part;}).join('');}
function updateIdFormatHeaders(){
  document.querySelectorAll('[data-id-format-toggle]').forEach(th=>{
    th.textContent=`ID (${idDisplayFormat})`;
    th.setAttribute('aria-label',`CAN-ID-Anzeige ${idDisplayFormat}`);
  });
  document.querySelectorAll('[data-id-format-label]').forEach(el=>el.textContent=`ID (${idDisplayFormat})`);
  document.querySelectorAll('[data-id-range-label]').forEach(el=>el.textContent=`ID ${el.dataset.idRangeLabel==='from'?'von':'bis'} (${idDisplayFormat})`);
  ['idFrom','idTo','showIds','hideIds','labelId','txId','simId','simRandomIdMin','simRandomIdMax'].forEach(id=>{const el=$(id);if(el)el.setAttribute('data-id-format',idDisplayFormat);});
  const setting=$('idDisplayFormatSetting');if(setting)setting.value=idDisplayFormat;
}
function setOverviewSort(key){
  if(overviewSort.key!==key)overviewSort={key,dir:key==='frames'?-1:1};
  else if(overviewSort.dir===1)overviewSort={key,dir:-1};
  else overviewSort={key:'fixed',dir:1};
  localStorage.setItem('deacsOverviewSortV2',JSON.stringify(overviewSort));
  updateOverviewSortHeaders();renderOverview();
}
function setIdDisplayFormat(value,notify=false){const previous=idDisplayFormat,next=value==='DEC'?'DEC':'HEX';if(previous!==next){['idFrom','idTo','showIds','hideIds','labelId','txId','simId','simRandomIdMin','simRandomIdMax'].forEach(id=>{const el=$(id);if(el&&el.value.trim())el.value=convertIdField(el.value,previous,next);});}idDisplayFormat=next;localStorage.setItem('deacsIdDisplayFormat',idDisplayFormat);updateIdFormatHeaders();scheduleRender();scheduleOverview();renderDecodedList();renderLabels();renderTxHistory();renderSim();if(notify)showNotice(`CAN-IDs werden jetzt ${idDisplayFormat==='HEX'?'hexadezimal':'dezimal'} angezeigt.`,'success',2200);}
function toggleIdDisplayFormat(){setIdDisplayFormat(idDisplayFormat==='HEX'?'DEC':'HEX',true);}
function initIdFormatToggle(){updateIdFormatHeaders();document.querySelectorAll('[data-id-format-toggle]').forEach(th=>{th.removeAttribute('tabindex');th.onclick=null;th.onkeydown=null;});const setting=$('idDisplayFormatSetting');if(setting){setting.value=idDisplayFormat;setting.onchange=()=>setIdDisplayFormat(setting.value,true);}}
function idTokens(v){return new Set(String(v||'').split(/[\s,;]+/).map(x=>internalCanId(x)).filter(Boolean));}
function filterTokens(value){return String(value||'').trim().split(/[\s,;]+/).filter(Boolean);}
function normalizeFilterDisplay(value){return filterTokens(value).map(token=>{const raw=token.trim();if(/^0x/i.test(raw))return '0x'+raw.slice(2).toUpperCase();if(/h$/i.test(raw))return '0x'+raw.slice(0,-1).toUpperCase();if(/^dec:/i.test(raw))return String(parseInt(raw.slice(4),10)||0);if(/d$/i.test(raw))return String(parseInt(raw.slice(0,-1),10)||0);return idDisplayFormat==='DEC'?String(parseInt(raw,10)||0):'0x'+raw.toUpperCase();}).join(' ');}
function filterPayload(value){return filterTokens(value).map(token=>/^0x/i.test(token)||/h$/i.test(token)||/^dec:/i.test(token)||/d$/i.test(token)?token:(idDisplayFormat==='DEC'?`${token}d`:`0x${token}`)).join(' ');}
const DBC_ENABLED_KEY='deacsDbcEnabled',DBC_FILE_KEY='deacsDbcFile';
let dbcState={enabled:false,file:localStorage.getItem(DBC_FILE_KEY)||'',messages:new Map(),loaded:false,error:'',maxSize:512*1024,fileSizes:new Map()};

function dbcNormalizeMessageId(raw){
  let value=Number(raw)||0,extended=false;
  if(value>=0x80000000){value=value&0x1FFFFFFF;extended=true;}
  else if(value>0x7FF)extended=true;
  return {id:value>>>0,extended};
}
function dbcMessageKey(id,extended=false){return `${extended?'E':'S'}:${idNumber(id)}`;}
function dbcMessageFor(id,extended=false){
  if(!dbcState.enabled||!dbcState.loaded)return null;
  return dbcState.messages.get(dbcMessageKey(id,extended))||dbcState.messages.get(`S:${idNumber(id)}`)||dbcState.messages.get(`E:${idNumber(id)}`)||null;
}
function dbcUnquote(text){return String(text||'').replace(/^\s*"|"\s*$/g,'').replace(/\\"/g,'"').replace(/\\\\/g,'\\');}
function parseDbc(text){
  const messages=new Map(),values=new Map(),comments=[];
  let current=null;
  const lines=String(text||'').split(/\r?\n/);
  for(const original of lines){
    const line=original.trim();if(!line)continue;
    let m=line.match(/^BO_\s+(\d+)\s+([^:]+):\s+(\d+)\s+(\S+)/);
    if(m){
      const idInfo=dbcNormalizeMessageId(m[1]);
      current={id:idInfo.id,extended:idInfo.extended,name:m[2].trim(),dlc:Math.max(0,Math.min(64,Number(m[3])||0)),transmitter:m[4],signals:[],comment:''};
      messages.set(`${idInfo.extended?'E':'S'}:${idInfo.id}`,current);continue;
    }
    m=line.match(/^SG_\s+([A-Za-z0-9_\.]+)(?:\s+[^:]*)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([-+0-9.eE]+),([-+0-9.eE]+)\)\s*\[([^|\]]+)\|([^\]]+)\]\s*"([^"]*)"\s*(.*)$/);
    if(m&&current){
      current.signals.push({name:m[1],start:Number(m[2]),length:Number(m[3]),endian:m[4]==='1'?'intel':'motorola',signed:m[5]==='-',factor:Number(m[6]),offset:Number(m[7]),min:Number(m[8]),max:Number(m[9]),unit:m[10]||'',receivers:m[11]||'',values:new Map(),comment:''});continue;
    }
    m=line.match(/^VAL_\s+(\d+)\s+([A-Za-z0-9_\.]+)\s+(.+);$/);
    if(m){
      const idInfo=dbcNormalizeMessageId(m[1]),key=`${idInfo.extended?'E':'S'}:${idInfo.id}:${m[2]}`,map=new Map();
      const pairs=m[3].matchAll(/(-?\d+)\s+"((?:\\.|[^"])*)"/g);for(const pair of pairs)map.set(String(pair[1]),dbcUnquote(`"${pair[2]}"`));
      values.set(key,map);continue;
    }
    m=line.match(/^CM_\s+BO_\s+(\d+)\s+"((?:\\.|[^"])*)"\s*;$/);
    if(m){comments.push({type:'message',id:m[1],text:dbcUnquote(`"${m[2]}"`)});continue;}
    m=line.match(/^CM_\s+SG_\s+(\d+)\s+([A-Za-z0-9_\.]+)\s+"((?:\\.|[^"])*)"\s*;$/);
    if(m){comments.push({type:'signal',id:m[1],signal:m[2],text:dbcUnquote(`"${m[3]}"`)});continue;}
  }
  for(const msg of messages.values())for(const sig of msg.signals){const key=`${msg.extended?'E':'S'}:${msg.id}:${sig.name}`;if(values.has(key))sig.values=values.get(key);}
  for(const c of comments){const idInfo=dbcNormalizeMessageId(c.id),msg=messages.get(`${idInfo.extended?'E':'S'}:${idInfo.id}`);if(!msg)continue;if(c.type==='message')msg.comment=c.text;else{const sig=msg.signals.find(x=>x.name===c.signal);if(sig)sig.comment=c.text;}}
  return messages;
}
function dbcExtractRaw(bytesIn,signal){
  const data=Array.from({length:8},(_,i)=>parseInt(bytesIn[i]||'00',16)||0),len=Math.max(1,Math.min(64,Number(signal.length)||1));
  let raw=0n;
  if(signal.endian==='intel'){
    for(let i=0;i<len;i++){const bit=signal.start+i,byteIndex=Math.floor(bit/8),bitIndex=bit%8;if(byteIndex>=data.length)break;if(data[byteIndex]&(1<<bitIndex))raw|=1n<<BigInt(i);}
  }else{
    let bit=signal.start;
    for(let i=0;i<len;i++){
      const byteIndex=Math.floor(bit/8),bitIndex=bit%8;raw=(raw<<1n)|BigInt(byteIndex<data.length&&((data[byteIndex]>>bitIndex)&1)?1:0);
      bit=bitIndex===0?bit+15:bit-1;
    }
  }
  if(signal.signed){const signBit=1n<<BigInt(len-1);if(raw&signBit)raw-=1n<<BigInt(len);}
  return raw;
}
function dbcFormatNumber(value){if(!Number.isFinite(value))return String(value);const abs=Math.abs(value);return abs!==0&&(abs>=1e7||abs<1e-4)?value.toExponential(6).replace(/0+e/,'e'):String(Number(value.toFixed(9)));}
function dbcDecodeSignals(message,bytesIn){
  if(!message)return[];
  return message.signals.map(signal=>{
    const raw=dbcExtractRaw(bytesIn,signal),numeric=Number(raw)*signal.factor+signal.offset,enumText=signal.values.get(raw.toString());
    return {...signal,raw:raw.toString(),numeric,valueText:enumText!==undefined?`${enumText} (${dbcFormatNumber(numeric)})`:dbcFormatNumber(numeric)};
  });
}
function dbcLabelFor(id){
  const numeric=idNumber(id);if(!dbcState.enabled||!dbcState.loaded)return'';
  const std=dbcState.messages.get(`S:${numeric}`),ext=dbcState.messages.get(`E:${numeric}`);return (std||ext)?.name||'';
}
function renderDecodedDbcSignals(){
  const name=$('decodedDbcName'),messageText=$('decodedDbcMessage'),body=$('decodedDbcSignals');if(!name||!messageText||!body)return;
  name.textContent=dbcState.enabled&&dbcState.loaded?(dbcState.file||'DBC'):'keine';
  const row=decodedRowByUid(selectedDecodedRow);if(!dbcState.enabled||!dbcState.loaded){messageText.textContent='Keine DBC aktiv.';body.innerHTML='<tr class="dbcEmptyRow"><td colspan="7">Keine DBC aktiv.</td></tr>';return;}
  if(!row){messageText.textContent='Keine Decoded-Zeile ausgewählt.';body.innerHTML='<tr class="dbcEmptyRow"><td colspan="7">Eine Zeile auswählen.</td></tr>';return;}
  const message=dbcMessageFor(row.id,!!row.ide);if(!message){messageText.textContent=`ID ${row.id}: keine Nachricht in der aktiven DBC.`;body.innerHTML='<tr class="dbcEmptyRow"><td colspan="7">Für diese CAN-ID sind keine DBC-Signale definiert.</td></tr>';return;}
  messageText.textContent=`${message.name} · ${message.signals.length} Signal${message.signals.length===1?'':'e'}`;
  const signals=dbcDecodeSignals(message,row.bytes.slice(0,row.dlc));
  if(!signals.length){body.innerHTML='<tr class="dbcEmptyRow"><td colspan="7">Nachricht enthält keine Signale.</td></tr>';return;}
  body.innerHTML=signals.map(sig=>`<tr title="${escapeHtml(sig.comment||'')}"><td>${escapeHtml(sig.name)}</td><td>${escapeHtml(sig.valueText)}</td><td>${escapeHtml(sig.unit||'')}</td><td>${escapeHtml(sig.raw)}</td><td>${sig.start}</td><td>${sig.length}</td><td>${sig.endian==='intel'?'Intel':'Motorola'} / ${sig.signed?'signed':'unsigned'}</td></tr>`).join('');
}
async function loadDbcFile(name,quiet=false){
  dbcState.file=String(name||'');localStorage.setItem(DBC_FILE_KEY,dbcState.file);
  if(!dbcState.file){dbcState.messages=new Map();dbcState.loaded=false;dbcState.error='';updateDbcUi();return;}
  try{
    const knownSize=dbcState.fileSizes.get(dbcState.file)||0;if(knownSize>dbcState.maxSize)throw new Error(`DBC zu groß (${Math.ceil(knownSize/1024)} KB, max. ${Math.floor(dbcState.maxSize/1024)} KB)`);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let response;try{response=await fetch('/api/dbc/file?name='+encodeURIComponent(dbcState.file)+'&ts='+Date.now(),{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}if(response.status===413)throw new Error('DBC zu groß für sicheren ESP32-Betrieb');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const text=await response.text();dbcState.messages=parseDbc(text);dbcState.loaded=true;dbcState.error='';
    if(!quiet)showNotice(`DBC geladen: ${dbcState.file} · ${dbcState.messages.size} Nachrichten.`,'success',2600);
  }catch(e){dbcState.messages=new Map();dbcState.loaded=false;dbcState.error=String(e?.message||e);if(!quiet)showNotice('DBC konnte nicht geladen werden.','error',4200);}
  updateDbcUi();renderOverview();renderDecodedList();scheduleRender();
}
function updateDbcUi(){
  const enabled=$('dbcEnabled'),select=$('dbcSelect'),status=$('dbcStatus'),remove=$('dbcDelete');if(enabled)enabled.checked=dbcState.enabled;if(select&&dbcState.file)select.value=dbcState.file;if(remove)remove.disabled=!dbcState.file;
  if(status){if(dbcState.error)status.textContent=`Fehler: ${dbcState.error}`;else if(dbcState.loaded)status.textContent=`${dbcState.file}: ${dbcState.messages.size} Nachrichten geladen.`;else status.textContent=dbcState.enabled?'Keine DBC geladen.':'DBC ist deaktiviert.';}
  renderDecodedDbcSignals();
}
async function refreshDbcList({quiet=false}={}){
  const select=$('dbcSelect');if(!select)return;
  try{
    const response=await fetch('/api/dbc/list?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();const entries=Array.isArray(data.files)?data.files:[];dbcState.maxSize=Number(data.maxSize)||512*1024;dbcState.fileSizes=new Map(entries.map(x=>[String(x?.name||x),Number(x?.size)||0]));const files=entries.map(x=>String(x?.name||x)).filter(Boolean);
    select.innerHTML=files.length?files.map(name=>{const size=dbcState.fileSizes.get(name)||0;const suffix=size?` · ${Math.ceil(size/1024)} KB`:'';return `<option value="${escapeHtml(name)}">${escapeHtml(name+suffix)}</option>`;}).join(''):'<option value="">Keine DBC gefunden</option>';
    if(files.length){if(!files.includes(dbcState.file))dbcState.file=files[0];select.value=dbcState.file;updateDbcUi();}
    else{dbcState.file='';dbcState.messages=new Map();dbcState.loaded=false;localStorage.removeItem(DBC_FILE_KEY);updateDbcUi();if(!quiet)showNotice('Keine DBC-Datei in data/dbc gefunden.','info',3200);}
  }catch(e){dbcState.error=String(e?.message||e);dbcState.loaded=false;updateDbcUi();if(!quiet)showNotice('DBC-Ordner konnte nicht gelesen werden.','error',4200);}
}
async function uploadDbcFromBrowser(file){
  if(!file)return;
  if(!/\.dbc$/i.test(file.name)){showNotice('Bitte eine DBC-Datei auswählen.','warning');return;}
  if(file.size>dbcState.maxSize){showNotice(`DBC ist zu groß. Maximum: ${Math.floor(dbcState.maxSize/1024)} KB.`,'warning',4500);return;}
  const button=$('dbcUpload');button.disabled=true;
  try{
    const form=new FormData();form.append('file',file,file.name);
    const response=await fetch('/api/dbc/upload',{method:'POST',body:form});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    dbcState.file=file.name;localStorage.setItem(DBC_FILE_KEY,dbcState.file);await refreshDbcList({quiet:true});
    if(dbcState.enabled)await loadDbcFile(dbcState.file);else updateDbcUi();
    showNotice(`DBC gespeichert: ${file.name}`,'success',3000);
  }catch(e){showNotice('DBC konnte nicht gespeichert werden.','error',4500);}finally{button.disabled=false;$('dbcUploadFile').value='';}
}
async function deleteSelectedDbc(){
  const name=dbcState.file;if(!name)return;
  if(!await askConfirm(`DBC ${name} wirklich vom ESP32 löschen?`,'DBC löschen'))return;
  try{
    const response=await fetch('/api/dbc/delete?name='+encodeURIComponent(name),{method:'POST'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    dbcState.file='';dbcState.messages=new Map();dbcState.loaded=false;localStorage.removeItem(DBC_FILE_KEY);await refreshDbcList({quiet:true});renderOverview();renderDecodedList();scheduleRender();showNotice('DBC gelöscht.','success');
  }catch(e){showNotice('DBC konnte nicht gelöscht werden.','error',4200);}
}
function initDbc(){
  const enabled=$('dbcEnabled'),select=$('dbcSelect'),reload=$('dbcReload'),upload=$('dbcUpload'),uploadFile=$('dbcUploadFile'),remove=$('dbcDelete');
  // Safety: DBC decoding is never auto-reactivated after a page reload. A problematic
  // or oversized file therefore cannot trap the browser/ESP32 in a reload loop.
  localStorage.removeItem(DBC_ENABLED_KEY);dbcState.enabled=false;
  if(enabled)enabled.onchange=async()=>{dbcState.enabled=enabled.checked;if(dbcState.enabled&&dbcState.file)await loadDbcFile(dbcState.file);else{dbcState.messages=new Map();dbcState.loaded=false;updateDbcUi();renderOverview();renderDecodedList();scheduleRender();}};
  if(select)select.onchange=()=>loadDbcFile(select.value);
  if(reload)reload.onclick=()=>refreshDbcList();
  if(upload&&uploadFile){upload.onclick=()=>uploadFile.click();uploadFile.onchange=()=>uploadDbcFromBrowser(uploadFile.files?.[0]);}
  if(remove)remove.onclick=deleteSelectedDbc;
  updateDbcUi();refreshDbcList({quiet:true});
}
function labelFor(id){return labels[id.toUpperCase()]||dbcLabelFor(id)||'';}
function saveLabels(){localStorage.setItem('deacsLabels',JSON.stringify(labels));renderLabels();renderOverview();renderDecodedList();}
function csvCell(v){const t=String(v??'');return /[\",\r\n]/.test(t)?`\"${t.replace(/\"/g,'\"\"')}\"`:t;}

function openLogDb(){
  if(logDb)return Promise.resolve(logDb);
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(LOG_DB_NAME,LOG_DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'id'});
      if(!db.objectStoreNames.contains('frames')){
        const store=db.createObjectStore('frames',{keyPath:'key',autoIncrement:true});
        store.createIndex('sessionId','sessionId',{unique:false});
      }
    };
    req.onsuccess=()=>{logDb=req.result;logDb.onversionchange=()=>logDb.close();resolve(logDb);};
    req.onerror=()=>reject(req.error||new Error('IndexedDB konnte nicht geöffnet werden'));
  });
}
function idbReq(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB-Transaktion abgebrochen'));});}
function logTimestampName(ts=Date.now()){const d=new Date(ts),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
function updateBrowserLogStatus(){
  if(!$('logState'))return;
  $('logState').textContent=browserLog.lastError?'Fehler':browserLog.active?'Aufnahme läuft':browserLog.sessionId?'gespeichert':'aus';
  $('logState').className=browserLog.lastError?'logError':browserLog.active?'logActive':'';
  $('logFrames').textContent=browserLog.totalFrames.toLocaleString('de-DE');
  $('logSaved').textContent=browserLog.persistedFrames.toLocaleString('de-DE');
  $('logSize').textContent=fmtBytes(browserLog.totalBytes+browserLog.bufferBytes);
  $('logSession').textContent=browserLog.sessionId?`DEACS_${logTimestampName(browserLog.startedAt)}`:'-';
  $('logError').textContent=browserLog.lastError;
  $('logToggle').textContent=browserLog.active?'Log stoppen':'Log starten';
  $('logToggle').classList.toggle('dangerButton',browserLog.active);
  $('logToggle').classList.toggle('primary',!browserLog.active);
  const exportDisabled=!browserLog.sessionId||browserLog.active||logExportBusy;
  $('exportMenuToggle').disabled=exportDisabled;
  $('logSave').disabled=exportDisabled;
  $('logExport').disabled=exportDisabled;
  $('logClear').disabled=!browserLog.sessionId||browserLog.active;
}
async function loadLatestLogSession(){
  try{
    const db=await openLogDb();
    const tx=db.transaction('sessions','readonly');
    const sessions=await idbReq(tx.objectStore('sessions').getAll());
    await txDone(tx);
    if(!sessions.length){browserLog.loaded=true;updateBrowserLogStatus();return;}
    const last=sessions.sort((a,b)=>b.startedAt-a.startedAt)[0];
    browserLog={...browserLog,active:false,sessionId:last.id,totalBytes:last.totalBytes||0,totalFrames:last.totalFrames||0,persistedFrames:last.totalFrames||0,buffer:[],bufferBytes:0,lastError:'',startedAt:last.startedAt||0,loaded:true};
    if(last.active){
      const tx2=db.transaction('sessions','readwrite');last.active=false;last.recovered=true;last.endedAt=Date.now();tx2.objectStore('sessions').put(last);await txDone(tx2);
    }
    updateBrowserLogStatus();
  }catch(e){browserLog.lastError=e.message||String(e);updateBrowserLogStatus();}
}
async function createLogSession(){
  const db=await openLogDb(),now=Date.now(),id=`${now}_${Math.random().toString(36).slice(2,8)}`;
  const session={id,startedAt:now,endedAt:null,active:true,totalFrames:0,totalBytes:0};
  const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').add(session);await txDone(tx);
  browserLog={active:true,sessionId:id,totalBytes:0,totalFrames:0,persistedFrames:0,buffer:[],bufferBytes:0,flushTimer:null,lastError:'',startedAt:now,loaded:true};
}
function appendBrowserLog(f){
  if(!browserLog.active)return;
  const b=Array.from({length:8},(_,i)=>f.bytes[i]||'');
  const line=[Math.round(Number(f.us)||0),(Number(f.deltaMs)||0).toFixed(3),dir(f),f.id,f.ext?1:0,f.rtr?1:0,f.dlc,...b].map(csvCell).join(',')+'\r\n';
  const size=new TextEncoder().encode(line).length;
  browserLog.buffer.push({line,bytes:size});browserLog.bufferBytes+=size;browserLog.totalFrames++;
  if(browserLog.buffer.length>=LOG_FLUSH_ROWS||browserLog.bufferBytes>=256*1024)flushBrowserLog();
  updateBrowserLogStatus();
}
let logFlushPromise=Promise.resolve();
function flushBrowserLog(){
  if(!browserLog.active||!browserLog.buffer.length)return logFlushPromise;
  const batch=browserLog.buffer.splice(0),batchBytes=browserLog.bufferBytes;browserLog.bufferBytes=0;
  const sessionId=browserLog.sessionId;
  logFlushPromise=logFlushPromise.then(async()=>{
    const db=await openLogDb();
    const tx=db.transaction(['frames','sessions'],'readwrite'),framesStore=tx.objectStore('frames');
    for(const item of batch)framesStore.add({sessionId,line:item.line,bytes:item.bytes});
    const sessions=tx.objectStore('sessions'),session=await idbReq(sessions.get(sessionId));
    if(session){session.totalFrames=(session.totalFrames||0)+batch.length;session.totalBytes=(session.totalBytes||0)+batchBytes;sessions.put(session);}
    await txDone(tx);
    browserLog.persistedFrames+=batch.length;browserLog.totalBytes+=batchBytes;updateBrowserLogStatus();
  }).catch(e=>{browserLog.lastError=e.message||String(e);browserLog.active=false;clearInterval(browserLog.flushTimer);updateBrowserLogStatus();});
  return logFlushPromise;
}
async function startBrowserLog(){
  try{
    if(browserLog.active)return;
    await createLogSession();
    browserLog.flushTimer=setInterval(flushBrowserLog,LOG_FLUSH_INTERVAL_MS);
    updateBrowserLogStatus();
  }catch(e){browserLog.lastError=e.message||String(e);updateBrowserLogStatus();}
}
async function stopBrowserLog(){
  if(!browserLog.active)return;
  clearInterval(browserLog.flushTimer);browserLog.flushTimer=null;
  await flushBrowserLog();await logFlushPromise;
  browserLog.active=false;
  try{
    const db=await openLogDb(),tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),session=await idbReq(store.get(browserLog.sessionId));
    if(session){session.active=false;session.endedAt=Date.now();store.put(session);}await txDone(tx);
  }catch(e){browserLog.lastError=e.message||String(e);}
  updateBrowserLogStatus();
}
function triggerTextDownload(name,parts,type='text/plain;charset=utf-8'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(parts,{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
function triggerCsvDownload(name,parts){triggerTextDownload(name,parts,'text/csv;charset=utf-8');}
let logExportBusy=false;
function setLogExportProgress({visible=true,title='Log wird exportiert',status='Logdaten werden gelesen …',done=0,total=0,percent=null}={}){
  const dialog=$('logExportProgress');if(!dialog)return;
  dialog.classList.toggle('visible',visible);dialog.setAttribute('aria-hidden',visible?'false':'true');
  if(!visible)return;
  const safeTotal=Math.max(0,Number(total)||0),safeDone=Math.max(0,Number(done)||0);
  const value=percent===null?(safeTotal?Math.min(100,Math.round(safeDone/safeTotal*100)):0):Math.max(0,Math.min(100,Math.round(percent)));
  $('logExportProgressTitle').textContent=title;$('logExportProgressStatus').textContent=status;
  $('logExportProgressBar').firstElementChild.style.width=`${value}%`;$('logExportProgressBar').setAttribute('aria-valuenow',String(value));
  $('logExportProgressPercent').textContent=`${value} %`;
  $('logExportProgressFrames').textContent=safeTotal?`${safeDone.toLocaleString('de-DE')} / ${safeTotal.toLocaleString('de-DE')} Frames`:'';
}
function beginLogExport(format){
  logExportBusy=true;$('exportMenuToggle').disabled=true;$('logSave').disabled=true;$('logExport').disabled=true;
  setLogExportProgress({title:`${format} wird vorbereitet`,status:'Logdaten werden aus dem Browserspeicher gelesen …',done:0,total:browserLog.totalFrames});
}
function updateLogExportProgress(done,total,status){setLogExportProgress({title:'Log wird exportiert',status,done,total});}
function endLogExport(){
  logExportBusy=false;setTimeout(()=>setLogExportProgress({visible:false}),450);updateBrowserLogStatus();
}
async function saveBrowserLog(){
  if(!browserLog.sessionId||browserLog.active||logExportBusy)return;
  beginLogExport('DEACS-Datei');
  try{
    const db=await openLogDb(),sessionId=browserLog.sessionId,total=browserLog.totalFrames;
    const csvHeader='Timestamp_us,Delta_us,Quelle,ID,IDE,RTR,DLC,D0,D1,D2,D3,D4,D5,D6,D7\r\n';
    const metadata={format:'DEACS-DLOG',version:1,createdAt:new Date().toISOString(),startedAt:browserLog.startedAt,totalFrames:browserLog.totalFrames,firmware:$('fw')?.textContent||''};
    const prefix='DEACS-DLOG;1\r\n'+JSON.stringify(metadata)+'\r\n'+csvHeader,prefixBytes=new TextEncoder().encode(prefix).length;
    let part=1,size=prefixBytes,chunks=[prefix],saved=0,lastUi=0;
    const tx=db.transaction('frames','readonly'),index=tx.objectStore('frames').index('sessionId');
    await new Promise((resolve,reject)=>{
      const req=index.openCursor(IDBKeyRange.only(sessionId));
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve();return;}const item=cursor.value;
        if(size+item.bytes>LOG_PART_LIMIT&&chunks.length>1){updateLogExportProgress(saved,total,`Teil ${part} wird als Datei bereitgestellt …`);triggerTextDownload(`DEACS_${logTimestampName(browserLog.startedAt)}_${String(part++).padStart(3,'0')}.dlog`,chunks,'application/x-deacs-dlog;charset=utf-8');chunks=[prefix];size=prefixBytes;}
        chunks.push(item.line);size+=item.bytes;saved++;const now=performance.now();if(now-lastUi>120||saved===total){lastUi=now;updateLogExportProgress(saved,total,`DEACS-Datei wird erstellt · Teil ${part}`);}cursor.continue();};
    });
    await txDone(tx);
    updateLogExportProgress(saved,total,'Datei ist fertig. Speicherdialog wird geöffnet …');
    if(chunks.length>1)triggerTextDownload(`DEACS_${logTimestampName(browserLog.startedAt)}_${String(part).padStart(3,'0')}.dlog`,chunks,'application/x-deacs-dlog;charset=utf-8');
    $('logError').textContent=`${saved.toLocaleString('de-DE')} Frames als DEACS-Datei gespeichert.`;
  }catch(e){showNotice('DEACS-Export fehlgeschlagen: '+(e.message||e),'error',6000);}
  finally{endLogExport();}
}
async function exportBrowserLog(){
  if(!browserLog.sessionId||browserLog.active||logExportBusy)return;
  beginLogExport('CSV-Datei');
  try{
    const db=await openLogDb(),sessionId=browserLog.sessionId,total=browserLog.totalFrames,header='Timestamp_us,Delta_us,Quelle,ID,IDE,RTR,DLC,D0,D1,D2,D3,D4,D5,D6,D7\r\n',headerBytes=new TextEncoder().encode(header).length;
    let part=1,size=headerBytes,chunks=[header],exported=0,lastUi=0;
    const tx=db.transaction('frames','readonly'),index=tx.objectStore('frames').index('sessionId');
    await new Promise((resolve,reject)=>{
      const req=index.openCursor(IDBKeyRange.only(sessionId));
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve();return;}const item=cursor.value;
        if(size+item.bytes>LOG_PART_LIMIT&&chunks.length>1){updateLogExportProgress(exported,total,`Teil ${part} wird als Datei bereitgestellt …`);triggerCsvDownload(`DEACS_${logTimestampName(browserLog.startedAt)}_${String(part++).padStart(3,'0')}.csv`,chunks);chunks=[header];size=headerBytes;}
        chunks.push(item.line);size+=item.bytes;exported++;const now=performance.now();if(now-lastUi>120||exported===total){lastUi=now;updateLogExportProgress(exported,total,`CSV-Datei wird erstellt · Teil ${part}`);}cursor.continue();};
    });
    await txDone(tx);updateLogExportProgress(exported,total,'Datei ist fertig. Speicherdialog wird geöffnet …');
    if(chunks.length>1)triggerCsvDownload(`DEACS_${logTimestampName(browserLog.startedAt)}_${String(part).padStart(3,'0')}.csv`,chunks);
    $('logError').textContent=`${exported.toLocaleString('de-DE')} Frames exportiert.`;
  }catch(e){showNotice('CSV-Export fehlgeschlagen: '+(e.message||e),'error',6000);}
  finally{endLogExport();}
}
async function clearBrowserLogs(){
  if(browserLog.active)return;
  if(!await askConfirm('Alle in diesem Browser gespeicherten DEACS-Logs wirklich löschen?','Logs löschen'))return;
  try{const db=await openLogDb(),tx=db.transaction(['sessions','frames'],'readwrite');tx.objectStore('sessions').clear();tx.objectStore('frames').clear();await txDone(tx);browserLog={active:false,sessionId:null,totalBytes:0,totalFrames:0,persistedFrames:0,buffer:[],bufferBytes:0,flushTimer:null,lastError:'',startedAt:0,loaded:true};updateBrowserLogStatus();}
  catch(e){browserLog.lastError=e.message||String(e);updateBrowserLogStatus();}
}
function downloadJson(name,obj){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function readJson(file,cb){const r=new FileReader();r.onload=()=>{try{cb(JSON.parse(r.result));}catch(e){showNotice('Ungültige JSON-Datei: '+e.message,'error',6000);}};r.readAsText(file);}

function parseCsvLine(line){
  const out=[];let cur='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;
    }else if(c===','&&!quoted){out.push(cur);cur='';}else cur+=c;
  }
  out.push(cur);return out;
}
function formatImportTiming(imported){
  if(!imported.length)return {range:'-',duration:'-'};
  const values=imported.map(f=>Number(f.us)).filter(Number.isFinite);
  if(!values.length)return {range:'-',duration:'-'};
  const min=Math.min(...values),max=Math.max(...values),duration=Math.max(0,max-min);
  const formatUs=us=>us>=1000000?`${(us/1000000).toFixed(3)} s`:us>=1000?`${(us/1000).toFixed(1)} ms`:`${Math.round(us)} µs`;
  return {range:`${formatUs(min)} – ${formatUs(max)}`,duration:formatUs(duration)};
}
function replaySourceGroup(f){
  const source=String(f?.source||f?.dir||'RX').toUpperCase();
  if(source==='RX')return 'RX';
  if(source==='TX')return 'TX';
  if(source==='SIM'||source==='GEN')return 'SIM';
  return 'OTHER';
}
function updateReplaySourceOptions(){
  const counts={RX:0,TX:0,SIM:0,OTHER:0};
  loadedSession.forEach(f=>counts[replaySourceGroup(f)]++);
  const defs=[['simReplayRx','RX'],['simReplayTx','TX'],['simReplaySim','SIM'],['simReplayOther','OTHER']];
  defs.forEach(([id,key])=>{
    const el=$(id),count=$(id+'Count');
    if(!el)return;
    // Eine Quelle mit 0 Frames bleibt bewusst auswählbar.
    // Nur während einer laufenden Wiedergabe wird die Auswahl gesperrt.
    el.disabled=replayRunning;
    if(count)count.textContent=counts[key].toLocaleString('de-DE');
    const label=el.closest('label');
    if(label)label.classList.toggle('emptySource',counts[key]===0);
  });
  if($('simReplayLoadedCount')){
    $('simReplayLoadedCount').textContent=loadedSession.length.toLocaleString('de-DE');
  }
}
function selectedReplayFrames(){
  const enabled={RX:!!$('simReplayRx')?.checked,TX:!!$('simReplayTx')?.checked,SIM:!!$('simReplaySim')?.checked,OTHER:!!$('simReplayOther')?.checked};
  return loadedSession.filter(f=>enabled[replaySourceGroup(f)]);
}
function updateImportedDataInfo(info=importedDataInfo){
  const box=$('importInfo');if(!box)return;
  if(!info){
    box.classList.add('empty');
    $('importState').textContent='Keine Daten geladen';
    $('importFile').textContent='-';$('importFrames').textContent='0';$('importSource').textContent='-';
    $('importRange').textContent='-';$('importDuration').textContent='-';$('importSize').textContent='0 B';$('importTime').textContent='-';
    return;
  }
  box.classList.remove('empty');
  $('importState').textContent='Import geladen';
  $('importFile').textContent=info.name;
  $('importFrames').textContent=info.frames.toLocaleString('de-DE');
  $('importSource').textContent=info.source;
  $('importRange').textContent=info.range;
  $('importDuration').textContent=info.duration;
  $('importSize').textContent=fmtBytes(info.size);
  $('importTime').textContent=new Date(info.importedAt).toLocaleString('de-DE');
  const canReplay=loadedSession.length>0;if($('importReplay'))$('importReplay').disabled=!canReplay;if($('simReplay'))$('simReplay').disabled=!canReplay;updateReplaySourceOptions();
}
function normalizeImportedFrame(f,index=0){
  const rawId=String(f.id??f.ID??'').trim().toUpperCase().replace(/^0X/,'');
  if(!/^[0-9A-F]{1,8}$/.test(rawId))return null;
  let data='';
  if(Array.isArray(f.data))data=f.data.map(x=>Number(x).toString(16).padStart(2,'0')).join('');
  else data=String(f.data??'').replace(/[^0-9A-F]/gi,'').toUpperCase();
  if(!data&&f.d0!==undefined)data=Array.from({length:8},(_,i)=>String(f['d'+i]??'').trim()).filter(Boolean).join('');
  data=(data.match(/[0-9A-F]{2}/g)||[]).slice(0,8).join('');
  const dlc=Math.max(0,Math.min(8,Number(f.dlc??data.length/2)||0));
  data=data.slice(0,dlc*2).padEnd(dlc*2,'0');
  const us=Number(f.us??f.timestamp_us??f.time_us);
  const direction=String(f.source??f.dir??f.direction??'RX').toUpperCase();
  const source=['RX','TX','SIM','GEN'].includes(direction)?direction:'OTHER';
  return {us:Number.isFinite(us)?us:index*1000,dir:source==='TX'?'TX':'RX',source,sim:source==='SIM'||source==='GEN'||!!f.sim,id:rawId,dlc,data,ext:Number(f.ext??f.extended??f.ide??0)!==0,rtr:Number(f.rtr??0)!==0};
}
function parseImportedCsv(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(!lines.length)return [];
  const header=parseCsvLine(lines[0]).map(x=>x.trim().toLowerCase());
  const hasHeader=header.includes('id');
  const rows=hasHeader?lines.slice(1):lines;
  return rows.map((line,index)=>{
    const v=parseCsvLine(line),o={};
    if(hasHeader)header.forEach((h,i)=>o[h]=v[i]??'');
    else {o.us=v[0];o.source=v[2];o.id=v[3];o.ext=v[4];o.rtr=v[5];o.dlc=v[6];for(let i=0;i<8;i++)o['d'+i]=v[7+i];}
    if(hasHeader&&!o.source&&o.dir)o.source=o.dir;
    if(hasHeader&&!o.data)o.data=Array.from({length:8},(_,i)=>o['d'+i]??'').join('');
    return normalizeImportedFrame(o,index);
  }).filter(Boolean);
}
async function importFramesIntoView(imported,fileInfo={}){
  if(!imported.length){showNotice('Keine gültigen CAN-Frames gefunden.','error',5000);return;}
  if(frames.length&&!(await askConfirm(`${imported.length.toLocaleString('de-DE')} Frames importieren und vorhandene Monitor-Daten ersetzen?`,'Daten importieren')))return;
  frames.length=0;overview.clear();previous.clear();totalReceived=0;
  resetMonitorViewFilters();paused=false;$('pause').textContent='Pause';
  const wasLogging=browserLog.active;browserLog.active=false;
  imported.slice(-MAX_FRAMES).forEach(addFrame);
  browserLog.active=wasLogging;
  loadedSession=imported;
  const timing=formatImportTiming(imported);
  const extension=(fileInfo.name?.split('.').pop()||'Datei').toUpperCase();
  importedDataInfo={name:fileInfo.name||'Importierte Daten',size:Number(fileInfo.size)||0,frames:imported.length,source:`Import (.${extension.toLowerCase()})`,range:timing.range,duration:timing.duration,importedAt:Date.now()};
  updateImportedDataInfo();
  render();renderOverview();updateCounts();
  activateTab('monitor');
  const visible=frames.filter(match).slice(-MAX_ROWS).length;
  showNotice(`${imported.length.toLocaleString('de-DE')} Frames importiert · ${visible.toLocaleString('de-DE')} werden angezeigt`,'success',5200);
}

function parseImportedDlog(text){
  const normalized=String(text||'').replace(/^\uFEFF/,'');
  const lines=normalized.split(/\r?\n/);
  if((lines[0]||'').trim()!=='DEACS-DLOG;1')throw new Error('Unbekanntes oder beschädigtes DEACS-Logformat.');
  let metadata={};
  try{metadata=JSON.parse(lines[1]||'{}');}catch(_){throw new Error('DEACS-Metadaten sind beschädigt.');}
  if(metadata.format!=='DEACS-DLOG'||Number(metadata.version)!==1)throw new Error('Diese DEACS-Logversion wird nicht unterstützt.');
  const csv=lines.slice(2).join('\n');
  return {frames:parseImportedCsv(csv),metadata};
}
function importDataFile(file){
  const r=new FileReader();
  r.onload=()=>{try{
    const text=String(r.result||'');let imported=[];
    if(file.name.toLowerCase().endsWith('.dlog')||text.trimStart().startsWith('DEACS-DLOG;')){
      imported=parseImportedDlog(text).frames;
    }else if(file.name.toLowerCase().endsWith('.json')||text.trim().startsWith('{')||text.trim().startsWith('[')){
      const o=JSON.parse(text),src=Array.isArray(o)?o:(o.frames||[]);
      imported=src.map(normalizeImportedFrame).filter(Boolean);
    }else imported=parseImportedCsv(text);
    importFramesIntoView(imported,{name:file.name,size:file.size});
  }catch(e){showNotice('Import fehlgeschlagen: '+e.message,'error',6500);}};
  r.readAsText(file);
}

function addFrame(f){
  f=normalizeFrameModel(f);
  totalReceived++;
  const now=performance.now();
  f.receivedAt=now;
  if(!f._monitorUid)f._monitorUid=++monitorFrameSeq;
  const k=key(f),old=previous.get(k)||[],existing=overview.get(k);
  f.previousBytes=old.slice();
  f.changedBytes=f.bytes.map((b,i)=>old[i]!==undefined&&old[i]!==b);
  f.bitChangeMasks=f.bytes.map((b,i)=>old[i]===undefined?0:((parseInt(old[i],16)^parseInt(b||'00',16))&0xFF));
  f.changed=f.changedBytes.some(Boolean)||old.length!==f.bytes.length;
  previous.set(k,f.bytes.slice());
  // Delta time is measured per CAN ID. Interleaved simulator frames no longer
  // make a 500 ms frame appear to have a 20-80 ms interval.
  f.deltaMs=existing?Math.max(0,(f.us-existing.lastUs)/1000):0;
  frames.push(f);
  if(frames.length>MAX_FRAMES)frames.splice(0,frames.length-MAX_FRAMES);
  const o=existing||{count:0,sequence:++overviewSequence,byteFlashUntil:Array(8).fill(0),packetFlashUntil:0,newIdUntil:now+900,
    deltaCount:0,deltaSum:0,deltaMin:null,deltaMax:null,changeCount:0,
    byteChangeCounts:Array(8).fill(0),recentUs:[]};
  const byteFlashUntil=Array.from({length:8},(_,i)=>
    f.changedBytes[i] ? now+650 : Number((o.byteFlashUntil||[])[i]||0)
  );
  const validDelta=Boolean(existing)&&f.deltaMs>=0;
  const deltaCount=Number(o.deltaCount||0)+(validDelta?1:0);
  const deltaSum=Number(o.deltaSum||0)+(validDelta?f.deltaMs:0);
  const deltaMin=validDelta?(o.deltaMin==null?f.deltaMs:Math.min(Number(o.deltaMin),f.deltaMs)):o.deltaMin;
  const deltaMax=validDelta?(o.deltaMax==null?f.deltaMs:Math.max(Number(o.deltaMax),f.deltaMs)):o.deltaMax;
  const byteChangeCounts=Array.from({length:8},(_,i)=>Number((o.byteChangeCounts||[])[i]||0)+(f.changedBytes[i]?1:0));
  const recentUs=[...(o.recentUs||[]),f.us].filter(t=>f.us-t<=2000000).slice(-256);
  const nextOverview={...f,count:o.count+1,lastUs:f.us,lastSeenAt:now,filterSeenAt:now,lastChangeAt:f.changed?now:Number(o.lastChangeAt||0),newIdUntil:Number(o.newIdUntil||0),
    deltaCount,deltaSum,deltaMin,deltaMax,
    changeCount:Number(o.changeCount||0)+(f.changed?1:0),byteChangeCounts,recentUs,
    changedByteCount:f.changedBytes.filter(Boolean).length,bitChangeMasks:f.bitChangeMasks.slice(),
    // Bei jedem empfangenen CAN-Frame die Frames-Zahl kurz rot und fett blitzen lassen.
    // Es wird ausschließlich die Zählerzelle markiert, niemals die komplette Zeile.
    packetFlashUntil:now+420,
    byteFlashUntil
  };
  latestOverviewLive.set(k,nextOverview);
  if(!frozenOverviewKeys.has(k))overview.set(k,nextOverview);
  appendBrowserLog(f);
  if(!paused)scheduleRender();
  scheduleOverview();
}
function match(f){const q=$('search').value.trim().toUpperCase(),d=$('direction').value,t=$('frameType').value,dlc=$('dlcFilter').value,from=Number.isFinite(parseCanIdInput($('idFrom').value))?parseCanIdInput($('idFrom').value):0,to=Number.isFinite(parseCanIdInput($('idTo').value))?parseCanIdInput($('idTo').value):0x1FFFFFFF,show=idTokens($('showIds').value),hide=idTokens($('hideIds').value);if(d!=='all'&&dir(f)!==d)return false;if(t==='std'&&f.ext||t==='ext'&&!f.ext||t==='rtr'&&!f.rtr)return false;if(dlc!=='all'&&f.dlc!==Number(dlc))return false;if(f.id&&parseInt(f.id,16)<from||parseInt(f.id,16)>to)return false;if(show.size&&!show.has(f.id))return false;if(hide.has(f.id)||hiddenIds.has(f.id))return false;if(ageFilterEnabled&&(performance.now()-f.receivedAt)>Math.max(1,Number($('maxAge').value)||5)*1000)return false;return !q||f.id.includes(q)||f.data.includes(q)||labelFor(f.id).toUpperCase().includes(q);}
function row(f){
  const cells=[];
  for(let i=0;i<8;i++)cells.push(`<td class="byteCell">${f.bytes[i]?formatHexValue(f.bytes[i]):''}</td>`);
  const label=labelFor(f.id),decoded=decodedContainsFrame(f);
  const idText=`${f.ext?'E:':''}${formatCanId(f.id,f.ext)}`;
  const idHtml=decoded?`<span class="decodedMonitorBadge">${idText}</span>`:idText;
  const labelHtml=decoded?`<span class="decodedLabelBadge">${escapeHtml(label)}</span>`:escapeHtml(label);
  const selected=selectedMonitorFrameUid===f._monitorUid?' monitorSelectedRow':'';
  const ascii=f.ascii||frameAscii(f.bytes,f.dlc);
  return `<tr class="row-${dir(f)}${selected}" data-monitor-uid="${f._monitorUid}" title="${escapeHtml(label)}"><td>${idHtml}</td><td>${labelHtml}</td><td>${(f.us/1e6).toFixed(6)}</td><td>${f.deltaMs.toFixed(3)}</td><td class="${dir(f)}">${dir(f)}</td><td>${f.dlc}${f.rtr?' RTR':''}</td>${cells.join('')}<td class="asciiCell">${escapeHtml(ascii)}</td></tr>`;
}
function loadMonitorFrameIntoTx(f){
  if(!f)return;
  $('txId').value=formatCanId(f.id,!!f.ext);
  $('txDlc').value=String(Math.max(0,Math.min(8,Number(f.dlc)||0)));
  setToggleButton('txExt',!!f.ext);setToggleButton('txRtr',!!f.rtr);
  const values=Array.isArray(f.bytes)?f.bytes:bytes(String(f.data||''));
  txInputs().forEach((input,i)=>input.value=String(values[i]||'00').toUpperCase().padStart(2,'0'));
  updateTxEditor();activateTab('tx');showNotice(`Frame ${formatCanId(f.id,!!f.ext)} in TX übernommen.`,'success',2200);
}
function render(){renderPending=false;if(monitorViewFrozen){updateCounts();return;}const w=document.querySelector('.monitorTable'),savedTop=w.scrollTop,auto=$('autoscroll').checked;const shown=frames.filter(match).slice(-MAX_ROWS);$('frames').innerHTML=shown.map(row).join('');$('visibleCount').textContent=shown.length;if(auto){w.scrollTop=w.scrollHeight;$('scrollToEnd').hidden=true;}else{w.scrollTop=savedTop;$('scrollToEnd').hidden=false;}}
function scheduleRender(){updateCounts();if(document.hidden||activeTab!=='monitor')return;if(!renderPending){renderPending=true;renderTimer=setTimeout(()=>requestAnimationFrame(()=>{updateCounts();render();}),75);}}function updateCounts(){$('receivedCount').textContent=totalReceived;$('bufferCount').textContent=frames.length;$('pauseInfo').textContent=paused?'Anzeige pausiert – Empfang läuft weiter':'';}
let overviewPending=false;
const OVERVIEW_ROW_HEIGHT=28,OVERVIEW_OVERSCAN=8;
let overviewLastVirtualStart=-1,overviewLastVirtualEnd=-1;
function scheduleOverview(){if(document.hidden||activeTab!=='decoder')return;if(!overviewPending){overviewPending=true;setTimeout(()=>{if(activeTab==='decoder'&&!document.hidden)renderOverview();else overviewPending=false;},150);}}function decodedContainsFrame(f){return decodedFrameKeys.has(overviewRowKey(f));}
function overviewRowKey(f){return `${f.ext?'E':'S'}:${f.id}`;}
function overviewFrameIsDecoded(f){
  if(decodedContainsFrame(f)||Boolean(labels[String(f.id||'').toUpperCase()]))return true;
  if(!dbcState.enabled||!dbcState.loaded)return false;
  return dbcState.messages.has(`${f.ext?'E':'S'}:${idNumber(f.id)}`);
}
function overviewSortValue(f,key,now){
  if(key==='fixed')return Number(f.sequence)||0;
  if(key==='label')return labelFor(f.id).toUpperCase();
  if(key==='frames')return Number(f.count)||0;
  if(key==='age')return Math.max(0,now-Number(f.lastSeenAt||now));
  return parseInt(f.id,16)||0;
}
function updateOverviewSortHeaders(){
  document.querySelectorAll('[data-overview-sort]').forEach(th=>{
    const active=th.dataset.overviewSort===overviewSort.key;
    th.classList.toggle('sortActive',active);
    th.setAttribute('aria-sort',active?(overviewSort.dir===1?'ascending':'descending'):'none');
    const base=th.dataset.sortLabel||th.textContent.replace(/\s*[▲▼]$/,'');th.textContent=base+(active?(overviewSort.dir===1?' ▲':' ▼'):'');
  });
}
function overviewFrameByRow(row){
  const id=row?.dataset.id,ext=row?.dataset.ext==='1';
  return id?overview.get(`${ext?'E':'S'}:${id}`)||null:null;
}
function copyFrameText(f){
  if(!f)return;
  const text=`${String(f.id||'').toUpperCase()} ${Array.isArray(f.bytes)?f.bytes.join(' '):String(f.data||'').match(/../g)?.join(' ')||''}`.trim();
  const done=()=>showNotice('Frame in die Zwischenablage kopiert.','success',1600);
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text));else fallbackCopy(text);
}
function fallbackCopy(text){
  const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();try{document.execCommand('copy');showNotice('Frame in die Zwischenablage kopiert.','success',1600);}catch(_){showNotice('Kopieren ist in diesem Browser nicht möglich.','warning');}area.remove();
}
function takeOverviewFrameToSimulator(f){
  if(!f)return;
  const data=(Array.isArray(f.bytes)?f.bytes:bytes(String(f.data||''))).slice(0,Math.max(0,Math.min(8,Number(f.dlc)||0))).join(' ');
  simEntries.push({id:String(f.id||'').toUpperCase(),data,dlc:Math.max(0,Math.min(8,Number(f.dlc)||String(data).split(/\s+/).filter(Boolean).length)),ms:100,enabled:true,dynamic:false,dynamicIndex:0,name:labelFor(f.id)||`Frame ${String(f.id||'').toUpperCase()}`,source:'RX'});
  saveSimulatorEntries();renderSim();activateTab('sim');showNotice(`Frame ${formatCanId(f.id,!!f.ext)} zum Simulator hinzugefügt.`,'success',2200);
}
function overviewRowClasses(f,only,now,changeWindowMs){
  const classes=['overviewRow'];
  if(selectedIds.has(overviewRowKey(f)))classes.push('selectedOverview');
  if(Number(f.newIdUntil||0)>now)classes.push('overviewNewId');
  if(frozenOverviewKeys.has(overviewRowKey(f)))classes.push('overviewFrozen');
  if(only&&Number(f.filterSeenAt||f.lastSeenAt||0)>0&&now-Number(f.filterSeenAt||f.lastSeenAt||0)>changeWindowMs)classes.push('overviewFadeOut');
  return classes.join(' ');
}
function overviewByteTitle(f,i){
  const mask=Number((f.bitChangeMasks||[])[i]||0);
  const changedBits=Array.from({length:8},(_,bit)=>mask&(1<<bit)?bit:null).filter(v=>v!==null).reverse().join(', ');
  return changedBits?`Geänderte Bits: ${changedBits}`:'Keine Bitänderung';
}
function overviewRowHtml(f,only,now,changeWindowMs){
  const isDecoded=decodedContainsFrame(f),label=labelFor(f.id);
  const labelHtml=isDecoded?`<span class="decodedLabelBadge">${escapeHtml(label)||'&nbsp;'}</span>`:escapeHtml(label);
  const avg=Number(f.deltaCount||0)>0?Number(f.deltaSum||0)/Number(f.deltaCount):0;
  const fmt=v=>v==null?'–':Number(v).toFixed(2);
  const bytesHtml=Array.from({length:8},(_,i)=>`<td class="byteCell overviewByte ${$('highlightData').checked&&Number((f.byteFlashUntil||[])[i]||0)>now?'overviewDataFlash':''}" data-col="byte-${i}" title="${overviewByteTitle(f,i)}"><span>${f.bytes[i]?formatHexValue(f.bytes[i]):''}</span><small title="Änderungen von D${i}">×${Number((f.byteChangeCounts||[])[i]||0)}</small></td>`).join('');
  const source=dir(f),ascii=f.ascii||frameAscii(f.bytes,f.dlc);
  return `<tr class="${overviewRowClasses(f,only,now,changeWindowMs)}" data-id="${f.id}" data-ext="${f.ext?1:0}"><td data-col="id">${f.ext?'E:':''}${formatCanId(f.id,f.ext)}</td><td data-col="label">${labelHtml}</td><td data-col="source"><span class="sourceText ${source.toLowerCase()}">${source}</span></td><td data-col="dlc">${f.dlc}</td><td class="overviewChangedCount" data-col="changed">${Number(f.changedByteCount||0)}</td><td class="overviewDelta" data-col="avg"><span>${fmt(avg)}</span><small>aktuell ${fmt(f.deltaMs)}</small></td><td data-col="min">${fmt(f.deltaMin)}</td><td data-col="max">${fmt(f.deltaMax)}</td>${bytesHtml}<td class="asciiCell" data-col="ascii">${escapeHtml(ascii)}</td><td data-col="frames" class="${$('highlightNew').checked&&f.packetFlashUntil>now?'overviewFramesNew':''}">${f.count}</td><td data-col="age">${Math.max(0,(now-Number(f.lastSeenAt||now))/1000).toFixed(2)}</td><td class="overviewFrameActions"><details class="rowActionMenu"><summary title="Frame verwenden">⋮</summary><div><button type="button" data-action="freeze">${frozenOverviewKeys.has(overviewRowKey(f))?'Freigeben':'Frame einfrieren'}</button><button type="button" data-action="tx">In TX übernehmen</button><button type="button" data-action="sim">In Simulator übernehmen</button><button type="button" data-action="gen">Als Generator verwenden</button><button type="button" data-action="filter">Zum Filter hinzufügen</button><button type="button" data-action="copy">Kopieren</button></div></details></td></tr>`;
}
function updateOverviewRow(tr,f,only,now,changeWindowMs){
  tr.className=overviewRowClasses(f,only,now,changeWindowMs);
  const setText=(col,value)=>{const cell=tr.querySelector(`[data-col="${col}"]`);if(cell&&cell.textContent!==String(value))cell.textContent=String(value);};
  const labelCell=tr.querySelector('[data-col="label"]'),label=labelFor(f.id),isDecoded=decodedContainsFrame(f);
  if(labelCell){
    if(isDecoded){if(!labelCell.querySelector('.decodedLabelBadge')||labelCell.textContent!==label)labelCell.innerHTML=`<span class="decodedLabelBadge">${escapeHtml(label)||'&nbsp;'}</span>`;}
    else if(labelCell.textContent!==label)labelCell.textContent=label;
  }
  const avg=Number(f.deltaCount||0)>0?Number(f.deltaSum||0)/Number(f.deltaCount):0;
  const fmt=v=>v==null?'–':Number(v).toFixed(2);
  setText('changed',Number(f.changedByteCount||0));
  const deltaCell=tr.querySelector('[data-col="avg"]'),deltaAverage=fmt(avg),deltaCurrent=`aktuell ${fmt(f.deltaMs)}`;
  if(deltaCell){const span=deltaCell.querySelector('span'),small=deltaCell.querySelector('small');if(span&&span.textContent!==deltaAverage)span.textContent=deltaAverage;if(small&&small.textContent!==deltaCurrent)small.textContent=deltaCurrent;}
  setText('min',fmt(f.deltaMin));setText('max',fmt(f.deltaMax));
  for(let i=0;i<8;i++){
    const cell=tr.querySelector(`[data-col="byte-${i}"]`);if(!cell)continue;
    const value=f.bytes[i]?formatHexValue(f.bytes[i]):'',count=`×${Number((f.byteChangeCounts||[])[i]||0)}`;
    const span=cell.querySelector('span'),small=cell.querySelector('small');
    if(span&&span.textContent!==value)span.textContent=value;
    if(small&&small.textContent!==count)small.textContent=count;
    cell.title=overviewByteTitle(f,i);
    cell.classList.toggle('overviewDataFlash',$('highlightData').checked&&Number((f.byteFlashUntil||[])[i]||0)>now);
  }
  setText('ascii',f.ascii||frameAscii(f.bytes,f.dlc));
  const framesCell=tr.querySelector('[data-col="frames"]');
  if(framesCell){const count=String(f.count);if(framesCell.textContent!==count)framesCell.textContent=count;framesCell.classList.toggle('overviewFramesNew',$('highlightNew').checked&&f.packetFlashUntil>now);}
  setText('age',Math.max(0,(now-Number(f.lastSeenAt||now))/1000).toFixed(2));
  const freezeButton=tr.querySelector('[data-action="freeze"]');if(freezeButton)freezeButton.textContent=frozenOverviewKeys.has(overviewRowKey(f))?'Freigeben':'Frame einfrieren';
}
function bindOverviewRows(){
  const updateSelectionClasses=()=>document.querySelectorAll('#decodedFrames tr.overviewRow').forEach(row=>row.classList.toggle('selectedOverview',selectedIds.has(`${row.dataset.ext==='1'?'E':'S'}:${row.dataset.id}`)));
  document.querySelectorAll('#decodedFrames tr.overviewRow').forEach(tr=>{
    tr.onclick=e=>{
      if(e.target.closest('.rowActionMenu'))return;
      const id=tr.dataset.id,key=`${tr.dataset.ext==='1'?'E':'S'}:${id}`;
      if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey)selectedIds.clear();
      if(selectedIds.has(key)&&(e.ctrlKey||e.metaKey||e.shiftKey))selectedIds.delete(key);else selectedIds.add(key);
      updateSelectionClasses();
    };
    tr.querySelectorAll('.rowActionMenu button[data-action]').forEach(button=>button.onclick=e=>{
      e.preventDefault();e.stopPropagation();
      const f=overviewFrameByRow(tr);if(!f)return;
      const action=button.dataset.action;
      if(action==='freeze'){
        const k=overviewRowKey(f);
        if(frozenOverviewKeys.has(k)){
          frozenOverviewKeys.delete(k);
          const latest=latestOverviewLive.get(k);if(latest)overview.set(k,latest);
          showNotice(`Frame ${formatCanId(f.id,!!f.ext)} freigegeben.`,'success',1800);
        }else{
          frozenOverviewKeys.add(k);
          overview.set(k,{...f,bytes:[...(f.bytes||[])],previousBytes:[...(f.previousBytes||[])],changedBytes:[...(f.changedBytes||[])],bitChangeMasks:[...(f.bitChangeMasks||[])],byteChangeCounts:[...(f.byteChangeCounts||[])],byteFlashUntil:[...(f.byteFlashUntil||[])]});
          showNotice(`Frame ${formatCanId(f.id,!!f.ext)} eingefroren.`,'success',1800);
        }
        renderOverview();
      }else if(action==='tx')loadMonitorFrameIntoTx(f);
      else if(action==='sim')takeOverviewFrameToSimulator(f);
      else if(action==='gen')takeOverviewFrameToGenerator(f);
      else if(action==='filter'){
        const id=`0x${String(f.id||'0').toUpperCase()}`;
        const current=filterDisplayText||$('filterIds').value||String(lastCanStatus?.filterIds||'');
        const ids=[...new Set(normalizeFilterDisplay(`${current} ${id}`).split(/\s+/).filter(Boolean))].join(` `);
        filterDisplayText=ids;localStorage.setItem('deacsFilterDisplayText',ids);
        $('filterIds').value=ids;$('filterMode').value='exclude';filterInputEditing=false;filterInputDirty=false;
        post('/api/filter',{enabled:1,mode:'exclude',ids:filterPayload(ids)}).then(status=>{setStatus(status);showNotice(`${formatCanId(f.id,!!f.ext)} zum Ausschlussfilter hinzugefügt.`,'success',1800);}).catch(()=>showNotice('ID konnte nicht zum Filter hinzugefügt werden.','error',3500));
      }
      else if(action==='copy')copyFrameText(f);
      tr.querySelector('.rowActionMenu')?.removeAttribute('open');
    });
    tr.ondblclick=e=>{
      if(e.target.closest('.rowActionMenu'))return;
      e.preventDefault();e.stopPropagation();
      const id=tr.dataset.id,ext=tr.dataset.ext==='1';
      const f=overview.get(`${ext?'E':'S'}:${id}`);
      if(!f)return;
      const existing=decodedRows.find(r=>r.id===f.id&&Boolean(r.ide)===Boolean(f.ext));
      const resolvedLabel=String(labelFor(f.id)||existing?.label||f.label||'').trim();
      if(resolvedLabel){labels[id]=resolvedLabel;localStorage.setItem('deacsLabels',JSON.stringify(labels));}
      if(existing){
        if(resolvedLabel&&existing.label!==resolvedLabel){existing.label=resolvedLabel;saveDecodedRows();}
        selectedDecodedRow=existing.uid;renderDecodedList();$('decodedResult').textContent=`ID ${id} ist bereits in Decoded messages`;
      }else{addDecodedFromFrame({...f,label:resolvedLabel});$('decodedResult').textContent=`ID ${id} zu Decoded hinzugefügt`;}
      if(resolvedLabel){renderLabels();showNotice(`Label „${resolvedLabel}“ ins Label Dictionary übernommen.`,'success',2200);}
      renderOverview();
    };
  });
}
function renderOverview(){
  overviewPending=false;
  const q=$('decoderSearch').value.trim().toUpperCase(),only=$('changedOnly').checked,decodedOnly=$('decodedOnly').checked,hideFast=$('hideFastFrames').checked,fastThreshold=Math.max(1,Number($('fastFrameThreshold').value)||100),now=performance.now();
  const changeWindowMs=Math.max(500,overviewChangeWindowSec*1000);
  const fadeDurationMs=600;
  const list=[...overview.values()].filter(f=>{
    const matchesSearch=!q||f.id.includes(q)||labelFor(f.id).toUpperCase().includes(q);
    if(!matchesSearch)return false;
    if(decodedOnly&&!overviewFrameIsDecoded(f))return false;
    const averageDelta=Number(f.deltaCount||0)>0?Number(f.deltaSum||0)/Number(f.deltaCount):0;
    if(hideFast&&averageDelta>0&&averageDelta<fastThreshold)return false;
    if(!only)return true;
    const filterSeenAt=Number(f.filterSeenAt||f.lastSeenAt||0);
    return filterSeenAt>0&&now-filterSeenAt<=changeWindowMs+fadeDurationMs;
  }).sort((a,b)=>{
    const av=overviewSortValue(a,overviewSort.key,now),bv=overviewSortValue(b,overviewSort.key,now);
    const cmp=typeof av==='string'?av.localeCompare(bv,'de',{numeric:true,sensitivity:'base'}):av-bv;
    return (cmp||((Number(a.sequence)||0)-(Number(b.sequence)||0)))*overviewSort.dir;
  });
  updateOverviewSortHeaders();

  const body=$('decodedFrames'),wrap=$('overviewTableWrap')||body.closest('.tablewrap');
  const viewportHeight=Math.max(OVERVIEW_ROW_HEIGHT,wrap?.clientHeight||500);
  const scrollTop=Math.max(0,wrap?.scrollTop||0);
  const visibleRows=Math.max(1,Math.ceil(viewportHeight/OVERVIEW_ROW_HEIGHT));
  const startIndex=Math.max(0,Math.floor(scrollTop/OVERVIEW_ROW_HEIGHT)-OVERVIEW_OVERSCAN);
  const endIndex=Math.min(list.length,startIndex+visibleRows+OVERVIEW_OVERSCAN*2);
  const renderList=list.slice(startIndex,endIndex);
  const topHeight=startIndex*OVERVIEW_ROW_HEIGHT;
  const bottomHeight=Math.max(0,(list.length-endIndex)*OVERVIEW_ROW_HEIGHT);

  const wantedKeys=renderList.map(overviewRowKey);
  const currentRows=[...body.querySelectorAll('tr.overviewRow')];
  const currentKeys=currentRows.map(row=>`${row.dataset.ext==='1'?'E':'S'}:${row.dataset.id}`);
  const sameStructure=overviewLastVirtualStart===startIndex&&overviewLastVirtualEnd===endIndex&&currentKeys.length===wantedKeys.length&&currentKeys.every((k,i)=>k===wantedKeys[i]);
  if(!sameStructure){
    const topSpacer=topHeight>0?`<tr class="overviewVirtualSpacer" aria-hidden="true"><td colspan="20" style="height:${topHeight}px!important"></td></tr>`:'';
    const bottomSpacer=bottomHeight>0?`<tr class="overviewVirtualSpacer" aria-hidden="true"><td colspan="20" style="height:${bottomHeight}px!important"></td></tr>`:'';
    body.innerHTML=topSpacer+renderList.map(f=>overviewRowHtml(f,only,now,changeWindowMs)).join('')+bottomSpacer;
    bindOverviewRows();
    overviewLastVirtualStart=startIndex;overviewLastVirtualEnd=endIndex;
  }else{
    currentRows.forEach((tr,i)=>updateOverviewRow(tr,renderList[i],only,now,changeWindowMs));
  }

  if($('overviewStatusFrames'))$('overviewStatusFrames').textContent=Number(totalReceived||0).toLocaleString('de-DE');
  if($('overviewStatusIds'))$('overviewStatusIds').textContent=overview.size.toLocaleString('de-DE');
  if($('overviewStatusVisible'))$('overviewStatusVisible').textContent=renderList.length.toLocaleString('de-DE');

  if(renderList.some(f=>f.packetFlashUntil>now||Number(f.newIdUntil||0)>now||(f.byteFlashUntil||[]).some(t=>t>now)))setTimeout(scheduleOverview,100);
  if(only&&list.length){
    const deadlines=list.flatMap(f=>{
      const changed=Number(f.lastChangeAt||0);
      if(changed<=0)return [];
      return [changed+changeWindowMs-now,changed+changeWindowMs+fadeDurationMs-now];
    }).filter(v=>v>0);
    const nextDeadline=Math.min(...deadlines);
    if(Number.isFinite(nextDeadline))setTimeout(scheduleOverview,Math.max(40,Math.min(1000,nextDeadline+15)));
  }
}

function renderDecodedByteInspector(){
  const panel=$('decodedByteInspector'),r=decodedRowByUid(selectedDecodedRow);
  if(!panel||!r){if(panel)panel.hidden=true;return;}
  const index=Math.max(0,Math.min(7,Number(selectedDecodedByte)||0));
  const hex=sanitizeHex(r.bytes[index],2).padStart(2,'0')||'00';
  const value=parseInt(hex,16)||0,signed=value>127?value-256:value;
  const binary=value.toString(2).padStart(8,'0');
  const ascii=value>=32&&value<=126?String.fromCharCode(value):'.';
  panel.hidden=false;$('decodedInspectorByte').textContent=`D${index}`;$('decodedInspectorHex').textContent=formatHexValue(hex);
  $('decodedInspectorUnsigned').textContent=String(value);$('decodedInspectorSigned').textContent=String(signed);
  $('decodedInspectorBinary').textContent=binary;$('decodedInspectorAscii').textContent=ascii;
  $('decodedInspectorBits').innerHTML=Array.from({length:8},(_,n)=>{const bit=7-n,on=Boolean(value&(1<<bit));return `<span class="decodedBit ${on?'on':''}" title="Bit ${bit}: ${on?1:0}">b${bit}:${on?1:0}</span>`;}).join('');
}
function renderDecodedList(){
  $('decodedList').innerHTML=decodedRows.map((r,n)=>{const ascii=r.bytes.slice(0,r.dlc).map(b=>{const v=parseInt(b,16);return v>=32&&v<=126?String.fromCharCode(v):'.';}).join('');return `<tr class="${selectedDecodedRow===r.uid?'selectedRow':''}" data-uid="${r.uid}">
    <td>${decodedInput(r,'id',formatCanId(r.id,!!r.ide),'idInput')}</td>
    <td>${decodedInput(r,'label',r.label,'labelInput')}</td>
    <td><select class="decodedInput dlcInput miniSelect" data-uid="${r.uid}" data-field="dlc">${Array.from({length:9},(_,i)=>`<option value="${i}" ${r.dlc===i?'selected':''}>${i}</option>`).join('')}</select></td>
    ${r.bytes.map((b,i)=>`<td class="decodedByteCell ${selectedDecodedRow===r.uid&&selectedDecodedByte===i?'selectedDecodedByte':''}">${decodedInput(r,'byte',b,'byteInput',i)}</td>`).join('')}
    <td class="asciiCell">${escapeHtml(ascii)}</td>
  </tr>`;}).join('');
  document.querySelectorAll('#decodedList tr').forEach(tr=>tr.onclick=e=>{if(e.target.matches('input,select'))return;selectedDecodedRow=tr.dataset.uid;renderDecodedList();});
  document.querySelectorAll('#decodedList .byteInput').forEach(input=>{input.onclick=e=>{e.stopPropagation();selectedDecodedRow=input.dataset.uid;selectedDecodedByte=Number(input.dataset.index)||0;renderDecodedByteInspector();document.querySelectorAll('#decodedList .decodedByteCell').forEach(td=>td.classList.remove('selectedDecodedByte'));input.closest('td')?.classList.add('selectedDecodedByte');};});
  document.querySelectorAll('.decodedInput').forEach(x=>{
    x.oninput=()=>{updateDecodedField(x.dataset.uid,x.dataset.field,x.value,x.dataset.index===''?undefined:Number(x.dataset.index));if(x.dataset.field==='byte'){selectedDecodedRow=x.dataset.uid;selectedDecodedByte=Number(x.dataset.index)||0;renderDecodedByteInspector();}};
    x.onchange=()=>{updateDecodedField(x.dataset.uid,x.dataset.field,x.value,x.dataset.index===''?undefined:Number(x.dataset.index));if(x.dataset.field==='ide')renderDecodedList();};
    x.onblur=()=>{const r=decodedRowByUid(x.dataset.uid);if(!r)return;try{validateDecodedRow(r);saveDecodedRows();renderDecodedList();}catch(e){$('decodedResult').textContent=e.message;x.focus();}};
  });
  renderDecodedByteInspector();
  renderDecodedDbcSignals();
}
function addDecodedFromFrame(f){const r=makeDecodedRow(f);decodedRows.push(r);selectedDecodedRow=r.uid;saveDecodedRows();renderDecodedList();renderOverview();}
function sendSelectedDecoded(){
  const r=decodedRowByUid(selectedDecodedRow);if(!r){$('decodedResult').textContent='Keine Zeile ausgewählt';return;}
  try{validateDecodedRow(r);}catch(e){$('decodedResult').textContent=e.message;return;}
  const payload={id:r.id,dlc:r.dlc,data:r.bytes.slice(0,r.dlc).join(' '),extended:r.ide,rtr:r.rtr};
  post('/api/send',payload).then(()=>{$('decodedResult').textContent=`ID ${r.id} gesendet`;saveDecodedRows();}).catch(e=>$('decodedResult').textContent=e.error||JSON.stringify(e));
}
function clearLabelEditor(){selectedLabelId=null;$('labelId').value='';$('labelText').value='';renderLabels();}
function selectLabel(id){selectedLabelId=id;$('labelId').value=formatCanId(id,idNumber(id)>0x7FF);$('labelText').value=labels[id]||'';renderLabels();$('labelText').focus();}
function renderLabels(){
  $('labelRows').innerHTML=Object.entries(labels).sort((a,b)=>parseInt(a[0],16)-parseInt(b[0],16)).map(([id,l])=>`<tr class="labelRow ${selectedLabelId===id?'selectedLabelRow':''}" data-id="${id}"><td>${formatCanId(id,idNumber(id)>0x7FF)}</td><td>${l}</td></tr>`).join('');
  document.querySelectorAll('#labelRows tr.labelRow').forEach(tr=>{
    tr.onclick=()=>selectLabel(tr.dataset.id);
    tr.ondblclick=()=>selectLabel(tr.dataset.id);
  });
}
function sessionObject(){return{format:'DEACS-session',version:1,saved:new Date().toISOString(),frames:frames.map(f=>({us:f.us,dir:f.dir,sim:!!f.sim,id:f.id,dlc:f.dlc,data:f.data,ext:!!f.ext,rtr:!!f.rtr}))};}
function playbackSession(){const src=loadedSession.length?loadedSession:frames;if(!src.length){showNotice('Keine Session vorhanden.','warning');return;}const base=src[0].us;src.forEach(f=>setTimeout(()=>post('/api/sim/inject',{id:f.id,data:(f.data.match(/../g)||[]).join(' '),extended:f.ext?1:0}).catch(console.error),Math.min(60000,Math.max(0,(f.us-base)/1000))));}

let browserFrameCount=0,browserFrameRate=0,browserRateLastCount=0,browserRateLastMs=performance.now();
function countBrowserFrames(n){browserFrameCount+=n;}
setInterval(()=>{const now=performance.now(),elapsed=now-browserRateLastMs;browserFrameRate=Math.round((browserFrameCount-browserRateLastCount)*1000/Math.max(1,elapsed));browserRateLastCount=browserFrameCount;browserRateLastMs=now;const e=$('browserFrameRate');if(e)e.textContent=browserFrameRate;},1000);
let reconnectTimer=null,reconnectAttempt=0,connectionGeneration=0,lastWsMessageAt=0;
const reconnectDelays=[500,1000,2000,5000,10000];
function updateSimulatorBackend(){
  const nextBackend=wsConnected?'esp32':'browser';
  if(nextBackend!==simBackend&&simRunning){
    stopBrowserSimulator();
    simRunning=false;
    updateSimButton();
    showNotice('Simulator wegen Wechsel der Verbindung gestoppt.','info',3500);
  }
  simBackend=nextBackend;
  const badge=$('simBackend');
  if(badge){
    badge.textContent=simBackend==='esp32'?'ESP32':'Browser';
    badge.className=`simBackendBadge ${simBackend}`;
    badge.title=simBackend==='esp32'?'Simulator wird vom ESP32 erzeugt.':'Simulator läuft lokal im Browser und benötigt keine ESP32-Verbindung.';
  }
  updateBrowserSimStatus();
}
function setConnectionState(text,state){const e=$('connection');e.textContent=text;e.className=`pill ${state}`;wsConnected=state==='online';updateSimulatorBackend();}
function scheduleReconnect(){
  if(reconnectTimer||document.hidden)return;
  const delay=reconnectDelays[Math.min(reconnectAttempt,reconnectDelays.length-1)];
  reconnectAttempt++;
  setConnectionState(`Verbinden ${Math.ceil(delay/1000)}s`,'offline');
  reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},delay);
}
function connect(){
  const generation=++connectionGeneration;
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  if(socket){try{socket.onopen=socket.onclose=socket.onerror=socket.onmessage=null;socket.close();}catch(_){}}
  setConnectionState('Verbinden…','offline');
  let ws;
  try{ws=new WebSocket(`ws://${location.hostname}:81/`);}catch(_){scheduleReconnect();return;}
  socket=ws;
  const openTimeout=setTimeout(()=>{if(generation===connectionGeneration&&ws.readyState!==WebSocket.OPEN)try{ws.close();}catch(_){}},5000);
  ws.onopen=()=>{
    if(generation!==connectionGeneration){try{ws.close();}catch(_){}return;}
    clearTimeout(openTimeout);reconnectAttempt=0;lastWsMessageAt=Date.now();setConnectionState('Verbunden','online');
  };
  ws.onclose=()=>{
    clearTimeout(openTimeout);
    if(generation!==connectionGeneration)return;
    setConnectionState('Getrennt','offline');scheduleReconnect();
  };
  ws.onerror=()=>{if(generation===connectionGeneration)try{ws.close();}catch(_){}};
  ws.onmessage=e=>{
    if(generation!==connectionGeneration)return;
    lastWsMessageAt=Date.now();
    let m;try{m=JSON.parse(e.data);}catch(_){return;}
    if(m.type==='frame'){countBrowserFrames(1);addFrame(m);}
    else if(m.type==='frames'&&Array.isArray(m.items)){countBrowserFrames(m.items.length);for(const f of m.items)addFrame(f);}
    else if(m.type==='status')setStatus(m.value);
  };
}
// Status arrives regularly from the ESP. If the TCP/WebSocket stack remains
// half-open and no message arrives for 8 s, force a clean reconnect.
setInterval(()=>{
  if(socket&&socket.readyState===WebSocket.OPEN&&lastWsMessageAt&&Date.now()-lastWsMessageAt>8000){
    setConnectionState('Keine Daten','offline');
    try{socket.close();}catch(_){}
  }else if(!socket||socket.readyState===WebSocket.CLOSED){scheduleReconnect();}
},2000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(!socket||socket.readyState!==WebSocket.OPEN)connect();if(activeTab==='monitor'){renderPending=false;requestAnimationFrame(()=>{updateCounts();render();});}else if(activeTab==='decoder'){overviewPending=false;requestAnimationFrame(renderOverview);}});
window.addEventListener('online',()=>connect());
function txInputs(){return [...document.querySelectorAll('#txBytes input')];}function norm(i){i.value=(i.value.replace(/[^0-9a-f]/gi,'').slice(0,2)||'00').padStart(2,'0').toUpperCase();}
function setToggleButton(id,on){const b=$(id);b.checked=!!on;b.classList.toggle('active',b.checked);b.setAttribute('aria-pressed',b.checked?'true':'false');b.textContent=`${b.dataset.label}: ${b.checked?'Ein':'Aus'}`;}
function initToggleButton(id,on=false,after=null){const b=$(id);b.dataset.label=b.dataset.label||b.textContent.trim();setToggleButton(id,on);b.onclick=()=>{setToggleButton(id,!b.checked);if(after)after();};}
function updateTxEditor(){const dlc=Number($('txDlc').value),rtr=$('txRtr').checked;txInputs().forEach((i,n)=>{i.disabled=txEditorLocked||rtr||n>=dlc;i.parentElement.classList.toggle('disabled',i.disabled);});}
function txPayload(){
  txInputs().forEach(norm);
  const idField=$('txId'),extended=$('txExt').checked,dlc=Number($('txDlc').value),rawId=internalCanId(idField.value);
  const maxId=extended?0x1FFFFFFF:0x7FF,idValue=/^[0-9A-F]+$/.test(rawId)?Number.parseInt(rawId,16):NaN;
  idField.classList.toggle('inputInvalid',!Number.isFinite(idValue)||idValue<0||idValue>maxId);
  if(!Number.isFinite(idValue)||idValue<0||idValue>maxId){
    throw new Error(`Ungültige CAN-ID. Erlaubt: 000–${extended?'1FFFFFFF':'7FF'}.`);
  }
  return{id:rawId,data:txInputs().slice(0,dlc).map(i=>i.value).join(' '),dlc,extended:extended?1:0,rtr:$('txRtr').checked?1:0};
}
const TX_HISTORY_STORAGE_KEY='deacsTxHistoryV1';
function saveTxHistory(){
  try{localStorage.setItem(TX_HISTORY_STORAGE_KEY,JSON.stringify(txHistory.slice(0,50)));}catch(_){}
}
function flushTxHistory(){
  if(txHistoryFlushTimer){clearTimeout(txHistoryFlushTimer);txHistoryFlushTimer=null;}
  saveTxHistory();
  renderTxHistory();
}
function scheduleTxHistoryFlush(){
  if(txHistoryFlushTimer)return;
  txHistoryFlushTimer=setTimeout(flushTxHistory,500);
}
function loadTxHistory(){
  try{
    const stored=JSON.parse(localStorage.getItem(TX_HISTORY_STORAGE_KEY)||'[]');
    if(!Array.isArray(stored))return;
    txHistory=stored.filter(p=>p&&/^[0-9A-F]+$/i.test(String(p.id||'').replace(/^0X/i,''))&&Number.isFinite(Number(p.dlc))&&typeof p.data==='string').slice(0,50).map(p=>({
      id:String(p.id).replace(/^0X/i,'').toUpperCase(),dlc:Math.max(0,Math.min(8,Number(p.dlc)||0)),data:String(p.data),extended:!!p.extended,rtr:!!p.rtr,
      count:Math.max(1,Number(p.count)||1),lastSent:Number(p.lastSent)||Date.now()
    }));
  }catch(_){txHistory=[];}
}
function txHistoryKey(p){return `${p.extended?1:0}|${p.rtr?1:0}|${String(p.id).toUpperCase()}|${p.dlc}|${p.data}`;}
function highlightTxHistory(key){
  highlightedTxHistoryKey=key;
  clearTimeout(txHistoryHighlightTimer);
  txHistoryHighlightTimer=setTimeout(()=>{highlightedTxHistoryKey=null;renderTxHistory();},2000);
}
function recordTxHistory(payload){
  const p={id:String(payload.id).replace(/^0X/i,'').toUpperCase(),data:String(payload.data||''),dlc:Number(payload.dlc)||0,extended:payload.extended?1:0,rtr:payload.rtr?1:0,count:1,lastSent:Date.now()};
  const key=txHistoryKey(p),existing=txHistory.findIndex(x=>txHistoryKey(x)===key);
  if(existing>=0){
    const previous=txHistory.splice(existing,1)[0];
    p.count=Math.max(1,Number(previous.count)||1)+1;
  }
  txHistory.unshift(p);
  if(txHistory.length>50)txHistory.length=50;
  selectedTxHistoryKey=key;
  highlightTxHistory(key);
  scheduleTxHistoryFlush();
}
function formatTxHistoryTime(value){
  const d=new Date(Number(value)||Date.now());
  return d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function loadHistoryFrameIntoTx(index){
  const p=txHistory[index];if(!p)return;
  stopTxCycle();
  $('txId').value=formatCanId(p.id,!!p.extended);
  $('txDlc').value=String(Math.max(0,Math.min(8,Number(p.dlc)||0)));
  const values=String(p.data||'').trim().split(/\s+/).filter(Boolean);
  txInputs().forEach((input,i)=>input.value=(values[i]||'00').toUpperCase());
  setToggleButton('txExt',!!p.extended);setToggleButton('txRtr',!!p.rtr);updateTxEditor();
  $('txId').classList.remove('inputInvalid');
  showNotice('Frame in die TX-Eingabe übernommen.','success',1600);
}
function renderTxHistory(){
  const body=$('txHistoryRows');if(!body)return;
  const clear=$('txHistoryClear');if(clear)clear.disabled=!txHistory.length;
  if(!txHistory.length){selectedTxHistoryKey=null;body.innerHTML='<tr class="txHistoryEmpty"><td colspan="15">Noch kein Frame gesendet</td></tr>';return;}
  body.innerHTML=txHistory.map((p,i)=>{const bytes=String(p.data||'').trim().split(/\s+/).filter(Boolean);while(bytes.length<8)bytes.push('–');const type=[p.extended?'EXT':'STD',p.rtr?'RTR':'DATA'].join(' / '),key=txHistoryKey(p),classes=[key===selectedTxHistoryKey?'txHistorySelected':'',key===highlightedTxHistoryKey?'txHistoryRecent':''].filter(Boolean).join(' ');return `<tr data-history-index="${i}" data-history-key="${key}" class="${classes}" title="Einfachklick: markieren · Doppelklick: in TX-Eingabe übernehmen"><td>${formatCanId(p.id,!!p.extended)}</td><td>${escapeHtml(labelFor(String(p.id||'').toUpperCase()))}</td><td>${p.dlc}</td>${bytes.slice(0,8).map((b,n)=>`<td class="txHistoryByte ${n>=p.dlc?'txByteOff':''}">${n<p.dlc?formatHexValue(b):'–'}</td>`).join('')}<td>${type}</td><td>${Math.max(1,Number(p.count)||1)}</td><td>${formatTxHistoryTime(p.lastSent)}</td><td class="txHistoryActions"><button data-i="${i}" class="txHistorySend primary" ${txSendingBlocked?'disabled':''}>Senden</button><button data-i="${i}" class="txHistoryDelete danger">Löschen</button></td></tr>`;}).join('');
  document.querySelectorAll('#txHistoryRows tr[data-history-index]').forEach(row=>{
    row.onclick=e=>{if(e.target.closest('button'))return;selectedTxHistoryKey=row.dataset.historyKey;renderTxHistory();};
    row.ondblclick=e=>{if(e.target.closest('button'))return;loadHistoryFrameIntoTx(+row.dataset.historyIndex);};
  });
  document.querySelectorAll('.txHistorySend').forEach(b=>b.onclick=e=>{e.stopPropagation();sendHistoryFrame(+b.dataset.i);});
  document.querySelectorAll('.txHistoryDelete').forEach(b=>b.onclick=e=>{e.stopPropagation();const p=txHistory[+b.dataset.i];if(p&&txHistoryKey(p)===selectedTxHistoryKey)selectedTxHistoryKey=null;txHistory.splice(+b.dataset.i,1);flushTxHistory();});
}
function sendPayload(payload){if(txSendingBlocked){showNotice('Senden ist im Listen-only-Modus deaktiviert.','warning');return Promise.reject(new Error('TX deaktiviert'));}return post('/api/send',payload).then(()=>{recordTxHistory(payload);}).catch(e=>{showNotice('Frame konnte nicht gesendet werden.','error',5000);throw e;});}
function sendTx(){
  if(txSendInFlight)return Promise.resolve();
  txSendInFlight=true;
  try{return sendPayload(txPayload()).then(()=>{showNotice('Frame gesendet.','success',1800);$('txId').focus();}).finally(()=>{txSendInFlight=false;});}
  catch(e){txSendInFlight=false;showNotice(e.message||'Ungültige TX-Eingabe.','warning',4000);return Promise.reject(e);}
}
function sendHistoryFrame(index){const payload=txHistory[index];if(!payload)return Promise.resolve();return sendPayload({...payload}).then(()=>showNotice('Frame erneut gesendet.','success',1800));}
function simulatorEntryRuntime(entry){
  const id=String(entry?.id||'').trim().replace(/^0X/i,'').toUpperCase();
  const raw=String(entry?.data||'').replace(/[^0-9A-F]/gi,'').toUpperCase();
  const idValue=parseInt(id,16),interval=Number(entry?.ms);
  const inferred=Math.min(8,(raw.match(/../g)||[]).length),dlc=Math.max(0,Math.min(8,Number.isFinite(Number(entry?.dlc))?Number(entry.dlc):inferred));
  if(!/^[0-9A-F]{1,8}$/.test(id)||!Number.isFinite(idValue)||idValue>0x1FFFFFFF)return null;
  if(raw.length%2||raw.length>16)return null;
  if(!Number.isFinite(interval)||interval<10)return null;
  const allBytes=(raw.match(/../g)||[]).map(b=>parseInt(b,16));
  while(allBytes.length<8)allBytes.push(0);
  const bytes=allBytes.slice(0,dlc);
  if(bytes.some(b=>!Number.isFinite(b)))return null;
  return {id,ext:idValue>0x7FF,bytes,dlc,dynamic:!!entry.dynamic,dynamicIndex:Math.max(0,Number(entry.dynamicIndex)||0),interval:Math.max(10,interval)};
}
function updateSimulatorBackendTooltip(){
  const badge=$('simBackend');
  if(!badge)return;
  badge.removeAttribute('title');
  const browserMode=badge.classList.contains('browser')||
                    String(badge.textContent||'').trim().toLowerCase()==='browser';
  badge.dataset.tooltip=browserMode
    ? 'Simulator läuft lokal im Browser und benötigt keine ESP32-Verbindung.'
    : 'Simulator wird vom verbundenen ESP32 ausgeführt.';
  badge.classList.toggle('tooltip-green',browserMode);
  badge.classList.toggle('tooltip-blue',!browserMode);
}

function updateBrowserSimStatus(){
  const e=$('simBrowserStatus');if(!e)return;
  if(simBackend!=='browser'&&!randomSimRunning){e.hidden=true;return;}
  e.hidden=false;
  if(randomSimRunning)e.textContent=`Generator aktiv · ${generatorLabel(randomSimConfig.type)} · ${randomSimConfig.rate} Frames/s · ${randomSimGenerated.toLocaleString('de-DE')} erzeugt`;
  else if(replayRunning)e.textContent=`Log-Wiedergabe aktiv · ${replayEmitted.toLocaleString('de-DE')} / ${replayFrames.length.toLocaleString('de-DE')} Frames · interne SIM`;
  else if(simRunning)e.textContent=`Browser-Simulator aktiv · ${browserSimActiveCount} aktive Frames · ${browserSimGenerated.toLocaleString('de-DE')} erzeugt`;
  else e.textContent=`Browser-Simulator bereit · ${simEntries.filter(x=>x.enabled&&simulatorEntryRuntime(x)).length} gültige Frames`;
  e.classList.toggle('active',simRunning||randomSimRunning||replayRunning);
  updateSimulatorBackendTooltip();
}
function restartBrowserSimulatorIfRunning(){
  if(simRunning&&simBackend==='browser'){
    const active=simEntries.filter(e=>e.enabled);
    simRunning=startBrowserSimulator(active);
    updateSimButton();
  }
}
function updateSimulatorCounts(){
  const total=simEntries.length,active=simEntries.filter(e=>e.enabled).length;
  if($('simCountTotal'))$('simCountTotal').textContent=total;
  if($('simCountActive'))$('simCountActive').textContent=active;
  if($('simCountInactive'))$('simCountInactive').textContent=total-active;
  if($('simEmptyHint'))$('simEmptyHint').hidden=total>0;
}
function moveSimulatorEntry(from,to){
  if(from===to||from<0||to<0||from>=simEntries.length||to>=simEntries.length)return;
  const [entry]=simEntries.splice(from,1);simEntries.splice(to,0,entry);
  saveSimulatorEntries();restartBrowserSimulatorIfRunning();renderSim();
}
function simulatorBytes(entry){
  const values=String(entry?.data||'').toUpperCase().match(/[0-9A-F]{2}/g)||[];
  return Array.from({length:8},(_,i)=>values[i]||'00');
}
function updateSimulatorEntryInput(input,commit=false){
  const entry=simEntries[Number(input.dataset.i)];if(!entry)return false;
  const field=input.dataset.field;
  if(field==='name')entry.name=input.value.trim().slice(0,40);
  else if(field==='id')entry.id=internalCanId(input.value).slice(0,8);
  else if(field==='byte'){
    const index=Math.max(0,Math.min(7,Number(input.dataset.byte)||0));
    const values=simulatorBytes(entry);
    values[index]=String(input.value||'').replace(/[^0-9A-F]/gi,'').toUpperCase().slice(0,2).padStart(2,'0');
    input.value=values[index];
    entry.data=values.join(' ');
  }else if(field==='dlc')entry.dlc=Math.max(0,Math.min(8,Number(input.value)||0));
  else if(field==='ms')entry.ms=Math.max(10,Math.min(60000,Number(input.value)||10));
  const valid=!!simulatorEntryRuntime(entry);
  input.closest('tr')?.classList.toggle('simInvalidRow',!valid);
  input.setAttribute('aria-invalid',valid?'false':'true');
  if(commit){saveSimulatorEntries();restartBrowserSimulatorIfRunning();renderSim();}
  return valid;
}
function renderSim(){
  const intervalOptions=[10,20,50,100,200,500,1000,2000,5000];
  const simCell=(e,i,field,value,cls='',extra='')=>{
    const editing=selectedSimEdit&&selectedSimEdit.i===i&&selectedSimEdit.field===field;
    if(field==='dlc'&&editing){
      const current=Math.max(0,Math.min(8,Number(value)||0));
      return `<select class="simEditInput simDlcSelect ${cls}" data-i="${i}" data-field="dlc" ${extra}>${Array.from({length:9},(_,n)=>`<option value="${n}" ${n===current?'selected':''}>${n}</option>`).join('')}</select>`;
    }
    if(field==='ms'&&editing){
      const current=Math.max(10,Number(value)||100);
      const options=intervalOptions.includes(current)?intervalOptions:[...intervalOptions,current].sort((a,b)=>a-b);
      return `<select class="simEditInput simIntervalSelect ${cls}" data-i="${i}" data-field="ms" ${extra}>${options.map(ms=>`<option value="${ms}" ${ms===current?'selected':''}>${ms} ms</option>`).join('')}</select>`;
    }
    if(editing){
      const max=field==='id'?8:field==='name'?40:'';
      const maxAttr=max?` maxlength="${max}"`:'';
      const editValue=field==='id'?formatCanId(value,idNumber(value)>0x7FF):String(value??'');
      return `<input class="simEditInput ${cls}" data-i="${i}" data-field="${field}" value="${escapeHtml(editValue)}"${maxAttr} ${extra}>`;
    }
    let shown=field==='ms'?`${Number(value)||100} ms`:String(value??'');
    if(field==='id')shown=formatCanId(value,idNumber(value)>0x7FF);
    return `<button type="button" class="simCellValue ${cls}" data-i="${i}" data-field="${field}" title="Zum Bearbeiten klicken">${escapeHtml(shown||'–')}</button>`;
  };
  const simByteCells=(e,i)=>{
    const dlc=Math.max(0,Math.min(8,Number.isFinite(Number(e.dlc))?Number(e.dlc):simulatorBytes(e).length));
    return simulatorBytes(e).map((value,byte)=>{
      const editing=selectedSimEdit&&selectedSimEdit.i===i&&selectedSimEdit.field==='byte'&&selectedSimEdit.byte===byte;
      const content=editing
        ? `<input class="simEditInput simByteInput" data-i="${i}" data-field="byte" data-byte="${byte}" maxlength="2" value="${value}" aria-label="D${byte} bearbeiten">`
        : `<button type="button" class="simCellValue simByteValue ${byte>=dlc?'simByteOff':''}" data-i="${i}" data-field="byte" data-byte="${byte}" title="D${byte} bearbeiten" ${byte>=dlc?'disabled':''}>${byte<dlc?formatHexValue(value):'–'}</button>`;
      return `<td>${content}</td>`;
    }).join('');
  };
  $('simRows').innerHTML=simEntries.length?simEntries.map((e,i)=>{
    const inferred=Math.min(8,String(e.data||'').split(/\s+/).filter(Boolean).length);
    const dlc=Math.max(0,Math.min(8,Number.isFinite(Number(e.dlc))?Number(e.dlc):inferred));
    e.dlc=dlc;
    return `<tr draggable="true" data-sim-index="${i}" class="${simulatorEntryRuntime(e)?'':'simInvalidRow'}${selectedSimIndex===i?' simSelectedRow':''}"><td>${simCell(e,i,'id',e.id,'simIdInput','aria-label="CAN-ID bearbeiten"')}</td><td>${simCell(e,i,'name',e.name,'simNameInput','aria-label="Label bearbeiten"')}</td><td>${simCell(e,i,'dlc',dlc,'simDlcInput','aria-label="DLC bearbeiten"')}</td>${simByteCells(e,i)}<td>${simCell(e,i,'ms',Number(e.ms)||100,'simMsInput','aria-label="Intervall bearbeiten"')}</td><td><input type="checkbox" data-i="${i}" class="simEnable" ${e.enabled?'checked':''} aria-label="Frame aktiv"></td><td><span class="sourceText ${String(e.source||'SIM').toLowerCase()}">${escapeHtml(e.source||'SIM')}</span></td><td class="simDragCell"><button type="button" class="simDragHandle" aria-label="Frame verschieben" title="Zum Sortieren ziehen">☰</button></td><td class="simRowActions"><details class="rowActionMenu"><summary title="Eintrag verwenden">⋮</summary><div><button type="button" class="simDuplicate" data-i="${i}">Duplizieren</button><button type="button" class="simToGenerator" data-i="${i}">Als Generator</button><button type="button" class="simDelete danger" data-i="${i}">Löschen</button></div></details></td></tr>`;
  }).join(''):'<tr class="simEmptyRow"><td colspan="16">Keine Simulator-Frames vorhanden</td></tr>';
  document.querySelectorAll('.simEnable').forEach(x=>x.onchange=()=>{simEntries[+x.dataset.i].enabled=x.checked;saveSimulatorEntries();restartBrowserSimulatorIfRunning();renderSim();});
  document.querySelectorAll('.simCellValue').forEach(x=>x.onclick=e=>{
    e.stopPropagation();
    selectedSimIndex=+x.dataset.i;
    selectedSimEdit={i:+x.dataset.i,field:x.dataset.field,byte:x.dataset.byte!==undefined?Number(x.dataset.byte):undefined};
    renderSim();
    requestAnimationFrame(()=>{const byteSelector=selectedSimEdit.byte!==undefined?`[data-byte="${selectedSimEdit.byte}"]`:'';const input=document.querySelector(`.simEditInput[data-i="${selectedSimEdit.i}"][data-field="${selectedSimEdit.field}"]${byteSelector}`);input?.focus();input?.select();});
  });
  document.querySelectorAll('.simEditInput').forEach(x=>{
    x.onclick=e=>e.stopPropagation();
    x.oninput=()=>updateSimulatorEntryInput(x,false);
    x.onchange=()=>{updateSimulatorEntryInput(x,x.tagName==='SELECT');if(x.tagName==='SELECT'){selectedSimEdit=null;renderSim();}};
    x.onblur=()=>{updateSimulatorEntryInput(x,true);selectedSimEdit=null;renderSim();};
    x.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();x.blur();}};
  });
  document.querySelectorAll('.simDelete').forEach(x=>x.onclick=()=>{const i=+x.dataset.i;simEntries.splice(i,1);selectedSimEdit=null;if(selectedSimIndex===i)selectedSimIndex=null;saveSimulatorEntries();restartBrowserSimulatorIfRunning();renderSim();});
  document.querySelectorAll('.simDuplicate').forEach(x=>x.onclick=()=>{const i=+x.dataset.i,e=simEntries[i];if(!e)return;simEntries.splice(i+1,0,{...e,name:e.name?`${e.name} Kopie`:'Kopie'});saveSimulatorEntries();restartBrowserSimulatorIfRunning();renderSim();});
  document.querySelectorAll('.simToGenerator').forEach(x=>x.onclick=()=>{const e=simEntries[+x.dataset.i];if(!e)return;takeOverviewFrameToGenerator({id:e.id,ext:idNumber(e.id)>0x7FF,dlc:Math.max(0,Math.min(8,Number(e.dlc)||0)),bytes:String(e.data||'').split(/\s+/).filter(Boolean)});});
  let dragged=-1;
  document.querySelectorAll('#simRows tr[data-sim-index]').forEach(row=>{
    row.addEventListener('click',e=>{if(e.target.closest('button,details,input'))return;selectedSimIndex=Number(row.dataset.simIndex);document.querySelectorAll('#simRows tr[data-sim-index]').forEach(r=>r.classList.toggle('simSelectedRow',Number(r.dataset.simIndex)===selectedSimIndex));});
    row.addEventListener('dragstart',e=>{if(e.target.closest('input')){e.preventDefault();return;}dragged=Number(row.dataset.simIndex);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(dragged));row.classList.add('simDragging');});
    row.addEventListener('dragend',()=>{dragged=-1;row.classList.remove('simDragging');document.querySelectorAll('.simDropTarget').forEach(r=>r.classList.remove('simDropTarget'));});
    row.addEventListener('dragover',e=>{e.preventDefault();row.classList.add('simDropTarget');});
    row.addEventListener('dragleave',()=>row.classList.remove('simDropTarget'));
    row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('simDropTarget');const from=dragged>=0?dragged:Number(e.dataTransfer.getData('text/plain'));moveSimulatorEntry(from,Number(row.dataset.simIndex));});
  });
  updateSimulatorCounts();updateBrowserSimStatus();updateSimButton();if(lastCanStatus)updateCanLiveSourceStyle(lastCanStatus);
}
function updateMainSimulatorSourceStyle(){
  const button=document.querySelector('nav button[data-tab="sim"]');
  if(!button)return;

  button.classList.toggle('logReplayActive',replayRunning);
  button.dataset.activitySource=
    replayRunning ? 'log' :
    (randomSimRunning && simRunning) ? 'sim-generator' :
    randomSimRunning ? 'generator' :
    simRunning ? 'simulator' :
    'idle';
}

function updateSimButton(){
  const b=$('simToggle');if(!b)return;
  b.textContent=simRunning?'■ Simulation stoppen':'▶ Simulation starten';b.classList.toggle('active',simRunning);b.setAttribute('aria-pressed',simRunning?'true':'false');
  const tabButton=document.querySelector('nav button[data-tab="sim"]');
  if(tabButton){
    const simulatorActive=simRunning||replayRunning;
    const anyActive=simulatorActive||randomSimRunning;
    tabButton.classList.toggle('simActivityGlow',anyActive);
  tabButton.classList.toggle('logReplayActive',replayRunning);

    tabButton.classList.toggle('simulatorActive',simulatorActive&&!randomSimRunning);
    tabButton.classList.toggle('generatorActive',randomSimRunning&&!simulatorActive);
    tabButton.classList.toggle('simAndGeneratorActive',simulatorActive&&randomSimRunning);
    tabButton.textContent=simulatorActive&&randomSimRunning?'Simulator · SIM + GEN':randomSimRunning?'Simulator · GEN aktiv':simulatorActive?'Simulator · aktiv':'Simulator';
    tabButton.title=simulatorActive&&randomSimRunning?'Simulator und Generator laufen':randomSimRunning?'Generator läuft':simulatorActive?'Simulator oder Log-Wiedergabe läuft':'Simulator';
    tabButton.setAttribute('aria-label',tabButton.title);
  }
  const randomButton=$('simRandom');
  if(randomButton){randomButton.textContent=randomSimRunning?'■ Generator stoppen':'▶ Generator starten';randomButton.classList.toggle('active',randomSimRunning);randomButton.setAttribute('aria-pressed',randomSimRunning?'true':'false');}
  if($('simExamples'))$('simExamples').disabled=simRunning||randomSimRunning;
  if($('simClear'))$('simClear').disabled=simRunning||randomSimRunning||replayRunning||!simEntries.length;
  if($('simReplay')){
    $('simReplay').textContent=replayRunning?'■ Log stoppen':'▶ Log abspielen';
    $('simReplay').classList.toggle('active',replayRunning);
    const selectableFrames=selectedReplayFrames().length;
    $('simReplay').disabled=!replayRunning&&(!selectableFrames||simRunning||randomSimRunning);
  }
  if($('importReplay'))$('importReplay').disabled=!loadedSession.length||simRunning||randomSimRunning||replayRunning;
  if($('simReplaySpeed'))$('simReplaySpeed').disabled=replayRunning;updateReplaySourceOptions();
  updateBrowserSimStatus();
  updateMainSimulatorSourceStyle();
  if($('simRandom')){
    $('simRandom').textContent=randomSimRunning?'■ Generator stoppen':'▶ Generator starten';
    $('simRandom').classList.toggle('active',randomSimRunning);
    $('simRandom').setAttribute('aria-pressed',randomSimRunning?'true':'false');
  }
}
function readRandomSimConfig(showErrors=true){
  const type=String($('simGeneratorType')?.value||'random');
  const rate=Math.max(1,Math.min(1000,Math.round(Number($('simRandomRate')?.value)||50)));
  const minText=internalCanId($('simRandomIdMin')?.value||'0');
  const maxText=internalCanId($('simRandomIdMax')?.value||'7FF');
  const idMin=parseInt(minText,16),idMax=parseInt(maxText,16);
  const dlcValue=$('simRandomDlc')?.value||'random';
  if(!/^[0-9A-F]{1,8}$/.test(minText)||!/^[0-9A-F]{1,8}$/.test(maxText)||!Number.isFinite(idMin)||!Number.isFinite(idMax)||idMin>idMax||idMax>0x1FFFFFFF){
    if(showErrors)showNotice('Random-ID-Bereich ist ungültig.','warning',4500);
    return null;
  }
  const dlc=dlcValue==='random'?'random':Math.max(1,Math.min(8,Number(dlcValue)||8));
  const start=Math.max(0,Math.min(255,Math.round(Number($('simGenStart')?.value)||0)));
  const step=Math.max(1,Math.min(255,Math.round(Number($('simGenStep')?.value)||1)));
  const byte=Math.max(0,Math.min(7,Math.round(Number($('simGenByte')?.value)||0)));
  const period=Math.max(2,Math.min(10000,Math.round(Number($('simGenPeriod')?.value)||32)));
  const seedText=String($('simGenSeed')?.value||'ACE1').trim().replace(/^0X/i,'').toUpperCase();
  const seedParsed=parseInt(seedText,16);
  const seed=Number.isInteger(seedParsed)&&seedParsed>0&&seedParsed<=0xFFFF?seedParsed:0xACE1;
  const baseText=String($('simGenBaseData')?.value||'').replace(/[^0-9A-F]/gi,'').toUpperCase();
  const baseBytes=(baseText.match(/../g)||[]).slice(0,8).map(x=>parseInt(x,16));while(baseBytes.length<8)baseBytes.push(0);
  const mask=Array.from(document.querySelectorAll('#simGenMask input[data-byte]')).map(x=>x.checked);
  if(!mask.some(Boolean))mask[0]=true;
  randomSimConfig={type,rate,idMin,idMax,dlc,start,step,byte,period,seed,baseBytes,mask};
  if($('simRandomRate'))$('simRandomRate').value=String(rate);
  if($('simRandomIdMin'))$('simRandomIdMin').value=formatCanId(minText,idMin>0x7FF);
  if($('simRandomIdMax'))$('simRandomIdMax').value=formatCanId(maxText,idMax>0x7FF);
  if($('simGenStart'))$('simGenStart').value=String(start);
  if($('simGenStep'))$('simGenStep').value=String(step);
  if($('simGenByte'))$('simGenByte').value=String(byte);
  if($('simGenPeriod'))$('simGenPeriod').value=String(period);
  if($('simGenSeed'))$('simGenSeed').value=seed.toString(16).toUpperCase().padStart(4,'0');
  if($('simGenBaseData'))$('simGenBaseData').value=baseBytes.map(v=>v.toString(16).toUpperCase().padStart(2,'0')).join(' ');
  document.querySelectorAll('#simGenMask input[data-byte]').forEach((x,i)=>x.checked=!!mask[i]);
  try{localStorage.setItem('deacs.randomSimulator.v4',JSON.stringify({type,rate,idMin:minText,idMax:maxText,dlc,start,step,byte,period,seed,baseBytes,mask}));}catch(_){ }
  updateGeneratorPreview();
  return randomSimConfig;
}
function loadRandomSimConfig(){
  try{
    const saved=JSON.parse(localStorage.getItem('deacs.randomSimulator.v4')||localStorage.getItem('deacs.randomSimulator.v3')||localStorage.getItem('deacs.randomSimulator.v2')||'null');
    if(saved){
      if($('simGeneratorType'))$('simGeneratorType').value=String(saved.type||'random');
      if($('simRandomRate'))$('simRandomRate').value=String(saved.rate||50);
      if($('simRandomIdMin'))$('simRandomIdMin').value=formatCanId(String(saved.idMin||'0'),parseInt(String(saved.idMin||'0'),16)>0x7FF);
      if($('simRandomIdMax'))$('simRandomIdMax').value=formatCanId(String(saved.idMax||'7FF'),parseInt(String(saved.idMax||'7FF'),16)>0x7FF);
      if($('simRandomDlc'))$('simRandomDlc').value=String(saved.dlc||'random');
      if($('simGenStart'))$('simGenStart').value=String(saved.start??0);
      if($('simGenStep'))$('simGenStep').value=String(saved.step??1);
      if($('simGenByte'))$('simGenByte').value=String(saved.byte??0);
      if($('simGenPeriod'))$('simGenPeriod').value=String(saved.period??32);
      if($('simGenSeed'))$('simGenSeed').value=Number(saved.seed||0xACE1).toString(16).toUpperCase().padStart(4,'0');
      if($('simGenBaseData')&&Array.isArray(saved.baseBytes))$('simGenBaseData').value=saved.baseBytes.slice(0,8).map(v=>Number(v).toString(16).toUpperCase().padStart(2,'0')).join(' ');
      if(Array.isArray(saved.mask))document.querySelectorAll('#simGenMask input[data-byte]').forEach((x,i)=>x.checked=!!saved.mask[i]);
    }
  }catch(_){ }
  readRandomSimConfig(false);
  updateGeneratorOptionVisibility();
}
function updateGeneratorOptionVisibility(){
  const type=String($('simGeneratorType')?.value||'random');
  let visible=0;
  document.querySelectorAll('#simGeneratorExtras [data-generators]').forEach(el=>{
    const show=String(el.dataset.generators||'').split(/\s+/).includes(type);
    el.classList.toggle('visible',show);if(show)visible++;
  });
  $('simGeneratorNoExtras')?.classList.toggle('visible',visible===0);
}
function generatorLabel(type){
  return ({random:'Zufall',counter:'Zähler',runningbit:'Laufbit',sine:'Sinus',saw:'Sägezahn',square:'Rechteck',lfsr:'LFSR'})[type]||'Zufall';
}
function generatorBytes(type,dlc,preview=false){
  const cfg=randomSimConfig,out=cfg.baseBytes.slice(0,dlc),selected=cfg.mask.map((v,i)=>v&&i<dlc?i:-1).filter(i=>i>=0);
  if(!selected.length)selected.push(0);
  const target=selected.includes(Math.min(dlc-1,cfg.byte))?Math.min(dlc-1,cfg.byte):selected[0];
  const state=preview?{...generatorState}:generatorState;
  if(type==='counter'){
    const value=state.counter&0xFF;selected.forEach(i=>out[i]=value);state.counter=(state.counter+cfg.step)&0xFF;
  }else if(type==='runningbit'){
    const total=Math.max(1,selected.length*8),pos=state.bit++%total;selected.forEach(i=>out[i]=0);out[selected[Math.floor(pos/8)]]=1<<(pos%8);
  }else if(type==='sine'){
    const value=Math.max(0,Math.min(255,Math.round(127.5+127.5*Math.sin((state.frame%cfg.period)*2*Math.PI/cfg.period))));out[target]=value;state.frame++;
  }else if(type==='saw'){
    out[target]=state.counter&0xFF;state.counter=(state.counter+cfg.step)&0xFF;
  }else if(type==='square'){
    out[target]=(state.frame%cfg.period)<(cfg.period/2)?0x00:0xFF;state.frame++;
  }else if(type==='lfsr'){
    selected.forEach(i=>{let x=state.lfsr&0xFFFF;x=(x>>1)^((-(x&1))&0xB400);state.lfsr=x||cfg.seed;out[i]=x&0xFF;});
  }else{
    selected.forEach(i=>out[i]=preview?0xA5:Math.floor(Math.random()*256));
  }
  return out;
}
function updateGeneratorPreview(bytesOverride=null,idOverride=null){
  const e=$('simGenPreview');if(!e)return;
  const cfg=randomSimConfig,dlc=cfg.dlc==='random'?8:cfg.dlc;
  const idValue=idOverride??cfg.idMin,id=formatCanId(idValue.toString(16),idValue>0x7FF);
  const data=(bytesOverride||generatorBytes(cfg.type,dlc,true)).slice(0,dlc).map(v=>formatHexValue(Number(v).toString(16).toUpperCase().padStart(2,'0'))).join(' ');
  e.textContent=`${id}  ${data}`;
}
function takeOverviewFrameToGenerator(f){
  const data=(Array.isArray(f.bytes)?f.bytes:bytes(String(f.data||''))).slice(0,8).map(x=>parseInt(String(x),16)||0);while(data.length<8)data.push(0);
  const id=String(f.id||'000').toUpperCase();
  $('simRandomIdMin').value=formatCanId(id,!!f.ext);$('simRandomIdMax').value=formatCanId(id,!!f.ext);$('simRandomDlc').value=String(Math.max(1,Math.min(8,Number(f.dlc)||data.filter((_,i)=>i<8).length||8)));
  $('simGenBaseData').value=data.map(v=>v.toString(16).toUpperCase().padStart(2,'0')).join(' ');
  document.querySelectorAll('#simGenMask input[data-byte]').forEach((x,i)=>x.checked=i===0);
  readRandomSimConfig(false);$('simRandomOptions').open=true;activateTab('sim');
  showNotice(`Frame ${formatCanId(id,!!f.ext)} als Generator-Grundlage übernommen.`,'success',3000);
}

function randomCanFrame(){
  const cfg=randomSimConfig;
  const dlc=cfg.dlc==='random'?1+Math.floor(Math.random()*8):cfg.dlc;
  const idValue=cfg.idMin+Math.floor(Math.random()*(cfg.idMax-cfg.idMin+1));
  const ext=idValue>0x7FF;
  const id=idValue.toString(16).toUpperCase().padStart(ext?8:3,'0');
  const bytes=generatorBytes(cfg.type,dlc);
  browserSimulatorFrame({id,ext,bytes,dynamic:false,dynamicIndex:0},'GEN');
  randomSimGenerated++;if(randomSimGenerated%Math.max(1,Math.round(cfg.rate/10))===0)updateGeneratorPreview(bytes,idValue);
}
function stopLogReplay(showMessage=false){
  replayGeneration++;
  if(replayTimer){clearTimeout(replayTimer);replayTimer=null;}
  const wasRunning=replayRunning;
  replayRunning=false;
  replayIndex=0;
  replayFrames=[];
  replayEmitted=0;
  if($('simReplayProgress'))$('simReplayProgress').textContent='0';
  if($('simReplayTotal'))$('simReplayTotal').textContent='0';
  updateSimButton();
  if(showMessage&&wasRunning)showNotice('Log-Simulation gestoppt.','success',1800);
}
function replayFrameToBrowser(f){
  const loggedSource=String(f.source||f.dir||'RX').toUpperCase();
  // Log-Wiedergabe ist eine interne Simulation und niemals CAN-TX.
  // Die ursprüngliche Quelle bleibt separat erhalten.
  addFrame({
    type:'frame',
    us:Math.round(performance.now()*1000),
    dir:'RX',
    sim:true,
    source:'SIM',
    replaySource:loggedSource,
    id:f.id,
    dlc:f.dlc,
    data:f.data,
    ext:!!f.ext,
    rtr:!!f.rtr
  });
  sendLiveSourceFrame('LOG',f.id,!!f.ext,f.data,!!f.rtr);
  countBrowserFrames(1);
  browserSimGenerated++;
  replayEmitted++;
  if($('simReplayProgress')){
    $('simReplayProgress').textContent=replayEmitted.toLocaleString('de-DE');
  }
  updateBrowserSimStatus();
  scheduleRender();
  scheduleOverview();
}
function scheduleNextReplayFrame(generation){
  if(!replayRunning||generation!==replayGeneration||!replayFrames.length)return;

  const speed=Math.max(0.01,Number($('simReplaySpeed')?.value)||1);
  const elapsedMs=performance.now()-replayStartedAt;

  while(replayIndex<replayFrames.length){
    const f=replayFrames[replayIndex];
    const dueMs=(Number(f._replayOffsetUs)||0)/1000/speed;
    if(dueMs>elapsedMs+2)break;
    replayFrameToBrowser(f);
    replayIndex++;
  }

  if(replayIndex>=replayFrames.length){
    if($('simReplayLoop')?.checked){
      replayIndex=0;
      replayEmitted=0;
      replayStartedAt=performance.now();
      if($('simReplayProgress'))$('simReplayProgress').textContent='0';
    }else{
      replayRunning=false;
      replayTimer=null;
      updateSimButton();
      showNotice(
        `Log-Simulation beendet · ${replayEmitted.toLocaleString('de-DE')} Frames wiedergegeben.`,
        'success',
        3000
      );
      return;
    }
  }

  const next=replayFrames[replayIndex];
  const nextDueMs=((Number(next?._replayOffsetUs)||0)/1000/speed)-
                  (performance.now()-replayStartedAt);
  replayTimer=setTimeout(
    ()=>scheduleNextReplayFrame(generation),
    Math.max(0,Math.min(50,Number.isFinite(nextDueMs)?nextDueMs:0))
  );
}
async function startLogReplay(){
  if(!loadedSession.length){
    showNotice('Zuerst eine DEACS-, CSV- oder JSON-Datei importieren.','warning',3800);
    return;
  }

  const selected=selectedReplayFrames();
  if(!selected.length){
    showNotice('Bitte mindestens eine im Log vorhandene Framegruppe auswählen.','warning',4200);
    return;
  }

  await stopSim();
  stopLogReplay();

  // Zeitstempel sortieren und auf 0 normieren. Dadurch funktionieren auch
  // Logs mit absoluten, unsortierten oder sehr großen Zeitstempeln stabil.
  const sorted=selected
    .map((frame,index)=>({
      ...frame,
      _originalOrder:index,
      _timeUs:Number.isFinite(Number(frame.us))?Number(frame.us):index*1000
    }))
    .sort((a,b)=>a._timeUs-b._timeUs||a._originalOrder-b._originalOrder);

  const firstUs=sorted[0]._timeUs;
  replayFrames=sorted.map(frame=>({
    ...frame,
    _replayOffsetUs:Math.max(0,frame._timeUs-firstUs)
  }));

  browserSimGenerated=0;
  replayEmitted=0;
  replayRunning=true;
  replayIndex=0;
  replayStartedAt=performance.now();
  replayBaseUs=0;

  if($('simReplayProgress'))$('simReplayProgress').textContent='0';
  if($('simReplayTotal')){
    $('simReplayTotal').textContent=replayFrames.length.toLocaleString('de-DE');
  }

  const generation=++replayGeneration;
  updateSimButton();
  activateTab('sim');

  const groups=[
    ['RX','simReplayRx'],
    ['TX','simReplayTx'],
    ['SIM/GEN','simReplaySim'],
    ['Andere','simReplayOther']
  ].filter(([,id])=>$(id)?.checked).map(([name])=>name).join(', ');

  showNotice(
    `Log-Simulation gestartet · ${replayFrames.length.toLocaleString('de-DE')} Frames · `+
    `${groups} · ${$('simReplaySpeed')?.value||1}× · interne SIM, kein CAN-TX.`,
    'success',
    4200
  );

  // Ersten Frame sofort einspeisen.
  scheduleNextReplayFrame(generation);
}
function stopRandomSimulator(){
  if(randomSimTimer){clearInterval(randomSimTimer);randomSimTimer=null;}
  randomSimRunning=false;randomSimAccumulator=0;
  updateBrowserSimStatus();
}
async function startRandomSimulator(){
  const cfg=readRandomSimConfig(true);if(!cfg)return;
  await stopSim();
  randomSimGenerated=0;randomSimAccumulator=0;generatorState={counter:cfg.start,bit:0,phase:0,frame:0,lfsr:cfg.seed};
  randomSimRunning=true;
  randomSimTimer=setInterval(()=>{
    if(!randomSimRunning)return;
    randomSimAccumulator+=randomSimConfig.rate/50;
    const count=Math.floor(randomSimAccumulator);randomSimAccumulator-=count;
    for(let i=0;i<count;i++)randomCanFrame();
  },20);
  updateSimButton();
  showNotice(`${generatorLabel(cfg.type)}-Generator gestartet · ${cfg.rate} interne Frames/s · kein CAN-TX.`,'success',3500);
}
function stopBrowserSimulator(){
  browserSimGeneration++;
  for(const timer of browserSimTimers)clearInterval(timer);
  browserSimTimers=[];
  browserSimActiveCount=0;
  updateBrowserSimStatus();
}
async function stopSim(){
  const backend=simBackend;
  stopLogReplay();
  simRunning=false;
  stopRandomSimulator();
  stopBrowserSimulator();
  updateSimButton();
  if(backend==='esp32'){
    try{await post('/api/sim/stop');}catch(e){console.error(e);}
  }
}
async function startEsp32Simulator(active){
  await post('/api/sim/stop');
  await post('/api/sim/clear');
  for(const e of active){
    await post('/api/sim/add',{
      id:e.id,data:e.data,interval:Math.max(10,Number(e.ms)||100),enabled:1,
      extended:parseInt(e.id,16)>0x7FF?1:0,dynamic:e.dynamic?1:0,dynamicIndex:e.dynamicIndex||0
    });
  }
  await post('/api/sim/start',{liveTx:$('liveTxSimulator')?.checked?1:0});
}
function browserSimulatorFrame(runtime,source='SIM'){
  const nowUs=Math.round(performance.now()*1000);
  const data=runtime.bytes.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join('');
  addFrame({
    type:'frame',us:nowUs,dir:'RX',sim:true,source:String(source||'SIM').toUpperCase(),id:runtime.id,dlc:runtime.bytes.length,
    data,ext:runtime.ext,rtr:false
  });
  sendLiveSourceFrame(String(source||'SIM').toUpperCase(),runtime.id,!!runtime.ext,data,false);
  countBrowserFrames(1);
  browserSimGenerated++;
  updateBrowserSimStatus();
  scheduleRender();
  scheduleOverview();
  if(runtime.dynamic&&runtime.bytes.length){
    runtime.bytes[runtime.dynamicIndex]=(runtime.bytes[runtime.dynamicIndex]+1)&0xFF;
    runtime.dynamicIndex=(runtime.dynamicIndex+1)%runtime.bytes.length;
  }
}
function startBrowserSimulator(active){
  stopBrowserSimulator();
  const generation=browserSimGeneration;
  let invalidCount=0;
  for(const entry of active){
    const runtime=simulatorEntryRuntime(entry);
    if(!runtime){invalidCount++;continue;}
    runtime.dynamicIndex%=runtime.bytes.length;
    const timer=setInterval(()=>{
      if(!simRunning||simBackend!=='browser'||generation!==browserSimGeneration)return;
      browserSimulatorFrame(runtime);
    },runtime.interval);
    browserSimTimers.push(timer);
  }
  browserSimActiveCount=browserSimTimers.length;
  updateBrowserSimStatus();
  if(!browserSimTimers.length){showNotice('Kein gültiger Simulator-Frame vorhanden.','warning',4500);return false;}
  const skipped=invalidCount?` · ${invalidCount} ungültig übersprungen`:'';
  showNotice(`Browser-Simulator gestartet · ${browserSimTimers.length} Frame${browserSimTimers.length===1?'':'s'}${skipped}.`,'success',3500);
  return true;
}
async function startSim(){
  stopRandomSimulator();
  const active=simEntries.filter(e=>e.enabled);
  if(!active.length){showNotice('Kein Simulator-Frame aktiviert.','warning');return;}
  simRunning=false;updateSimButton();
  if(simBackend==='browser'){
    browserSimGenerated=0;
    simRunning=startBrowserSimulator(active);
    updateSimButton();
    return;
  }
  try{
    await startEsp32Simulator(active);
    simRunning=true;updateSimButton();
  }catch(e){console.error(e);showNotice('Simulator konnte nicht gestartet werden.','error',5000);simRunning=false;updateSimButton();}
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));
['search','idFrom','idTo','showIds'].forEach(id=>$(id).oninput=scheduleRender);
$('hideIds').oninput=()=>{const active=$('hideIds').value.trim().length>0;$('hideIds').classList.toggle('filterActive',active);scheduleRender();};$('maxAge').onchange=scheduleRender;['direction','frameType','dlcFilter'].forEach(id=>$(id).onchange=scheduleRender);$('changeWindow').value=String(overviewChangeWindowSec);initToggleButton('changedOnly',true,()=>{
  if($('changedOnly').checked){
    // Beim Einschalten bleiben alle aktuell sichtbaren Frames zunächst erhalten.
    // Ab diesem Moment läuft für jeden Frame das konfigurierte Sichtfenster.
    const now=performance.now();
    overview.forEach((f,k)=>overview.set(k,{...f,filterSeenAt:now}));
    latestOverviewLive.forEach((f,k)=>latestOverviewLive.set(k,{...f,filterSeenAt:now}));
  }
  scheduleOverview();
});$('changeWindow').onchange=()=>{overviewChangeWindowSec=Math.max(0.5,Number($('changeWindow').value)||2);localStorage.setItem('deacsOverviewChangeWindowSec',String(overviewChangeWindowSec));scheduleOverview();};initToggleButton('highlightNew',true,scheduleOverview);initToggleButton('highlightData',true,scheduleOverview);initToggleButton('autoscroll',true,()=>{monitorViewFrozen=!$('autoscroll').checked;$('scrollToEnd').hidden=$('autoscroll').checked;if(!monitorViewFrozen)scheduleRender();});
initToggleButton('decodedOnly',false,scheduleOverview);
initToggleButton('hideFastFrames',false,scheduleOverview);
const savedFastFrameThreshold=Number(localStorage.getItem('deacsFastFrameThreshold'))||100;
$('fastFrameThreshold').value=String([...$('fastFrameThreshold').options].some(option=>Number(option.value)===savedFastFrameThreshold)?savedFastFrameThreshold:100);
$('fastFrameThreshold').onchange=()=>{localStorage.setItem('deacsFastFrameThreshold',$('fastFrameThreshold').value);scheduleOverview();};
const monitorTable=document.querySelector('.monitorTable');
$('frames').onclick=e=>{const tr=e.target.closest('tr[data-monitor-uid]');if(!tr)return;selectedMonitorFrameUid=Number(tr.dataset.monitorUid);document.querySelectorAll('#frames tr').forEach(row=>row.classList.toggle('monitorSelectedRow',Number(row.dataset.monitorUid)===selectedMonitorFrameUid));};
$('frames').ondblclick=e=>{const tr=e.target.closest('tr[data-monitor-uid]');if(!tr)return;const f=frames.find(x=>x._monitorUid===Number(tr.dataset.monitorUid));loadMonitorFrameIntoTx(f);};
monitorTable.addEventListener('scroll',()=>{if(!$('autoscroll').checked)return;const nearBottom=monitorTable.scrollHeight-monitorTable.scrollTop-monitorTable.clientHeight<28;if(!nearBottom){setToggleButton('autoscroll',false);monitorViewFrozen=true;$('scrollToEnd').hidden=false;}});

document.querySelectorAll('[data-overview-sort]').forEach(th=>{th.onclick=()=>setOverviewSort(th.dataset.overviewSort);th.tabIndex=0;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOverviewSort(th.dataset.overviewSort);}};});
$('overviewTableWrap')?.addEventListener('scroll',()=>{if(activeTab!=='decoder')return;requestAnimationFrame(()=>{overviewLastVirtualStart=-1;scheduleOverview();});},{passive:true});
$('scrollToEnd').onclick=()=>{monitorViewFrozen=false;setToggleButton('autoscroll',true);render();monitorTable.scrollTop=monitorTable.scrollHeight;$('scrollToEnd').hidden=true;};$('ageToggle').onclick=()=>{ageFilterEnabled=!ageFilterEnabled;$('ageToggle').classList.toggle('activeToggle',ageFilterEnabled);$('ageToggle').setAttribute('aria-pressed',String(ageFilterEnabled));$('ageToggle').textContent=ageFilterEnabled?'Ausblenden aktiv':'Ältere ausblenden';scheduleRender();};$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Fortsetzen':'Pause';updateCounts();if(!paused)scheduleRender();};$('clear').onclick=()=>{frames.length=0;previous.clear();totalReceived=0;updateCounts();scheduleRender();};$('decoderClear').onclick=()=>{overview.clear();latestOverviewLive.clear();frozenOverviewKeys.clear();renderOverview();};$('decoderSearch').oninput=scheduleOverview;
$('decodedNew').onclick=()=>addDecodedFromFrame({id:'000',dlc:8,data:'0000000000000000'});
$('decodedDuplicate').onclick=()=>{const r=decodedRowByUid(selectedDecodedRow);if(!r){$('decodedResult').textContent='Keine Zeile ausgewählt';return;}addDecodedFromFrame({...r,uid:null,bytes:[...r.bytes]});};
$('decodedDelete').onclick=()=>{if(!selectedDecodedRow)return;decodedRows=decodedRows.filter(r=>r.uid!==selectedDecodedRow);selectedDecodedRow=decodedRows[0]?.uid||null;saveDecodedRows();renderDecodedList();renderOverview();};
$('decodedSend').onclick=sendSelectedDecoded;
$('decodedListClear').onclick=async()=>{if(await askConfirm('Decoded-Liste wirklich leeren?','Decoded-Liste leeren')){decodedRows=[];selectedDecodedRow=null;saveDecodedRows();renderDecodedList();renderOverview();showNotice('Decoded-Liste geleert.','success');}};

$('saveSession').onclick=()=>downloadJson(`DEACS_session_${new Date().toISOString().replace(/[:.]/g,'-')}.json`,sessionObject());$('loadSession').onclick=()=>$('sessionFile').click();$('sessionFile').onchange=e=>{const f=e.target.files[0];if(f)readJson(f,o=>{loadedSession=Array.isArray(o)?o:(o.frames||[]);showNotice(`${loadedSession.length.toLocaleString('de-DE')} Frames geladen.`,'success');});};$('playSession').onclick=playbackSession;
$('labelNew').onclick=clearLabelEditor;$('labelSave').onclick=()=>{const id=internalCanId($('labelId').value);const l=$('labelText').value.trim();if(!/^[0-9A-F]{1,8}$/.test(id)||!l){showNotice('Bitte eine gültige ID und ein Label eingeben.','warning');return;}if(selectedLabelId&&selectedLabelId!==id)delete labels[selectedLabelId];labels[id]=l;selectedLabelId=id;saveLabels();};$('labelDelete').onclick=async()=>{if(!selectedLabelId){showNotice('Zuerst eine Zeile auswählen.','warning');return;}if(await askConfirm(`Label ${selectedLabelId} wirklich löschen?`,'Label löschen')){delete labels[selectedLabelId];clearLabelEditor();saveLabels();showNotice('Label gelöscht.','success');}};$('labelsExport').onclick=()=>downloadJson('DEACS_labels.json',labels);$('labelsImport').onclick=()=>$('labelsFile').click();$('labelsFile').onchange=e=>{const f=e.target.files[0];if(f)readJson(f,o=>{labels={...labels,...o};saveLabels();});};
$('txId').oninput=()=>$('txId').classList.remove('inputInvalid');$('txDlc').onchange=updateTxEditor;initToggleButton('txExt',false);initToggleButton('txRtr',false,updateTxEditor);$('send').onclick=sendTx;$('txCyclic').onclick=()=>{if(txTimer){stopTxCycle();return;}let payload;try{payload=txPayload();}catch(e){showNotice(e.message||'Ungültige TX-Eingabe.','warning',4000);return;}const ms=Math.max(10,Number($('txInterval').value)||100);$('txCyclic').textContent='Zyklus stoppen';$('txCyclic').classList.add('primary');$('txCyclic').setAttribute('aria-pressed','true');setTxEditorLocked(true);sendPayload(payload).then(()=>showNotice(`Zyklisches Senden gestartet: ${ms} ms.`,'success',1800)).catch(()=>stopTxCycle());txTimer=setInterval(()=>sendPayload(payload).catch(()=>stopTxCycle()),ms);};$('txClear').onclick=()=>{stopTxCycle();$('txId').value='';$('txDlc').value='0';document.querySelectorAll('#txBytes input').forEach(i=>i.value='00');setToggleButton('txExt',false);setToggleButton('txRtr',false);updateTxEditor();};$('txHistoryClear').onclick=async()=>{if(!txHistory.length)return;if(await askConfirm('Gesendete Frames wirklich vollständig löschen?','TX-Liste löschen')){txHistory=[];selectedTxHistoryKey=null;highlightedTxHistoryKey=null;flushTxHistory();showNotice('TX-Liste gelöscht.','success',1800);$('txId').focus();}};document.addEventListener('keydown',e=>{if(e.key!=='Delete'||!selectedTxHistoryKey)return;const active=document.activeElement;if(active&&(['INPUT','TEXTAREA','SELECT'].includes(active.tagName)||active.isContentEditable))return;const index=txHistory.findIndex(p=>txHistoryKey(p)===selectedTxHistoryKey);if(index<0)return;e.preventDefault();txHistory.splice(index,1);selectedTxHistoryKey=null;flushTxHistory();showNotice('TX-Verlaufseintrag gelöscht.','success',1600);});loadTxHistory();updateTxEditor();renderTxHistory();
function formatSimulatorAddByte(input){
  const hex=String(input.value||'').toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,2);
  input.value=hex;
  input.setAttribute('aria-invalid',hex.length!==2?'true':'false');
  return hex;
}
document.querySelectorAll('#simAddBytes input').forEach(input=>{
  input.oninput=()=>formatSimulatorAddByte(input);
  input.onblur=()=>{input.value=formatSimulatorAddByte(input).padStart(2,'0');input.setAttribute('aria-invalid','false');};
});
$('simDlc').onchange=()=>{const dlc=Math.max(0,Math.min(8,Number($('simDlc').value)||0));document.querySelectorAll('#simAddBytes input').forEach((input,i)=>{input.disabled=i>=dlc;input.closest('label')?.classList.toggle('disabled',i>=dlc);});};$('simDlc').onchange();
$('simAdd').onclick=()=>{
  const id=internalCanId($('simId').value);
  const addBytes=[...document.querySelectorAll('#simAddBytes input')].map(input=>formatSimulatorAddByte(input));
  const dlc=Math.max(0,Math.min(8,Number($('simDlc').value)||0));
  const usedBytes=addBytes.slice(0,dlc);
  const checked={hex:usedBytes.join(''),incomplete:usedBytes.some(v=>v.length!==2),data:usedBytes.join(' ')};
  const ms=Math.max(10,Number($('simMs').value)||100);
  if(!/^[0-9A-F]{1,8}$/.test(id)){
    showNotice('Simulator-ID ist ungültig. Erlaubt sind 1 bis 8 HEX-Zeichen.','warning',5000);
    $('simId').focus();return;
  }
  if(checked.incomplete){
    showNotice(checked.incomplete?'Das letzte Datenbyte ist unvollständig.':'Bitte mindestens ein Datenbyte eingeben.','warning',5000);
    document.querySelector('#simAddBytes input[aria-invalid="true"]')?.focus();return;
  }
  simEntries.push({id,data:checked.data,dlc,ms,enabled:true,dynamic:false,dynamicIndex:0,name:`Frame ${id}`,source:'SIM'});
  saveSimulatorEntries();
  renderSim();
};
$('simExamples').onclick=()=>{
  const existing=new Set(simEntries.map(e=>`${e.id}|${e.data}|${e.ms}`));
  let added=0;
  for(const sample of DEFAULT_SIM_ENTRIES){
    const key=`${sample.id}|${sample.data}|${sample.ms}`;
    if(existing.has(key))continue;
    simEntries.push({...sample,dlc:Number.isFinite(Number(sample.dlc))?Number(sample.dlc):Math.min(8,String(sample.data||'').split(/\s+/).filter(Boolean).length),name:sample.name||`Beispiel ${sample.id}`,source:'SIM'});existing.add(key);added++;
  }
  saveSimulatorEntries();renderSim();
  showNotice(added?`${added} Beispiel-Frame${added===1?'':'s'} geladen.`:'Alle Beispiel-Frames sind bereits vorhanden.',added?'success':'info');
};
$('simClear').onclick=async()=>{
  if(!simEntries.length)return;
  if(!await askConfirm('Alle Simulator-Frames dauerhaft löschen?','Simulator leeren'))return;
  await stopSim();simEntries.splice(0,simEntries.length);saveSimulatorEntries();renderSim();
  showNotice('Alle Simulator-Frames wurden gelöscht.','success');
};
$('simToggle').onclick=()=>simRunning?stopSim():startSim();
$('simRandom').onclick=()=>randomSimRunning?stopSim():startRandomSimulator();
$('simGeneratorType').onchange=()=>{updateGeneratorOptionVisibility();readRandomSimConfig(false);};
['simRandomRate','simRandomIdMin','simRandomIdMax','simRandomDlc','simGenStart','simGenStep','simGenByte','simGenPeriod','simGenSeed','simGenBaseData'].forEach(id=>{const e=$(id);if(e)e.onchange=()=>readRandomSimConfig(false);});
document.querySelectorAll('#simGenMask input[data-byte]').forEach(x=>x.onchange=()=>readRandomSimConfig(false));
$('simGenBaseData').oninput=()=>{const raw=$('simGenBaseData').value.replace(/[^0-9A-F]/gi,'').toUpperCase().slice(0,16);$('simGenBaseData').value=(raw.match(/.{1,2}/g)||[]).join(' ');};
function openExportDialog(){if($('exportMenuToggle').disabled)return;$('exportDialog').classList.add('visible');$('logSave').focus();}function closeExportDialog(){$('exportDialog').classList.remove('visible');}$('exportMenuToggle').onclick=openExportDialog;$('exportDialogCancel').onclick=closeExportDialog;$('exportDialog').onclick=e=>{if(e.target===$('exportDialog'))closeExportDialog();};$('dataImport').onclick=()=>{$('dataImportFile').click();};$('dataImportFile').onchange=e=>{const f=e.target.files[0];if(f)importDataFile(f);e.target.value='';};$('importReplay').onclick=startLogReplay;
$('simReplay').onclick=()=>replayRunning?stopLogReplay(true):startLogReplay();
['simReplayRx','simReplayTx','simReplaySim','simReplayOther'].forEach(id=>{
  const el=$(id);
  if(el)el.onchange=()=>updateSimButton();
});
let canSettingsApplying=false;async function applyCanSettings(){if(canSettingsApplying)return;canSettingsApplying=true;canSettingsDirty=true;const bitrate=$('bitrate').value,mode=$('mode').value;$('bitrate').disabled=true;$('mode').disabled=true;try{const status=await post('/api/can',{bitrate,mode});canSettingsDirty=false;setStatus(status);showNotice(`CAN automatisch neu gestartet: ${status.listenOnly?'Listen-only':(status.noAck?'TX ohne ACK':'TX mit ACK')}, ${Math.round(status.bitrate/1000)} kbit/s.`,'success');}catch(e){canSettingsDirty=false;try{const status=await fetch('/api/status?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());setStatus(status);}catch(_){}showNotice('CAN konnte nicht neu gestartet werden. Die letzte funktionierende Einstellung wurde wiederhergestellt.','error',5000);}finally{$('bitrate').disabled=false;$('mode').disabled=false;canSettingsApplying=false;}}$('bitrate').onchange=applyCanSettings;$('mode').onchange=applyCanSettings;$('canMode').onclick=async()=>{if(canToggleBusy)return;canToggleBusy=true;$('canMode').classList.add('busy');try{const status=await post('/api/can/toggle',{});setStatus(status);showNotice(status.canRunning?'CAN wieder verbunden.':'CAN hardware-nah getrennt.','success',2200);}catch(e){showNotice('CAN-Zustand konnte nicht umgeschaltet werden.','error',4000);}finally{canToggleBusy=false;$('canMode').classList.remove('busy');}};$('canMode').tabIndex=0;$('canMode').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('canMode').click();}};$('filterIds').onfocus=()=>{filterInputEditing=true;};$('filterMode').onchange=()=>{filterInputDirty=true;$('applyFilter').textContent='Filter anwenden';$('applyFilter').dataset.active='0';$('applyFilter').classList.remove('activeToggle');};$('filterIds').oninput=()=>{filterInputDirty=true;$('filterIds').classList.remove('filterActive');if($('applyFilter').dataset.active==='1'){$('applyFilter').textContent='Filter anwenden';$('applyFilter').dataset.active='0';$('applyFilter').classList.remove('activeToggle');}};$('filterIds').onblur=()=>{filterInputEditing=false;};$('filterIds').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('applyFilter').click();}};$('applyFilter').onclick=async()=>{const active=$('applyFilter').dataset.active==='1';const ids=$('filterIds').value.trim();if(!active&&!ids){showNotice('Bitte mindestens eine CAN-ID eingeben.','warning',2600);$('filterIds').focus();return;}try{const displayIds=normalizeFilterDisplay(ids),payloadIds=filterPayload(displayIds);const status=await post('/api/filter',{enabled:active?0:1,mode:$('filterMode').value,ids:active?'':payloadIds});filterInputEditing=false;filterInputDirty=false;if(active){filterDisplayText='';localStorage.removeItem('deacsFilterDisplayText');}else{filterDisplayText=displayIds;localStorage.setItem('deacsFilterDisplayText',filterDisplayText);$('filterIds').value=filterDisplayText;}setStatus(status);showNotice(active?'Serverfilter gelöscht.':'Serverfilter angewendet.','success',1800);}catch(e){showNotice('Serverfilter konnte nicht geändert werden.','error',3500);}};$('resetDiagnosticPeaks').onclick=async()=>{try{const status=await post('/api/diagnostics/reset',{});setStatus(status);showNotice('Diagnose-Spitzenwerte wurden zurückgesetzt.','success');}catch(e){showNotice('Diagnose-Spitzenwerte konnten nicht zurückgesetzt werden.','error',4000);}};$('runDiagnosticSelfTest').onclick=async()=>{try{const r=await fetch('/api/diagnostics/selftest?ts='+Date.now(),{cache:'no-store'}).then(x=>x.json());const ok=r.can&&r.websocket&&r.heap&&r.queue&&Number(r.drops)===0;const lines=[`${r.can?'✔':'✖'} CAN-Treiber`,`${r.websocket?'✔':'⚠'} Browser/WebSocket`,`${r.heap?'✔':'⚠'} Speicher (${r.freeHeap} B frei)`,`${r.queue?'✔':'⚠'} Queue (${r.queuePercent} %)`,`${Number(r.drops)===0?'✔':'⚠'} Verluste (${r.drops})`];const box=$('diagnosticSelfTest');box.textContent=lines.join(' · ');box.hidden=false;box.classList.toggle('warning',!ok);}catch(e){showNotice('Selbsttest konnte nicht ausgeführt werden.','error',4000);}};$('loadDiagnosticEvents').onclick=async()=>{try{const r=await fetch('/api/diagnostics/events?ts='+Date.now(),{cache:'no-store'}).then(x=>x.json());const pre=$('diagnosticEvents');pre.textContent=(r.events||[]).map(e=>{const sec=Math.floor(Number(e.ms||0)/1000);const h=String(Math.floor(sec/3600)).padStart(2,'0'),m=String(Math.floor(sec%3600/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');return `${h}:${m}:${s}  ${e.text}`;}).join('\n')||'Keine Diagnose-Ereignisse vorhanden.';pre.hidden=false;}catch(e){showNotice('Ereignisse konnten nicht geladen werden.','error',4000);}};$('logToggle').onclick=()=>browserLog.active?stopBrowserLog():startBrowserLog();$('logSave').onclick=async()=>{closeExportDialog();await saveBrowserLog();};$('logExport').onclick=async()=>{closeExportDialog();await exportBrowserLog();};$('logClear').onclick=clearBrowserLogs;window.addEventListener('beforeunload',e=>{if(browserLog.active){flushBrowserLog();e.preventDefault();e.returnValue='';}});
$('appNoticeClose').onclick=closeNotice;$('appDialogCancel').onclick=()=>closeDialog(false);$('appDialogConfirm').onclick=()=>closeDialog(true);$('appDialog').onclick=e=>{if(e.target===$('appDialog'))closeDialog(false);};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('appDialog').classList.contains('visible'))closeDialog(false);if(e.key==='Escape'&&$('exportDialog').classList.contains('visible'))closeExportDialog();});

function csvCellValue(cell){
  const controls=[...cell.querySelectorAll('input,select,textarea')];
  if(controls.length)return controls.map(x=>x.type==='checkbox'?(x.checked?'1':'0'):(x.value||'')).join(' ').trim();
  return String(cell.innerText||cell.textContent||'').replace(/\s+/g,' ').trim();
}
function csvEscape(value){const text=String(value??'');return /[;"\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function markedTableRow(){
  if(selectedCsvRow?.isConnected)return selectedCsvRow;
  const active=document.querySelector('.tab.active');
  return active?.querySelector('tbody tr.monitorSelectedRow,tbody tr.selectedOverview,tbody tr.selectedRow,tbody tr.selectedLabelRow,tbody tr.txHistorySelected,tbody tr.simSelectedRow')||null;
}
document.addEventListener('click',e=>{
  const row=e.target.closest('.tab.active .tablewrap tbody tr');if(!row||row.classList.contains('simEmptyRow')||row.classList.contains('txHistoryEmpty'))return;
  if(selectedCsvRow?.isConnected&&selectedCsvRow!==row)selectedCsvRow.classList.remove('csvSelectedRow');
  selectedCsvRow=row;row.classList.add('csvSelectedRow');
},true);
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||String(e.key).toLowerCase()!=='c')return;
  const active=document.activeElement,selection=window.getSelection?.().toString();
  if(selection||active&&(['INPUT','TEXTAREA'].includes(active.tagName)||active.isContentEditable))return;
  const row=markedTableRow();if(!row)return;
  const cells=[...row.cells].filter(c=>!c.matches('.simDragCell,.overviewFrameActions,.txHistoryActions,.simRowActions')&&!c.querySelector('.rowActionMenu'));
  const csv=cells.map(c=>csvEscape(csvCellValue(c))).join(';');
  e.preventDefault();
  const done=()=>showNotice('Markierte Zeile als CSV kopiert.','success',1800);
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(csv).then(done).catch(()=>fallbackCopy(csv));else fallbackCopy(csv);
});

initIdFormatToggle();updateSimulatorBackend();
LIVE_TX_SETTING_IDS.forEach(id=>{const el=$(id);if(!el)return;el.checked=localStorage.getItem(`deacs.${id}`)==='1';el.onchange=()=>localStorage.setItem(`deacs.${id}`,el.checked?'1':'0');});loadRandomSimConfig();loadLatestLogSession();initDbc();renderLabels();renderDecodedList();$('hideIds').classList.toggle('filterActive',$('hideIds').value.trim().length>0);renderSim();stopSim();fetch('/api/status?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(setStatus);connect();updateCounts();


// V0.13.02-TEST: Grundgerüst für den getrennten Ereignis-Analyse-Tab.
const eventMarkers=[];
let selectedEventMarker=-1;
function currentEventMonitorFrame(){return frames.find(frame=>frame._monitorUid===selectedMonitorFrameUid)||frames[frames.length-1]||null;}
function getEventSourceLabel(frame=currentEventMonitorFrame()){
  if(!frame)return'Keine Monitor-Frames';
  const source=dir(frame);return source==='SIM'?'Simulator':source==='GEN'?'Generator':source==='TX'?'TX':'Live CAN / RX';
}
function formatEventMarkerTime(ms){
  const total=Math.max(0,Math.floor(ms));
  const minutes=Math.floor(total/60000);
  const seconds=Math.floor((total%60000)/1000);
  const millis=total%1000;
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}
function renderEventMarkers(){
  const body=$('eventMarkerRows');if(!body)return;
  if(!eventMarkers.length){body.innerHTML='<tr class="eventEmptyRow"><td colspan="3">Noch keine Marker gesetzt.</td></tr>';return;}
  body.innerHTML=eventMarkers.map((marker,index)=>`<tr data-event-marker="${index}" class="${index===selectedEventMarker?'eventSelected':''}"><td>${formatEventMarkerTime(marker.time)}</td><td>${escapeHtml(marker.text)}</td><td>${escapeHtml(marker.source)}</td></tr>`).join('');
  body.querySelectorAll('tr[data-event-marker]').forEach(row=>row.onclick=()=>{selectedEventMarker=Number(row.dataset.eventMarker);renderEventMarkers();});
}
let eventAnalysisResults=[],selectedEventResult=-1;
function eventData(f){return (f.bytes||bytes(f.data)).slice(0,Math.min(8,Number(f.dlc)||0)).map(x=>String(x||'00').toUpperCase().padStart(2,'0'));}
function eventCyclic(list){if(list.length<4)return false;const gaps=list.slice(1).map((f,i)=>f.receivedAt-list[i].receivedAt),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;if(mean<=0)return false;return Math.sqrt(gaps.reduce((n,v)=>n+(v-mean)**2,0)/gaps.length)/mean<.15;}
function analyzeEvent(marker){
  const before=Math.max(0,Number($('eventBeforeMs').value)||0),after=Math.max(0,Number($('eventAfterMs').value)||0),hideSame=$('eventHideSame').checked,onlyChanges=$('eventOnlyChanges').checked,hideCyclic=$('eventHideCyclic').checked;
  const groups=new Map();frames.filter(f=>f.receivedAt>=marker.time-before&&f.receivedAt<=marker.time+after).forEach(f=>{const k=key(f);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(f);});
  const out=[];groups.forEach(raw=>{raw.sort((a,b)=>a.receivedAt-b.receivedAt);const cyclic=eventCyclic(raw);if(hideCyclic&&cyclic)return;let list=raw;if(hideSame)list=raw.filter((f,i)=>!i||eventData(f).join('')!==eventData(raw[i-1]).join(''));const changedBytes=new Set(),changedBits=new Set(),byteCounts=Array(8).fill(0);let changes=0;for(let i=1;i<list.length;i++){const a=eventData(list[i-1]),b=eventData(list[i]);let changed=false;for(let n=0;n<Math.max(a.length,b.length);n++){const mask=(parseInt(a[n]||'00',16)^parseInt(b[n]||'00',16))&255;if(!mask)continue;changed=true;changedBytes.add(n);byteCounts[n]=(byteCounts[n]||0)+1;for(let bit=0;bit<8;bit++)if(mask&(1<<bit))changedBits.add(`${n}.${bit}`);}if(changed)changes++;}if(onlyChanges&&!changes)return;const beforeList=raw.filter(f=>f.receivedAt<marker.time),lastBefore=beforeList[beforeList.length-1]||null,afterList=raw.filter(f=>f.receivedAt>=marker.time),beforeData=lastBefore?eventData(lastBefore).join(''):null,firstAfter=(beforeData!==null?afterList.find(f=>eventData(f).join('')!==beforeData):afterList[0])||afterList[0]||null;out.push({id:raw[0].id,ext:raw[0].ext,source:dir(raw[0]),label:labelFor(raw[0].id),frames:raw.length,changes,bytes:[...changedBytes].sort((a,b)=>a-b),bits:[...changedBits],byteCounts,cyclic,lastBefore,firstAfter,score:changes*100+changedBytes.size*20+changedBits.size*4+Math.min(raw.length,20)});});return out.sort((a,b)=>b.score-a.score||b.changes-a.changes);
}
function renderEventDetail(){
  const box=$('eventDetailPlaceholder'),r=eventAnalysisResults[selectedEventResult];if(!box||!r)return;
  const before=r.lastBefore?eventData(r.lastBefore):[],after=r.firstAfter?eventData(r.firstAfter):[],changed=new Set(),shownBits=[];
  for(let i=0;i<Math.max(before.length,after.length);i++){const mask=(parseInt(before[i]||'00',16)^parseInt(after[i]||'00',16))&255;if(!mask)continue;changed.add(i);for(let bit=0;bit<8;bit++)if(mask&(1<<bit))shownBits.push(`${i}.${bit}`);}
  const row=(title,values,isAfter)=>{const cells=Array.from({length:8},(_,i)=>`<td class="eventByteCell ${isAfter&&changed.has(i)?'eventByteChanged':''}"><span>${values[i]?formatHexValue(values[i]):'–'}</span><small>${isAfter&&changed.has(i)?`${Number(r.byteCounts[i]||0)}× geändert`:``}</small></td>`).join(''),ascii=frameAscii(values,values.length);return `<tr><th>${title}</th>${cells}<td class="asciiCell">${escapeHtml(ascii)}</td></tr>`;};
  box.innerHTML=`<div class="eventDetailGrid"><b>${formatCanId(r.id,r.ext)} · ${escapeHtml(r.label||'ohne Label')}</b><span>Quelle: ${escapeHtml(r.source)}${r.cyclic?' · zyklisch':''}</span><div class="eventByteTableWrap"><table class="eventByteTable"><thead><tr><th></th>${Array.from({length:8},(_,i)=>`<th>D${i}</th>`).join('')}<th>ASCII</th></tr></thead><tbody>${row('Vorher',before,false)}${row('Nachher',after,true)}</tbody></table></div><span>Unterschiede zwischen den gezeigten Frames: ${shownBits.length?`Bits ${shownBits.join(', ')}`:'keine'}</span></div>`;
}
function renderEventResults(){const body=$('eventResultRows');if(!body)return;if(!eventAnalysisResults.length){body.innerHTML='<tr class="eventEmptyRow"><td colspan="5">Keine passenden Änderungen gefunden.</td></tr>';$('eventDetailPlaceholder').textContent='Zeitfenster oder Filter anpassen.';return;}body.innerHTML=eventAnalysisResults.map((r,i)=>`<tr data-event-result="${i}" class="${i===selectedEventResult?'eventSelected':''}"><td>${r.score}</td><td>${formatCanId(r.id,r.ext)}</td><td>${r.frames}</td><td>${r.changes}</td><td>${r.bytes.length?r.bytes.map(n=>`D${n}`).join(', '):'–'}</td></tr>`).join('');body.querySelectorAll('[data-event-result]').forEach(row=>row.onclick=()=>{selectedEventResult=Number(row.dataset.eventResult);renderEventResults();renderEventDetail();});renderEventDetail();}
function initEventAnalysisTab(){
  const sourceStatus=$('eventSourceStatus');
  if(sourceStatus)sourceStatus.textContent=frames.length?`${getEventSourceLabel()} · ${frames.length.toLocaleString('de-DE')} Monitor-Frames`:'Warte auf Monitor-Frames';
  $('eventMarkerAdd')?.addEventListener('click',()=>{
    const input=$('eventMarkerText');
    const text=String(input?.value||'').trim()||`Marker ${eventMarkers.length+1}`;
    const monitorFrame=currentEventMonitorFrame();
    if(!monitorFrame){showNotice('Im aktuellen Monitor sind noch keine Frames vorhanden.','info');return;}
    const source=getEventSourceLabel(monitorFrame);
    eventMarkers.push({time:performance.now(),text,source});
    if(sourceStatus)sourceStatus.textContent=`${source} · ${frames.length.toLocaleString('de-DE')} Monitor-Frames`;
    selectedEventMarker=eventMarkers.length-1;
    if(input)input.value='';
    renderEventMarkers();
    showNotice(`Marker „${text}“ gesetzt.`,'success');
  });
  $('eventMarkerText')?.addEventListener('keydown',event=>{if(event.key==='Enter')$('eventMarkerAdd')?.click();});
  $('eventMarkerDelete')?.addEventListener('click',()=>{
    if(selectedEventMarker<0||selectedEventMarker>=eventMarkers.length){showNotice('Bitte zuerst einen Marker auswählen.','info');return;}
    eventMarkers.splice(selectedEventMarker,1);selectedEventMarker=-1;renderEventMarkers();showNotice('Marker gelöscht.','success');
  });
  $('eventAnalyze')?.addEventListener('click',()=>{
    const hint=$('eventAnalysisHint');if(!eventMarkers.length){if(hint)hint.textContent='Für die Analyse wird mindestens ein Marker benötigt.';showNotice('Bitte zuerst einen Marker setzen.','info');return;}
    const marker=eventMarkers[selectedEventMarker>=0?selectedEventMarker:eventMarkers.length-1];eventAnalysisResults=analyzeEvent(marker);selectedEventResult=eventAnalysisResults.length?0:-1;renderEventResults();
    if(hint)hint.textContent=`${eventAnalysisResults.length} IDs ausgewertet · Marker: ${marker.text} · ${$('eventBeforeMs').value} ms vorher / ${$('eventAfterMs').value} ms nachher.`;
    showNotice(`Ereignis-Analyse abgeschlossen: ${eventAnalysisResults.length} Treffer.`,'success');
  });
  renderEventMarkers();
}
document.addEventListener('DOMContentLoaded',initEventAnalysisTab);
