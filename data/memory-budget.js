'use strict';
// Browser RAM is separate from device RAM. deviceMemory is a coarse capacity
// hint, not a measurement of free OS RAM. Leave most of it for other processes.
function browserBudgetForDevice(gib){
  const mib=1024*1024;
  return Number.isFinite(Number(gib))&&Number(gib)>0?Math.max(128*mib,Math.min(2048*mib,Number(gib)*1024*mib/4)):512*mib;
}
const memoryBudget={limit:0.8,fallback:browserBudgetForDevice(navigator.deviceMemory),reserved:0,sampledAt:-Infinity,estimated:0,lastNotice:-Infinity,storage:null};
function estimatedBrowserBytes(){
  // Conservative allowances include object/array/Map and scheduler overhead.
  return 8*1024*1024+frames.length*2048+overview.size*6144+previous.size*512+
    simEntries.length*4096+decodedRows.length*3072+txHistory.length*2048+
    loadedSession.length*1024+replayFrames.length*2048+Object.keys(labels).length*2048+
    dbcState.messages.size*16384+eventMarkers.length*1024+browserLog.bufferBytes*4+browserRxQueueSize*512;
}
function browserMemoryState(){
  const now=performance.now(),heap=performance.memory;
  if(now-memoryBudget.sampledAt>200){
    memoryBudget.estimated=estimatedBrowserBytes();memoryBudget.reserved=0;memoryBudget.sampledAt=now;
  }
  const measured=heap&&Number.isFinite(heap.jsHeapSizeLimit)&&heap.jsHeapSizeLimit>0&&Number.isFinite(heap.usedJSHeapSize)&&heap.usedJSHeapSize>=0;
  return {total:measured?heap.jsHeapSizeLimit:memoryBudget.fallback,
    used:(measured?heap.usedJSHeapSize:memoryBudget.estimated)+memoryBudget.reserved,
    estimated:!measured};
}
function formatMiB(bytes){return (Number(bytes)/1048576).toLocaleString(uiLocale(),{maximumFractionDigits:1});}
function updateMonitorMemoryStatus(state=browserMemoryState()){
  const el=$('monitorMemoryStatus');if(!el)return;
  updateLiveText(el,uiText`Browser-RAM-Budget: ${formatMiB(state.used)} / ${formatMiB(state.total)} MiB`);
}
function memoryNotice(message){
  if(performance.now()-memoryBudget.lastNotice<5000)return;
  if(message===undefined){
    const state=browserMemoryState();updateMonitorMemoryStatus(state);
    message=uiText`80-%-Grenze des Browser-RAM-Budgets erreicht: ${formatMiB(state.used)} / ${formatMiB(state.total)} MiB. Neue Monitor-Frames werden verworfen; Simulatoren laufen weiter. Bitte Daten exportieren oder Listen leeren.`;
  }
  memoryBudget.lastNotice=performance.now();showNotice(message,'warning',6000);
}
function admitBrowserBytes(bytes,notify=true){
  const state=browserMemoryState();
  if(!Number.isFinite(bytes)||bytes<0||state.used+bytes>state.total*memoryBudget.limit){if(notify)memoryNotice();return false;}
  memoryBudget.reserved+=bytes;return true;
}
function checkBrowserFile(file,multiplier=24){
  return admitBrowserBytes(Number(file.size)*multiplier);
}
function persistList(key,value){
  try{
    const text=JSON.stringify(value);
    let used=0;
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k!==key)used+=(k.length+(localStorage.getItem(k)||'').length)*2;}
    // Web Storage has its own small quota, independent of IndexedDB.
    if(used+(key.length+text.length)*2>5*1024*1024*memoryBudget.limit)throw new Error(uiText('80-%-Grenze für lokale Listen erreicht'));
    localStorage.setItem(key,text);return true;
  }catch(e){memoryNotice(uiText('Liste bleibt im Arbeitsspeicher, konnte aber nicht dauerhaft gespeichert werden. Bitte exportieren. ')+e.message);return false;}
}
async function checkBrowserStorage(bytes){
  let estimate;
  if(navigator.storage?.estimate)estimate=await navigator.storage.estimate();
  else{
    // The device is served over HTTP; StorageManager may be unavailable there.
    // Read session counters with a cursor instead of materializing all records.
    const db=await openLogDb();let usage=0;
    await new Promise((resolve,reject)=>{
      const request=db.transaction('sessions','readonly').objectStore('sessions').openCursor();
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return;}
        usage+=(cursor.value.totalBytes||0)*4+(cursor.value.totalFrames||0)*256+1024;cursor.continue();};
    });
    estimate={usage,quota:128*1024*1024,estimated:true};
  }
  memoryBudget.storage=estimate;
  // Include conservative IndexedDB record/index overhead.
  if(!estimate.quota||estimate.usage+bytes*4+65536>estimate.quota*memoryBudget.limit)throw new Error(uiText('80-%-Grenze des Browser-Dateispeichers erreicht'));
}
function updateMemoryStatus(status){
  const el=$('memoryBudgetStatus');if(!el)return;
  const b=browserMemoryState(),pct=(used,total)=>total?`${(100*used/total).toFixed(1)} %`:uiText('nicht vorhanden');
  updateMonitorMemoryStatus(b);
  const storage=memoryBudget.storage;
  updateLiveText(el,uiText`ESP32-RAM ${pct(status.heapTotal-status.freeHeap,status.heapTotal)} · PSRAM ${pct(status.psramTotal-status.psramFree,status.psramTotal)} · LittleFS ${pct(status.fsUsed,status.fsTotal)} · Browser-RAM ${pct(b.used,b.total)}${b.estimated?uiText` (Schätzung, Budget ${formatMiB(b.total)} MiB)`:''}${storage?uiText` · Browser-Dateispeicher ${pct(storage.usage,storage.quota)}${storage.estimated?uiText(' (Schätzung, Budget 128 MiB)'):''}`:''}`);
  if(status.logMemoryLimited&&!lastCanStatus?.logMemoryLimited)memoryNotice(uiText('ESP32-Logging wurde an der 80-%-Dateispeichergrenze gestoppt.'));
}

let fullFilterRevision=null,fullFilterLoading=false;
function displayServerFilter(text){
  // The device returns bare hexadecimal IDs; keep their base explicit even
  // when the rest of the page uses decimal IDs (or an ID ends in D).
  filterDisplayText=String(text||'').trim().split(/\s+/).filter(Boolean).map(id=>'0x'+id.replace(/^0x/i,'').toUpperCase()).join(' ');
  $('filterIds').value=filterDisplayText;
  $('filterIds').classList.toggle('filterActive',!!lastCanStatus?.filterEnabled&&!!filterDisplayText);
}
async function syncFullFilter(status){
  if(filterInputEditing||filterInputDirty)return;
  if($('filterMode'))$('filterMode').value=status.filterMode==='exclude'?'exclude':'include';
  if(!status.filterIdsTruncated){
    displayServerFilter(status.filterIds);fullFilterRevision=null;return;
  }
  if(fullFilterLoading||fullFilterRevision===status.filterRevision)return;
  if(!admitBrowserBytes((status.filterCount||0)*64))return;
  const generation=connectionGeneration;
  fullFilterLoading=true;
  try{
    const response=await deviceFetch('/api/filter/ids',{cache:'no-store'});if(!response.ok)throw new Error(uiText('Filter konnte nicht gelesen werden'));
    const text=await response.text();
    if(generation===connectionGeneration&&lastCanStatus?.filterRevision===status.filterRevision&&lastCanStatus?.filterIdsTruncated&&!filterInputEditing&&!filterInputDirty){displayServerFilter(text);fullFilterRevision=status.filterRevision;}
  }catch(e){memoryNotice(e.message);}finally{fullFilterLoading=false;}
}

const tablePageOffsets=new Map();
function tableWindow(list,id,renderPage){
  const size=200,last=Math.max(0,Math.ceil(list.length/size)-1)*size;
  const start=Math.min(tablePageOffsets.get(id)||0,last);tablePageOffsets.set(id,start);
  let pager=$(id+'Pages');
  if(!pager){
    pager=document.createElement('div');pager.id=id+'Pages';pager.className='sectionActionRow';
    $(id).closest('table').parentElement.insertAdjacentElement('afterend',pager);
  }
  pager.hidden=list.length<=size;
  pager.replaceChildren();
  for(const [text,offset,disabled] of [[uiText('Zurück'),Math.max(0,start-size),start===0],[uiText('Weiter'),start+size,start>=last]]){
    const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=disabled;
    button.onclick=()=>{tablePageOffsets.set(id,offset);renderPage();};pager.append(button);
  }
  const info=document.createElement('span');info.textContent=`${start+1}–${Math.min(start+size,list.length)} ${uiLanguage==='ja'?'／':uiLanguage==='en'?'of':'von'} ${list.length}`;pager.append(info);
  return list.slice(start,start+size);
}
