import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectKey } from './permissions.js';
import {
  DEFAULT_ADD_ROLE, addedByCaption, collaboratorCaption, subjectCountLabel,
  composeOrdinarySubjects, filterNewCollaborators, prepareAddedCollaborators,
  rejectNonElevatingInherited, applyCollaboratorAction, applyBatchCollaboratorAction,
  rowRoleOptions, batchPermissionOptions, MODE_SWITCH_COPY
} from './collaboratorRules.js';

const state={members:[{id:'zhou-ning',name:'周宁'},{id:'chen-ke',name:'陈可'},{id:'lin-xia',name:'林夏'}]};
const person=(id,role,addedBy)=>({type:'person',id,role,...(addedBy?{addedBy}:{})});

test('迁移用的合成函数仍对同对象取较高档，产品交互不再用它叠加入继承项',()=>{
  const inherited=[person('chen-ke','manager'),person('zhao-heng','editor')];
  const local=[person('chen-ke','editor','zhou-ning')];
  const composed=composeOrdinarySubjects(inherited,local);
  assert.deepEqual(composed.map(s=>[s.id,s.role]),[['chen-ke','manager'],['zhao-heng','editor']]);
});

test('继承模式文案为继承权限且不能改项；自定义文案记录转换或添加者',()=>{
  const inherited=[person('chen-ke','viewer')];
  assert.equal(collaboratorCaption(state,inherited[0],{mode:'inherit'}),'继承权限');
  assert.match(applyCollaboratorAction(state,{localSubjects:[],inheritedSubjects:inherited,mode:'inherit'},inherited[0],'editor','zhou-ning').error,/继承模式不能修改/);
  const result=applyCollaboratorAction(state,{localSubjects:[],inheritedSubjects:inherited,mode:'custom'},person('chen-ke','viewer'),'editor','zhou-ning');
  assert.equal(result.error,undefined);
  assert.deepEqual(result.localSubjects,[person('chen-ke','editor','zhou-ning')]);
  assert.equal(collaboratorCaption(state,result.localSubjects[0],{mode:'custom'}),'自定义权限：由「周宁」添加');
  assert.equal(addedByCaption(state,'missing'),'本项单独授权');
  assert.match(MODE_SWITCH_COPY.custom.body,/不再影响本项/);
  assert.match(MODE_SWITCH_COPY.inherit.body,/全部失效/);
});

test('自定义模式下可以改或移除快照项，继承模式选项全部锁定',()=>{
  const local=[person('chen-ke','editor','zhou-ning')];
  assert.deepEqual(applyCollaboratorAction(state,{localSubjects:local,mode:'custom'},local[0],'viewer','zhou-ning').localSubjects,[person('chen-ke','viewer','zhou-ning')]);
  assert.deepEqual(applyCollaboratorAction(state,{localSubjects:local,mode:'custom'},local[0],'remove','zhou-ning').localSubjects,[]);
  assert.deepEqual(rowRoleOptions('inherited','editor',undefined,'inherit').map(o=>[o.value,o.disabled]),[['manager',true],['editor',true],['downloader',true],['viewer',true]]);
  assert.deepEqual(rowRoleOptions('local','editor',undefined,'custom').every(o=>o.disabled),false);
});

test('批量在继承模式全部禁用；自定义可改可删',()=>{
  const local=[person('chen-ke','viewer','lin-xia'),person('zhao-heng','editor','zhou-ning')];
  const keys=local.map(subjectKey);
  assert.equal(batchPermissionOptions([{kind:'inherited',role:'viewer'}],'inherit').canRemove,false);
  assert.ok(batchPermissionOptions([{kind:'inherited',role:'viewer'}],'inherit').options.every(o=>o.disabled));
  assert.equal(batchPermissionOptions([{kind:'local',role:'editor'}],'custom').canRemove,true);
  assert.match(applyBatchCollaboratorAction(state,{localSubjects:local,mode:'inherit'},keys,'remove','zhou-ning').error,/继承模式不能修改/);
  const changed=applyBatchCollaboratorAction(state,{localSubjects:local,mode:'custom'},keys,'manager','zhou-ning');
  assert.equal(changed.error,undefined);
  assert.deepEqual(changed.localSubjects.map(s=>[s.id,s.role,s.addedBy]).sort(),[['chen-ke','manager','lin-xia'],['zhao-heng','manager','zhou-ning']]);
  const removed=applyBatchCollaboratorAction(state,{localSubjects:local,mode:'custom'},[subjectKey(local[0])],'remove','zhou-ning');
  assert.deepEqual(removed.localSubjects,[local[1]]);
});

test('确认添加默认可查看并下载，取消不写入，已有对象不会重复加入',()=>{
  assert.equal(DEFAULT_ADD_ROLE,'downloader');
  const existing=[person('chen-ke','viewer')];
  const prepared=prepareAddedCollaborators([{type:'person',id:'lin-xia'},{type:'department',id:'product'},person('chen-ke','manager')], 'zhou-ning', existing);
  assert.deepEqual(prepared.map(s=>[s.type,s.id,s.role,s.addedBy]),[['person','lin-xia','downloader','zhou-ning'],['department','product','downloader','zhou-ning']]);
  assert.equal(subjectCountLabel(prepared),'共1部门、1人');
  assert.equal(subjectCountLabel([{type:'company',id:'org'},{type:'person',id:'a'},{type:'person',id:'b'}]),'共1公司、0部门、2人');
  assert.deepEqual(filterNewCollaborators([],existing),[]);
  const inherited=[person('chen-ke','editor')];
  assert.deepEqual(rejectNonElevatingInherited([person('chen-ke','viewer'),person('lin-xia','downloader'),person('chen-ke','manager')],inherited).map(s=>[s.id,s.role]),[['lin-xia','downloader'],['chen-ke','manager']]);
});
