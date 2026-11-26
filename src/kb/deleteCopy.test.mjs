import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';
import {
  LIBRARY_DELETE_COPY,
  libraryDeleteBody,
  contentDeleteBody,
  LIBRARY_PERMANENT_DELETE_COPY,
  contentPermanentDeleteBody,
} from './deleteCopy.js';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

test('删除确认文案从用户结果出发，去掉研发细节', () => {
  assert.equal(LIBRARY_DELETE_COPY, '知识库和其中的内容将移入回收站，之后可在回收站恢复。');
  assert.equal(libraryDeleteBody(), LIBRARY_DELETE_COPY);
  assert.equal(libraryDeleteBody('知识库或其中内容已变化，请取消后重新确认删除'), `${LIBRARY_DELETE_COPY} 知识库或其中内容已变化，请取消后重新确认删除`);
  assert.equal(libraryDeleteBody().includes('原有单独删除'), false);
  assert.equal(libraryDeleteBody().includes('未保存的设置'), false);

  assert.equal(contentDeleteBody(), '该内容将移入回收站，之后可在回收站恢复。');
  assert.equal(contentDeleteBody({ hasFolder: true }), '文件夹和其中的内容将移入回收站，之后可在回收站恢复。');
  assert.equal(contentDeleteBody({ batchSummary: '已选 2 项内容', hasFolder: false }), '已选 2 项内容。所选内容将移入回收站，之后可在回收站恢复。');
  assert.equal(contentDeleteBody({ batchSummary: '已选 2 项内容。', hasFolder: true }), '已选 2 项内容。文件夹和其中的内容将移入回收站，之后可在回收站恢复。');
  assert.equal(contentDeleteBody({ error: '没有管理权限' }), '该内容将移入回收站，之后可在回收站恢复。 没有管理权限');

  assert.equal(LIBRARY_PERMANENT_DELETE_COPY, '知识库和其中的内容将永久删除，无法恢复。');
  assert.equal(LIBRARY_PERMANENT_DELETE_COPY.includes('独立副本'), false);
  assert.equal(contentPermanentDeleteBody(), '该内容将永久删除，无法恢复。');
  assert.equal(contentPermanentDeleteBody(true), '该内容和其中的内容将永久删除，无法恢复。');
});

function installBrowser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5174/knowledge-base-prototype/#/home',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.MessageChannel = class {
    constructor() {
      this.port1 = { onmessage: null, postMessage: (data) => queueMicrotask(() => this.port2.onmessage?.({ data })), close() {}, start() {} };
      this.port2 = { onmessage: null, postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })), close() {}, start() {} };
    }
  };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.open = () => null;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  return dom;
}

async function boot(dom) {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export { KnowledgeApp } from './src/kb/KnowledgeApp.jsx';
        export { createElement, act } from 'react';
        export { createRoot } from 'react-dom/client';
      `,
      resolveDir: new URL('../..', import.meta.url).pathname,
      sourcefile: 'delete-copy-harness.js',
    },
    bundle: true,
    format: 'iife',
    globalName: 'DeleteCopyHarness',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env.BASE_URL': '"/knowledge-base-prototype/"',
    },
    plugins: [{ name: 'css-stub', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); } }],
  });
  dom.window.eval(result.outputFiles[0].text);
  return dom.window.DeleteCopyHarness;
}

const click = async (api, element) => { await api.act(async () => { element.click(); }); };

test.describe('删除确认与编辑顶栏界面', { timeout: 180000 }, () => {
  let api;
  test.before(async () => { const dom = installBrowser(); api = { ...await boot(dom), dom }; });
  test.afterEach(async () => { if (api?.root) { await api.act(async () => api.root.unmount()); api.root = null; } });

  async function mount(hash) {
    const { window } = api.dom;
    window.localStorage.clear();
    window.location.hash = hash;
    const previous = window.document.getElementById('root');
    const host = window.document.createElement('div');
    host.id = 'root';
    previous.replaceWith(host);
    const root = api.createRoot(host);
    await api.act(async () => { root.render(api.createElement(api.KnowledgeApp)); });
    api.root = root;
    return window.document;
  }

  test('知识库设置删除确认使用约定短文案', async () => {
    const document = await mount('#/personal');
    await click(api, document.querySelector('[aria-label="知识库设置 周宁的个人知识库"]'));
    await click(api, [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '删除知识库'));
    const dialog = document.querySelector('[role="dialog"][aria-label="删除知识库「周宁的个人知识库」？"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('p')?.textContent, LIBRARY_DELETE_COPY);
  });

  test('删除文件确认只说明将移入回收站且可恢复', async () => {
    const document = await mount('#/space/space-handbook?view=shared');
    await click(api, document.querySelector('[aria-label="报销需要哪些材料更多操作"]'));
    const menu = document.querySelector('[role="menu"]');
    await click(api, [...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '删除'));
    const dialog = document.querySelector('[role="dialog"][aria-label="删除「报销需要哪些材料」？"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('p')?.textContent, '该内容将移入回收站，之后可在回收站恢复。');
  });

  test('编辑顶栏补上切换身份和设置，并保留编辑操作', async () => {
    const document = await mount('#/doc/doc-note?view=personal');
    const bar = document.querySelector('.document-chrome-bar');
    assert.ok(bar);
    assert.equal(bar.querySelector('[aria-label="原型演示 · 切换身份"]')?.tagName, 'SELECT');
    assert.match(bar.textContent, /原型演示 · 切换身份/);
    const settings = [...bar.querySelectorAll('button')].find(button => button.textContent.trim() === '设置');
    assert.ok(settings);
    assert.equal(settings.disabled, false);
    assert.match(bar.textContent, /返回/);
    assert.ok(bar.querySelector('[aria-label="问 AI"]'));
    assert.ok(bar.querySelector('[aria-label="本周要整理的口径更多操作"]'));
    await click(api, settings);
    assert.ok(document.querySelector('[aria-label="知识库设置"]'));
  });
});
