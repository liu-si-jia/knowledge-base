import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, normalizeState } from './store.js';
import { accessFromSubjects, subjectKey } from './permissions.js';
import {
  contentRights, libraryRights, saveEntityAccess, permissionLayers,
  displayedResponsibles, inheritedOrdinarySubjects, permissionModeFor,
  switchNodePermissionMode, migrateAccess,
} from './access.js';
import { createLibrary } from './libraryCreation.js';
import { createContent } from './contentCreation.js';
import { handoverReason, handoverSnapshot, transferResponsibility } from './handover.js';
import { collaboratorCaption, applyCollaboratorAction, applyBatchCollaboratorAction } from './collaboratorRules.js';
import { addCollaborators } from './permissionOperations.js';

const person=(id,role,addedBy)=>({type:'person',id,role,...(addedBy?{addedBy}:{})});
const get=(s,id)=>s.nodes.find(n=>n.id===id)||s.spaces.find(n=>n.id===id);
function setup(){
  let s=normalizeState(seedState());
  const lib=createLibrary(s,{name:'权限模型验收库',initializer:'shared',access:accessFromSubjects(s,[person('chen-ke','editor'),person('zhou-ning','editor'),person('lin-xia','editor')])},'zhao-heng');
  s={...lib.state,viewAs:'zhao-heng'};
  const folder=createContent(s,{spaceId:lib.library.id,format:'folder',name:'验收文件夹'},'zhou-ning');s=folder.state;
  const doc=createContent(s,{spaceId:lib.library.id,parentId:folder.node.id,format:'doc',name:'验收文档'},'lin-xia');s=doc.state;
  return {s,library:s.spaces.find(l=>l.id===lib.library.id),folder:get(s,folder.node.id),doc:get(s,doc.node.id)};
}
const toCustom=(s,id,userId)=>{
  const result=switchNodePermissionMode(s,get(s,id),'custom',userId);
  return saveEntityAccess(s,{id,permissionMode:result.permissionMode,localAccess:result.localAccess,convertedBy:result.convertedBy},userId);
};
const toInherit=(s,id,userId)=>{
  const result=switchNodePermissionMode(s,get(s,id),'inherit',userId);
  return saveEntityAccess(s,{id,permissionMode:result.permissionMode,localAccess:result.localAccess,convertedBy:result.convertedBy},userId);
};

const asUser=(s,userId)=>({...s,viewAs:userId});
test('转交后原负责人完全退出，但知识库负责人身份仍保留',()=>{
  let {s,library,doc}=setup();
  s=saveEntityAccess(asUser(s,'zhao-heng'),{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','editor'),person('zhou-ning','editor')])},'zhao-heng');
  const result=transferResponsibility(asUser(s,'lin-xia'),{id:doc.id,newResponsibleId:'chen-ke',expected:handoverSnapshot(s,doc.id)},'lin-xia');
  s=result.state;const item=get(s,doc.id);
  assert.equal(item.creatorId,'lin-xia');
  assert.equal(item.responsibleId,'chen-ke');
  assert.equal(contentRights(s,item,'lin-xia').manage,false);
  assert.equal(contentRights(s,item,'lin-xia').view,false);
  // Hand over the folder, then confirm the library owner still has manage on the file.
  const folderHand=transferResponsibility(asUser(s,'zhou-ning'),{id:get(s,doc.parentId).id,newResponsibleId:'chen-ke',includeChildren:false,expected:handoverSnapshot(s,doc.parentId)},'zhou-ning');
  s=folderHand.state;
  assert.equal(libraryRights(s,get(s,library.id),'zhao-heng').manage,true);
  assert.equal(contentRights(s,get(s,doc.id),'zhao-heng').manage,true);
  const libHand=transferResponsibility(asUser(s,'zhao-heng'),{id:library.id,entity:'space',newResponsibleId:'chen-ke',includeChildren:false,expected:handoverSnapshot(s,library.id,'space')},'zhao-heng');
  s=libHand.state;
  assert.equal(libraryRights(s,get(s,library.id),'zhao-heng').manage,false);
  assert.equal(contentRights(s,get(s,doc.id),'zhao-heng').manage,false);
});

test('继承父级实际权限并可沿目录链路传递',()=>{
  let {s,library,folder,doc}=setup();
  assert.equal(permissionModeFor(folder),'inherit');
  assert.equal(permissionModeFor(doc),'inherit');
  assert.equal(contentRights(s,folder,'chen-ke').edit,true);
  assert.equal(contentRights(s,doc,'chen-ke').edit,true);
  assert.equal(contentRights(s,doc,'zhou-ning').manage,true); // parent folder responsible inherited as 可管理
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','manager')])},'zhao-heng');
  assert.equal(contentRights(s,get(s,doc.id),'chen-ke').manage,true);
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','viewer')])},'zhao-heng');
  assert.equal(contentRights(s,get(s,doc.id),'chen-ke').manage,false);
  assert.equal(contentRights(s,get(s,doc.id),'chen-ke').view,true);
});

test('继承模式不能加人也不能改继承项',()=>{
  const {s,doc}=setup();
  const layers=permissionLayers(s,doc);
  assert.equal(layers.mode,'inherit');
  assert.match(applyCollaboratorAction(s,{localSubjects:[],inheritedSubjects:layers.inherited.subjects,mode:'inherit'},layers.inherited.subjects[0],'manager','lin-xia').error,/继承模式不能修改/);
  assert.match(applyBatchCollaboratorAction(s,{localSubjects:[],inheritedSubjects:layers.inherited.subjects,mode:'inherit'},[subjectKey(layers.inherited.subjects[0])],'remove','lin-xia').error,/继承模式不能修改/);
  assert.throws(()=>addCollaborators(s,{id:doc.id,subjects:[person('chen-ke','manager')]},'lin-xia'),/转为自定义/);
  assert.throws(()=>saveEntityAccess(s,{id:doc.id,permissionMode:'inherit',localAccess:accessFromSubjects(s,[person('chen-ke','manager')])},'lin-xia'),/转为自定义/);
  assert.equal(collaboratorCaption(s,layers.inherited.subjects[0],{mode:'inherit'}),'继承权限');
});

test('转自定义快照当时继承的普通权限，父级再改不影响快照',()=>{
  let {s,library,doc}=setup();
  s=toCustom(s,doc.id,'lin-xia');
  const item=get(s,doc.id);
  assert.equal(item.permissionMode,'custom');
  assert.equal(item.convertedBy,'lin-xia');
  assert.equal(item.localAccess.subjects.find(row=>row.id==='chen-ke').role,'editor');
  assert.equal(item.localAccess.subjects.find(row=>row.id==='chen-ke').addedBy,'lin-xia');
  assert.ok(item.localAccess.subjects.some(row=>row.id==='zhou-ning'&&row.role==='manager'));
  assert.equal(collaboratorCaption(s,item.localAccess.subjects[0],{mode:'custom'}),'自定义权限：由「林夏」添加');
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','viewer')])},'zhao-heng');
  const current=get(s,doc.id);
  assert.equal(current.localAccess.subjects.find(row=>row.id==='chen-ke').role,'editor');
  assert.equal(contentRights(s,current,'chen-ke').edit,true);
  assert.equal(contentRights(s,current,'chen-ke').view,true);
  assert.equal(contentRights(s,current,'chen-ke').manage,false);
});

test('改回继承后自定义添加和修改全部失效并重新跟随父级',()=>{
  let {s,library,doc}=setup();
  s=toCustom(s,doc.id,'lin-xia');
  s=saveEntityAccess(s,{id:doc.id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('chen-ke','manager'),person('zhou-ning','viewer')]),convertedBy:'lin-xia'},'lin-xia');
  assert.equal(contentRights(s,get(s,doc.id),'chen-ke').manage,true);
  s=saveEntityAccess(s,{id:library.id,entity:'space',access:accessFromSubjects(s,[person('chen-ke','viewer')])},'zhao-heng');
  assert.equal(contentRights(s,get(s,doc.id),'chen-ke').manage,true);
  s=toInherit(s,doc.id,'lin-xia');
  const item=get(s,doc.id);
  assert.equal(item.permissionMode,'inherit');
  assert.equal(item.localAccess.subjects.length,0);
  assert.equal(item.convertedBy,undefined);
  assert.equal(contentRights(s,item,'chen-ke').manage,false);
  assert.equal(contentRights(s,item,'chen-ke').view,true);
  assert.equal(contentRights(s,item,'zhou-ning').manage,true);
});

test('知识库负责人在下级不可移除或降权，自定义后也一样',()=>{
  let {s,doc}=setup();
  const header=displayedResponsibles(s,doc);
  assert.ok(header.some(row=>row.id==='zhao-heng'&&row.sources.includes('知识库负责人')));
  assert.ok(!inheritedOrdinarySubjects(s,doc).some(row=>row.type==='person'&&row.id==='zhao-heng'));
  s=toCustom(s,doc.id,'lin-xia');
  assert.ok(!get(s,doc.id).localAccess.subjects.some(row=>row.id==='zhao-heng'));
  assert.equal(contentRights(s,get(s,doc.id),'zhao-heng').manage,true);
  s=saveEntityAccess(s,{id:doc.id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('zhao-heng','viewer')])},'lin-xia');
  const item=get(s,doc.id);
  assert.ok(!item.localAccess.subjects.some(row=>row.id==='zhao-heng'));
  assert.equal(contentRights(s,item,'zhao-heng').manage,true);
});

test('祖先文件夹负责人转自定义后可以改或去掉',()=>{
  let {s,doc}=setup();
  assert.equal(contentRights(s,doc,'zhou-ning').manage,true);
  assert.ok(inheritedOrdinarySubjects(s,doc).some(row=>row.id==='zhou-ning'&&row.role==='manager'));
  s=toCustom(s,doc.id,'lin-xia');
  assert.ok(get(s,doc.id).localAccess.subjects.some(row=>row.id==='zhou-ning'&&row.role==='manager'));
  s=saveEntityAccess(s,{id:doc.id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('zhou-ning','viewer')]),convertedBy:'lin-xia'},'lin-xia');
  assert.equal(contentRights(s,get(s,doc.id),'zhou-ning').manage,false);
  assert.equal(contentRights(s,get(s,doc.id),'zhou-ning').view,true);
  s=saveEntityAccess(s,{id:doc.id,permissionMode:'custom',localAccess:accessFromSubjects(s,[]),convertedBy:'lin-xia'},'lin-xia');
  assert.equal(contentRights(s,get(s,doc.id),'zhou-ning').view,false);
});

test('同一人不重复出现在上方负责人区和权限列表',()=>{
  let {s,library,folder}=setup();
  const same=displayedResponsibles(s,folder);
  assert.equal(same.filter(row=>row.id==='zhou-ning'||row.id==='zhao-heng').length,2);
  assert.ok(!inheritedOrdinarySubjects(s,folder).some(row=>row.type==='person'&&(row.id==='zhou-ning'||row.id==='zhao-heng')));
  // Make the folder responsible the same person as the library owner.
  s={...s,nodes:s.nodes.map(n=>n.id===folder.id?{...n,responsibleId:'zhao-heng'}:n)};
  const merged=displayedResponsibles(s,get(s,folder.id));
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,'zhao-heng');
  assert.deepEqual(merged[0].sources,['知识库负责人','本项负责人']);
  assert.ok(!inheritedOrdinarySubjects(s,get(s,folder.id)).some(row=>row.type==='person'&&row.id==='zhao-heng'));
  const spaceRows=displayedResponsibles(s,library,'space');
  assert.equal(spaceRows.length,1);
  assert.equal(spaceRows[0].id,'zhao-heng');
});

test('继承来的可管理不能交接本项负责人，仅本项或知识库负责人可以',()=>{
  const {s,doc}=setup();
  assert.match(handoverReason(s,doc.id,'node','zhou-ning'),/只有当前负责人或知识库负责人/);
  assert.match(handoverReason(s,doc.id,'node','chen-ke'),/只有当前负责人或知识库负责人/);
  assert.equal(handoverReason(s,doc.id,'node','lin-xia'),'');
  assert.equal(handoverReason(s,doc.id,'node','zhao-heng'),'');
});

test('取消切换不改变模式；无管理权限者不能转换',()=>{
  const {s,doc}=setup();
  const before=structuredClone(doc);
  // Confirmation is a UI concern; calling switch is what a confirmed action does.
  assert.throws(()=>switchNodePermissionMode(s,doc,'custom','chen-ke'),/管理权限/);
  assert.deepEqual(get(s,doc.id),before);
  const next=switchNodePermissionMode(s,doc,'inherit','lin-xia');
  assert.equal(next.permissionMode,'inherit');
  assert.equal(get(s,doc.id).permissionMode,'inherit');
});

test('规范化把旧分层本项授权收敛为自定义快照，并保持幂等',()=>{
  const {s,doc}=setup();
  const state=structuredClone(s);
  const node=state.nodes.find(n=>n.id===doc.id);
  node.permissionMode='layered';
  node.localAccess=accessFromSubjects(state,[person('chen-ke','manager')]);
  const first=migrateAccess(state);
  const migrated=first.nodes.find(n=>n.id===node.id);
  assert.equal(migrated.permissionMode,'custom');
  assert.equal(migrated.localAccess.subjects.find(row=>row.id==='chen-ke').role,'manager');
  assert.ok(migrated.localAccess.subjects.some(row=>row.id==='zhou-ning'&&row.role==='manager'));
  assert.deepEqual(migrateAccess(first),first);
});
