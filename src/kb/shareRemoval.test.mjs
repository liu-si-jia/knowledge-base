import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';
import { seedState, normalizeState } from './store.js';
import { saveEntityAccess, switchNodePermissionMode, contentRights, librariesForView, displayedResponsibles } from './access.js';
import { roleLabel } from './store.js';
import { createLibrary } from './libraryCreation.js';
import { createContent } from './contentCreation.js';
import { accessFromSubjects, PERMISSION_ROLES, roleRights } from './permissions.js';
import { addCollaborators } from './permissionOperations.js';
import { homeEntries } from './personalization.js';
import { searchKnowledge } from './knowledgeSearch.js';
import { didShareItem, didShareLibrary } from './sharing.js';
import { responsibleId } from './ownership.js';
import { actionReason } from './fileActions.js';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const person = (id, role) => ({ type: 'person', id, role });
const get = (state, id) => state.nodes.find(node => node.id === id);
const persistMode = (state, id, userId, next) => {
  const result = switchNodePermissionMode(state, get(state, id), next, userId);
  return saveEntityAccess(state, { id, permissionMode: result.permissionMode, localAccess: result.localAccess, convertedBy: result.convertedBy }, userId);
};

function fixture() {
  let state = normalizeState(seedState());
  const created = createLibrary(state, { name: '协作回归库', initializer: 'shared', access: accessFromSubjects(state, [person('chen-ke', 'editor')]) }, state.meId);
  state = created.state;
  const made = createContent(state, { spaceId: created.library.id, format: 'doc', name: '协作回归说明' }, state.meId);
  return { state: made.state, id: made.node.id, library: created.library };
}

test('四档权限、负责人、继承与自定义可双向切换，添加协作者仍写入授权', () => {
  let { state, id } = fixture();
  assert.deepEqual(PERMISSION_ROLES.map(([, label]) => label), ['可管理', '可编辑', '可查看并下载', '仅查看']);
  assert.equal(roleRights('viewer').view && !roleRights('viewer').download && !roleRights('viewer').edit && !roleRights('viewer').manage, true);
  assert.equal(roleRights('downloader').download && !roleRights('downloader').edit, true);
  assert.equal(roleRights('editor').edit && roleRights('editor').download && !roleRights('editor').manage, true);
  assert.equal(roleRights('manager').manage && roleRights('manager').edit && roleRights('manager').download && roleRights('manager').view && roleRights('manager').share, true);
  const node = get(state, id);
  const managerRights = contentRights(state, node, state.meId);
  assert.equal(managerRights.share, true);
  assert.equal(roleLabel(managerRights), '查看、编辑、管理、下载');
  assert.equal(roleLabel(managerRights).includes('分享'), false);
  assert.equal(roleLabel({ view: true, edit: false, share: false, manage: false, download: false }), '查看');
  assert.equal(displayedResponsibles(state, node, 'node').some(row => row.id === state.meId), true);
  assert.equal(contentRights(state, node, state.meId).manage, true);
  assert.throws(() => switchNodePermissionMode(state, node, 'custom', 'chen-ke'), /管理权限/);
  assert.throws(() => addCollaborators(state, { id, subjects: [person('lin-xia', 'viewer')] }, state.meId), /转为自定义/);

  state = persistMode(state, id, state.meId, 'custom');
  assert.equal(get(state, id).permissionMode, 'custom');
  state = addCollaborators(state, { id, subjects: [person('lin-xia', 'downloader')] }, state.meId);
  const added = get(state, id).localAccess.subjects.find(row => row.id === 'lin-xia');
  assert.equal(added.role, 'downloader');
  assert.equal(added.addedBy, state.meId);
  assert.equal(contentRights(state, get(state, id), 'lin-xia').download, true);
  assert.equal(contentRights(state, get(state, id), 'lin-xia').edit, false);
  assert.equal(contentRights(state, get(state, id), state.meId).manage, true);

  const beforeReturn = structuredClone(state);
  assert.throws(() => switchNodePermissionMode(state, get(state, id), 'inherit', 'chen-ke'), /管理权限/);
  assert.deepEqual(state, beforeReturn);
  state = persistMode(state, id, state.meId, 'inherit');
  assert.equal(get(state, id).permissionMode, 'inherit');
  assert.equal(get(state, id).localAccess.subjects.length, 0);
  assert.equal(contentRights(state, get(state, id), state.meId).manage, true);
  state = persistMode(state, id, state.meId, 'custom');
  assert.equal(get(state, id).permissionMode, 'custom');
});

test('与我共享和我共享的依赖协作授权与负责人，检索范围不因移除分享入口而缩小', () => {
  let { state, id, library } = fixture();
  state = persistMode(state, id, state.meId, 'custom');
  state = addCollaborators(state, { id, subjects: [person('lin-xia', 'viewer')] }, state.meId);
  const node = get(state, id);
  assert.equal(didShareItem(state, node, state.meId), true);
  assert.equal(didShareLibrary(state, state.spaces.find(item => item.id === library.id), state.meId), true);
  assert.equal(homeEntries(state, state.meId, 'mine').some(item => item.id === id), true);
  assert.equal(homeEntries(state, state.meId, 'mine', '不存在的关键词').length, 0);
  assert.equal(homeEntries(state, state.meId, 'mine', '协作回归').some(item => item.id === id), true);
  assert.equal(responsibleId(node) !== 'lin-xia' && responsibleId(state.spaces.find(item => item.id === node.spaceId)) !== 'lin-xia', true);
  assert.equal(homeEntries(state, 'lin-xia', 'shared').some(item => item.id === id), true);
  const sharedLibraries = librariesForView(state, 'lin-xia', 'shared');
  assert.equal(sharedLibraries.some(item => item.id === library.id && responsibleId(item) !== 'lin-xia'), true);
  const found = searchKnowledge(state, 'lin-xia', '协作回归');
  assert.equal(found.some(row => row.id === id), true);
  assert.equal(found.some(row => row.id === library.id), true);
  assert.equal(searchKnowledge(state, 'lin-xia', '协作回归', 'file').some(row => row.id === id), true);
  assert.equal(actionReason(state, node, state.meId, 'permissions'), '');
  assert.equal(actionReason(state, node, state.meId, 'share'), '');
});

test('介绍页去掉独立分享流程、分享草稿和草稿隔离，并保留协作与首页栏目', () => {
  const html = readFileSync(new URL('../../public/product-introduction.html', import.meta.url), 'utf8');
  for (const removed of ['独立分享', '分享弹窗', '分享草稿', '草稿不互通', '返回分享', '内部分享', '分享 / 协作']) {
    assert.equal(html.includes(removed), false, removed);
  }
  for (const kept of ['与我共享', '我共享的', '添加协作者', '转为自定义', '改回继承', '权限管理与协作者', '协作授权', '可管理', '可编辑', '可查看并下载', '仅查看']) {
    assert.equal(html.includes(kept), true, kept);
  }
});

const shareControl = root => [...root.querySelectorAll('button,[role="menuitem"],[role="dialog"]')].filter(element => {
  const name = element.getAttribute('aria-label') || '';
  const ownText = [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').replace(/\s+/g, '');
  return name === '分享' || name.endsWith('分享') || ownText === '分享' || name.includes('关闭分享') || (element.textContent || '').includes('移动并继续分享');
});

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
        import * as accessModule from './src/kb/AccessDialog.jsx';
        export const accessExportNames = Object.keys(accessModule);
        export { createElement, act } from 'react';
        export { createRoot } from 'react-dom/client';
      `,
      resolveDir: new URL('../..', import.meta.url).pathname,
      sourcefile: 'share-removal-harness.js',
    },
    bundle: true,
    format: 'iife',
    globalName: 'ShareRemovalHarness',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env.BASE_URL': '"/knowledge-base-prototype/"',
    },
    plugins: [{
      name: 'css-stub',
      setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); },
    }],
  });
  dom.window.eval(result.outputFiles[0].text);
  return dom.window.ShareRemovalHarness;
}

async function mount(api, hash) {
  const { window } = api.dom;
  window.localStorage.clear();
  window.location.hash = hash;
  const previous = window.document.getElementById('root');
  const host = window.document.createElement('div');
  host.id = 'root';
  previous.replaceWith(host);
  const root = api.createRoot(host);
  await api.act(async () => { root.render(api.createElement(api.KnowledgeApp)); });
  return root;
}

const click = async (api, element) => { await api.act(async () => { element.click(); }); };
const textButton = (document, text) => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
const dismissOverlays = async api => {
  let guard = 0;
  while (guard < 4) {
    const button = textButton(api.dom.window.document, '继续查看');
    if (!button) return;
    await click(api, button);
    guard += 1;
  }
};

test.describe('已渲染界面不能打开独立分享，权限管理与导航仍可操作', { timeout: 120000 }, () => {
  let api;
  test.before(async () => {
    const dom = installBrowser();
    const harness = await boot(dom);
    api = { ...harness, dom };
    assert.equal(api.accessExportNames.includes('ShareDialog'), false);
    const state = normalizeState(seedState());
    const shared = state.nodes.find(node => node.id === 'doc-faq');
    const personal = state.nodes.find(node => node.id === 'doc-note');
    for (const [node, context] of [[shared, 'list'], [shared, 'document'], [personal, 'list'], [personal, 'document']]) {
      const items = api.fileMenuItems(state, node, state.meId, context);
      assert.equal(items.some(item => item.action === 'share' || item.label === '分享'), false);
    }
    assert.equal(api.fileMenuItems(state, shared, state.meId, 'document').some(item => item.action === 'permissions' && item.label === '权限管理'), true);
    assert.equal(api.fileMenuItems(state, personal, state.meId, 'list').some(item => item.action === 'permissions'), false);
  });

  test.afterEach(async () => { if (api?.root) await api.act(async () => api.root.unmount()); });

  test('首页、共享库栏目、全局搜索和权限弹窗', async () => {
    api.root = await mount(api, '#/home');
    const { document } = api.dom.window;
    assert.equal(shareControl(document).length, 0);
    for (const label of ['主页', '知识广场', '共享知识库', '个人知识库', '回收站', '问AI']) assert.ok(textButton(document, label), label);
    for (const label of ['最近', '收藏', '与我共享', '我共享的']) {
      const tab = textButton(document, label);
      assert.equal(tab?.getAttribute('role'), 'tab', label);
      await click(api, tab);
      assert.equal(tab.getAttribute('aria-selected'), 'true');
      assert.equal(shareControl(document).length, 0);
      assert.equal(document.body.textContent.includes('分享'), false, label);
      if (label === '我共享的') assert.match(document.body.textContent, /给自己的内容添加协作者后，会显示在这里。/);
    }

    const search = document.querySelector('[aria-label="全局搜索"]');
    await api.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(api.dom.window.HTMLInputElement.prototype, 'value').set;
      setter.call(search, '报销');
      search.dispatchEvent(new api.dom.window.Event('input', { bubbles: true }));
    });
    assert.match(document.body.textContent, /报销需要哪些材料/);
    assert.equal(shareControl(document).length, 0);
    await click(api, document.querySelector('[aria-label="关闭搜索结果"]'));
    await click(api, textButton(document, '最近'));

    const more = document.querySelector('[aria-label="报销需要哪些材料更多操作"]');
    assert.ok(more, document.body.textContent.replace(/\s+/g, ' ').slice(0, 700));
    await click(api, more);
    const menu = document.querySelector('[role="menu"]');
    assert.equal([...menu.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.trim() === '分享'), false);
    await click(api, [...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '权限管理'));
    const dialog = document.querySelector('[role="dialog"][aria-label="权限管理"]');
    assert.ok(dialog);
    assert.equal(document.querySelector('[role="dialog"][aria-label="分享"]'), null);
    assert.match(dialog.textContent, /负责人/);
    assert.equal(dialog.querySelector('.grant-add'), null);

    await click(api, textButton(dialog, '转为自定义'));
    const customConfirm = document.querySelector('[aria-label="转为自定义权限"]');
    assert.match(customConfirm.textContent, /取消则不切换/);
    await click(api, customConfirm.querySelector('button[type="submit"]'));
    assert.ok(textButton(dialog, '添加协作者'));
    assert.ok(textButton(dialog, '改回继承'));
    const roleTrigger = [...dialog.querySelectorAll('.permission-role-trigger')].find(element => !element.disabled);
    await click(api, roleTrigger);
    const roleMenu = document.querySelector('[role="menu"]');
    const roles = [...roleMenu.querySelectorAll('[role="menuitemradio"] b')].map(item => item.textContent.trim());
    assert.deepEqual(roles, ['可管理', '可编辑', '可查看并下载', '仅查看']);
    await click(api, [...roleMenu.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.includes('仅查看')));

    await click(api, textButton(dialog, '改回继承'));
    const inheritConfirm = document.querySelector('[aria-label="改回继承权限"]');
    await click(api, inheritConfirm.querySelector('button[type="submit"]'));
    assert.equal(dialog.querySelector('.grant-add'), null);
    await click(api, textButton(dialog, '转为自定义'));
    await click(api, document.querySelector('[aria-label="转为自定义权限"] button[type="submit"]'));
    await click(api, [...dialog.querySelectorAll('button')].find(element => element.textContent.trim() === '保存权限'));
    const saved = JSON.parse(api.dom.window.localStorage.getItem('kb-prototype-v3'));
    assert.equal(saved.nodes.find(node => node.id === 'doc-faq').permissionMode, 'custom');
    assert.equal(document.querySelector('[role="dialog"][aria-label="分享"]'), null);
    assert.equal(shareControl(document).length, 0);
  });

  test('知识库页、库内目录、文档、回收站和问 AI 都没有分享入口', async () => {
    api.root = await mount(api, '#/shared');
    const { document } = api.dom.window;
    for (const label of ['全部', '我共享的', '与我共享']) assert.ok(textButton(document, label), label);
    assert.equal(shareControl(document).length, 0);
    assert.equal(document.body.textContent.includes('分享'), false);
    for (const label of ['个人知识库', '知识广场', '回收站', '问AI']) {
      await click(api, textButton(document, label));
      if (label === '问AI') await dismissOverlays(api);
      assert.equal(shareControl(document).length, 0, label);
      assert.equal(document.body.textContent.includes('分享'), false, label);
    }

    await api.act(async () => api.root.unmount());
    api.root = await mount(api, '#/space/space-handbook?view=shared');
    assert.ok(textButton(document, '设置'));
    assert.equal(shareControl(document).length, 0);
    assert.equal(document.body.textContent.includes('分享'), false);
    await click(api, document.querySelector('[aria-label="报销需要哪些材料更多操作"]'));
    assert.equal([...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.trim() === '分享'), false);
    assert.ok([...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.trim() === '权限管理'));

    await api.act(async () => api.root.unmount());
    api.root = await mount(api, '#/doc/doc-faq?view=shared');
    await dismissOverlays(api);
    assert.equal(shareControl(document).length, 0);
    const status = [...document.querySelectorAll('.document-status-left button')].map(element => element.textContent.trim());
    assert.ok(status.includes('权限：查看、编辑、管理、下载'), status.join(' | '));
    assert.equal(document.body.textContent.includes('分享'), false);
    await click(api, [...document.querySelectorAll('.document-status-left button')].find(element => element.textContent.trim() === '权限：查看、编辑、管理、下载'));
    assert.equal(document.querySelector('[role="dialog"][aria-label="分享"]'), null);
    await click(api, document.querySelector('[aria-label="报销需要哪些材料更多操作"]'));
    const items = [...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim());
    assert.equal(items.includes('分享'), false);
    assert.equal(items.includes('权限管理'), true);
  });
});
