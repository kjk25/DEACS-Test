'use strict';
// UI text only: tagged templates translate static parts before inserting values.
// CAN payloads, labels, filenames, IDs and exported data are never translated.
const LANGUAGE_KEY='deacsLanguage';
const UI_LANGUAGES=['de','en','ja'];
const UI_CATALOGS={en:UI_EN,ja:UI_JA};
let uiLanguage=(()=>{try{const saved=localStorage.getItem(LANGUAGE_KEY);return UI_LANGUAGES.includes(saved)?saved:'de';}catch(_){return 'de';}})();
const uiLocale=()=>({de:'de-DE',en:'en-GB',ja:'ja-JP'})[uiLanguage];
const uiPhrasePattern=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+Array.from(new Set(Object.values(UI_CATALOGS).flatMap(catalog=>Object.keys(catalog)))).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','gu');
function translateUiFragment(text,language=uiLanguage){
  const catalog=UI_CATALOGS[language];
  if(!catalog)return text;
  return catalog[text]??text.replace(uiPhrasePattern,match=>catalog[match]??match);
}
function isBoundUiText(current,original){
  return UI_LANGUAGES.some(language=>current===translateUiFragment(original,language));
}
function uiText(text,...values){
  if(typeof text==='string')return translateUiFragment(text);
  return text.reduce((out,part,index)=>out+translateUiFragment(part)+(index<values.length?String(values[index]):''),'');
}
// Original static nodes are bound once. No mutation observer runs on CAN rows.
const uiTextBindings=[],uiAttributeBindings=[];
function bindUiLanguage(){
  // Option values must remain stable when their visible text changes.
  document.querySelectorAll('option:not([value])').forEach(option=>option.value=option.textContent);
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(!node.parentElement.closest('script,style,pre,textarea')&&node.nodeValue.trim())uiTextBindings.push([node,node.nodeValue]);
  }
  document.querySelectorAll('[title],[placeholder],[aria-label],[data-tooltip]').forEach(el=>{
    for(const attr of ['title','placeholder','aria-label','data-tooltip']){
      if(el.hasAttribute(attr))uiAttributeBindings.push([el,attr,el.getAttribute(attr)]);
    }
  });
  document.getElementById('languageToggle')?.addEventListener('click',()=>setUiLanguage(UI_LANGUAGES[(UI_LANGUAGES.indexOf(uiLanguage)+1)%UI_LANGUAGES.length]));
  document.querySelectorAll('.toggleButton').forEach(button=>button.dataset.label=button.dataset.label||button.textContent.trim());
  applyStaticUiLanguage();
}
function applyStaticUiLanguage(){
  document.documentElement.lang=uiLanguage;
  for(const [node,original] of uiTextBindings){
    if(node.isConnected&&isBoundUiText(node.nodeValue,original))node.nodeValue=translateUiFragment(original);
  }
  for(const [el,attr,original] of uiAttributeBindings){
    if(el.isConnected&&isBoundUiText(el.getAttribute(attr),original))el.setAttribute(attr,translateUiFragment(original));
  }
  const button=document.getElementById('languageToggle');
  if(button){
    button.innerHTML=UI_LANGUAGES.map(language=>language===uiLanguage?'<b>'+language.toUpperCase()+'</b>':language.toUpperCase()).join(' / ');
    button.title=({de:'Switch to English',en:'日本語に切り替え',ja:'Auf Deutsch umschalten'})[uiLanguage];
    button.setAttribute('aria-label',button.title);
  }
}
function setUiLanguage(language){
  if(!UI_LANGUAGES.includes(language))return;
  uiLanguage=language;
  try{localStorage.setItem(LANGUAGE_KEY,language);}catch(_){}
  applyStaticUiLanguage();
  document.dispatchEvent(new Event('deacs-language-changed'));
}
bindUiLanguage();
