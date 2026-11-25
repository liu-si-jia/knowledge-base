import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const PLAZA_COPY = '全员查看：北辰制造，公司成员默认可查看';

test('介绍页不再把广场全员查看写成单独置顶', () => {
  const intro = readFileSync(new URL('../../public/product-introduction.html', import.meta.url), 'utf8');
  assert.equal(intro.includes('广场另显'), false);
  assert.equal(intro.includes('另显全员'), false);
  assert.match(intro, /广场全员查看在权限列表中只读展示/);
  assert.match(intro, /广场全员查看并入权限列表/);
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
      sourcefile: 'plaza-grant-list-harness.js',
    },
    bundle: true, format: 'iife', globalName: 'PlazaGrantHarness', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.BASE_URL': '"/knowledge-base-prototype/"' },
    plugins: [{ name: 'css-stub', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); } }],
  });
  dom.window.eval(result.outputFiles[0].text);
  return dom.window.PlazaGrantHarness;
}

const click = async (api, element) => { await api.act(async () => { element.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
const textButton = (document, label, root = document) => [...root.querySelectorAll('button')].find(button => button.textContent.trim() === label);

function assertProtectedFloor(dialog) {
  assert.ok(dialog);
  assert.equal(dialog.querySelector('.grant-notices'), null);
  assert.equal(dialog.querySelector('.grant-notice'), null);
  const list = dialog.querySelector('.grant-list');
  assert.ok(list);
  const floor = list.querySelector('.grant-row.is-floor');
  assert.ok(floor);
  assert.match(floor.textContent, new RegExp(PLAZA_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(floor.textContent, /仅查看/);
  assert.equal(floor.querySelector('.permission-role-trigger'), null);
  assert.equal(floor.querySelector('input[type="checkbox"]'), null);
  assert.equal([...floor.querySelectorAll('button')].length, 0);
  const beforeList = dialog.querySelector('.grant-fields')?.querySelector('.grant-heading');
  assert.ok(beforeList);
  const noticesBeforeList = [...dialog.querySelectorAll('.grant-fields .grant-notice, .grant-fields .grant-notices')]
    .filter(node => {
      const heading = node.parentElement?.querySelector(':scope > .grant-heading');
      const listEl = node.parentElement?.querySelector(':scope > .grant-list');
      return heading && listEl && node.compareDocumentPosition(listEl) & 4;
    });
  assert.equal(noticesBeforeList.length, 0);
  assert.equal(dialog.querySelector('.grant-fields > .grant-row.is-floor'), null);
}

function assertNoFloor(dialog) {
  assert.ok(dialog);
  assert.equal(dialog.querySelector('.grant-row.is-floor'), null);
  assert.equal(dialog.textContent.includes(PLAZA_COPY), false);
}

test.describe('广场全员查看并入权限列表', { timeout: 180000 }, () => {
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

  async function switchIdentity(document, name) {
    const select = document.querySelector('[aria-label="当前身份"]') || document.querySelector('[aria-label="原型演示 · 切换身份"]');
    assert.ok(select);
    const option = [...select.options].find(item => item.textContent.trim() === name || item.textContent.trim().startsWith(`${name} ·`) || item.textContent.includes(name));
    assert.ok(option, `missing identity ${name}`);
    const setter = Object.getOwnPropertyDescriptor(api.dom.window.HTMLSelectElement.prototype, 'value').set;
    await api.act(async () => {
      setter.call(select, option.value);
      select.dispatchEvent(new api.dom.window.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  test('新建弹窗选知识广场时全员查看在列表内，个人与共享不出现', async () => {
    const document = await mount('#/home');
    await click(api, textButton(document, '新建知识库'));
    const dialog = document.querySelector('[aria-label="新建知识库"]');
    assert.ok(dialog);
    const type = name => dialog.querySelector(`input[name="library-initializer"][value="${name}"]`);
    assert.equal(type('personal').checked, true);
    assertNoFloor(dialog);
    await click(api, type('shared'));
    assertNoFloor(dialog);
    await click(api, type('plaza'));
    assert.equal(type('plaza').checked, true);
    assertProtectedFloor(dialog);
    const ownerRow = dialog.querySelector('.grant-list .grant-row.is-owner');
    assert.ok(ownerRow);
    assert.match(ownerRow.textContent, /知识库所有者/);
  });

  test('广场库设置把全员查看放进权限列表，不再单独置顶', async () => {
    const document = await mount('#/plaza');
    await switchIdentity(document, '赵衡');
    await click(api, document.querySelector('[aria-label="知识库设置 组织知识广场"]'));
    const dialog = document.querySelector('[aria-label="知识库设置"]');
    assertProtectedFloor(dialog);
  });

  test('广场内容权限管理同样把全员查看放进列表', async () => {
    const document = await mount('#/space/space-plaza?view=plaza');
    await switchIdentity(document, '赵衡');
    await click(api, document.querySelector('[aria-label="组织知识使用说明更多操作"]'));
    const menu = document.querySelector('[role="menu"]');
    await click(api, [...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '权限管理'));
    const dialog = document.querySelector('[role="dialog"][aria-label="权限管理"]');
    assertProtectedFloor(dialog);
  });

  test('个人库与共享库设置、新建入口不误加全员查看', async () => {
    let document = await mount('#/personal');
    await click(api, document.querySelector('[aria-label="知识库设置 周宁的个人知识库"]'));
    assertNoFloor(document.querySelector('[aria-label="知识库设置"]'));
    await click(api, textButton(document.querySelector('[aria-label="知识库设置"]'), '取消'));

    document = await mount('#/shared');
    await click(api, document.querySelector('[aria-label="知识库设置 产品手册库"]'));
    assertNoFloor(document.querySelector('[aria-label="知识库设置"]'));
    await click(api, textButton(document.querySelector('[aria-label="知识库设置"]'), '取消'));

    await click(api, textButton(document, '新建知识库'));
    assertNoFloor(document.querySelector('[aria-label="新建知识库"]'));
  });
});
