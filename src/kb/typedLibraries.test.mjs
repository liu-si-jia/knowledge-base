import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, seedState } from './store.js';
import { createContent } from './contentCreation.js';
import { createLibrary } from './libraryCreation.js';
import { accessFromSubjects, companyId } from './permissions.js';
import { contentRights, libraryRights, librariesForView, saveEntityAccess, deleteContent, restoreContent, restoreNeedsLocation, switchNodePermissionMode } from './access.js';
import { addCollaborators } from './permissionOperations.js';
import { relocateContent } from './contentOperations.js';
import { performBatch, sourceLocations } from './fileActions.js';

const fresh=()=>normalizeState(seedState()),node=(s,id)=>s.nodes.find(n=>n.id===id),person=(id,role)=>({type:'person',id,role});
test('固定类型互斥，自己创建的共享库不进个人；公司授权不改变类型',()=>{
  let s=fresh();assert.deepEqual(librariesForView(s,s.meId,'personal').map(l=>l.id),['space-personal']);
  assert.ok(librariesForView(s,s.meId,'shared').some(l=>l.id==='space-company-share'));
  assert.equal(librariesForView(s,s.meId,'plaza').some(l=>l.id==='space-company-share'),false);
  s=saveEntityAccess(s,{id:'space-handbook',entity:'space',access:accessFromSubjects(s,[{type:'company',id:companyId(s),role:'editor'}])},s.meId);
  assert.ok(librariesForView(s,s.meId,'shared').some(l=>l.id==='space-handbook'));
  assert.equal(librariesForView(s,s.meId,'plaza').some(l=>l.id==='space-handbook'),false);
});
test('个人库只准本人访问；拒绝给库或内容添加协作者',()=>{
  const s=fresh();assert.equal(contentRights(s,node(s,'doc-note'),'chen-ke').view,false);
  assert.throws(()=>addCollaborators(s,{id:'doc-note',subjects:[person('chen-ke','viewer')]},s.meId),/移动/);
  assert.throws(()=>saveEntityAccess(s,{id:'space-personal',entity:'space',access:accessFromSubjects(s,[person('chen-ke','viewer')])},s.meId),/个人知识库/);
});
test('新建文件默认继承：本项与知识库负责人受保护，祖先文件夹负责人按可管理继承且自定义后可改',()=>{
  let s=fresh();const made=createContent(s,{spaceId:'space-retro',parentId:'folder-retro',format:'doc',name:'实施说明'},'lin-xia');s=made.state;
  for(const id of ['lin-xia','zhou-ning','zhao-heng'])assert.equal(contentRights(s,node(s,made.node.id),id).manage,true);
  s=saveEntityAccess(s,{id:made.node.id,permissionMode:'custom',localAccess:accessFromSubjects(s,[person('zhou-ning','viewer')])},'lin-xia');
  assert.equal(contentRights(s,node(s,made.node.id),'zhou-ning').manage,false);
  assert.equal(contentRights(s,node(s,made.node.id),'zhou-ning').view,true);
  assert.equal(contentRights(s,node(s,made.node.id),'zhao-heng').manage,true);
  assert.equal(contentRights(s,node(s,made.node.id),'lin-xia').manage,true);
  assert.equal(node(s,made.node.id).inheritedExclusions.length,0);
});
test('广场全公司查看底线不可移除；继承子项跟随上级额外公司授权，撤销需在上级进行',()=>{
  let s=fresh();assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').view,true);assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').download,false);
  s=saveEntityAccess(s,{id:'space-plaza',entity:'space',access:accessFromSubjects(s,[{type:'company',id:companyId(s),role:'editor'}])},'zhao-heng');
  assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').edit,true);
  s=saveEntityAccess(s,{id:'doc-plaza',permissionMode:'inherit',localAccess:accessFromSubjects(s,[])},'zhao-heng');
  assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').view,true);assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').edit,true);
  s=saveEntityAccess(s,{id:'space-plaza',entity:'space',access:accessFromSubjects(s,[])},'zhao-heng');assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').view,true);assert.equal(contentRights(s,node(s,'doc-plaza'),'chen-ke').edit,false);assert.equal(libraryRights(s,s.spaces.find(l=>l.id==='space-plaza'),'chen-ke').view,true);
});
test('自定义快照不随父级调高；继承子项才跟随父级当前实际权限',()=>{
  let s=fresh();s=saveEntityAccess(s,{id:'doc-faq',permissionMode:'custom',localAccess:accessFromSubjects(s,[person('chen-ke','viewer')])},s.meId);
  s=saveEntityAccess(s,{id:'space-handbook',entity:'space',access:accessFromSubjects(s,[])},s.meId);
  s=saveEntityAccess(s,{id:'space-handbook',entity:'space',access:accessFromSubjects(s,[person('chen-ke','manager')])},s.meId);
  assert.equal(contentRights(s,node(s,'doc-faq'),'chen-ke').view,true);assert.equal(contentRights(s,node(s,'doc-faq'),'chen-ke').manage,false);assert.equal(node(s,'doc-faq').localAccess.subjects[0].role,'viewer');
  s=saveEntityAccess(s,{id:'doc-faq',permissionMode:'inherit',localAccess:accessFromSubjects(s,[])},s.meId);
  assert.equal(contentRights(s,node(s,'doc-faq'),'chen-ke').manage,true);
});
test('跨库根目录移动保留原 ID、创建人与正文，原个人位置不留副本',()=>{
  const s=fresh(),before=node(s,'doc-note'),r=relocateContent(s,{id:before.id,mode:'move',spaceId:'space-handbook',parentId:'',expectedSpaceId:before.spaceId,expectedParentId:''},s.meId);
  assert.equal(r.node.id,before.id);assert.equal(r.node.ownerId,before.ownerId);assert.equal(r.node.body,before.body);assert.equal(r.node.createdAt,before.createdAt);
  assert.equal(r.node.spaceId,'space-handbook');assert.equal(r.state.nodes.filter(n=>n.id===before.id).length,1);assert.equal(s.nodes.find(n=>n.id===before.id).spaceId,'space-personal');
});
test('别人创建的文件和混合创建人文件夹禁止移入个人，但可独立复制',()=>{
  const s=fresh();for(const id of ['doc-guide','folder-guide'])assert.throws(()=>relocateContent(s,{id,mode:'move',spaceId:'space-personal',parentId:''},s.meId),/组织原件/);
  const r=relocateContent(s,{id:'folder-guide',mode:'copy',spaceId:'space-personal',parentId:''},s.meId),copies=r.state.nodes.filter(n=>!s.nodes.some(old=>old.id===n.id));
  assert.equal(copies.length,2);assert.ok(copies.every(n=>n.ownerId===s.meId&&n.spaceId==='space-personal'));assert.equal(contentRights(r.state,r.node,'chen-ke').view,false);
  assert.equal(node(r.state,'doc-guide').ownerId,'chen-ke');assert.equal(node(r.state,'doc-guide').spaceId,'space-handbook');
});
test('仅在线查看者不能通过复制绕过下载限制',()=>{
  const s=fresh();assert.equal(contentRights(s,node(s,'doc-company'),'lin-xia').view,true);assert.equal(contentRights(s,node(s,'doc-company'),'lin-xia').download,false);
  assert.throws(()=>relocateContent(s,{id:'doc-company',mode:'copy',spaceId:'space-handbook',parentId:''},'lin-xia'),/下载/);
});
test('移动后改回继承并清空普通授权，目标位置的知识库负责人与本项负责人生效',()=>{
  let s=fresh();const made=createContent(s,{spaceId:'space-retro',parentId:'folder-retro',format:'doc',name:'移动权限说明'},'lin-xia');s=made.state;
  const switched=switchNodePermissionMode(s,node(s,made.node.id),'custom','lin-xia');
  s=saveEntityAccess(s,{id:made.node.id,permissionMode:switched.permissionMode,localAccess:switched.localAccess,convertedBy:switched.convertedBy},'lin-xia');
  s=saveEntityAccess(s,{id:made.node.id,permissionMode:'custom',localAccess:accessFromSubjects(s,[...s.nodes.find(n=>n.id===made.node.id).localAccess.subjects,person('chen-ke','editor')]),convertedBy:'lin-xia'},'lin-xia');
  const r=relocateContent(s,{id:made.node.id,mode:'move',spaceId:'space-company-share',parentId:''},s.meId);
  assert.equal(r.node.localAccess.subjects.length,0);assert.equal(r.node.inheritedExclusions.length,0);
  assert.equal(contentRights(r.state,r.node,'zhou-ning').edit,true);assert.equal(contentRights(r.state,r.node,'zhou-ning').manage,false);
  assert.equal(contentRights(r.state,r.node,'zhao-heng').manage,false);assert.equal(contentRights(r.state,r.node,'lin-xia').manage,true);assert.equal(contentRights(r.state,r.node,'chen-ke').manage,true);
});
test('批量跨库整体校验，不因同为根目录而判定原地，也不部分移动',()=>{
  const s=fresh(),before=structuredClone(s),ids=['doc-faq','doc-guide'];
  assert.throws(()=>performBatch(s,{ids,sourceSpaceId:'space-handbook',targetSpaceId:'space-personal',action:'move',parentId:'',expected:sourceLocations(s,ids)},s.meId),/组织原件/);
  assert.deepEqual(s,before);
  const r=performBatch(s,{ids:['doc-note'],sourceSpaceId:'space-personal',targetSpaceId:'space-handbook',action:'move',parentId:'',expected:sourceLocations(s,['doc-note'])},s.meId);
  assert.equal(node(r.state,'doc-note').spaceId,'space-handbook');
});
test('删除记录的原父级跨库移动后，可选择新位置恢复原文件',()=>{
  let s=fresh();s=deleteContent(s,'doc-guide',s.meId);
  s=relocateContent(s,{id:'folder-guide',mode:'move',spaceId:'space-retro',parentId:''},s.meId).state;
  const deleted=node(s,'doc-guide');assert.equal(restoreNeedsLocation(s,deleted),true);assert.ok(deleted.originalLocation.includes('产品手册库'));
  assert.throws(()=>restoreContent(s,deleted.id,s.meId),/选择恢复位置/);
  s=restoreContent(s,deleted.id,s.meId,{spaceId:'space-retro',parentId:''});
  assert.equal(node(s,deleted.id).spaceId,'space-retro');assert.equal(node(s,deleted.id).deletedAt,'');assert.equal(node(s,deleted.id).ownerId,'chen-ke');
});
test('新建库保存固定类型，广场初始全员查看，个人拒绝其他成员',()=>{
  const s=fresh(),r=createLibrary(s,{name:'新的广场',initializer:'plaza'},s.meId);
  assert.equal(r.library.kind,'plaza');assert.equal(libraryRights(r.state,r.library,'chen-ke').view,true);assert.equal(libraryRights(r.state,r.library,'chen-ke').download,false);
  assert.throws(()=>createLibrary(s,{name:'不合法个人',initializer:'personal',access:accessFromSubjects(s,[person('chen-ke','viewer')])},s.meId),/个人知识库/);
});
