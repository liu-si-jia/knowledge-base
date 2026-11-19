import { didShareItem } from './sharing.js';
import { responsibleId } from './ownership.js';
import { librariesForView, contentRights, effectiveAccess, libraryType } from './access.js';
import { favorites } from './fileActions.js';

const owns=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
export function pinnedRecords(state,userId){
  const saved=state.pinsByUser?.[userId];
  if(owns(state.pinsByUser,userId))return Array.isArray(saved)?saved:[];
  return userId===state.meId?librariesForView(state,userId).slice(0,4).map(s=>({spaceId:s.id,view:libraryType(s)})):[];
}
function effectiveLibraryView(state,id,userId,preferred){return [preferred,'personal','shared','plaza'].filter(Boolean).find(view=>librariesForView(state,userId,view).some(s=>s.id===id))||'';}
export function pinKey(record){return record?.nodeId?`node:${record.nodeId}`:record?.spaceId||'';}
export function isLibraryPin(record){return !!record&&!record.nodeId&&!!record.spaceId;}
export function visiblePins(state,userId){
  const seen=new Set();
  return pinnedRecords(state,userId).map(record=>{
    if(record.nodeId){
      const node=state.nodes.find(n=>n.id===record.nodeId);
      const library=node&&state.spaces.find(s=>s.id===node.spaceId);
      const view=effectiveLibraryView(state,node?.spaceId,userId,record.view);
      return {key:pinKey(record),kind:'node',node,library,view,record};
    }
    const library=state.spaces.find(s=>s.id===record.spaceId);
    const view=effectiveLibraryView(state,record.spaceId,userId,record.view);
    return {key:pinKey(record),kind:'library',library,view,record};
  }).filter(item=>{
    if(item.kind==='library'){
      if(!item.library||item.library.deletedAt||!item.view||seen.has(item.key))return false;
      seen.add(item.key);return true;
    }
    if(!item.node||item.node.deletedAt||!item.library||item.library.deletedAt||!item.view)return false;
    if(!contentRights(state,item.node,userId).view||seen.has(item.key))return false;
    seen.add(item.key);return true;
  });
}
const PIN_SPACES=['personal','shared','plaza'];
export function pinnedLibrariesForView(state,userId,view){
  const available=new Map(librariesForView(state,userId,view).map(library=>[library.id,library]));
  const ids=visiblePins(state,userId).filter(p=>p.kind==='library').map(p=>p.library.id).filter(id=>available.has(id));
  const order=state.viewPinOrderByUser?.[userId]?.[view];
  return [...new Set([...(Array.isArray(order)?order:[]).filter(id=>ids.includes(id)),...ids])].map(id=>available.get(id));
}
function savePins(state,userId,records){
  const existing=state.pinsByUser||{[state.meId]:pinnedRecords(state,state.meId)};
  return {...state,pinsByUser:{...existing,[userId]:records}};
}
export function togglePin(state,userId,id,view){const current=pinnedRecords(state,userId),present=current.some(p=>isLibraryPin(p)&&p.spaceId===id);if(present)return savePins(state,userId,current.filter(p=>!(isLibraryPin(p)&&p.spaceId===id)));const origin=effectiveLibraryView(state,id,userId,view);if(!origin)throw Error('当前无法访问该知识库');return savePins(state,userId,[...current,{spaceId:id,view:origin}]);}
export function isContentPinned(state,userId,nodeId){return pinnedRecords(state,userId).some(p=>p.nodeId===nodeId);}
export function toggleNodePin(state,userId,nodeId){
  const current=pinnedRecords(state,userId);
  if(current.some(p=>p.nodeId===nodeId))return savePins(state,userId,current.filter(p=>p.nodeId!==nodeId));
  const node=state.nodes.find(n=>n.id===nodeId);
  if(!node||node.deletedAt||!contentRights(state,node,userId).view)throw Error('当前无法访问该内容');
  const origin=effectiveLibraryView(state,node.spaceId,userId);
  if(!origin)throw Error('当前无法访问该内容');
  return savePins(state,userId,[...current,{spaceId:node.spaceId,view:origin,nodeId}]);
}
function recordByKey(records,id){return records.find(p=>pinKey(p)===id||isLibraryPin(p)&&p.spaceId===id);}
export function reorderPin(state,userId,id,targetId,after=false){
  const records=pinnedRecords(state,userId),source=recordByKey(records,id),target=recordByKey(records,targetId);
  if(!source||!target||pinKey(source)===pinKey(target))return state;
  const next=records.filter(p=>pinKey(p)!==pinKey(source)),at=next.findIndex(p=>pinKey(p)===pinKey(target));
  if(at<0)return state;
  next.splice(at+(after?1:0),0,source);return savePins(state,userId,next);
}
export function reorderViewPin(state,userId,view,id,targetId,after=false){
  if(!PIN_SPACES.includes(view))return state;
  const ids=pinnedLibrariesForView(state,userId,view).map(l=>l.id);
  if(id===targetId||!ids.includes(id)||!ids.includes(targetId))return state;
  const next=ids.filter(item=>item!==id),index=next.indexOf(targetId);next.splice(index+(after?1:0),0,id);
  return {...state,viewPinOrderByUser:{...state.viewPinOrderByUser,[userId]:{...state.viewPinOrderByUser?.[userId],[view]:next}}};
}
export function recentVisits(state,userId){if(owns(state.recentVisitsByUser,userId))return state.recentVisitsByUser[userId]||[];return userId===state.meId?(state.recents||[]).map(id=>({id,visitedAt:''})):[];}
export function visitContent(state,id,userId){const node=state.nodes.find(n=>n.id===id);if(!contentRights(state,node,userId).view)throw Error('当前没有查看权限');const records=[{id,visitedAt:new Date().toISOString()},...recentVisits(state,userId).filter(r=>r.id!==id)].slice(0,100);return {...state,recentVisitsByUser:{...(state.recentVisitsByUser||{[state.meId]:recentVisits(state,state.meId)}),[userId]:records},...(userId===state.meId?{recents:records.map(r=>r.id)}:{})};}
export function homeEntries(state,userId,tab,query=''){
  const visits=recentVisits(state,userId),favoriteIds=new Set(favorites(state,userId));
  const available=state.nodes.filter(n=>contentRights(state,n,userId).view).filter(n=>!query.trim()||`${n.name} ${(n.creationDraft?n.creationDraftBody:n.body)||''}`.includes(query.trim()));
  let result=available.filter(n=>tab==='recent'?visits.some(r=>r.id===n.id):tab==='favorite'?favoriteIds.has(n.id):tab==='mine'?didShareItem(state,n,userId):responsibleId(n)!==userId&&responsibleId(state.spaces.find(s=>s.id===n.spaceId))!==userId&&libraryType(state.spaces.find(s=>s.id===n.spaceId))==='shared');
  result=[...new Map(result.map(n=>[n.id,n])).values()];
  return result.sort((a,b)=>tab==='recent'?visits.findIndex(r=>r.id===a.id)-visits.findIndex(r=>r.id===b.id):new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
}
