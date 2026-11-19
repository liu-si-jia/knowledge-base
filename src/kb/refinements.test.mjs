import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, normalizeState } from './store.js';
import { createLibrary } from './libraryCreation.js';
import { createContent } from './contentCreation.js';
import { accessFromSubjects, companyId } from './permissions.js';
import { contentRights, effectiveAccess, accessFingerprint, saveEntityAccess, permissionLayers, migrateAccess, librariesForView, switchNodePermissionMode } from './access.js';
import { addCollaborators, savePermissionDetails } from './permissionOperations.js';
import { pinnedRecords, visiblePins, pinnedLibrariesForView, togglePin, reorderPin, reorderViewPin, recentVisits, visitContent, homeEntries } from './personalization.js';
const person=(id,role)=>({type:'person',id,role}),empty=state=>accessFromSubjects(state,[]);
function fixture(){let s=normalizeState(seedState());let r=createLibrary(s,{name:'分层授权验收',initializer:'shared',access:accessFromSubjects(s,[person('chen-ke','viewer'),person('zhao-heng','editor')])},s.meId);s=r.state;const library=r.library;const add=(format,name,parentId='')=>{const r=createContent(s,{format,name,parentId,spaceId:library.id},s.meId);s=r.state;return r.node;};const folder=add('folder','资料'),file=add('doc','授权说明',folder.id),other=add('doc','另一个文件');return {s,library,folder,file,other};}
const setLocal=(s,id,subjects)=>saveEntityAccess(s,{id,permissionMode:subjects.length?'custom':'inherit',localAccess:accessFromSubjects(s,subjects),convertedBy:subjects.length?s.meId:undefined},s.meId);
const toCustom=(s,id)=>{const node=s.nodes.find(n=>n.id===id),result=switchNodePermissionMode(s,node,'custom',s.meId);return saveEntityAccess(s,{id,permissionMode:result.permissionMode,localAccess:result.localAccess,convertedBy:result.convertedBy},s.meId);};

test('继承子项跟随父级当前实际权限，自定义快照不受父级后改影响',()=>{
  let {s,library,file}=fixture();
  assert.equal(contentRights(s,file,'chen-ke').view,true);
  assert.equal(contentRights(s,file,'zhao-heng').edit,true);
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','manager')])},s.meId);
  assert.equal(contentRights(s,s.nodes.find(n=>n.id===file.id),'chen-ke').manage,true);
  s=setLocal(s,file.id,[person('chen-ke','editor')]);
  let current=s.nodes.find(n=>n.id===file.id);
  assert.equal(current.permissionMode,'custom');
  assert.equal(contentRights(s,current,'chen-ke').edit,true);
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','manager'),person('zhao-heng','editor')])},s.meId);
  current=s.nodes.find(n=>n.id===file.id);
  assert.equal(contentRights(s,current,'chen-ke').manage,false);
  assert.equal(contentRights(s,current,'chen-ke').edit,true);
  assert.equal(contentRights(s,current,'zhao-heng').view,false);
  assert.equal(current.localAccess.subjects[0].role,'editor');
});
test('改回继承后自定义修改失效，并重新跟随父级当前权限',()=>{
  let {s,library,file}=fixture();
  s=setLocal(s,file.id,[person('chen-ke','editor')]);
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:empty(s)},s.meId);
  let current=s.nodes.find(n=>n.id===file.id);
  assert.equal(contentRights(s,current,'chen-ke').edit,true);
  s=saveEntityAccess(s,{id:file.id,permissionMode:'inherit',localAccess:empty(s)},s.meId);
  current=s.nodes.find(n=>n.id===file.id);
  assert.equal(current.permissionMode,'inherit');
  assert.equal(contentRights(s,current,'chen-ke').view,false);
  assert.equal(contentRights(s,current,'zhao-heng').edit,false);
});
test('继承模式下公司与部门授权随父级生效，转自定义后可再单独加人',()=>{
  let {s,library,folder,file}=fixture();s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[{type:'company',id:companyId(s),role:'viewer'},{type:'department',id:'product',role:'editor'}])},s.meId);
  s=setLocal(s,folder.id,[]);
  assert.equal(s.nodes.find(n=>n.id===folder.id).permissionMode,'inherit');
  s=toCustom(s,file.id);
  s=addCollaborators(s,{id:file.id,subjects:[person('lin-xia','downloader')]},s.meId);
  const current=s.nodes.find(n=>n.id===file.id);assert.equal(contentRights(s,current,'chen-ke').edit,true);assert.equal(contentRights(s,current,'zhao-heng').view,true);assert.equal(contentRights(s,current,'lin-xia').download,true);assert.equal(effectiveAccess(s,current).visibility,'public');
  assert.equal(librariesForView(s,'lin-xia','shared').some(l=>l.id===library.id),true);
});
test('继承模式不能通过分享加人；转为自定义后可添加尚未在快照中的对象',()=>{
  let {s,file}=fixture();
  assert.throws(()=>addCollaborators(s,{id:file.id,subjects:[person('chen-ke','editor')]},s.meId),/转为自定义/);
  s=toCustom(s,file.id);
  s=addCollaborators(s,{id:file.id,subjects:[person('lin-xia','downloader')]},s.meId);
  const current=s.nodes.find(n=>n.id===file.id),layers=permissionLayers(s,current);
  assert.equal(current.permissionMode,'custom');
  assert.equal(layers.local.subjects.find(row=>row.id==='lin-xia').role,'downloader');
  assert.equal(layers.local.subjects.find(row=>row.id==='lin-xia').addedBy,s.meId);
  assert.equal(layers.local.subjects.find(row=>row.id==='chen-ke').role,'viewer');
  assert.throws(()=>addCollaborators(s,{id:file.id,subjects:[person('chen-ke','viewer')]},s.meId),/已有直接授权/);
});
test('权限草稿取消不改状态；父级变动或操作者撤权后提交失败；负责人不可移除',()=>{
  let {s,library,file}=fixture();const before=structuredClone(s),draft=permissionLayers(s,file);draft.excluded=[{type:'person',id:'chen-ke'}];draft.local.subjects.push(person('lin-xia','viewer'));assert.deepEqual(s,before);
  const expected=accessFingerprint(s,file,'node');s=saveEntityAccess(s,{id:library.id,entity:'space',access:empty(s)},s.meId);
  assert.throws(()=>saveEntityAccess(s,{id:file.id,localAccess:empty(s),expected},s.meId),/已变化/);assert.throws(()=>saveEntityAccess(s,{id:file.id,localAccess:empty(s)},'chen-ke'),/管理权限/);
  s=setLocal(s,file.id,[person(s.meId,'viewer')]);const current=s.nodes.find(n=>n.id===file.id);assert.equal(current.localAccess.subjects.length,0);assert.equal(current.inheritedExclusions.length,0);assert.equal(contentRights(s,current,s.meId).manage,true);
});
test('缓存迁移把旧本项授权收敛为含当时父级实际权限的自定义快照，不改原数据且幂等',()=>{
  const s=seedState();s.accessModelVersion=1;s.nodes[0].access=accessFromSubjects(s,[person('lin-xia','manager')]);s.nodes[1].localAccess=accessFromSubjects(s,[person('zhao-heng','editor')]);s.nodes[1].versions=[{body:'历史'}];s.nodes[1].blobId='original';const before=structuredClone(s),next=migrateAccess(s);
  assert.deepEqual(s,before);assert.equal(next.nodes[0].permissionMode,'inherit');assert.equal(next.nodes[0].localAccess.subjects.length,0);
  assert.equal(next.nodes[1].permissionMode,'custom');
  assert.equal(next.nodes[1].localAccess.subjects.find(row=>row.id==='zhao-heng').role,'editor');
  assert.ok(next.nodes[1].localAccess.subjects.some(row=>row.type==='department'&&row.id==='product'));
  assert.ok(next.nodes[1].localAccess.subjects.some(row=>row.id==='lin-xia'&&row.role==='downloader'));
  assert.deepEqual(next.nodes[1].versions,before.nodes[1].versions);assert.equal(next.nodes[1].blobId,'original');assert.deepEqual(migrateAccess(next),next);
});
test('置顶主用户初始四项、跨入口去重、取消后不自动补齐，排序按用户刷新保留',()=>{
  let {s,library}=fixture();const initial=pinnedRecords(s,s.meId);assert.equal(initial.length,4);assert.deepEqual(pinnedRecords(s,'chen-ke'),[]);
  s=togglePin(s,s.meId,library.id,'personal');assert.equal(visiblePins(s,s.meId).length,initial.length+1);s=reorderPin(s,s.meId,library.id,initial[0].spaceId);assert.equal(visiblePins(s,s.meId)[0].library.id,library.id);
  s=normalizeState(JSON.parse(JSON.stringify(s)));assert.equal(visiblePins(s,s.meId)[0].library.id,library.id);s=togglePin(s,s.meId,library.id,'shared');assert.equal(visiblePins(s,s.meId).length,initial.length);
  s=togglePin(s,'chen-ke',library.id,'shared');assert.equal(pinnedRecords(s,'chen-ke').length,1);s=saveEntityAccess(s,{id:library.id,entity:'space',access:empty(s)},s.meId);assert.equal(visiblePins(s,'chen-ke').length,0);
  for(const p of [...pinnedRecords(s,s.meId)])s=togglePin(s,s.meId,p.spaceId);assert.deepEqual(visiblePins(s,s.meId),[]);
});
test('主页四个范围按本人记录、实际权限和归属过滤；仅查看的他人广场内容不算与我共享',()=>{
  let {s,library,file,other,folder}=fixture();s=visitContent(s,other.id,s.meId);s=visitContent(s,file.id,s.meId);assert.deepEqual(homeEntries(s,s.meId,'recent').slice(0,2).map(n=>n.id),[file.id,other.id]);assert.equal(recentVisits(s,'lin-xia').length,0);
  assert.ok(homeEntries(s,s.meId,'mine').some(n=>n.id===folder.id));assert.ok(homeEntries(s,'chen-ke','shared').some(n=>n.id===file.id));
  s=savePermissionDetails(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[{type:'company',id:companyId(s),role:'viewer'}])},s.meId);assert.equal(homeEntries(s,'chen-ke','shared').some(n=>n.id===file.id),true);assert.ok(homeEntries(s,s.meId,'mine').some(n=>n.id===file.id));
  s=visitContent(s,file.id,'chen-ke');assert.equal(homeEntries(s,'chen-ke','recent')[0].id,file.id);assert.equal(homeEntries(s,s.meId,'recent')[0].id,file.id);assert.equal(homeEntries(s,s.meId,'mine','不匹配').length,0);
});
test('置顶切换不再写入历史分类页排序，侧栏持久化独立',()=>{
 let {s,library}=fixture();s.viewPinOrderByUser={[s.meId]:{shared:['space-retro']}};const before=structuredClone(s.viewPinOrderByUser);
 s=togglePin(s,s.meId,library.id,'shared');s=reorderPin(s,s.meId,library.id,pinnedRecords(s,s.meId)[0].spaceId);assert.deepEqual(s.viewPinOrderByUser,before);
 s=normalizeState(JSON.parse(JSON.stringify(s)));assert.equal(visiblePins(s,s.meId)[0].library.id,library.id);assert.equal(visiblePins(s,s.meId).filter(p=>p.library.id===library.id).length,1);
});
test('公司授权不改变置顶的固定类型，删除失权隐藏而不重置记录',()=>{
 let {s,library}=fixture();s=togglePin(s,s.meId,library.id,'shared');s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[{type:'company',id:companyId(s),role:'viewer'}])},s.meId);
 assert.equal(visiblePins(s,s.meId).find(p=>p.library.id===library.id).view,'shared');s.spaces=s.spaces.map(l=>l.id===library.id?{...l,deletedAt:'deleted'}:l);assert.equal(visiblePins(s,s.meId).some(p=>p.library.id===library.id),false);assert.ok(pinnedRecords(s,s.meId).some(p=>p.spaceId===library.id));
});
