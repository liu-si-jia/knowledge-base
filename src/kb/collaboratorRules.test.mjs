import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectKey } from './permissions.js';
import {
  DEFAULT_ADD_ROLE, addedByCaption, collaboratorCaption, subjectCountLabel,
  composeOrdinarySubjects, filterNewCollaborators, prepareAddedCollaborators,
  rejectNonElevatingInherited, applyCollaboratorAction, applyBatchCollaboratorAction,
  rowRoleOptions, batchPermissionOptions
} from './collaboratorRules.js';

const state={members:[{id:'zhou-ning',name:'周宁'},{id:'chen-ke',name:'陈可'}]};
const person=(id,role,addedBy)=>({type:'person',id,role,...(addedBy?{addedBy}:{})});

test('本项值独立保存，实际同对象权限取继承与本项较高档',()=>{
  const inherited=[person('chen-ke','manager'),person('zhao-heng','editor')];
  const local=[person('chen-ke','editor','zhou-ning')];
  const composed=composeOrdinarySubjects(inherited,local);
  assert.deepEqual(composed.map(s=>[s.id,s.role]),[['chen-ke','manager'],['zhao-heng','editor']]);
  const afterParent=[person('chen-ke','viewer'),person('zhao-heng','manager')];
  const next=composeOrdinarySubjects(afterParent,local);
  assert.equal(next.find(s=>s.id==='chen-ke').role,'editor');
  assert.equal(next.find(s=>s.id==='zhao-heng').role,'manager');
});

test('继承上调后写入本项并记录添加者，副文案改为由谁添加',()=>{
  const inherited=[person('chen-ke','viewer')];
  const result=applyCollaboratorAction(state,{localSubjects:[],inheritedSubjects:inherited},person('chen-ke','viewer'),'editor','zhou-ning');
  assert.equal(result.error,undefined);
  assert.deepEqual(result.localSubjects,[person('chen-ke','editor','zhou-ning')]);
  const composed=composeOrdinarySubjects([person('chen-ke','viewer')],result.localSubjects);
  assert.equal(composed[0].role,'editor');
  assert.equal(collaboratorCaption(state,result.localSubjects[0],{inheritedOnly:false}),'由「周宁」添加');
  assert.equal(collaboratorCaption(state,person('chen-ke','viewer'),{inheritedOnly:true}),'继承自上层目录');
  assert.equal(addedByCaption(state,'missing'),'本项单独授权');
});

test('继承权限不能移除或下调，等于当前档视为未改',()=>{
  const inherited=[person('chen-ke','editor')];
  assert.match(applyCollaboratorAction(state,{localSubjects:[],inheritedSubjects:inherited},person('chen-ke','editor'),'remove','zhou-ning').error,/不能移除/);
  assert.match(applyCollaboratorAction(state,{localSubjects:[],inheritedSubjects:inherited},person('chen-ke','editor'),'viewer','zhou-ning').error,/不能下调/);
  assert.deepEqual(applyCollaboratorAction(state,{localSubjects:[],inheritedSubjects:inherited},person('chen-ke','editor'),'editor','zhou-ning').localSubjects,[]);
  assert.deepEqual(rowRoleOptions('inherited','editor').map(o=>[o.value,o.disabled]),[['manager',false],['editor',false],['downloader',true],['viewer',true]]);
});

test('批量包含继承项时只能上调，不能移除或下调；仅本项可选移除',()=>{
  const inherited=[person('chen-ke','viewer')];
  const local=[person('zhao-heng','editor','zhou-ning')];
  const keys=[subjectKey(inherited[0]),subjectKey(local[0])];
  assert.equal(batchPermissionOptions([{kind:'inherited',role:'viewer'},{kind:'local',role:'editor'}]).canRemove,false);
  assert.equal(batchPermissionOptions([{kind:'inherited',role:'viewer'},{kind:'local',role:'editor'}]).options.find(o=>o.value==='viewer').disabled,true);
  assert.equal(batchPermissionOptions([{kind:'inherited',role:'viewer'},{kind:'local',role:'editor'}]).options.find(o=>o.value==='manager').disabled,false);
  assert.match(applyBatchCollaboratorAction(state,{localSubjects:local,inheritedSubjects:inherited},keys,'remove','zhou-ning').error,/不能批量移除/);
  assert.match(applyBatchCollaboratorAction(state,{localSubjects:local,inheritedSubjects:inherited},keys,'viewer','zhou-ning').error,/只能上调/);
  const upgraded=applyBatchCollaboratorAction(state,{localSubjects:local,inheritedSubjects:inherited},keys,'manager','zhou-ning');
  assert.equal(upgraded.error,undefined);
  assert.deepEqual(upgraded.localSubjects.map(s=>[s.id,s.role,s.addedBy]).sort(),[['chen-ke','manager','zhou-ning'],['zhao-heng','manager','zhou-ning']]);
  const removed=applyBatchCollaboratorAction(state,{localSubjects:local,inheritedSubjects:inherited},[subjectKey(local[0])],'remove','zhou-ning');
  assert.deepEqual(removed.localSubjects,[]);
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
