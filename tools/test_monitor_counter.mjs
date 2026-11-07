// Run with: node tools/test_monitor_counter.mjs. No browser/device required.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../data/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function render(){'),source.indexOf('function scheduleRender(){'));
const body={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],insertAdjacentHTML(){}};
const wrap={clientHeight:560,scrollTop:0,scrollHeight:5000};
const elements={frames:body,visibleCount:{textContent:''},autoscroll:{checked:true},scrollToEnd:{hidden:false}};
let predicate=()=>true;
const context=vm.createContext({paused:false,pausedMonitorLength:0,renderPending:false,monitorRowMarkup:'',MAX_ROWS:1200,frames:[],row:f=>`<tr data-monitor-uid="${f.id}"></tr>`,createMonitorMatcher:()=>predicate,$:id=>elements[id],document:{querySelector:()=>wrap,documentElement:{}},getComputedStyle:()=>({getPropertyValue:()=>28})});
vm.runInContext(code,context);
for(const size of [100,2000]){
  context.frames=Array.from({length:size},(_,id)=>({id}));context.render();
  assert.equal(Number(elements.visibleCount.textContent),size);
  assert.equal((body.innerHTML.match(/data-monitor-uid/g)||[]).length,36);
}
predicate=f=>f.id%2===0;context.render();
assert.equal(Number(elements.visibleCount.textContent),1000);
elements.autoscroll.checked=false;wrap.scrollTop=140;context.render();
assert.equal(wrap.scrollTop,140);
assert.equal(Number(elements.visibleCount.textContent),1000);
context.frames=[];context.render();assert.equal(Number(elements.visibleCount.textContent),0);
console.log(JSON.stringify({ok:true,results:['count grows beyond viewport and 1200','DOM working set stays bounded','filters affect count','manual scroll remains fixed','empty list resets count']}));
