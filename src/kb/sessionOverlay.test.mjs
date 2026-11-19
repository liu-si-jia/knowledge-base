import test from 'node:test';
import assert from 'node:assert/strict';
import { ASK_AI_OVERLAY_KEY, ONLYOFFICE_OVERLAY_KEY, dismissOverlay, overlayDismissed, resetOverlaySession } from './sessionOverlay.js';

function memory(){
  const data=new Map();
  return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>{data.set(key,String(value));},removeItem:key=>{data.delete(key);}};
}

test('遮罩在当前加载会话内关闭后不再自动弹出，刷新会话后会再次出现',()=>{
  const storage=memory();
  resetOverlaySession(storage);
  delete globalThis.__kbOverlayBoot;
  assert.equal(overlayDismissed(ASK_AI_OVERLAY_KEY,storage),false);
  dismissOverlay(ASK_AI_OVERLAY_KEY,storage);
  assert.equal(overlayDismissed(ASK_AI_OVERLAY_KEY,storage),true);
  assert.equal(overlayDismissed(ONLYOFFICE_OVERLAY_KEY,storage),false);
  const firstBoot=globalThis.__kbOverlayBoot;
  delete globalThis.__kbOverlayBoot;
  assert.notEqual(firstBoot,undefined);
  assert.equal(overlayDismissed(ASK_AI_OVERLAY_KEY,storage),false);
  dismissOverlay(ONLYOFFICE_OVERLAY_KEY,storage);
  assert.equal(overlayDismissed(ONLYOFFICE_OVERLAY_KEY,storage),true);
  resetOverlaySession(storage);
});
