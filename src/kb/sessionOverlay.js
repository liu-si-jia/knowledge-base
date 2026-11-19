const bootKey='kb-overlay-boot';

function memoryStorage(){
  const data=new Map();
  return {
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>{data.set(key,String(value));},
    removeItem:key=>{data.delete(key);},
  };
}

function liveStorage(preferred){
  if(preferred)return preferred;
  try{if(typeof sessionStorage!=='undefined')return sessionStorage;}catch{/* private mode or missing */}
  if(typeof globalThis!=='undefined'){
    globalThis.__kbOverlayMemory||=memoryStorage();
    return globalThis.__kbOverlayMemory;
  }
  return memoryStorage();
}

function bootId(storage){
  const store=liveStorage(storage);
  const existing=typeof globalThis!=='undefined'?globalThis.__kbOverlayBoot:'';
  if(existing)return existing;
  const id=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if(typeof globalThis!=='undefined')globalThis.__kbOverlayBoot=id;
  try{store.setItem(bootKey,id);}catch{/* ignore quota */}
  return id;
}

export const ASK_AI_OVERLAY_KEY='kb-ask-ai-overlay-dismissed';
export const ONLYOFFICE_OVERLAY_KEY='kb-onlyoffice-overlay-dismissed';

export function overlayDismissed(key,storage){
  const store=liveStorage(storage);
  try{return store.getItem(key)===bootId(store);}catch{return false;}
}

export function dismissOverlay(key,storage){
  const store=liveStorage(storage);
  try{store.setItem(key,bootId(store));}catch{/* ignore quota */}
}

export function resetOverlaySession(storage){
  if(typeof globalThis!=='undefined')delete globalThis.__kbOverlayBoot;
  const store=liveStorage(storage);
  try{store.removeItem(bootKey);store.removeItem(ASK_AI_OVERLAY_KEY);store.removeItem(ONLYOFFICE_OVERLAY_KEY);}catch{/* ignore */}
}
