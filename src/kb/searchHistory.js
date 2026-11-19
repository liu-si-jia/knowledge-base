export const SEARCH_HISTORY_KEY='kb-global-search-history';
export const SEARCH_HISTORY_LIMIT=10;

function liveStorage(preferred){
  if(preferred)return preferred;
  try{if(typeof localStorage!=='undefined')return localStorage;}catch{/* private mode */}
  if(typeof globalThis!=='undefined'){
    globalThis.__kbSearchHistoryMemory||={data:new Map(),getItem(key){return this.data.has(key)?this.data.get(key):null;},setItem(key,value){this.data.set(key,String(value));},removeItem(key){this.data.delete(key);}};
    return globalThis.__kbSearchHistoryMemory;
  }
  return {getItem:()=>null,setItem(){},removeItem(){}};
}

export function normalizeSearchTerm(term){
  return String(term||'').trim();
}

export function readSearchHistory(storage){
  const store=liveStorage(storage);
  try{
    const raw=store.getItem(SEARCH_HISTORY_KEY);
    const list=raw?JSON.parse(raw):[];
    if(!Array.isArray(list))return [];
    const seen=new Set(),result=[];
    for(const item of list){
      const term=normalizeSearchTerm(item);
      if(!term||seen.has(term))continue;
      seen.add(term);result.push(term);
      if(result.length>=SEARCH_HISTORY_LIMIT)break;
    }
    return result;
  }catch{return [];}
}

export function rememberSearchTerm(term,storage){
  const value=normalizeSearchTerm(term);
  if(!value)return readSearchHistory(storage);
  const next=[value,...readSearchHistory(storage).filter(item=>item!==value)].slice(0,SEARCH_HISTORY_LIMIT);
  try{liveStorage(storage).setItem(SEARCH_HISTORY_KEY,JSON.stringify(next));}catch{/* ignore quota */}
  return next;
}

export function clearSearchHistory(storage){
  try{liveStorage(storage).removeItem(SEARCH_HISTORY_KEY);}catch{/* ignore */}
  return [];
}
