import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, normalizeState } from './store.js';
import { saveEntityAccess, contentRights, permissionLayers, switchNodePermissionMode } from './access.js';
import { createLibrary } from './libraryCreation.js';
import { createContent } from './contentCreation.js';
import { accessFromSubjects } from './permissions.js';
import { applyCollaboratorAction, applyBatchCollaboratorAction, rowRoleOptions, batchPermissionOptions, collaboratorCaption } from './collaboratorRules.js';
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
const persistMode=(s,id,userId,next)=>{
  const result=switchNodePermissionMode(s,get(s,id),next,userId);
  return saveEntityAccess(s,{id,permissionMode:result.permissionMode,localAccess:result.localAccess,convertedBy:result.convertedBy},userId);
};
test('继承模式不能改项或加人；转自定义后才可调整快照',()=>{
  let {s,id}=fixture();
  const layers=permissionLayers(s,get(s,id)),args={localSubjects:[],inheritedSubjects:layers.inherited.subjects,mode:'inherit'};
  assert.match(applyCollaboratorAction(s,args,layers.inherited.subjects[0],'viewer','zhou-ning').error,/继承模式不能修改/);
  assert.equal(rowRoleOptions('inherited','editor',undefined,'inherit').every(o=>o.disabled),true);
  assert.throws(()=>addCollaborators(s,{id,subjects:[person('lin-xia','viewer')]},s.meId),/转为自定义/);
  s=persistMode(s,id,s.meId,'custom');
  const custom=permissionLayers(s,get(s,id));
  const changed=applyCollaboratorAction(s,{localSubjects:custom.local.subjects,mode:'custom'},custom.local.subjects[0],'viewer',s.meId);
  assert.equal(changed.error,undefined);
  assert.equal(collaboratorCaption(s,custom.local.subjects[0],{mode:'custom'}),'自定义权限：由「周宁」添加');
});
test('自定义快照不随父级后改；改回继承后重新跟随父级',()=>{
  let {s,id,lid}=fixture();
  s=persistMode(s,id,s.meId,'custom');
  const stored=structuredClone(get(s,id).localAccess.subjects);
  assert.equal(stored.find(row=>row.id==='chen-ke').role,'editor');
  s=saveEntityAccess(s,{id:lid,entity:'space',access:accessFromSubjects(s,[person('chen-ke','manager')])},s.meId);
  assert.deepEqual(get(s,id).localAccess.subjects,stored);
  assert.equal(contentRights(s,get(s,id),'chen-ke').manage,false);
  assert.equal(contentRights(s,get(s,id),'chen-ke').edit,true);
  s=persistMode(s,id,s.meId,'inherit');
  assert.equal(get(s,id).localAccess.subjects.length,0);
  assert.equal(contentRights(s,get(s,id),'chen-ke').manage,true);
});
test('自定义批量可以改或移除；继承模式批量锁定',()=>{
  let {s,id}=fixture();
  s=persistMode(s,id,s.meId,'custom');
  const layers=permissionLayers(s,get(s,id)),args={localSubjects:layers.local.subjects,mode:'custom'};
  assert.equal(batchPermissionOptions([{kind:'local',role:'editor'}],'custom').canRemove,true);
  assert.match(applyBatchCollaboratorAction(s,{...args,mode:'inherit'},['person:chen-ke'],'viewer','zhou-ning').error,/继承模式不能修改/);
  const changed=applyBatchCollaboratorAction(s,args,['person:chen-ke'],'viewer','zhou-ning');
  assert.equal(changed.localSubjects.find(row=>row.id==='chen-ke').role,'viewer');
  assert.equal(changed.localSubjects.find(row=>row.id==='chen-ke').addedBy,s.meId);
  const removed=applyBatchCollaboratorAction(s,args,['person:chen-ke'],'remove','zhou-ning');
  assert.equal(removed.localSubjects.some(row=>row.id==='chen-ke'),false);
});
test('addedBy是真实首次添加者；改单项/批量/持久化不改作者，未知历史不补造',()=>{
  let {s,id}=fixture();
  s=persistMode(s,id,s.meId,'custom');
  s=saveEntityAccess(s,{id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('lin-xia','viewer','forged'),person('chen-ke','manager')]),convertedBy:s.meId},s.meId);
  assert.equal(get(s,id).localAccess.subjects.find(row=>row.id==='lin-xia').addedBy,s.meId);
  s=saveEntityAccess(s,{id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('lin-xia','editor','forged'),person('chen-ke','manager')]),convertedBy:s.meId},'chen-ke');
  assert.equal(get(s,id).localAccess.subjects.find(row=>row.id==='lin-xia').addedBy,s.meId);
  const current=get(s,id);
  current.localAccess.subjects=current.localAccess.subjects.map(row=>row.id==='lin-xia'?{type:'person',id:'lin-xia',role:'editor'}:row);
  s=saveEntityAccess(s,{id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('lin-xia','manager','forged'),person('chen-ke','manager')]),convertedBy:s.meId},s.meId);
  assert.equal(get(s,id).localAccess.subjects.find(row=>row.id==='lin-xia').addedBy,undefined);
});
test('纯规则修改已有自定义项保留添加者和未知历史；新加入才填当前操作者',()=>{
  for(const addedBy of ['zhou-ning',undefined]){
    const row=person('lin-xia','viewer',addedBy),args={localSubjects:[row],inheritedSubjects:[],mode:'custom'};
    const changed=applyCollaboratorAction({},args,row,'editor','chen-ke');assert.equal(changed.localSubjects[0].addedBy,addedBy);
    const batch=applyBatchCollaboratorAction({},args,['person:lin-xia'],'manager','chen-ke');assert.equal(batch.localSubjects[0].addedBy,addedBy);
  }
  const next=applyCollaboratorAction({},{localSubjects:[],inheritedSubjects:[],mode:'custom'},person('lin-xia','viewer'),'editor','chen-ke');assert.equal(next.localSubjects[0].addedBy,'chen-ke');
});
test('权限管理不经过分享草稿；继承模式不能直接加人，转自定义后记录添加者',()=>{
  let {s,id}=fixture();const before=structuredClone(s),pending=[person('lin-xia','downloader')];
  assert.throws(()=>addCollaborators(s,{id,subjects:pending},s.meId),/转为自定义/);
  assert.deepEqual(s,before);
  s=persistMode(s,id,s.meId,'custom');
  s=addCollaborators(s,{id,subjects:pending},s.meId);assert.equal(get(s,id).localAccess.subjects.find(row=>row.id==='lin-xia').addedBy,s.meId);
});
