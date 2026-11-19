import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedFileSummary, uploadModeCopy } from './uploadCopy.js';

test('上传说明随模式切换，且不会提到当前模式没有的按钮',()=>{
  const file=uploadModeCopy('file'),folder=uploadModeCopy('folder');
  assert.equal(file.title,'上传文件');
  assert.equal(file.chooseLabel,'选择本地文件');
  assert.equal(folder.title,'上传文件夹');
  assert.equal(folder.chooseLabel,'选择文件夹');
  assert.equal(file.hint.includes('选择文件夹'),false);
  assert.equal(folder.hint.includes('选择本地文件'),false);
  assert.equal(file.hint.includes('选择本地文件'),false);
  assert.match(folder.hint,/只能包含文件/);
  assert.equal(selectedFileSummary(3),'已选择 3 个文件');
});
