import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';
import { normalizeState, seedState } from './store.js';
import { displayedResponsibles } from './access.js';
import { handoverReason } from './handover.js';
import { deleteLibrary } from './libraryLifecycle.js';
import { deleteContent } from './access.js';
import { matchesRecycleQuery, recycleLibraryHaystack, recycleNodeHaystack } from './recycleSearch.js';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

test('回收站检索只匹配已删除内容的名称、位置、创建人和正文', () => {
  const state = normalizeState(seedState());
  const faq = state.nodes.find(node => node.id === 'doc-faq');
  assert.equal(matchesRecycleQuery(recycleNodeHaystack(state, faq), '报销'), true);
  assert.equal(matchesRecycleQuery(recycleNodeHaystack(state, faq), '没有这个词'), false);
  const deleted = deleteContent(state, 'doc-faq', state.meId);
  const removed = deleted.nodes.find(node => node.id === 'doc-faq');
  assert.ok(removed.deletedAt);
  assert.equal(matchesRecycleQuery(recycleNodeHaystack(deleted, removed), '报销需要'), true);
  assert.equal(matchesRecycleQuery(recycleNodeHaystack(deleted, removed), '产品手册库'), true);
  assert.equal(matchesRecycleQuery(recycleNodeHaystack(deleted, removed), '周宁'), true);
  const library = deleteLibrary(state, 'space-retro', state.meId);
  const recycled = library.spaces.find(space => space.id === 'space-retro');
  assert.ok(recycled.deletedAt);
  assert.equal(matchesRecycleQuery(recycleLibraryHaystack(library, recycled), '交付复盘'), true);
  assert.equal(matchesRecycleQuery(recycleLibraryHaystack(library, recycled), '共享知识库'), true);
  assert.equal(matchesRecycleQuery(recycleLibraryHaystack(library, recycled), '找不到'), false);
});

test('受保护身份文案改为所有者，菜单不再提供外部转交入口', () => {
  const state = normalizeState(seedState());
  const space = displayedResponsibles(state, state.spaces.find(item => item.id === 'space-handbook'), 'space');
  assert.deepEqual(space[0].sources, ['知识库所有者']);
  const doc = displayedResponsibles(state, state.nodes.find(node => node.id === 'doc-faq'));
  assert.deepEqual(doc[0].sources, ['知识库所有者', '本项所有者']);
  const retroDoc = displayedResponsibles(state, state.nodes.find(node => node.id === 'doc-retro'));
  assert.deepEqual(retroDoc, [{id:'zhao-heng',sources:['知识库所有者','本项所有者']}]);
  assert.match(handoverReason(state, 'space-personal', 'space', state.meId), /不提供所有者转交/);
  assert.equal(handoverReason(state, 'space-handbook', 'space', state.meId), '');
  const menuSource = readFileSync(new URL('./FileMenu.jsx', import.meta.url), 'utf8');
  assert.equal(menuSource.includes("handover:'交接负责人'") || menuSource.includes("handover:'转交所有者'"), false);
  assert.match(menuSource, /permissions:'权限管理'/);
  const intro = readFileSync(new URL('../../public/product-introduction.html', import.meta.url), 'utf8');
  assert.equal(intro.includes('负责人'), false);
  assert.match(intro, /转交所有者/);
  assert.match(intro, /知识库所有者/);
  assert.equal(intro.includes('「更多操作」→ 交接负责人'), false);
  assert.equal(intro.includes('上置展示'), false);
});

function installBrowser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/knowledge-base-prototype/#/home', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.MessageChannel = class { constructor() { this.port1 = { onmessage: null, postMessage: data => queueMicrotask(() => this.port2.onmessage?.({ data })), close() {}, start() {} }; this.port2 = { onmessage: null, postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })), close() {}, start() {} }; } };
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
      contents: `export { KnowledgeApp } from './src/kb/KnowledgeApp.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';`,
      resolveDir: new URL('../..', import.meta.url).pathname,
      sourcefile: 'owner-recycle-harness.js',
    },
    bundle: true, format: 'iife', globalName: 'OwnerRecycleHarness', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.BASE_URL': '"/knowledge-base-prototype/"' },
    plugins: [{ name: 'css-stub', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); } }],
  });
  dom.window.eval(result.outputFiles[0].text);
  return dom.window.OwnerRecycleHarness;
}

const click = async (api, element) => { await api.act(async () => { element.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
const typeIn = async (api, input, value) => {
  const setter = Object.getOwnPropertyDescriptor(api.dom.window.HTMLInputElement.prototype, 'value').set;
  await api.act(async () => { setter.call(input, value); input.dispatchEvent(new api.dom.window.Event('input', { bubbles: true })); });
};
const textButton = (document, label, root = document) => [...root.querySelectorAll('button')].find(button => button.textContent.trim() === label);

test.describe('回收站搜索、所有者改名与权限列表', { timeout: 180000 }, () => {
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

  async function confirmDelete(document) {
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, document.body.textContent.replace(/\s+/g, ' ').slice(0, 400));
    const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === '删除');
    await click(api, confirm);
  }

  test('回收站可即时搜索，无结果有空态，且不改目录搜索', async () => {
    const document = await mount('#/space/space-handbook?view=shared');
    const listSearch = document.querySelector('[aria-label="搜索当前目录"]');
    assert.ok(listSearch);
    assert.equal(listSearch.placeholder, '搜索当前文件夹');
    await typeIn(api, listSearch, '报销');
    assert.match(document.body.textContent, /报销需要哪些材料/);
    assert.equal(document.body.textContent.includes('知识库怎么授权'), false);
    await typeIn(api, listSearch, '');
    await click(api, document.querySelector('[aria-label="报销需要哪些材料更多操作"]'));
    await click(api, textButton(document, '删除'));
    await confirmDelete(document);
    await api.act(async () => { api.dom.window.location.hash = '#/recycle'; await new Promise(resolve => setTimeout(resolve, 0)); });
    const recycleSearch = document.querySelector('[aria-label="搜索回收站"]');
    assert.ok(recycleSearch);
    assert.equal(recycleSearch.placeholder, '搜索回收站');
    assert.match(document.body.textContent, /报销需要哪些材料/);
    await typeIn(api, recycleSearch, '报销');
    assert.match(document.body.textContent, /报销需要哪些材料/);
    assert.equal(document.body.textContent.includes('没有找到相关内容'), false);
    await typeIn(api, recycleSearch, '没有这样的已删除内容');
    assert.match(document.body.textContent, /没有找到相关内容/);
    assert.match(document.body.textContent, /搜索仅覆盖回收站内已删除的内容/);
    assert.equal(document.body.textContent.includes('报销需要哪些材料'), false);
    await api.act(async () => { api.dom.window.location.hash = '#/shared'; await new Promise(resolve => setTimeout(resolve, 0)); });
    const sharedSearch = document.querySelector('[aria-label="搜索当前目录"]') || document.querySelector('[aria-label="全局搜索"]');
    assert.ok(sharedSearch);
    assert.equal(document.querySelector('[aria-label="搜索回收站"]'), null);
  });

  test('设置去掉说明墙，所有者在权限列表只读且可从该行转交', async () => {
    const document = await mount('#/shared');
    await click(api, document.querySelector('[aria-label="知识库设置 产品手册库"]'));
    const dialog = document.querySelector('[aria-label="知识库设置"]');
    assert.ok(dialog);
    assert.equal(dialog.textContent.includes('可多选，也可不选'), false);
    assert.equal(dialog.textContent.includes('分类名单由组织统一维护'), false);
    assert.equal(dialog.textContent.includes('知识库类型：'), false);
    assert.equal(dialog.textContent.includes('历史创建人'), false);
    assert.ok(dialog.querySelector('.library-category-options'));
    assert.equal([...dialog.querySelectorAll('.library-category-options input')].length, 3);
    const ownerRow = dialog.querySelector('.grant-list .grant-row.is-owner');
    assert.ok(ownerRow);
    assert.equal(dialog.querySelector('.grant-responsibility'), null);
    assert.match(ownerRow.textContent, /知识库所有者/);
    assert.match(ownerRow.textContent, /可管理/);
    const transfer = [...ownerRow.querySelectorAll('button')].find(button => button.textContent.trim() === '转交所有者');
    assert.ok(transfer);
    assert.equal(transfer.disabled, false);
    assert.equal(ownerRow.querySelector('.permission-role-trigger'), null);
    await click(api, transfer);
    const handover = document.querySelector('[aria-label="转交所有者"]');
    assert.ok(handover);
    assert.match(handover.textContent, /当前所有者/);
    await click(api, handover.querySelector('[aria-label="关闭所有者转交"]'));
  });

  test('权限弹窗把受保护身份放进列表，外部转交入口已去掉', async () => {
    const document = await mount('#/space/space-handbook?view=shared');
    const toolbarMenu = document.querySelector('.knowledge-detail-toolbar [aria-label$="更多操作"]');
    assert.equal(toolbarMenu, null);
    await click(api, document.querySelector('[aria-label="报销需要哪些材料更多操作"]'));
    const menu = document.querySelector('[role="menu"]');
    assert.equal([...menu.querySelectorAll('[role="menuitem"]')].some(item => /转交|交接/.test(item.textContent)), false);
    await click(api, [...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '权限管理'));
    const dialog = document.querySelector('[role="dialog"][aria-label="权限管理"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('.grant-responsibility'), null);
    const ownerRow = dialog.querySelector('.grant-list .grant-row.is-owner');
    assert.ok(ownerRow);
    assert.match(ownerRow.textContent, /知识库所有者/);
    assert.match(ownerRow.textContent, /本项所有者/);
    assert.match(ownerRow.textContent, /转交所有者/);
    assert.match(ownerRow.textContent, /可管理/);
    assert.equal(ownerRow.querySelector('.permission-role-trigger'), null);
    assert.equal(ownerRow.querySelector('input[type="checkbox"]'), null);
  });
});
