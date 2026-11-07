"""Run memory and list regression checks against the real UI in headless Chrome."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, subprocess, threading, tempfile, sys

ROOT = Path(__file__).resolve().parents[1]
TEST = r'''
window.testErrors=[];
const reportFetch=window.fetch.bind(window);
addEventListener('error',e=>testErrors.push(e.message));
addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));
const fixture={fw:'0.13.47',canRunning:true,listenOnly:true,bitrate:500000,
  heapTotal:300000,freeHeap:180000,psramTotal:8388608,psramFree:8388608,fsTotal:3500000,fsUsed:100000};
window.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('dbc/list')?{files:[{name:'first.dbc',size:100},{name:'selected.dbc',size:100}],maxSize:2800000}:fixture,text:async()=>String(url).includes('dbc/file')?'BO_ 291 PersistedDbc: 1 Vector__XXX':''});
addEventListener('load',()=>setTimeout(async()=>{
  const results=[];
  function check(ok,name){if(!ok)throw new Error(name);results.push(name);}
  try{
    check(typeof startSim==='function','app startup');
    const resetPost=post;let resetEndpoint='';
    post=async path=>{resetEndpoint=path;return {...fixture,errors:0,diagnosticEventCount:0};};
    browserRxDropped=42;browserFrameCount=123;browserRateLastCount=100;browserFrameRate=23;
    $('diagnosticEvents').textContent='old event';$('diagnosticEvents').hidden=false;
    $('diagnosticSelfTest').textContent='old result';$('diagnosticSelfTest').hidden=false;
    await $('resetDiagnosticPeaks').onclick();post=resetPost;
    check(resetEndpoint==='/api/diagnostics/reset'&&browserRxDropped===0&&browserFrameCount===0&&browserRateLastCount===0&&browserFrameRate===0,'diagnostic reset clears browser counters and calls device reset');
    check($('diagnosticEvents').hidden&&!$('diagnosticEvents').textContent&&$('diagnosticSelfTest').hidden&&!$('diagnosticSelfTest').textContent,'diagnostic reset removes loaded events and old self-test result');

    browserLog.lastError='';await loadLatestLogSession();
    check(browserLog.loaded&&!browserLog.lastError,'latest browser log loads without undefined batchBytes');

    const liveStatus=$('browserRxStatus');
    browserRxQueueSize=0;browserRxDropped=0;updateBrowserRxStatus();
    const liveNode=liveStatus.firstChild,selection=getSelection(),range=document.createRange();
    range.setStart(liveNode,0);range.setEnd(liveNode,7);selection.removeAllRanges();selection.addRange(range);
    const selectedStatus=selection.toString();
    updateBrowserRxStatus();
    check(liveStatus.firstChild===liveNode&&selection.toString()===selectedStatus,'unchanged live status preserves selection and text node');
    browserRxQueueSize=12;updateBrowserRxStatus();
    check(liveStatus.firstChild===liveNode&&selection.toString()===selectedStatus&&liveStatus.textContent.includes('12'),'changing queue count preserves selected status label');
    selection.removeAllRanges();browserRxQueueSize=0;updateBrowserRxStatus();

    if(!sessionStorage.getItem('preferences-reloaded')){
      saveUiPreferences();sessionStorage.setItem('preferences-defaults',localStorage.getItem(UI_PREFERENCES_KEY));
      $('search').value='123';$('direction').value='SIM';$('eventBeforeMs').value='900';$('eventOnlyChanges').checked=false;
      $('txId').value='0x1D';$('txDlc').value='2';txInputs()[0].value='AB';$('txRtr').click();
      $('simId').value='456';$('simDlc').value='4';$('simAddBytes').querySelector('input').value='EE';
      $('simReplaySpeed').value='2';$('changedOnly').click();
      $('search').dispatchEvent(new Event('input',{bubbles:true}));
      check(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)).values.search==='123','editing a field persists preferences');
      await loadDbcFile('selected.dbc',true);$('dbcEnabled').checked=true;await $('dbcEnabled').onchange();
      check(localStorage.getItem(DBC_ENABLED_KEY)==='1','DBC activation is saved');
      sessionStorage.setItem('preferences-reloaded','1');location.reload();return;
    }
    for(let i=0;i<100&&!dbcState.loaded;i++)await new Promise(resolve=>setTimeout(resolve,10));
    check($('dbcEnabled').checked&&dbcState.enabled,'DBC activation survives a page reload');
    check(dbcState.file==='selected.dbc'&&$('dbcSelect').value==='selected.dbc'&&dbcState.loaded&&dbcState.messages.has('S:291'),'selected DBC is reloaded and decoded after page reload');
    $('dbcEnabled').checked=false;await $('dbcEnabled').onchange();
    check(localStorage.getItem(DBC_ENABLED_KEY)==='0','DBC deactivation is saved');
    check($('search').value==='123'&&$('direction').value==='SIM','monitor preferences survive a page reload');
    check($('eventBeforeMs').value==='900'&&!$('eventOnlyChanges').checked,'event preferences survive a page reload');
    check($('txId').value==='0x1D'&&$('txDlc').value==='2'&&txInputs()[0].value==='AB'&&$('txRtr').checked,'TX draft and byte values survive a page reload');
    check($('simId').value==='456'&&$('simDlc').value==='4'&&$('simAddBytes').querySelector('input').value==='EE','simulator draft survives a page reload');
    check($('simReplaySpeed').value==='2'&&!$('changedOnly').checked,'replay and overview preferences survive a page reload');
    check(!txTimer&&!simRunning&&!randomSimRunning&&!replayRunning&&!browserLog.active,'restored inputs do not start any action');
    localStorage.setItem(UI_PREFERENCES_KEY,sessionStorage.getItem('preferences-defaults'));restoreUiPreferences();
    const cleanPreferences=JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY));
    localStorage.setItem(UI_PREFERENCES_KEY,JSON.stringify({...cleanPreferences,format:'HEX',values:{...cleanPreferences.values,txId:'0x1D'}}));
    idDisplayFormat='DEC';restoreUiPreferences();
    check($('txId').value==='29','saved ID draft follows a changed display format');
    idDisplayFormat='HEX';localStorage.setItem(UI_PREFERENCES_KEY,JSON.stringify(cleanPreferences));restoreUiPreferences();

    clearMonitor();
    addFrame({id:'123',data:'01',dlc:1,us:1000,source:'SIM'});render();
    $('pause').click();const pausedRows=$('frames').innerHTML;
    addFrame({id:'456',data:'02',dlc:1,us:2000,source:'SIM'});render();
    check($('frames').innerHTML===pausedRows&&frames.length===2,'pause freezes monitor even when a producer forces rendering while reception continues');
    $('pause').click();render();
    check($('frames').querySelectorAll('[data-monitor-uid]').length===2,'resume displays frames received during pause');
    clearMonitor();

    check($('headerVersion').textContent==='V0.13.47','displayed version updated');
    check($('simReplayLoop').checked,'endless replay enabled by default');
    $('simReplayLoop').checked=false;$('simReplayLoop').onchange();
    check(localStorage.getItem('deacsReplayLoop')==='0','replay preference saved');
    $('simReplayLoop').checked=true;$('simReplayLoop').onchange();
    const realReplayFrame=replayFrameToBrowser;
    let replayed=0;replayFrameToBrowser=()=>{replayed++;replayEmitted++;};
    replayFrames=[{_replayOffsetUs:0},{_replayOffsetUs:10000000}];
    replayRunning=true;replayIndex=0;replayStartedAt=performance.now()-11000;
    scheduleNextReplayFrame(replayGeneration);clearTimeout(replayTimer);
    check(replayRunning&&replayIndex===0&&replayed===2,'loop restarts after last frame');
    scheduleNextReplayFrame(replayGeneration);clearTimeout(replayTimer);
    check(replayed===3,'second replay cycle emits frames');
    $('simReplayLoop').checked=false;replayIndex=0;replayStartedAt=performance.now()-11000;
    scheduleNextReplayFrame(replayGeneration);
    check(!replayRunning,'single replay stops after last frame');
    $('simReplayLoop').checked=true;
    replayFrames=Array.from({length:1000},()=>({_replayOffsetUs:0}));replayRunning=true;replayIndex=0;replayStartedAt=performance.now();
    const before=replayed;scheduleNextReplayFrame(replayGeneration);clearTimeout(replayTimer);
    check(replayed-before<=256&&replayRunning,'large replay yields before exhausting same-time frames');
    const cancelledGeneration=replayGeneration;stopLogReplay();const stoppedAt=replayed;
    scheduleNextReplayFrame(cancelledGeneration);
    check(replayed===stoppedAt&&!replayRunning,'stop invalidates scheduled endless replay');
    replayFrameToBrowser=realReplayFrame;
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const modeEntry={id:'123',data:'FE 11',dlc:2,ms:100,enabled:true};
    const modeFrames=[];const modeOriginalAddFrame=addFrame;addFrame=f=>{modeFrames.push(f);return true;};
    for(const mode of SIM_DATA_MODES){
      const a=simulatorEntryRuntime({...modeEntry,mode}),b=simulatorEntryRuntime({...modeEntry,mode});
      for(let n=0;n<260;n++){
        browserSimulatorFrame(a);browserSimulatorFrame(b);
        const x=modeFrames.at(-2),y=modeFrames.at(-1);
        check(x.id==='123'&&x.dlc===2&&x.data.length===4,'mode preserves ID and DLC '+mode+' '+n);
        if(mode!=='random')check(x.data===y.data,'independent reproducible state '+mode+' '+n);
        if(mode==='fixed')check(x.data==='FE11','fixed bytes stay stable '+n);
        if(mode==='counter')check(x.data===((254+n)&255).toString(16).padStart(2,'0').repeat(2).toUpperCase(),'counter wraps '+n);
      }
      check(simulatorEntryRuntime({...modeEntry,mode,dlc:0}).bytes.length===0,'zero DLC '+mode);
      check(normalizeSimulatorEntry({...modeEntry,mode}).mode===mode,'mode import/export '+mode);
    }
    addFrame=modeOriginalAddFrame;
    check(normalizeSimulatorEntry({...modeEntry,dynamic:true}).mode==='fixed','legacy entries default to stable frames');
    const savedSimEntries=simEntries.slice(),savedBackend=simBackend;
    simEntries.splice(0,simEntries.length,{...modeEntry});renderSim();
    const modeSelect=document.querySelector('.simDataMode');
    check(modeSelect&&modeSelect.options.length===8&&modeSelect.value==='fixed','each frame offers eight modes, fixed by default');
    modeSelect.value='sine';modeSelect.onchange();
    check(simEntries[0].mode==='sine'&&loadSimulatorEntries()[0].mode==='sine'&&simulatorExportObject().frames[0].mode==='sine','row mode selection is persisted and exported');
    renderSim();check(document.querySelector('.simDataMode').value==='sine','row mode selection survives redraw');

    simEntries.length=0;simEntries.push({id:'1A1',data:'00',dlc:1,ms:10,enabled:true},{id:'1A2',data:'01',dlc:1,ms:30,enabled:true},{id:'1A3',data:'02',dlc:1,ms:10,enabled:false});
    simBackend='browser';$('simRepeatMode').value='once';$('simRepeatMode').onchange();
    check(localStorage.getItem('deacsSimulatorMode')==='once'&&$('simReplayLoop').checked,'simulator mode saved independently of log loop');
    await startSim();check($('simRepeatMode').disabled,'simulator mode locked while running');await wait(100);
    check(browserSimGenerated===2&&!simRunning&&browserSimTimers.length===0,'one-shot emits each enabled frame once and stops');
    await startSim();await wait(100);
    check(browserSimGenerated===2&&!simRunning,'one-shot can be restarted');
    $('simRepeatMode').value='endless';await startSim();await wait(100);
    check(browserSimGenerated>2&&simRunning,'endless simulator repeats independently');
    activateTab('monitor');render();
    check($('frames').children.length>0,'running simulator fills monitor');
    setToggleButton('autoscroll',false);
    selectedMonitorFrameUid=frames[0]._monitorUid;
    $('clear').click();
    check(frames.length===0&&previous.size===0&&totalReceived===0,'clear resets monitor capture');
    check($('frames').children.length===0&&$('visibleCount').textContent==='0'&&selectedMonitorFrameUid===null,'clear removes rows with auto-scroll disabled immediately');
    check(simRunning&&!$('autoscroll').checked,'clear preserves simulator and scroll settings');
    await wait(100);
    render();check(frames.length>0&&$('frames').querySelectorAll('tr[data-monitor-uid]').length>0,'simulator updates monitor rows while auto-scroll is disabled');
    $('scrollToEnd').click();
    check($('frames').children.length>0,'resume shows new simulator frames');
    $('clear').click();
    check($('frames').children.length===0,'clear removes live snapshot immediately');

    await stopSim();const stoppedCount=browserSimGenerated;await wait(60);
    check(browserSimGenerated===stoppedCount&&!simRunning,'stop cancels endless simulator timers');

    frames.length=0;overview.clear();previous.clear();latestOverviewLive.clear();
    for(let i=0;i<1250;i++)addFrame({id:'123',data:'00',dlc:1,us:i*1000});
    setToggleButton('autoscroll',true);render();
    const scrollWrap=document.querySelector('.monitorTable');
    scrollWrap.scrollTop=5000;scrollWrap.dispatchEvent(new Event('scroll'));render();
    check(!$('autoscroll').checked,'manual scrolling disables auto-scroll');
    const heldTop=scrollWrap.scrollTop;
    const anchor=[...$('frames').querySelectorAll('tr[data-monitor-uid]')].find(tr=>tr.getBoundingClientRect().top>=scrollWrap.getBoundingClientRect().top+40);
    const anchorUid=anchor.dataset.monitorUid,anchorTop=anchor.getBoundingClientRect().top;
    for(let i=0;i<100;i++)addFrame({id:'123',data:'01',dlc:1,us:(1250+i)*1000});
    render();
    const retained=$('frames').querySelector('tr[data-monitor-uid="'+anchorUid+'"]');
    check(scrollWrap.scrollTop===heldTop&&retained&&Math.abs(retained.getBoundingClientRect().top-anchorTop)<1,'incoming frames preserve viewport and visible rows above 1200 frames');
    check(frames.length===1350&&$('frames').querySelectorAll('tr[data-monitor-uid]').length<=1200,'continued capture keeps rendered rows bounded');
    scrollWrap.scrollTop=scrollWrap.scrollHeight;scrollWrap.dispatchEvent(new Event('scroll'));render();
    check($('frames').querySelector('tr[data-monitor-uid="'+frames[frames.length-1]._monitorUid+'"]'),'new frames remain reachable by manual scrolling');
    $('scrollToEnd').click();
    check($('autoscroll').checked&&scrollWrap.scrollHeight-scrollWrap.scrollTop-scrollWrap.clientHeight<2,'jump to end resumes automatic scrolling');

    clearMonitor();
    const originalAddFrame=addFrame;let processedRx=[];
    addFrame=frame=>{processedRx.push(frame.us);return true;};
    const burstFrames=Array.from({length:BROWSER_RX_QUEUE_LIMIT+300},(_,i)=>({id:'123',data:'00',dlc:1,us:i}));
    enqueueBrowserRx(burstFrames);
    check(browserRxQueueSize===BROWSER_RX_QUEUE_LIMIT&&browserRxDropped===300,'RX overload is bounded and counts discarded browser frames');
    const pendingTimer=browserRxTimer;clearTimeout(pendingTimer);browserRxTimer=null;
    processBrowserRx();
    check(processedRx.length>0&&processedRx.length<=BROWSER_RX_SLICE_FRAMES&&browserRxQueueSize>0,'RX processing yields after a bounded slice');
    let uiResponded=false;setTimeout(()=>{uiResponded=true;},0);await wait(30);
    check(uiResponded&&browserRxQueueSize>0,'UI timers run before RX backlog is exhausted');
    updateBrowserRxStatus();
    check($('browserRxStatus').textContent.includes('300')&&$('browserRxStatus').classList.contains('browserRxOverload'),'browser RX loss is visible');
    resetBrowserRx();processedRx=[];
    enqueueBrowserRx(burstFrames.slice(0,200));
    for(let i=0;i<100&&browserRxQueueSize;i++)await wait(10);
    check(browserRxQueueSize===0&&processedRx.length===200&&processedRx.every((us,i)=>us===i),'normal RX bursts are processed in order without loss');
    enqueueBrowserRx(burstFrames.slice(0,100));clearMonitor();await wait(20);
    check(browserRxQueueSize===0&&processedRx.length===200&&browserRxDropped===0,'clear also cancels pending RX work');
    addFrame=originalAddFrame;
    let rxHeartbeats=0;const rxHeartbeat=setInterval(()=>rxHeartbeats++,0);
    enqueueBrowserRx(Array.from({length:2000},(_,i)=>({id:'123',data:'00',dlc:1,us:i})));
    for(let i=0;i<300&&browserRxQueueSize;i++)await wait(10);
    clearInterval(rxHeartbeat);
    check(frames.length===2000&&browserRxDropped===0&&rxHeartbeats>1&&frames.every((frame,i)=>frame.us===i),'real frame normalization remains ordered and yields to UI timers during a 2000-frame burst');
    render();
    check($('frames').querySelectorAll('tr[data-monitor-uid]').length<150,'monitor renders only a viewport-sized working set');
    check(Number($('visibleCount').textContent)===frames.filter(createMonitorMatcher()).length,'displayed count covers every filtered frame rather than only rendered DOM rows');
    setToggleButton('autoscroll',false);scrollWrap.scrollTop=0;render();
    const heldRow=$('frames').querySelector('tr[data-monitor-uid]');
    addFrame({id:'123',data:'01',dlc:1,us:2001});render();
    check($('frames').querySelector('tr[data-monitor-uid]')===heldRow,'unmoved monitor viewport reuses existing DOM rows');
    setToggleButton('autoscroll',true);clearMonitor();
    simEntries[0].ms=1000;simEntries[1].ms=1000;$('simRepeatMode').value='once';await startSim();await stopSim();await wait(30);
    check(browserSimGenerated===0&&!simRunning,'one-shot can be stopped before its first frame');
    const originalPost=post,calls=[];let run=40;
    post=async(url,data)=>{calls.push({url,data});return url==='/api/sim/start'?{simulator:true,simRunId:++run}:{};};
    simBackend='esp32';esp32SimRunId=null;simRunning=false;
    syncSimulatorRun({simulator:true,simRunId:39,simLoop:false});
    check(simRunning&&esp32SimRunId===39&&$('simToggle').getAttribute('aria-pressed')==='true','page adopts already running ESP32 simulator');
    check($('simRepeatMode').value==='once'&&$('simRepeatMode').disabled,'page adopts ESP32 repeat mode');
    await $('simToggle').onclick();
    check(calls.some(call=>call.url==='/api/sim/stop')&&!simRunning,'adopted simulator can be stopped');
    syncSimulatorRun({simulator:false,simRunId:39});
    check(!simRunning&&!$('simRepeatMode').disabled,'stopped ESP32 status unlocks controls');
    await startSim();
    check(calls.find(call=>call.url==='/api/sim/start').data.loop===0,'ESP32 one-shot parameter transmitted');
    syncSimulatorRun({simulator:false,simRunId:40});check(simRunning,'stale status cannot stop a newer simulator run');
    syncSimulatorRun({simulator:false,simRunId:41});check(!simRunning&&!$('simRepeatMode').disabled,'matching ESP32 completion resets UI');
    calls.length=0;$('simRepeatMode').value='endless';await startSim();
    check(calls.find(call=>call.url==='/api/sim/start').data.loop===1,'ESP32 endless parameter transmitted');
    await stopSim();post=originalPost;simBackend=savedBackend;simEntries.length=0;simEntries.push(...savedSimEntries);


    const dbcFetch=deviceFetch,savedDbc={...dbcState};
    const pendingDbc=new Map();
    deviceFetch=url=>new Promise(resolve=>pendingDbc.set(String(url).split('name=')[1].split('&')[0],resolve));
    const firstDbc=loadDbcFile('first.dbc',true),secondDbc=loadDbcFile('second.dbc',true);
    pendingDbc.get('second.dbc')({ok:true,text:async()=> 'BO_ 291 NewMessage: 1 Vector__XXX'});await secondDbc;
    pendingDbc.get('first.dbc')({ok:true,text:async()=> 'BO_ 111 OldMessage: 1 Vector__XXX'});await firstDbc;
    check(dbcState.file==='second.dbc'&&dbcState.messages.has('S:291')&&!dbcState.messages.has('S:111'),'late DBC response cannot replace newer selection');
    const disabledDbc=loadDbcFile('disabled.dbc',true);
    $('dbcEnabled').checked=false;await $('dbcEnabled').onchange();
    pendingDbc.get('disabled.dbc')({ok:true,text:async()=> 'BO_ 111 OldMessage: 1 Vector__XXX'});await disabledDbc;
    check(!dbcState.loaded&&dbcState.messages.size===0,'DBC disable invalidates pending load');
    deviceFetch=async()=>({ok:true,json:async()=>({files:[{name:'replacement.dbc',size:100}],maxSize:1000})});
    dbcState.enabled=false;dbcState.loaded=true;dbcState.messages=new Map([['S:111',{}]]);
    await refreshDbcList({quiet:true});
    check(dbcState.file==='replacement.dbc'&&!dbcState.loaded&&dbcState.messages.size===0,'DBC list change discards removed file decoder');
    deviceFetch=dbcFetch;dbcState=savedDbc;
    const startPost=post;let startCommands=[];
    simBackend='esp32';
    post=async url=>{startCommands.push(url);connectionGeneration++;return {};};
    let interrupted=false;try{await startEsp32Simulator([{id:'123',data:'00',dlc:1,ms:100,enabled:true}]);}catch(_){interrupted=true;}
    check(interrupted&&startCommands.length===1,'connection change cancels remaining simulator upload commands');
    post=startPost;simBackend=savedBackend;
    const syncFixture={...fixture,filterEnabled:true,filterMode:'exclude',filterIds:'123 1D',filterRevision:1};
    const savedDeviceFetch=deviceFetch,savedConnection=wsConnected;
    wsConnected=true;simBackend='esp32';
    filterDisplayText='0x999';filterInputEditing=false;filterInputDirty=false;
    setStatus(syncFixture);
    check($('filterIds').value==='0x123 0x1D','ESP32 filter replaces stale local filter');
    const savedIdFormat=idDisplayFormat;idDisplayFormat='DEC';
    check(filterPayload($('filterIds').value)==='0x123 0x1D','synced filter preserves hexadecimal IDs in decimal display');
    idDisplayFormat=savedIdFormat;
    filterInputDirty=true;$('filterIds').value='0x456';
    setStatus({...syncFixture,filterIds:'789',filterRevision:2});
    check($('filterIds').value==='0x456','incoming filter status preserves unsaved edits');
    filterInputDirty=false;
    let resolveFilter;
    deviceFetch=()=>new Promise(resolve=>{resolveFilter=resolve;});
    setStatus({...syncFixture,filterIdsTruncated:true,filterCount:40,filterRevision:3,filterMode:'include'});
    check($('filterMode').value==='include'&&fullFilterLoading,'large filter immediately updates mode');
    setStatus({...syncFixture,filterIds:'456',filterRevision:4});
    resolveFilter({ok:true,text:async()=> '999'});await wait(0);
    check($('filterIds').value==='0x456'&&!fullFilterLoading,'delayed large filter cannot overwrite newer filter');
    setStatus({...syncFixture,filterIdsTruncated:true,filterCount:40,filterRevision:5});
    resolveFilter({ok:true,text:async()=> '123 1D'});await wait(0);
    check($('filterIds').value==='0x123 0x1D'&&fullFilterRevision===5,'complete large filter is adopted');
    fullFilterRevision=null;
    setStatus({...syncFixture,filterIdsTruncated:true,filterCount:40,filterRevision:6});
    connectionGeneration++;
    resolveFilter({ok:true,text:async()=> 'BAD'});await wait(0);
    check($('filterIds').value==='0x123 0x1D','filter response from previous connection is ignored');
    deviceFetch=savedDeviceFetch;
    esp32SimRunId=null;simRunning=false;
    syncSimulatorRun({simulator:true,simRunId:1,simLoop:true,simLiveTx:true});
    check($('liveTxSimulator').checked&&$('liveTxSimulator').disabled,'running ESP32 simulator adopts and locks actual live TX setting');
    syncSimulatorRun({simulator:false,simRunId:1});
    check(!$('liveTxSimulator').disabled,'simulator stop unlocks live TX setting');
    $('liveTxSimulator').checked=false;
    setStatus({...syncFixture,canRunning:true,listenOnly:false});
    check(!txSendingBlocked&&!$('send').disabled,'connected live CAN enables TX');
    const liveStyle=getComputedStyle($('canMode')),reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
    check($('canMode').dataset.liveSource==='can'&&liveStyle.color==='rgb(78, 224, 161)'&&(reducedMotion?liveStyle.boxShadow!=='none':liveStyle.animationName==='deacsSimulatorButtonGlow'),'CAN LIVE glows green without a simulator or other TX source, including reduced motion');
    const activityFlags=[simRunning,randomSimRunning,replayRunning];
    for(const [label,color] of [['SIM','rgb(78, 224, 161)'],['GEN','rgb(111, 198, 255)'],['LOG','rgb(255, 208, 154)']]){
      simRunning=label==='SIM';randomSimRunning=label==='GEN';replayRunning=label==='LOG';
      updateCanLiveSourceStyle({...syncFixture,canRunning:true,listenOnly:false});
      const badge=$('canMode').querySelector('.canActiveSource');
      check($('canMode').textContent==='CAN LIVE · '+label&&getComputedStyle(badge).color===color,'CAN LIVE identifies active '+label+' with its source color');
    }
    simRunning=randomSimRunning=replayRunning=true;updateCanLiveSourceStyle({...syncFixture,canRunning:true,listenOnly:false});
    check($('canMode').textContent==='CAN LIVE · SIM + GEN + LOG'&&$('canMode').querySelectorAll('.canActiveSource').length===3,'CAN LIVE shows simultaneous sources separately');
    [simRunning,randomSimRunning,replayRunning]=activityFlags;updateCanLiveSourceStyle({...syncFixture,canRunning:true,listenOnly:false});
    txTimer=setInterval(()=>{},1000);setTxEditorLocked(true);
    setConnectionState('Getrennt','offline');
    check(txSendingBlocked&&$('send').disabled&&!txTimer&&!txEditorLocked,'connection loss disables TX and stops browser TX cycle');
    check(!$('canMode').classList.contains('sourceAura'),'connection loss removes CAN LIVE glow immediately');
    setStatus({...syncFixture,canRunning:true,listenOnly:false});
    check(txSendingBlocked,'delayed live status cannot enable TX while offline');
    setConnectionState('Verbunden','online');
    check(txSendingBlocked,'reconnect waits for fresh CAN status');
    setStatus({...syncFixture,canRunning:true,listenOnly:false});
    check(!txSendingBlocked,'fresh CAN status enables TX after reconnect');
    setStatus({...syncFixture,canRunning:true,listenOnly:true});
    check(txSendingBlocked&&$('mode').value==='listen','external CAN mode change updates TX and settings');
    check(!$('canMode').classList.contains('sourceAura'),'listen-only does not glow as live TX');
    updateCanModeState({...syncFixture,canRunning:true,listenOnly:false,twaiState:'BUS_OFF'});
    check(!$('canMode').classList.contains('sourceAura'),'bus-off cannot retain CAN LIVE glow');
    updateCanModeState({...syncFixture,canRunning:true,listenOnly:true,twaiState:'RUNNING'});
    setConnectionState('Getrennt','offline');wsConnected=savedConnection;simBackend=savedBackend;
    Object.defineProperty(performance,'memory',{configurable:true,value:undefined});
    check(browserBudgetForDevice(8)===2048*1024*1024&&browserBudgetForDevice(.5)===128*1024*1024&&browserBudgetForDevice(undefined)===512*1024*1024,'estimated browser budget adapts to device capacity');
    memoryBudget.fallback=128*1024*1024;
    memoryBudget.sampledAt=-Infinity;
    check(browserMemoryState().estimated,'fallback explicitly estimated');
    check(!admitBrowserBytes(128*1024*1024,false),'over-budget allocation rejected');
    check(admitBrowserBytes(1024,false),'small allocation accepted');
    simEntries.length=0;
    for(let i=0;i<501;i++)simEntries.push({id:i.toString(16),data:'00',dlc:1,ms:100,enabled:true});
    renderSim();
    check(simEntries.length===501&&$('simRows').rows.length===200,'sim list grows beyond 16 and paginates');
    $('simRowsPages').querySelectorAll('button')[1].click();
    check($('simRows').rows[0].dataset.simIndex==='200','sim page retains global indices');
    $('simRows').querySelector('.simDelete').click();
    check(simEntries.length===500&&simEntries[200].id===(201).toString(16),'page action deletes correct entry');
    txHistory=[];
    for(let i=0;i<251;i++)recordTxHistory({id:i.toString(16),data:'00',dlc:1});
    flushTxHistory();
    check(txHistory.length===251&&$('txHistoryRows').rows.length===200,'TX history grows beyond 50 and paginates');
    persistList('budget-test',{old:true});
    check(!persistList('budget-test','x'.repeat(3*1024*1024)),'local storage 80% rejection');
    check(JSON.parse(localStorage.getItem('budget-test')).old,'rejection retains prior stored data');
    localStorage.removeItem('budget-test');
    Object.defineProperty(performance,'memory',{configurable:true,value:{jsHeapSizeLimit:100000000,usedJSHeapSize:80000000}});
    memoryBudget.sampledAt=-Infinity;
    check(!admitBrowserBytes(1,false),'measured 80% boundary rejects growth');
    Object.defineProperty(performance,'memory',{configurable:true,value:{jsHeapSizeLimit:100000000,usedJSHeapSize:1000000}});
    memoryBudget.sampledAt=-Infinity;
    check(browserMemoryState().used===1000000,'measured heap usage replaces conservative model estimate');

    Object.defineProperty(performance,'memory',{configurable:true,value:undefined});memoryBudget.sampledAt=-Infinity;
    frames.length=0;overview.clear();previous.clear();latestOverviewLive.clear();
    for(let i=0;i<10500;i++)addFrame({id:'123',data:'00',dlc:1,us:i*1000});
    check(frames.length===10500,'monitor grows beyond former 10000 limit');
    updateCounts();updateMonitorMemoryStatus();
    check(!$('bufferCount').parentElement.textContent.includes('/10000'),'monitor removes obsolete 10000-frame limit');
    check($('monitorMemoryStatus').textContent.includes('128 MiB')&&!$('monitorMemoryStatus').textContent.includes('Sch\u00e4tzung')&&!$('monitorMemoryStatus').textContent.includes('Grenze'),'monitor shows RAM budget without removed qualifiers');
    memoryBudget.lastNotice=-Infinity;memoryNotice();
    check($('appNoticeText').textContent.includes('Browser-RAM-Budget')&&$('appNoticeText').textContent.includes('MiB'),'memory warning identifies browser budget and sizes');

    memoryBudget.fallback=1;memoryBudget.sampledAt=-Infinity;
    const count=frames.length;addFrame({id:'124',data:'00',dlc:1,us:12000000});
    check(frames.length===count&&!overview.has('S:124'),'full monitor rejects new frame without partial entry');
    const oldReceived=totalReceived,oldDrops=browserRxDropped;
    const simRuntime=simulatorEntryRuntime({id:'123',data:'00',dlc:1,ms:10,mode:'counter'});
    const generatedBefore=browserSimGenerated;
    browserSimulatorFrame(simRuntime);browserSimulatorFrame(simRuntime);
    check(browserSimGenerated===generatedBefore+2&&simRuntime.bytes[0]===1&&totalReceived===oldReceived+2,'simulator generation and receive counters continue when monitor is full');
    check(browserRxDropped===oldDrops+2&&frames.length===count,'rejected simulator frames are counted without erasing existing data');
    memoryBudget.fallback=128*1024*1024;memoryBudget.sampledAt=-Infinity;
    const budgetBackend=simBackend,budgetMode=$('simRepeatMode').value;
    simBackend='browser';$('simRepeatMode').value='endless';
    simRunning=startBrowserSimulator([{id:'123',data:'00',dlc:1,ms:10,enabled:true}]);
    memoryBudget.fallback=1;memoryBudget.sampledAt=-Infinity;
    const runningTimers=browserSimTimers.slice(),runningGenerated=browserSimGenerated;
    await wait(60);
    check(simRunning&&browserSimGenerated>runningGenerated,'real simulator timers continue with an exhausted monitor budget');
    restartBrowserSimulatorIfRunning();
    check(simRunning&&runningTimers.every((timer,index)=>timer===browserSimTimers[index]),'failed memory-limited restart retains the running simulator');
    await stopSim();simBackend=budgetBackend;$('simRepeatMode').value=budgetMode;
    memoryBudget.fallback=128*1024*1024;memoryBudget.sampledAt=-Infinity;
    const confirmOriginal=askConfirm;askConfirm=async()=>true;
    const imported=Array.from({length:500},(_,i)=>({id:'123',data:'00',dlc:1,us:i*1000}));
    await importFramesIntoView(imported);
    check(frames.length===500&&loadedSession.length===500,'preflighted import retains the complete admitted list');
    memoryBudget.fallback=1;memoryBudget.sampledAt=-Infinity;
    await importFramesIntoView(imported);
    check(frames.length===500,'rejected import preserves current monitor');
    memoryBudget.fallback=128*1024*1024;memoryBudget.sampledAt=-Infinity;askConfirm=confirmOriginal;
    await checkBrowserStorage(100);
    const nativeEstimate=navigator.storage.estimate.bind(navigator.storage);
    navigator.storage.estimate=async()=>({usage:0,quota:10*1024*1024});
    await startBrowserLog();
    check(browserLog.active,'logging starts below quota');
    browserLog.buffer=[{line:'pending-line\r\n',bytes:14}];browserLog.bufferBytes=14;browserLog.totalFrames=1;
    navigator.storage.estimate=async()=>({usage:8*1024*1024,quota:10*1024*1024});
    const flush=flushBrowserLog();
    browserLog.buffer.push({line:'second-line\r\n',bytes:13});browserLog.bufferBytes+=13;browserLog.totalFrames++;
    const sameFlush=flushBrowserLog();
    check(flush===sameFlush,'only one write batch in flight');
    await flush;
    check(!browserLog.active&&browserLog.buffer.length===2&&browserLog.buffer[0].line==='pending-line\r\n','quota failure retains concurrent batches in capture order');
    const oldSession=browserLog.sessionId;
    await startBrowserLog();
    check(browserLog.sessionId===oldSession&&browserLog.buffer.length===2,'restart cannot overwrite unpersisted data');
    let exported='';
    const originalDownload=triggerTextDownload;
    triggerTextDownload=(name,parts)=>{exported+=parts.join('');};
    await exportBrowserLog();
    check(exported.includes('pending-line'),'CSV export includes unpersisted batch');
    exported='';await saveBrowserLog();
    // The export dialog deliberately remains busy until its completion callback.
    if(!exported){logExportBusy=false;await saveBrowserLog();}
    check(exported.includes('pending-line')&&exported.includes('DEACS-DLOG'),'DLOG export includes unpersisted batch');
    triggerTextDownload=originalDownload;navigator.storage.estimate=nativeEstimate;
    navigator.storage.estimate=undefined;
    await checkBrowserStorage(100);
    check(memoryBudget.storage.estimated,'HTTP storage fallback remains usable and explicitly estimated');
    navigator.storage.estimate=nativeEstimate;

    const settingsDownload=downloadJson,settingsConfirm=askConfirm,settingsPost=post;
    let settingsExport=null,settingsCalls=[];
    downloadJson=(name,object)=>{settingsExport=JSON.parse(JSON.stringify(object));};
    await $('settingsSave').onclick();
    check(settingsExport?.format==='DEACS-Settings'&&settingsExport.version===1&&Array.isArray(settingsExport.simulator),'settings save exports a versioned configuration file');
    const settingsProfile=JSON.parse(JSON.stringify(settingsExport));
    settingsProfile.values.search='saved-filter';settingsProfile.values.direction='RX';settingsProfile.values.eventBeforeMs='900';
    settingsProfile.values.bitrate='250000';settingsProfile.values.mode='listen';settingsProfile.values.filterMode='include';settingsProfile.values.filterIds='0x123 0x456';
    settingsProfile.serverFilter={enabled:true,mode:'include',ids:'0x123 0x456'};
    settingsProfile.checks.liveTxSimulator=true;settingsProfile.checks.liveTxGenerator=true;settingsProfile.checks.liveTxLog=true;
    settingsProfile.checks.dbcEnabled=false;settingsProfile.toggles.changedOnly=false;settingsProfile.toggles.autoscroll=false;
    settingsProfile.byteGroups.txBytes[0]='AB';settingsProfile.simulator=[{id:'456',data:'01 02',dlc:2,ms:100,enabled:true}];
    settingsProfile.labels={'123':'settings-label'};settingsProfile.decoded=[];
    post=async(url,data)=>{settingsCalls.push({url,data});return {...fixture,bitrate:250000,simulator:false,simRunId:99,filterEnabled:true,filterMode:'include',filterIds:'123 456',filterRevision:30};};
    askConfirm=async()=>false;
    const settingsBefore=simEntries.length;
    check(await loadSettingsObject(settingsProfile)===false&&simEntries.length===settingsBefore&&settingsCalls.length===0,'cancelled settings import preserves data and sends no commands');
    let rejectedSettings=false;try{await loadSettingsObject({...settingsProfile,version:999});}catch(_){rejectedSettings=true;}
    check(rejectedSettings&&settingsCalls.length===0,'unsupported settings version is rejected before any changes');
    rejectedSettings=false;try{await loadSettingsObject({...settingsProfile,values:{...settingsProfile.values,mode:'invalid'}});}catch(_){rejectedSettings=true;}
    check(rejectedSettings&&settingsCalls.length===0,'invalid CAN settings are rejected before any commands');
    askConfirm=async()=>true;wsConnected=false;simBackend='browser';
    const settingsFrameCount=frames.length;
    await loadSettingsObject(settingsProfile);
    check($('search').value==='saved-filter'&&$('direction').value==='RX'&&$('eventBeforeMs').value==='900'&&txInputs()[0].value==='AB','settings import restores filters and editor values');
    check($('liveTxSimulator').checked&&$('liveTxGenerator').checked&&$('liveTxLog').checked&&!$('changedOnly').checked&&!$('autoscroll').checked,'settings import restores checkboxes and toggles');
    check(simEntries.length===1&&simEntries[0].id==='456'&&labels['123']==='settings-label'&&decodedRows.length===0,'settings import restores simulator and label definitions');
    check(pendingDeviceSettings?.bitrate==='250000'&&!$('settingsApplyDevice').hidden&&settingsCalls.length===0,'offline settings import stages device values without sending commands');
    check(!simRunning&&!randomSimRunning&&!replayRunning&&!txTimer&&frames.length===settingsFrameCount,'settings import does not start traffic or replace captured CAN data');
    wsConnected=true;simBackend='esp32';
    await $('settingsApplyDevice').onclick();
    check(settingsCalls.length===2&&settingsCalls[0].url==='/api/can'&&settingsCalls[1].url==='/api/filter'&&settingsCalls[1].data.ids==='0x123 0x456','device settings explicitly apply CAN configuration and complete server filter');
    check(!pendingDeviceSettings&&$('settingsApplyDevice').hidden&&!localStorage.getItem(PENDING_DEVICE_SETTINGS_KEY),'successful device apply clears staged settings');
    settingsCalls=[];
    await loadSettingsObject(settingsProfile);
    check(settingsCalls.some(call=>call.url==='/api/can')&&settingsCalls.some(call=>call.url==='/api/filter')&&!settingsCalls.some(call=>/sim\/start|api\/send|log\/start/.test(call.url)),'connected settings import applies configuration without starting transmission');

    const failedSettingsPost=post;
    pendingDeviceSettings={bitrate:'250000',mode:'listen',filter:{enabled:true,mode:'include',ids:'0x123'}};
    updateSettingsDeviceDraft();post=async url=>{throw new Error('test transport failure');};
    check(await applySettingsToDevice()===false&&pendingDeviceSettings&&!$('settingsApplyDevice').hidden,'failed device import remains staged for retry');
    post=failedSettingsPost;await applySettingsToDevice();
    const exportDeviceFetch=deviceFetch;
    deviceFetch=async()=>({ok:true,text:async()=>Array.from({length:40},(_,i)=>(0x100+i).toString(16)).join(' ')});
    lastCanStatus={...fixture,filterEnabled:true,filterIdsTruncated:true,filterRevision:35};filterInputDirty=false;
    await saveSettingsFile();
    check(settingsExport.serverFilter.ids.split(' ').length===40,'settings export includes complete server filters beyond status preview');
    deviceFetch=async()=>({ok:true,json:async()=>({files:[{name:'available.dbc',size:100}],maxSize:1000})});
    const missingDbcProfile=JSON.parse(JSON.stringify(settingsProfile));missingDbcProfile.values.dbcSelect='missing.dbc';missingDbcProfile.checks.dbcEnabled=true;
    wsConnected=false;simBackend='browser';await loadSettingsObject(missingDbcProfile);
    check(dbcState.file==='missing.dbc'&&$('dbcSelect').value==='missing.dbc'&&!dbcState.loaded&&dbcState.error.includes('missing.dbc'),'settings import preserves a missing DBC reference and reports it');
    deviceFetch=exportDeviceFetch;
    const fileTarget={files:[new File([JSON.stringify(settingsProfile)],'settings.json',{type:'application/json'})],value:'settings.json'};
    await $('settingsFile').onchange({target:fileTarget});
    check(fileTarget.value===''&&$('search').value==='saved-filter','settings file picker reads JSON and resets file selection for reuse');
    post=settingsPost;askConfirm=settingsConfirm;downloadJson=settingsDownload;
    wsConnected=false;simBackend='browser';
    check(testErrors.length===0,'no startup/runtime errors: '+testErrors.join(';'));
    await reportFetch('/test-result',{method:'POST',body:JSON.stringify({ok:true,results})});
  }catch(e){await reportFetch('/test-result',{method:'POST',body:JSON.stringify({ok:false,error:e.stack,results,testErrors})});}
},100));
'''

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT/'data'),**kw)
    def log_message(self,*a): pass
    def do_POST(self):
        server.result=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200);self.end_headers();server.finished.set()
    def do_GET(self):
        if self.path=='/':
            html=(ROOT/'data/index.html').read_text(encoding='utf-8')
            html=html.replace('<head>','<head><script>'+TEST+'</script>',1)
            body=html.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body)
        else: super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server.finished=threading.Event()
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='deacs-browser-',ignore_cleanup_errors=True) as profile:
    browser=next(path for path in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe') if Path(path).exists())
    process=subprocess.Popen([browser,'--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,f'http://127.0.0.1:{server.server_port}/'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        if not server.finished.wait(35):raise SystemExit('Browser produced no test result')
        data=server.result;print(json.dumps(data,ensure_ascii=False,indent=2))
    finally:
        process.terminate();process.wait(timeout=10)
    if not data['ok']:raise SystemExit(1)
server.shutdown()
