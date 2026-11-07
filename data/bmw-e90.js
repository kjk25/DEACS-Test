'use strict';
// Community reference: github.com/veikkos/e90-can-cluster, e90-can-cluster.ino / config.h.
// Protocol values are not BMW factory documentation; real cluster validation is required.
const BMW_E90_ENCODER={
 clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0))},
 speed(s,v,ms,calibration=60){
  s.acc=(s.acc||0)+this.clamp(v,0,260)*(1360-this.clamp(calibration,0,200))*Math.max(0,ms)/100000;
  const n=Math.floor(s.acc);s.acc-=n;s.speedCounter=((s.speedCounter||0)+n)&65535;
  s.tickCounter=((s.tickCounter||0)+Math.max(0,ms)*4)%4096;
  const lo=s.speedCounter&255,hi=s.speedCounter>>>8,t=Math.floor(s.tickCounter);
  return [lo,hi,lo,hi,lo,hi,t&255,0xF0|(t>>>8)];
 },
 rpm(v){const r=Math.round(this.clamp(v,0,8000)*4);return [0x5F,0x59,0xFF,0,r&255,r>>>8,0x80,0x99]},
 ignition(mode,n){return [mode==='run'?0x45:mode==='on'?0x55:0,0x42,0x69,0x8F,n&255,0,0,0]},
 gear(g,n){return [g?0x78:0xB4,g?((this.clamp(g,1,8)+4)<<4):0x0F,255,((n%15)<<4)|13,g?0xF2:0xF0,255,255,255]},
 dynamics(kmh,ms){
  const v=Math.round(this.clamp(kmh,0,260)*10),a=[v&255,((v>>>8)&15)|(kmh>=1?0x10:0)|0x80,0,0,0,0,(Math.floor((ms%300)*16/300)&15)<<4,0];
  const sum=a.slice(0,7).reduce((n,b)=>n+b,0xA0);a[7]=(sum+(sum>>>8)+1)&255;return a;
 },
 fuel(percent,right=false){
  const points=right?[[1,8400],[.875,5400],[.75,4600],[.5,3350],[.25,2200],[0,950]]:[[1,9700],[.875,8200],[.75,6250],[.5,3600],[.25,1950],[0,625]],p=this.clamp(percent,0,1);
  for(let i=0;i<points.length-1;i++){const [x,y]=points[i],[xx,yy]=points[i+1];if(p>=xx)return Math.round(yy+(y-yy)*(p-xx)/(x-xx))}return points.at(-1)[1];
 },
 consumeFuel(fill,ms){return this.clamp(fill-Math.max(0,Number(ms)||0)/70000,0,1)},
 symbol(id,on){return [0x40,id&255,(id>>>8)&255,on?0x31:0x30,255,255,255,255]},
 cruise(on,speed,counter){return [counter&255,on?Math.round(this.clamp(speed,0,250)):0xFE,on?0xF4:0xF1,0,0,on?0x58:0x50,1,0]},
 outside(celsius){return Math.round((this.clamp(celsius,-40,86.5)+41)*2)},
 battery(volts){const n=Math.round(this.clamp(volts,0,65.535)*1000);return [(n>>>16)&255,(n>>>8)&255,n&255,0,0,0,0,0]}
};
const BMW_E90_DEMO_IDS=['130','12F','1A0','1A6','0AA','1D0','1D2','349','1F6','21A','34F','19E','0C0','0D7','0C4','0C1','592','193','2A6','3B0','3B4','366'];
const BMW_E90_SYMBOLS=[['ABS / DSC',42],['DTC',357],['DSC',36],['Lenkung',73],['Motor',31],['Reifendruck gelb',50],['Reifendruck rot',63],['Bremse rot',308],['Batterie rot',213],['Öldruck rot',212],['Kühlmittel',166],['Temperatur rot',39],['Dreieck gelb',37],['Dreieck rot',41],['Getriebe',288],['Tür links',715],['Tür rechts',716],['Heckklappe',19]];
const BMW_E90_STAGES=[[357,36,42],[31,213,212],[50,63,166],[39,37,41],[288,715,716,19]];
(function(){
 const $=id=>document.getElementById(id),E=BMW_E90_ENCODER;if(!$('bmwE90'))return;
 const S={active:false,mode:'off',demo:false,hold:false,auto:false,live:false,starting:false,generation:0,last:0,elapsed:0,speed:0,rpm:0,gear:0,fuel:1,coolant:90,ignition:0xE2,abs:0,airbag:0xC3,absAlive:0xF0,sos:0xF0,gearCounter:0,coolantCounter:0,speedCounter:0,tickCounter:0,acc:0,stage:-1};
 const lamps={left:false,right:false,hazard:false,high:false,low:false,fog:false,brake:false},symbols=new Map(),due=new Map();
 let timer=0,pump=0,queue=[],lastLight=-1,lastBrake=-1,cruiseCounter=0;
 function update(){
  $('bmwSpeedValue').textContent=Math.round(S.speed);$('bmwRpmValue').textContent=Math.round(S.rpm);$('bmwGear').textContent=S.gear?'M'+S.gear:'N';
  $('bmwSpeedNeedle').style.transform=`rotate(${135+270*S.speed/260}deg)`;$('bmwRpmNeedle').style.transform=`rotate(${135+270*S.rpm/8000}deg)`;
  [...$('bmwShiftLight').children].forEach((x,i)=>x.classList.toggle('on',i<8*S.rpm/8000));
  document.querySelectorAll('#bmwE90 [data-lamp]').forEach(b=>{const on=b.dataset.lamp==='auto'?S.auto:!!lamps[b.dataset.lamp];b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
  document.querySelectorAll('#bmwE90 [data-symbol]').forEach(b=>{const on=symbols.has(Number(b.dataset.symbol));b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
  $('bmwRaceState').textContent=uiText(!S.active?'STOP':S.hold?'HALTEN':S.mode==='on'?'Zündung an':S.demo?'DEMO':'LAMPENTEST');
  $('bmwFuelView').textContent=Math.round(S.fuel*100)+' %';$('bmwCoolantView').textContent=Math.round(S.coolant)+' °C';
  $('bmwFuelNeedle').style.transform=`rotate(${200+140*E.clamp(S.fuel,0,1)}deg)`;
  $('bmwCoolantNeedle').style.transform=`rotate(${200+140*E.clamp(S.coolant/130,0,1)}deg)`;
 }
 function flush(){
  pump=0;const item=queue.shift();if(!item)return;const [id,a]=item,data=a.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  // Readouts describe generated demo frames, not feedback from the physical car.
  if(id==='34F')$('bmwBrakePedalLamp').classList.toggle('on',a[0]===0xFE);
  if(id==='193'){const on=a[2]===0xF4&&!!(a[5]&8);$('bmwCruiseLamp').classList.toggle('on',on);$('bmwCruiseSpeedView').textContent=on?a[1]:0}
  if(id==='2A6')$('bmwAutoWiperLamp').classList.toggle('on',!!(a[0]&1));
  if(id==='3B0')$('bmwReverseLamp').classList.toggle('on',!!(a[0]&0x40));
  if(id==='3B4')$('bmwBatteryView').textContent=(((a[0]<<16)|(a[1]<<8)|a[2])/1000).toFixed(1);
  if(id==='0C4'){let raw=a[0]|a[1]<<8;if(raw&0x8000)raw-=65536;$('bmwSteerView').textContent=Math.round(raw*.01)}
  addFrame({type:'frame',us:Math.round(performance.now()*1000),dir:'RX',sim:true,source:'BMW',id,dlc:8,data,ext:false,rtr:false});
  if(S.live)sendLiveSourceFrame('BMW',id,false,data,false);if(queue.length)pump=setTimeout(flush,3);
 }
 function send(id,a){
  if(!BMW_E90_DEMO_IDS.includes(id)||a.length!==8)throw Error('Invalid BMW demo frame');
  // Keep ignition ahead of lamp bursts; never queue a catch-up burst of old heartbeats.
  if(S.active&&id==='130')queue.unshift([id,a]);else queue.push([id,a]);
  if(!pump)pump=setTimeout(flush,0);
 }
 function clearQueue(){clearTimeout(pump);pump=0;queue=[]}
 function every(key,ms,now,fn){if(!due.has(key)||now-due.get(key)>=ms){due.set(key,now);fn()}}
 function symbol(id,on){if(on){symbols.set(id,performance.now());send('592',E.symbol(id,true))}else if(symbols.delete(id))send('592',E.symbol(id,false))}
 function clearSymbols(){for(const id of [...symbols.keys()])symbol(id,false)}
 function fuelFrame(){const l=E.fuel(S.fuel),r=E.fuel(S.fuel,true);send('349',[l&255,l>>>8,r&255,r>>>8,0,0,0,0])}
 function lights(now,force=false){
  every('indicator',force?0:200,now,()=>{const l=lamps.left||lamps.hazard,r=lamps.right||lamps.hazard;send('1F6',[l&&r?0xB1:l?0x91:r?0xA1:0x80,0xF0,0,0,0,0,0,0])});
  const v=(lamps.low||lamps.high?4:0)|(lamps.high?2:0)|(lamps.fog?0x60:0),br=lamps.brake?0xFE:0xFD;
  if(force||v!==lastLight){send('21A',[v,0,0xF7,0,0,0,0,0]);due.set('light',now);lastLight=v}else every('light',5000,now,()=>send('21A',[v,0,0xF7,0,0,0,0,0]));
  if(force||br!==lastBrake){send('34F',[br,255,0,0,0,0,0,0]);due.set('brake',now);lastBrake=br}else every('brake',5000,now,()=>send('34F',[br,255,0,0,0,0,0,0]));
 }
 function allOff(){S.auto=false;S.stage=-1;clearSymbols();for(const k of Object.keys(lamps))lamps[k]=false;lights(performance.now(),true);update()}
 function motion(){
  S.mode=S.elapsed<2000?'on':'run';if(S.mode==='on'){S.speed=0;S.rpm=0;S.gear=0;return}
  const d=E.clamp($('bmwRaceDuration').value,3,60)*1000,p=((S.elapsed-2000)%(d*2))/d;
  S.speed=E.clamp($('bmwTarget').value,20,260)*(p<=1?p:2-p);S.gear=S.speed<1?0:Math.min(7,Math.floor(S.speed/32)+1);
  const idle=E.clamp($('bmwIdleRpm').value,600,1500),shift=E.clamp($('bmwShiftRpm').value,4500,8000);
  S.rpm=S.speed<1?idle:Math.round(1800+(shift-1800)*(S.speed%32)/32);
 }
 function choreography(){
  const step=Math.floor(S.elapsed/2000),p=step%6;
  Object.assign(lamps,{low:true,left:p===0,right:p===1,hazard:p===2||p===5,high:p===3||p===5,fog:p===4||p===5,brake:p%2===0});
  const stage=step%BMW_E90_STAGES.length;if(stage!==S.stage){clearSymbols();for(const id of BMW_E90_STAGES[stage])symbol(id,true);S.stage=stage}
 }
 function tick(){
  if(!S.active)return;const now=performance.now(),dt=now-S.last;S.last=now;
  if(!S.hold&&(S.demo||S.auto)){S.elapsed+=dt;if(S.demo)motion()}
  if(S.demo&&!S.hold&&S.mode==='run')S.fuel=E.consumeFuel(S.fuel,dt);
  every('fast',100,now,()=>{
   send('130',E.ignition(S.mode,S.ignition++));S.ignition&=255;send('12F',[0x3F,0,0,0,0,0x40,1,0]);send('1A0',E.dynamics(S.speed,now));
   const delta=due.has('speedTime')?now-due.get('speedTime'):0;due.set('speedTime',now);
   send('1A6',E.speed(S,S.speed,delta,$('bmwCalibration').value));send('0AA',E.rpm(S.rpm));
   S.coolantCounter=(S.coolantCounter+1)&15;send('1D0',[Math.round(S.coolant+48),255,S.coolantCounter|(S.mode==='run'?0x20:0),0xCD,0,0,0xCD,0xA8]);
  });
  every('slow',200,now,()=>{
   send('19E',[0,0xE0,((S.abs%3)<<4)|3,0xFC,0xCC,0,0,S.abs&255]);S.abs=(S.abs+1)&255;
   send('0C0',[S.absAlive,255,0,0,0,0,0,0]);S.absAlive=((S.absAlive+1)|0xF0)&255;
   send('0D7',[S.airbag,255,0,0,0,0,0,0]);S.airbag=(S.airbag+1)&255;send('0C4',[0x83,0,0,0,0,255,0xF1,0]);
   send('1D2',E.gear(S.gear,S.gearCounter++));fuelFrame();
  });
  if(S.auto&&!S.hold)choreography();lights(now);every('sos',1000,now,()=>{send('0C1',[S.sos,255,0,0,0,0,0,0]);S.sos=((S.sos+1)|0xF0)&255});
  // Supplemental tests requested by the user. These are deliberately slow,
  // separate from the 100-ms ignition heartbeat; not all are used by this cluster.
  if(S.demo&&S.mode==='run')every('extras',2000,now,()=>{
   const phase=Math.floor(S.elapsed/2000)%6;cruiseCounter=(cruiseCounter+17)&255;
   send('193',E.cruise(phase===1||phase===2,100,cruiseCounter));
   send('2A6',[phase%2,0,0,0,0,0,0,0]);
   send('3B0',[phase===4?0x40:0,0,0,0,0,0,0,0]);
   send('3B4',E.battery(13.8+.1*phase));
   const range=4000;send('366',[E.outside(20+phase),range&255,range>>>8,0,0,0,0,0]);
  });
  for(const [id,last] of symbols)if(now-last>=5000){send('592',E.symbol(id,true));symbols.set(id,now)}every('ui',100,now,update);
 }
 async function configureLive(){
  if(!$('liveTxBmw').checked){S.live=false;return}
  if(!socket||socket.readyState!==WebSocket.OPEN)throw Error(uiText('Zuerst USB oder WLAN verbinden.'));
  const status=await post('/api/can',{bitrate:100000,mode:'noack'});setStatus(status);
  if(!status.canRunning||status.listenOnly||status.bitrate!==100000||!status.noAck)throw Error(uiText('100 kbit/s / TX ohne ACK wurde nicht bestätigt.'));S.live=true;
 }
 async function start(demo){
  if(S.starting)return;const generation=++S.generation;S.starting=true;update();
  try{await configureLive();if(generation!==S.generation){S.live=false;return}
   clearInterval(timer);clearQueue();due.clear();clearSymbols();
   Object.assign(S,{active:true,demo,hold:false,auto:demo,mode:'on',last:performance.now(),elapsed:0,speed:0,rpm:0,gear:0,stage:-1});
   if(demo)lamps.low=true;tick();timer=setInterval(tick,25);
  }catch(e){if(generation===S.generation){S.live=false;showNotice(String(e.message||e),'error')}}finally{S.starting=false;update()}
 }
 function stop(){
  ++S.generation;S.active=false;S.demo=false;S.hold=false;clearInterval(timer);timer=0;clearQueue();allOff();S.mode='off';S.speed=S.rpm=S.gear=0;
  send('0AA',E.rpm(0));send('1D2',E.gear(0,S.gearCounter++));send('1A6',E.speed(S,0,0));
  send('193',E.cruise(false,0,cruiseCounter));send('2A6',[0,0,0,0,0,0,0,0]);send('3B0',[0,0,0,0,0,0,0,0]);
  send('130',E.ignition('off',S.ignition++));update();
 }
 for(const [name,id] of BMW_E90_SYMBOLS){const b=document.createElement('button');b.type='button';b.className='bmwTestLamp';b.dataset.symbol=id;b.textContent=uiText(name);b.onclick=async()=>{if(!S.active)await start(false);if(S.active){S.auto=false;symbol(id,!symbols.has(id));update()}};$('bmwLampTests').append(b)}
 document.querySelectorAll('#bmwE90 [data-lamp]').forEach(b=>b.onclick=async()=>{
  if(!S.active)await start(false);if(!S.active)return;const k=b.dataset.lamp;
  if(k==='auto'){S.auto=!S.auto;S.stage=-1}else{S.auto=false;lamps[k]=!lamps[k];if(k==='left'&&lamps[k])lamps.right=lamps.hazard=false;if(k==='right'&&lamps[k])lamps.left=lamps.hazard=false;if(k==='hazard'&&lamps[k])lamps.left=lamps.right=false}
  lights(performance.now(),true);update();
 });
 $('bmwStartRace').onclick=()=>start(true);$('bmwStop').onclick=stop;
 $('bmwReset').onclick=()=>{S.fuel=1;stop();S.speedCounter=S.tickCounter=S.acc=0;S.ignition=0xE2;fuelFrame();update()};$('bmwHold').onclick=()=>{if(S.active){S.hold=!S.hold;update()}};
 $('liveTxBmw').addEventListener('change',async()=>{if(!S.active)return;const generation=S.generation;S.live=false;clearQueue();try{await configureLive();if(generation!==S.generation){S.live=false;return}due.clear()}catch(e){S.live=false;showNotice(String(e.message||e),'error')}update()});
 document.addEventListener('deacs-language-changed',()=>{
  for(const [name,id] of BMW_E90_SYMBOLS)document.querySelector(`#bmwE90 [data-symbol="${id}"]`).textContent=uiText(name);
  update();
 });
 // A closing browser may prevent delivery. Stop is the observable shutdown path.
 window.addEventListener('pagehide',()=>{if(S.active)stop()});
 for(const [id,max,step] of [['bmwSpeedTicks',260,20],['bmwRpmTicks',8,1]])for(let v=0;v<=max;v+=step){const a=(135+270*v/max)*Math.PI/180,b=document.createElement('span');b.className='bmwRaceLabel';b.textContent=v;b.style.transform=`translate(${Math.cos(a)*151}px,${Math.sin(a)*151}px) translate(-50%,-50%)`;$(id).append(b)}update();
})();
