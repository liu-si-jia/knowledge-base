import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, normalizeState } from './store.js';
import { createLibrary } from './libraryCreation.js';
import { createContent } from './contentCreation.js';
import { accessFromSubjects } from './permissions.js';
import { saveEntityAccess, switchNodePermissionMode } from './access.js';
import { shareInheritGuidance, SHARE_NO_MANAGE_COPY } from './shareGuidance.js';

const person=(id,role)=>({type:'person',id,role});
function fixture(){
  let s=normalizeState(seedState());
  const created=createLibrary(s,{name:'分享引导验收',initializer:'shared',access:accessFromSubjects(s,[person('chen-ke','editor')])},s.meId);
  s=created.state;
  const file=createContent(s,{format:'doc',name:'说明',spaceId:created.library.id},s.meId);
  s=file.state;
  return {s,library:created.library,file:file.node};
}

test('分享引导：有可管理时需先转为自定义，无管理权限提示无权添加协作，库级不套用',()=>{
  const {s,library,file}=fixture();
  const inheritManage=shareInheritGuidance(s,file,'node',s.meId);
  assert.equal(inheritManage.kind,'inherit-manage');
  assert.equal(inheritManage.canAdd,false);
  assert.equal(inheritManage.canSwitch,true);
  const inheritViewer=shareInheritGuidance(s,file,'node','chen-ke');
  assert.equal(inheritViewer.kind,'inherit-no-manage');
  assert.equal(inheritViewer.canAdd,false);
  assert.equal(inheritViewer.canSwitch,false);
  assert.equal(inheritViewer.message,SHARE_NO_MANAGE_COPY);
  const libraryGuide=shareInheritGuidance(s,library,'space',s.meId);
  assert.equal(libraryGuide.kind,'library');
  assert.equal(libraryGuide.canAdd,true);
  const switched=switchNodePermissionMode(s,file,'custom',s.meId);
  const customState=saveEntityAccess(s,{id:file.id,permissionMode:switched.permissionMode,localAccess:switched.localAccess,convertedBy:switched.convertedBy},s.meId);
  const custom=shareInheritGuidance(customState,customState.nodes.find(n=>n.id===file.id),'node',s.meId);
  assert.equal(custom.kind,'custom');
  assert.equal(custom.canAdd,true);
});
