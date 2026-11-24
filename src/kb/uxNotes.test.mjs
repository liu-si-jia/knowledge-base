import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';
import { seedState, normalizeState } from './store.js';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

function installBrowser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5173/knowledge-base-prototype/#/home',
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
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  return dom;
}

async function boot(dom) {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export { KnowledgeApp } from './src/kb/KnowledgeApp.jsx';
        export { fileMenuItems } from './src/kb/FileMenu.jsx';
        export { createElement, act } from 'react';
        export { createRoot } from 'react-dom/client';
      `,
      resolveDir: new URL('../..', import.meta.url).pathname,
      sourcefile: 'ux-notes-harness.js',
    },
    bundle: true,
    format: 'iife',
    globalName: 'UxNotesHarness',
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
  return dom.window.UxNotesHarness;
}

const click = async (api, element) => { await api.act(async () => { element.click(); }); };

test.describe('四项批注界面', { timeout: 120000 }, () => {
  let api;
  test.before(async () => {
    const dom = installBrowser();
    api = { ...await boot(dom), dom };
    const state = normalizeState(seedState());
    const folder = state.nodes.find(node => node.id === 'folder-retro');
    const labels = api.fileMenuItems(state, folder, state.meId, 'list').map(item => item.label);
    assert.equal(labels.includes('在此文件夹新建'), true);
    assert.equal(labels.includes('上传到此文件夹'), true);
    assert.equal(labels.includes('在此新建'), false);
    assert.equal(labels.includes('上传到此处'), false);
    assert.equal(labels.includes('分享'), false);
  });
  test.afterEach(async () => { if (api?.root) await api.act(async () => api.root.unmount()); });

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

  test('封面不显示访问计数，身份切换仍可用且标注为原型演示', async () => {
    for (const hash of ['#/space/space-personal?view=personal', '#/space/space-handbook?view=shared', '#/space/space-plaza?view=plaza']) {
      const document = await mount(hash);
      assert.equal(document.body.textContent.includes('你可访问'), false, hash);
      assert.equal(document.body.textContent.includes('项内容'), false, hash);
      assert.equal([...document.querySelectorAll('button')].some(element => element.textContent.includes('分享')), false, hash);
      await api.act(async () => api.root.unmount());
      api.root = null;
    }
    const document = await mount('#/space/space-handbook?view=shared');
    const demo = document.querySelector('[aria-label="原型演示 · 切换身份"]');
    assert.ok(demo);
    assert.equal(demo.value, 'zhou-ning');
    await api.act(async () => {
      demo.value = 'lin-xia';
      demo.dispatchEvent(new api.dom.window.Event('change', { bubbles: true }));
    });
    assert.equal(document.querySelector('[aria-label="原型演示 · 切换身份"]').value, 'lin-xia');
    assert.equal(document.body.textContent.includes('分享'), false);
  });

  test('文件夹菜单新文案仍在该文件夹新建，主页按钮为新建且四个选项可用', async () => {
    const document = await mount('#/space/space-retro?view=shared');
    await click(api, document.querySelector('[aria-label="项目复盘资料更多操作"]'));
    const menu = [...document.querySelectorAll('[role="menuitem"]')].map(element => element.textContent.trim());
    assert.equal(menu.includes('在此文件夹新建'), true);
    assert.equal(menu.includes('上传到此文件夹'), true);
    assert.equal(menu.includes('分享'), false);
    await click(api, [...document.querySelectorAll('[role="menuitem"]')].find(element => element.textContent.trim() === '在此文件夹新建'));
    assert.match(document.querySelector('.folder-operation-target').textContent, /在此文件夹新建：项目复盘资料/);
    const folderChoice = [...document.querySelectorAll('.folder-operation-choice')].find(element => element.textContent.includes('文件夹'));
    assert.ok(folderChoice, [...document.querySelectorAll('[role="menuitem"],.folder-operation-choice')].map(element => element.textContent).join('|'));
    await click(api, folderChoice);
    await api.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(api.dom.window.location.hash, /folder=folder-retro/);
    assert.ok(document.querySelector('[aria-label="新文件夹名称"]'), document.body.textContent.replace(/\s+/g, ' ').slice(0, 280));

    await api.act(async () => api.root.unmount());
    const home = await mount('#/home');
    const create = home.querySelector('[aria-label="新建"]');
    assert.equal(create.textContent.replace(/\s+/g, ''), '新建');
    assert.ok([...home.querySelectorAll('button')].some(element => element.textContent.includes('上传文件')));
    assert.ok([...home.querySelectorAll('button')].some(element => element.textContent.includes('新建知识库')));
    await click(api, create);
    const options = [...home.querySelectorAll('.new-create-options [role="menuitem"] span')].map(element => element.textContent.trim());
    assert.deepEqual(options, ['文档', '表格', '幻灯片', '文件夹']);
    assert.equal(home.body.textContent.includes('分享'), false);
  });
});
