import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, normalizeState } from './store.js';
import { saveEntityAccess, contentRights, permissionLayers } from './access.js';
import { createLibrary } from './libraryCreation.js';
import { createContent } from './contentCreation.js';
import { accessFromSubjects } from './permissions.js';
import { applyCollaboratorAction, applyBatchCollaboratorAction, rowRoleOptions, batchPermissionOptions, managementDraftFromShare } from './collaboratorRules.js';
import { addCollaborators } from './permissionOperations.js';
const person=(id,role,addedBy)=>({type:'person',id,role,...(addedBy?{addedBy}:{})});
function fixture(){
  let s=normalizeState(seedState());
  const lib=createLibrary(s,{name:'回修模拟测试库',initializer:'shared',access:accessFromSubjects(s,[person('chen-ke','editor')])},s.meId);s=lib.state;
  const made=createContent(s,{spaceId:lib.library.id,format:'doc',name:'回修测试文档'},s.meId);s=made.state;
  const id=made.node.id,lid=lib.library.id;
  return {s,id,lid};
}
const get=(s,id)=>s.nodes.find(n=>n.id===id);
const local=(s,id,subjects)=>saveEntityAccess(s,{id,localAccess:accessFromSubjects(s,subjects)},s.meId);
const parent=(s,lid,role)=>saveEntityAccess(s,{id:lid,entity:'space',access:accessFromSubjects(s,[person('chen-ke',role)])},s.meId);
test('继承editor→本项manager后不能降viewer；移除本项恢复继承且不可移除继承',()=>{
  let {s,id}=fixture();s=local(s,id,[person('chen-ke','manager')]);
  const layers=permissionLayers(s,get(s,id)),args={localSubjects:layers.local.subjects,inheritedSubjects:layers.inherited.subjects};
  assert.match(applyCollaboratorAction(s,args,person('chen-ke','manager'),'viewer','lin-xia').error,/继承权限下限/);
  assert.equal(rowRoleOptions('local','manager','editor').find(o=>o.value==='viewer').disabled,true);
  assert.throws(()=>local(s,id,[person('chen-ke','viewer')]),/继承权限下限/);
  s=local(s,id,[]);assert.equal(contentRights(s,get(s,id),'chen-ke').edit,true);assert.equal(contentRights(s,get(s,id),'chen-ke').manage,false);
  assert.match(applyCollaboratorAction(s,{localSubjects:[],inheritedSubjects:layers.inherited.subjects},person('chen-ke','editor'),'remove','lin-xia').error,/不能移除/);
});
test('上级调高/低不改local原值，实际取高；unchanged低local可保存、修改低于下限会拒绝',()=>{
  let {s,id,lid}=fixture();s=local(s,id,[person('chen-ke','manager')]);s=local(s,id,[person('chen-ke','editor')]);
  const stored=structuredClone(get(s,id).localAccess.subjects);
  s=parent(s,lid,'manager');assert.deepEqual(get(s,id).localAccess.subjects,stored);assert.equal(contentRights(s,get(s,id),'chen-ke').manage,true);
  assert.doesNotThrow(()=>local(s,id,stored));
  assert.throws(()=>local(s,id,[person('chen-ke','downloader')]),/继承权限下限/);
  s=parent(s,lid,'viewer');assert.deepEqual(get(s,id).localAccess.subjects,stored);assert.equal(contentRights(s,get(s,id),'chen-ke').edit,true);
  s=local(s,id,[]);assert.equal(contentRights(s,get(s,id),'chen-ke').download,false);assert.equal(contentRights(s,get(s,id),'chen-ke').view,true);
});
test('批量本项也不能低于继承下限；移除只删本项并恢复继承',()=>{
  let {s,id}=fixture();s=local(s,id,[person('chen-ke','manager')]);
  const layers=permissionLayers(s,get(s,id)),args={localSubjects:layers.local.subjects,inheritedSubjects:layers.inherited.subjects};
  assert.equal(batchPermissionOptions([{kind:'local',role:'manager',inheritedRole:'editor'}]).options.find(o=>o.value==='viewer').disabled,true);
  assert.match(applyBatchCollaboratorAction(s,args,['person:chen-ke'],'viewer','lin-xia').error,/不能下调/);
  const removed=applyBatchCollaboratorAction(s,args,['person:chen-ke'],'remove','lin-xia');assert.deepEqual(removed.localSubjects,[]);
  const changed=applyBatchCollaboratorAction(s,args,['person:chen-ke'],'editor','lin-xia');assert.equal(changed.localSubjects[0].addedBy,s.meId);
});
test('addedBy是真实首次添加者；改单项/批量/持久化不改作者，未知历史不补造',()=>{
  let {s,id,lid}=fixture();s=local(s,id,[person('lin-xia','viewer','forged')]);assert.equal(get(s,id).localAccess.subjects[0].addedBy,s.meId);
  s=parent(s,lid,'manager');
  s=saveEntityAccess(s,{id,localAccess:accessFromSubjects(s,[person('lin-xia','editor','forged')])},'chen-ke');assert.equal(get(s,id).localAccess.subjects[0].addedBy,s.meId);
  get(s,id).localAccess.subjects[0]={type:'person',id:'lin-xia',role:'editor'}; // unknown historical author
  s=local(s,id,[person('lin-xia','manager','forged')]);assert.equal(get(s,id).localAccess.subjects[0].addedBy,undefined);
});
test('纯规则修改已有本项保留添加者和未知历史；继承上调才填当前操作者',()=>{
  for(const addedBy of ['zhou-ning',undefined]){
    const row=person('lin-xia','viewer',addedBy),args={localSubjects:[row],inheritedSubjects:[]};
    const changed=applyCollaboratorAction({},args,row,'editor','chen-ke');assert.equal(changed.localSubjects[0].addedBy,addedBy);
    const batch=applyBatchCollaboratorAction({},args,['person:lin-xia'],'manager','chen-ke');assert.equal(batch.localSubjects[0].addedBy,addedBy);
  }
  const next=applyCollaboratorAction({},{localSubjects:[],inheritedSubjects:[person('lin-xia','viewer')]},person('lin-xia','viewer'),'editor','chen-ke');assert.equal(next.localSubjects[0].addedBy,'chen-ke');
});
test('分享待新增draft不进入管理保存；取消不落盘，分享确认保存记录真正添加者',()=>{
  let {s,id}=fixture();const before=structuredClone(s),pending=[person('lin-xia','downloader')];
  const target={layers:permissionLayers(s,get(s,id))};
  const draft=managementDraftFromShare(target,'node');assert.deepEqual(draft.subjects,[]);assert.deepEqual(s,before);
  s=local(s,id,draft.subjects);assert.equal(get(s,id).localAccess.subjects.length,0);assert.deepEqual(pending,[person('lin-xia','downloader')]);
  s=addCollaborators(s,{id,subjects:pending},s.meId);assert.equal(get(s,id).localAccess.subjects[0].addedBy,s.meId);
});
