import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';
import { normalizeState, seedState } from './store.js';
import { createLibrary } from './libraryCreation.js';
import { savePermissionDetails } from './permissionOperations.js';
import { librariesForView, libraryRights } from './access.js';
import { accessFromSubjects, initialAccess } from './permissions.js';
import { searchKnowledge } from './knowledgeSearch.js';
import { didShareLibrary } from './sharing.js';
import {
  LIBRARY_CATEGORIES, LIBRARY_CATEGORY_FILTERS, SEED_LIBRARY_CATEGORY_IDS,
  assertLibraryCategoryIds, librariesInList, libraryCategoryIds,
} from './libraryCategories.js';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const person = (id, role) => ({ type: 'person', id, role });
const byId = (state, id) => state.spaces.find(space => space.id === id);
const tree = state => state.nodes.map(node => [node.id, node.name, node.parentId || '', node.spaceId, node.deletedAt || '']);
const viewers = state => Object.fromEntries(state.members.map(member => [member.id, librariesForView(state, member.id).map(space => space.id)]));
const settings = (state, library, categoryIds, userId) => savePermissionDetails(state, {
  id: library.id, entity: 'space', name: library.name, description: library.description || '', access: library.access, categoryIds,
  expectedCategories: JSON.stringify(libraryCategoryIds(library)),
}, userId);

test('名单、字段与 4.4 样本只挂在知识库上', () => {
  assert.deepEqual(LIBRARY_CATEGORIES.map(item => item.name), ['制度规范', '项目资料', '培训学习']);
  assert.deepEqual(LIBRARY_CATEGORY_FILTERS.map(item => item.name), ['全部分类', '制度规范', '项目资料', '培训学习', '未分类']);
  const state = normalizeState(seedState());
  for (const [id, categoryIds] of Object.entries(SEED_LIBRARY_CATEGORY_IDS)) assert.deepEqual(byId(state, id).categoryIds, categoryIds, id);
  assert.equal(state.nodes.some(node => Object.prototype.hasOwnProperty.call(node, 'categoryIds')), false);
  assert.equal(state.spaces.some(space => space.category === 'policy' || space.categoryIds?.includes('未分类')), false);
  assert.equal(readFileSync(new URL('../../public/product-introduction.html', import.meta.url), 'utf8').includes('制度规范'), false);
  const app = readFileSync(new URL('./KnowledgeApp.jsx', import.meta.url), 'utf8');
  assert.equal(app.includes('params.get("category")') || app.includes("params.get('category')"), false);
});

test('缺字段的种子库按 4.4 回填，已保存的选择丢弃非法 id 且不恢复样本', () => {
  const raw = seedState();
  delete byId(raw, 'space-plaza').categoryIds;
  byId(raw, 'space-handbook').categoryIds = [];
  byId(raw, 'space-retro').categoryIds = ['training', 'nope', 'policy', 'policy'];
  byId(raw, 'space-personal').categoryIds = ['未分类', '制度规范'];
  raw.spaces.push({ id: 'user-lib', kind: 'shared', name: '用户库', ownerId: 'zhou-ning', access: { subjects: [] }, members: [] });
  const state = normalizeState(raw);
  assert.deepEqual(byId(state, 'space-plaza').categoryIds, ['policy', 'training']);
  assert.deepEqual(byId(state, 'space-handbook').categoryIds, []);
  assert.deepEqual(byId(state, 'space-retro').categoryIds, ['policy', 'training']);
  assert.deepEqual(byId(state, 'space-personal').categoryIds, []);
  assert.deepEqual(byId(state, 'user-lib').categoryIds, []);
  assert.deepEqual(byId(state, 'space-chen-personal').categoryIds, ['training']);
  const restored = normalizeState(seedState());
  for (const [id, categoryIds] of Object.entries(SEED_LIBRARY_CATEGORY_IDS)) assert.deepEqual(byId(restored, id).categoryIds, categoryIds, id);
});

test('新建与设置显式读写分类，名单外的值不能保存', () => {
  const state = normalizeState(seedState());
  const before = structuredClone(state);
  assert.throws(() => createLibrary(state, { name: '非法分类', initializer: 'personal', categoryIds: ['未分类'] }, state.meId), /组织名单/);
  assert.throws(() => assertLibraryCategoryIds(['自定义分类']), /组织名单/);
  assert.deepEqual(state, before);
  const made = createLibrary(state, { name: '多分类库', initializer: 'shared', access: accessFromSubjects(state, [person('chen-ke', 'viewer')]), categoryIds: ['training', 'policy'] }, state.meId);
  assert.deepEqual(made.library.categoryIds, ['policy', 'training']);
  const blank = createLibrary(state, { name: '不选分类', initializer: 'personal', access: initialAccess(state, 'personal') }, state.meId);
  assert.deepEqual(blank.library.categoryIds, []);
  const handbook = byId(state, 'space-handbook');
  const renamed = savePermissionDetails(state, { id: handbook.id, entity: 'space', name: '产品手册库改名', description: handbook.description, access: handbook.access }, state.meId);
  assert.deepEqual(byId(renamed, 'space-handbook').categoryIds, ['policy']);
  assert.throws(() => settings(state, handbook, ['项目资料'], state.meId), /组织名单/);
  assert.deepEqual(state, before);
});

test('可管理的人能改交付复盘库分类，低权限不能，且不改变访问与库内位置', () => {
  const state = normalizeState(seedState());
  const retro = byId(state, 'space-retro');
  assert.equal(libraryRights(state, retro, 'zhao-heng').manage, true);
  assert.equal(libraryRights(state, retro, 'zhou-ning').manage, true);
  assert.equal(libraryRights(state, retro, 'lin-xia').manage, false);
  assert.equal(libraryRights(state, retro, 'chen-ke').manage, false);
  const beforeViewers = viewers(state), beforeTree = tree(state);
  assert.throws(() => settings(state, retro, ['training'], 'lin-xia'), /管理权限/);
  assert.throws(() => settings(state, retro, [], 'chen-ke'), /管理权限/);
  assert.deepEqual(viewers(state), beforeViewers);
  let next = settings(state, retro, ['training', 'project'], 'zhou-ning');
  assert.deepEqual(byId(next, 'space-retro').categoryIds, ['project', 'training']);
  assert.equal(byId(next, 'space-retro').kind, 'shared');
  next = settings(next, byId(next, 'space-retro'), [], 'zhao-heng');
  assert.deepEqual(byId(next, 'space-retro').categoryIds, []);
  assert.deepEqual(viewers(next), beforeViewers);
  assert.deepEqual(tree(next), beforeTree);
  const stale = JSON.stringify(['project']);
  assert.throws(() => savePermissionDetails(next, { id: retro.id, entity: 'space', name: retro.name, description: retro.description, access: byId(next, retro.id).access, categoryIds: ['policy'], expectedCategories: stale }, 'zhou-ning'), /分类已在其他页面变化/);
  assert.deepEqual(byId(next, 'space-retro').categoryIds, []);
});

test('三类列表单选筛选不跨类型，多分类库只出现一次，共享页签继续收窄', () => {
  const state = normalizeState(seedState());
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'personal', 'all', 'all').map(space => space.id), ['space-personal']);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'personal', 'all', 'uncategorized').map(space => space.id), ['space-personal']);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'personal', 'all', 'training'), []);
  assert.deepEqual(librariesInList(state, 'chen-ke', 'personal', 'all', 'training').map(space => space.id), ['space-chen-personal']);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'shared', 'all', 'policy').map(space => space.id), ['space-handbook', 'space-company-share']);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'shared', 'all', 'project').map(space => space.id), ['space-retro', 'space-company-share']);
  assert.equal(librariesInList(state, 'zhou-ning', 'shared', 'all', 'project').filter(space => space.id === 'space-company-share').length, 1);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'shared', 'joined', 'policy').map(space => space.id), ['space-company-share']);
  assert.equal(didShareLibrary(state, byId(state, 'space-handbook'), 'zhou-ning'), false);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'shared', 'created', 'policy'), []);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'shared', 'all', 'training'), []);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'plaza', 'all', 'policy').map(space => space.id), ['space-plaza']);
  assert.deepEqual(librariesInList(state, 'zhou-ning', 'plaza', 'all', 'project'), []);
  for (const section of ['personal', 'shared', 'plaza']) assert.equal(librariesInList(state, 'zhou-ning', section, 'all', 'policy').every(space => space.kind === section), true);
  assert.equal(searchKnowledge(state, state.meId, '制度规范').some(row => row.kind === 'library'), false);
  assert.equal(searchKnowledge(state, state.meId, '产品手册库').some(row => row.id === 'space-handbook'), true);
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
      sourcefile: 'library-category-harness.js',
    },
    bundle: true, format: 'iife', globalName: 'CategoryHarness', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.BASE_URL': '"/knowledge-base-prototype/"' },
    plugins: [{ name: 'css-stub', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); } }],
  });
  dom.window.eval(result.outputFiles[0].text);
  return dom.window.CategoryHarness;
}

const click = async (api, element) => { await api.act(async () => { element.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
const cards = document => [...document.querySelectorAll('[aria-label^="打开知识库 "]')].map(button => ({
  name: button.querySelector('strong')?.textContent || '',
  categories: [...button.querySelectorAll('[role="listitem"]')].map(item => item.textContent),
}));
const checkedCategory = document => document.querySelector('.library-category-filter input:checked')?.nextElementSibling?.textContent || '';
const chooseCategory = async (api, document, name) => {
  const input = [...document.querySelectorAll('.library-category-filter input')].find(item => item.nextElementSibling?.textContent === name);
  assert.ok(input, name);
  await click(api, input);
};
const chooseScope = async (api, document, name) => { await click(api, [...document.querySelectorAll('.knowledge-scope-tabs button')].find(button => button.textContent === name)); };
const go = async (api, document, title) => { await click(api, document.querySelector(`button[title="${title}"]`)); };
const visit = async (api, hash) => { await api.act(async () => { api.dom.window.location.hash = hash; await new Promise(resolve => setTimeout(resolve, 0)); }); };
const switchIdentity = async (api, value) => {
  const select = api.dom.window.document.querySelector('[aria-label="当前身份"]');
  await api.act(async () => { select.value = value; select.dispatchEvent(new api.dom.window.Event('change', { bubbles: true })); });
};
const typeIn = async (api, input, value) => {
  const setter = Object.getOwnPropertyDescriptor(api.dom.window.HTMLInputElement.prototype, 'value').set;
  await api.act(async () => { setter.call(input, value); input.dispatchEvent(new api.dom.window.Event('input', { bubbles: true })); });
};

test.describe('知识库分类界面', { timeout: 180000 }, () => {
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

  test('三类列表筛选、卡片、空态、身份与路由', async () => {
    const personal = await mount('#/personal');
    assert.deepEqual([...personal.querySelectorAll('.library-category-filter label span')].map(item => item.textContent), ['全部分类', '制度规范', '项目资料', '培训学习', '未分类']);
    assert.equal(checkedCategory(personal), '全部分类');
    assert.deepEqual(cards(personal), [{ name: '周宁的个人知识库', categories: [] }]);
    assert.equal(personal.querySelector('[aria-label="打开知识库 周宁的个人知识库"]').textContent.includes('未分类'), false);
    await chooseCategory(api, personal, '未分类');
    assert.deepEqual(cards(personal), [{ name: '周宁的个人知识库', categories: [] }]);
    await chooseCategory(api, personal, '培训学习');
    assert.deepEqual(cards(personal), []);
    assert.equal(personal.querySelector('.knowledge-empty strong').textContent, '没有属于该分类的知识库');
    assert.equal(api.dom.window.location.hash.includes('category'), false);

    await go(api, personal, '共享知识库');
    const shared = api.dom.window.document;
    assert.equal(api.dom.window.location.hash, '#/shared');
    assert.equal(checkedCategory(shared), '全部分类');
    assert.deepEqual([...shared.querySelectorAll('.knowledge-scope-tabs button')].map(button => button.textContent), ['全部', '我共享的', '与我共享']);
    assert.deepEqual(cards(shared).find(card => card.name === '公司协作资料').categories, ['制度规范', '项目资料']);
    await chooseCategory(api, shared, '制度规范');
    assert.deepEqual(cards(shared).map(card => card.name), ['产品手册库', '公司协作资料']);
    await chooseScope(api, shared, '与我共享');
    assert.deepEqual(cards(shared).map(card => card.name), ['公司协作资料']);
    await chooseScope(api, shared, '全部');
    await chooseCategory(api, shared, '项目资料');
    assert.deepEqual(cards(shared).map(card => card.name), ['交付复盘库', '公司协作资料']);
    await chooseScope(api, shared, '我共享的');
    assert.equal(shared.querySelector('.knowledge-empty strong').textContent, '当前范围内没有属于该分类的知识库');
    await chooseScope(api, shared, '全部');
    await chooseCategory(api, shared, '培训学习');
    assert.equal(shared.querySelector('.knowledge-empty strong').textContent, '没有属于该分类的知识库');
    assert.equal(api.dom.window.location.hash, '#/shared');
    await switchIdentity(api, 'zhao-heng');
    assert.equal(checkedCategory(shared), '培训学习');
    await chooseCategory(api, shared, '项目资料');
    await switchIdentity(api, 'zhou-ning');
    assert.equal(checkedCategory(shared), '项目资料');
    assert.deepEqual(cards(shared).map(card => card.name), ['交付复盘库', '公司协作资料']);

    await go(api, shared, '知识广场');
    const plaza = api.dom.window.document;
    assert.equal(checkedCategory(plaza), '全部分类');
    assert.deepEqual(cards(plaza), [{ name: '组织知识广场', categories: ['制度规范', '培训学习'] }]);
    await chooseCategory(api, plaza, '培训学习');
    await go(api, plaza, '个人知识库');
    assert.equal(checkedCategory(api.dom.window.document), '全部分类');

    await go(api, api.dom.window.document, '主页');
    const home = api.dom.window.document;
    assert.equal(home.querySelector('.library-category-filter'), null);
    assert.equal(home.querySelector('.library-wide-grid'), null);
    assert.deepEqual([...home.querySelectorAll('[role="tablist"] button')].map(button => button.textContent), ['最近', '收藏', '与我共享', '我共享的']);
    assert.equal(home.body.textContent.includes('制度规范'), false);

    await go(api, home, '回收站');
    assert.equal(api.dom.window.document.querySelector('.library-category-filter'), null);
    assert.equal(api.dom.window.document.body.textContent.includes('制度规范'), false);

    await go(api, api.dom.window.document, '共享知识库');
    const search = api.dom.window.document.querySelector('[aria-label="全局搜索"]');
    await typeIn(api, search, '制度规范');
    const results = api.dom.window.document.querySelector('[aria-label="全局搜索结果"]');
    assert.equal(results.textContent.includes('产品手册库'), false);
    assert.match(results.textContent, /没有找到可访问的结果/);
  });

  test('新建、设置、管理闸门、库内不出现分类，恢复示例回到 4.4', async () => {
    const document = await mount('#/shared');
    await click(api, document.querySelector('[aria-label="知识库设置 交付复盘库"]'));
    const dialog = document.querySelector('[aria-label="知识库设置"]');
    assert.deepEqual([...dialog.querySelectorAll('.library-category-options span')].map(item => item.textContent), ['制度规范', '项目资料', '培训学习']);
    assert.equal([...dialog.querySelectorAll('.library-category-options input')].map(input => input.checked).join(','), 'false,true,false');
    assert.equal(dialog.textContent.includes('可多选，也可不选'), false);
    assert.equal(dialog.textContent.includes('知识库类型：'), false);
    assert.equal(dialog.textContent.includes('历史创建人'), false);
    assert.equal(dialog.textContent.includes('未分类'), false);
    assert.equal([...dialog.querySelectorAll('input')].some(input => input.type === 'checkbox' && input.nextElementSibling?.textContent === '未分类'), false);
    assert.equal([...dialog.querySelectorAll('input,textarea')].some(input => /分类/.test(input.getAttribute('placeholder') || '') || input.getAttribute('aria-label') === '新建分类'), false);
    await click(api, [...dialog.querySelectorAll('.library-category-options input')].find(input => input.value === 'training'));
    await api.act(async () => { dialog.querySelector('button[type="submit"]').click(); await new Promise(resolve => setTimeout(resolve, 80)); });
    assert.equal(document.querySelector('[aria-label="知识库设置"]'), null);
    assert.deepEqual(cards(document).find(card => card.name === '交付复盘库').categories, ['项目资料', '培训学习']);
    await chooseCategory(api, document, '培训学习');
    assert.deepEqual(cards(document).map(card => card.name), ['交付复盘库']);
    await chooseCategory(api, document, '项目资料');
    assert.equal(cards(document).filter(card => card.name === '交付复盘库').length, 1);

    await click(api, document.querySelector('[aria-label="知识库设置 交付复盘库"]'));
    const again = document.querySelector('[aria-label="知识库设置"]');
    while (again.querySelector('.library-category-options input:checked')) await click(api, again.querySelector('.library-category-options input:checked'));
    await api.act(async () => { again.querySelector('button[type="submit"]').click(); await new Promise(resolve => setTimeout(resolve, 80)); });
    await chooseCategory(api, document, '未分类');
    assert.deepEqual(cards(document).find(card => card.name === '交付复盘库').categories, []);
    assert.equal(document.querySelector('[aria-label="打开知识库 交付复盘库"]').textContent.includes('未分类'), false);
    await chooseCategory(api, document, '项目资料');
    assert.equal(cards(document).some(card => card.name === '交付复盘库'), false);

    await switchIdentity(api, 'lin-xia');
    await chooseCategory(api, document, '未分类');
    assert.equal(document.querySelector('[aria-label="知识库设置 交付复盘库"]'), null);
    await click(api, document.querySelector('[aria-label="打开知识库 交付复盘库"]'));
    assert.match(api.dom.window.location.hash, /^#\/space\/space-retro\?view=shared$/);
    const detail = api.dom.window.document.querySelector('.knowledge-library-detail');
    assert.equal(detail.querySelector('.library-category-filter'), null);
    assert.equal(detail.querySelector('.library-card-categories'), null);
    assert.equal([...detail.querySelectorAll('.knowledge-detail-row.head span')].map(item => item.textContent).filter(Boolean).join(','), '名称,所有者,更新时间,类型');
    assert.equal(detail.textContent.includes('项目复盘资料'), true);
    assert.equal(detail.textContent.includes('制度规范'), false);
    const librarySettings = [...detail.querySelectorAll('.knowledge-detail-toolbar button')].find(button => button.textContent.includes('设置'));
    assert.equal(librarySettings.disabled, true);
    assert.equal(librarySettings.title, '需要管理权限');

    await visit(api, '#/home');
    await switchIdentity(api, 'zhou-ning');
    const home = api.dom.window.document;
    await click(api, [...home.querySelectorAll('button')].find(button => button.textContent.includes('新建知识库')));
    const create = home.querySelector('[aria-label="新建知识库"]');
    assert.deepEqual([...create.querySelectorAll('.library-category-options span')].map(item => item.textContent), ['制度规范', '项目资料', '培训学习']);
    assert.equal([...create.querySelectorAll('.library-category-options input')].some(input => input.nextElementSibling?.textContent === '未分类'), false);
    await typeIn(api, create.querySelector('[aria-label="知识库名称"]'), '分类演示库');
    await click(api, [...create.querySelectorAll('.library-category-options input')].find(input => input.value === 'policy'));
    await click(api, [...create.querySelectorAll('.library-category-options input')].find(input => input.value === 'training'));
    await api.act(async () => { create.querySelector('button[type="submit"]').click(); await new Promise(resolve => setTimeout(resolve, 80)); });
    assert.match(api.dom.window.location.hash, /^#\/space\/.+\?view=personal$/);
    assert.equal(api.dom.window.location.hash.includes('category'), false);
    assert.equal(api.dom.window.document.querySelector('.knowledge-library-detail').textContent.includes('制度规范'), false);
    await visit(api, '#/personal');
    const owned = api.dom.window.document;
    await chooseCategory(api, owned, '制度规范');
    assert.deepEqual(cards(owned).map(card => card.name), ['分类演示库']);
    await chooseCategory(api, owned, '培训学习');
    assert.deepEqual(cards(owned), [{ name: '分类演示库', categories: ['制度规范', '培训学习'] }]);

    await click(api, [...owned.querySelectorAll('button')].find(button => button.textContent === '恢复示例'));
    const confirm = owned.querySelector('[aria-label="恢复示例数据"]');
    await click(api, [...confirm.querySelectorAll('button')].find(button => button.textContent === '确认'));
    await go(api, owned, '共享知识库');
    const restored = api.dom.window.document;
    assert.equal(cards(restored).some(card => card.name === '分类演示库'), false);
    assert.deepEqual(cards(restored).find(card => card.name === '交付复盘库').categories, ['项目资料']);
    assert.deepEqual(cards(restored).find(card => card.name === '公司协作资料').categories, ['制度规范', '项目资料']);
    await go(api, restored, '知识广场');
    assert.deepEqual(cards(api.dom.window.document), [{ name: '组织知识广场', categories: ['制度规范', '培训学习'] }]);
  });
});
