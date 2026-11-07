"""Verify DE/EN/JA switching in the real UI, including the standalone USB file."""
from http.server import ThreadingHTTPServer
from pathlib import Path
import json, subprocess, tempfile, threading, sys
from test_web_serial import Handler, ROOT

CHECKS = r'''
addEventListener('load',()=>setTimeout(async()=>{
 const results=[];
 const check=(ok,name)=>{if(!ok)throw new Error(name);results.push(name);};
 const report=result=>reportFetch(window.serialReportURL,{method:'POST',body:JSON.stringify(result)});
 try{
  if(sessionStorage.getItem('language-reload')){
   check(uiLanguage==='ja'&&document.documentElement.lang==='ja','Japanese survives reload');
   check($('clear').textContent==='クリア','Japanese applied before app initialization');
   await report({ok:true,results:JSON.parse(sessionStorage.getItem('language-results')).concat(results),errors:serialTestErrors});return;
  }
  check(uiLanguage==='de'&&$('clear').textContent==='Leeren','German remains the default');
  const oldSocket=socket,generation=connectionGeneration,oldFrameList=frames;
  $('search').value='123';$('autoscroll').click();
  labels['123']='Löschen';simEntries.splice(0,simEntries.length,{id:'123',data:'AA 55',dlc:2,ms:100,enabled:true,name:'Änderungen'});
  addFrame({type:'frame',id:'123',dlc:2,data:'AA55',us:123456,sim:true,dir:'RX'});
  renderLabels();renderSim();
  const activeBefore=activeTab;$('languageToggle').click();
  check(activeTab===activeBefore&&$('languageToggle').parentElement.tagName==='NAV','language button is separate from tab navigation');
  const languageBox=$('languageToggle').getBoundingClientRect(),settingsBox=document.querySelector('nav [data-tab="settings"]').getBoundingClientRect();
  check(languageBox.left-settingsBox.right>=18&&Math.abs(languageBox.right-document.querySelector('nav').getBoundingClientRect().right+12)<2,'language button is right aligned with a separate gap');
  check(uiLanguage==='en'&&document.documentElement.lang==='en','language selector switches to English');
  check($('clear').textContent==='Clear'&&$('search').placeholder==='ID or data','monitor and placeholders translated');
  check(document.querySelector('nav [data-tab="decoder"]').textContent==='Overview','navigation translated');
  check($('simAdd').textContent==='Add frame'&&$('settingsSave').textContent==='Save settings','simulator and settings translated');
  check($('mode').options[1].textContent==='TX with ACK'&&$('mode').options[1].value==='normal','translated options preserve protocol values');
  check($('changedOnly').textContent==='Changes only: On','dynamic toggle text translated');
  check(getEventSourceLabel(null)==='No monitor frames','empty event source translated');
  check($('simRows').textContent.includes('Änderungen')&&$('labelRows').textContent.includes('Löschen'),'custom simulator names and labels remain unchanged');
  check($('search').value==='123'&&!$('autoscroll').checked&&frames===oldFrameList&&frames.some(f=>f.id==='123'&&f.data==='AA55'),'switch preserves inputs, toggles and CAN data');
  check(socket===oldSocket&&connectionGeneration===generation,'switch does not reconnect or send CAN configuration');
  showNotice(uiText`Frame ${'Löschen'} zum Simulator hinzugefügt.`);
  check($('appNoticeText').textContent==='Frame Löschen added to simulator.','dynamic messages translate static text and preserve user values');
  const confirmation=askConfirm(uiText('Alle Simulator-Frames dauerhaft löschen?'));
  check($('appDialogTitle').textContent==='Please confirm'&&$('appDialogConfirm').textContent==='Confirm','confirmation dialog translated');
  $('appDialogCancel').click();await confirmation;
  check(uiText('<button title="Zum Bearbeiten klicken">Löschen</button>')==='<button title="Click to edit">Delete</button>','generated row actions and tooltips translated');
  const profile=settingsObject();check(profile.language==='en','settings export includes language');
  const legacy={...profile};delete legacy.language;validateSettingsObject(legacy);
  let invalid=false;try{validateSettingsObject({...profile,language:'xx'});}catch(_){invalid=true;}
  check(invalid,'invalid language rejected and old settings remain compatible');
  simBackend='browser';await startSim();const timers=browserSimTimers.slice();
  check(simRunning&&timers.length>0,'browser simulator started for switch test');
  $('languageToggle').click();
  check(uiLanguage==='ja'&&document.documentElement.lang==='ja','language selector switches to Japanese');
  check($('clear').textContent==='クリア'&&$('search').placeholder==='IDまたはデータ','Japanese static text and placeholders');
  check($('changedOnly').textContent==='変更のみ: オン'&&getEventSourceLabel(null)==='モニターフレームなし','Japanese dynamic UI');
  check($('mode').options[1].textContent==='ACKありで送信'&&$('mode').options[1].value==='normal','Japanese preserves protocol values');
  check(document.querySelector('nav [data-tab="decoded"]').textContent==='デコード済みメッセージ'&&document.querySelector('nav [data-tab="labels"]').textContent==='ラベル辞書'&&document.querySelector('nav [data-tab="settings"]').textContent==='設定','Japanese translates originally English navigation');
  check(document.querySelector('nav [data-tab="sim"]').textContent.includes('シミュレーター')&&$('pause').textContent==='一時停止','Japanese dynamic navigation and pause');
  check($('labelNew').textContent==='新規'&&$('labelsExport').textContent==='エクスポート'&&$('labelsImport').textContent==='インポート','Japanese dictionary actions');
  setToggleButton('txExt',true);check($('txExt').textContent==='拡張ID: オン','Japanese dynamically generated toggle label');
  setToggleButton('txExt',false);
  check(labels['123']==='Löschen'&&simEntries[0].name==='Änderungen'&&socket===oldSocket&&connectionGeneration===generation,'Japanese preserves user data and connection');
  check(simRunning&&timers.every((timer,index)=>timer===browserSimTimers[index]),'Japanese preserves running simulator');
  const japaneseProfile=settingsObject();validateSettingsObject(japaneseProfile);
  check(japaneseProfile.language==='ja'&&uiLocale()==='ja-JP','Japanese settings export and locale');
  $('languageToggle').click();
  check($('clear').textContent==='Leeren'&&$('simAdd').textContent==='Frame hinzufügen'&&$('changedOnly').textContent==='Nur Änderungen: Ein','switch back restores German static and dynamic UI');
  check(simRunning&&timers.every((timer,index)=>timer===browserSimTimers[index]),'language switch preserves running simulator timers');
  check(labels['123']==='Löschen'&&simEntries[0].name==='Änderungen','switch back preserves user configuration');
  await stopSim();wsConnected=false;
  const originalConfirm=askConfirm;askConfirm=async()=>true;
  await loadSettingsObject(profile);
  check(uiLanguage==='en','settings import restores language');
  setUiLanguage('de');await loadSettingsObject(legacy);
  check(uiLanguage==='de','legacy settings import retains current language');
  await loadSettingsObject(japaneseProfile);
  check(uiLanguage==='ja'&&$('clear').textContent==='クリア','settings import restores Japanese');
  setUiLanguage('en');check($('clear').textContent==='Clear','Japanese switches directly to English');
  askConfirm=originalConfirm;setUiLanguage('ja');
  check(serialTestErrors.length===0,'no runtime errors during switching');
  sessionStorage.setItem('language-results',JSON.stringify(results));sessionStorage.setItem('language-reload','1');location.reload();
 }catch(error){await report({ok:false,error:error.stack,results,errors:serialTestErrors});}
},150));
'''

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.done=threading.Event()
    threading.Thread(target=server.serve_forever,daemon=True).start()
    report=f'http://127.0.0.1:{server.server_port}/result'
    fake=(ROOT/'tools/tests/web_serial_fake.js').read_text(encoding='utf-8')
    source=ROOT/'data/usb.html' if '--file' in sys.argv else ROOT/'data/index.html'
    server.html=source.read_text(encoding='utf-8').replace('<head>','<head><script>window.serialReportURL='+json.dumps(report)+';'+fake+'\n'+CHECKS+'</script>',1)
    browsers=[Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')]
    browser=next(p for p in browsers if p.exists())
    try:
        with tempfile.TemporaryDirectory(prefix='deacs-i18n-',ignore_cleanup_errors=True) as directory:
            if '--file' in sys.argv:
                page=Path(directory)/'DEACS_USB_test.html';page.write_text(server.html,encoding='utf-8');url=page.as_uri()
            else:url=f'http://127.0.0.1:{server.server_port}/'
            process=subprocess.Popen([str(browser),'--headless','--disable-gpu','--window-size=1440,900','--no-first-run','--no-default-browser-check','--user-data-dir='+str(Path(directory)/'profile'),url],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                if not server.done.wait(40):raise SystemExit('Browser produced no result')
                print(json.dumps(server.result,ensure_ascii=False,indent=2))
                if not server.result['ok']:raise SystemExit(1)
            finally:process.terminate();process.wait(timeout=10)
    finally:server.shutdown();server.server_close()

if __name__=='__main__':main()
