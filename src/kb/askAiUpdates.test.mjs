import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

function installBrowser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5175/knowledge-base-prototype/#/home',
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
      sourcefile: 'ask-ai-harness.js',
    },
    bundle: true,
    format: 'iife',
    globalName: 'AskAiHarness',
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
  return dom.window.AskAiHarness;
}

const click = async (api, element) => { await api.act(async () => { element.click(); }); };
const type = async (api, element, value) => {
  await api.act(async () => {
    const proto = element.tagName === 'TEXTAREA' ? api.dom.window.HTMLTextAreaElement.prototype : api.dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new api.dom.window.Event('input', { bubbles: true }));
  });
};

test.describe('问AI六项与置顶图标界面', { timeout: 180000 }, () => {
  let api;
  test.before(async () => { const dom = installBrowser(); api = { ...await boot(dom), dom }; });
  test.afterEach(async () => { if (api?.root) { await api.act(async () => api.root.unmount()); api.root = null; } });

  async function mount(hash = '#/ask') {
    const { window } = api.dom;
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  test('问AI首页去掉蒙层、浮动图标、建议问法和专家入口', async () => {
    const document = await mount('#/ask');
    assert.equal(document.querySelector('.ask-ai-overlay, .prototype-overlay'), null);
    assert.equal(document.body.textContent.includes('一期暂不开发'), false);
    assert.equal(document.querySelector('.composer-mascot'), null);
    assert.equal(document.body.textContent.includes('试试这样问'), false);
    assert.equal(document.body.textContent.includes('技能 / 专家'), false);
    assert.equal(document.body.textContent.includes('技能/专家'), false);
    const ask = document.querySelector('.knowledge-ai-workspace, .ai-workbench');
    assert.ok(ask);
    assert.equal(ask.textContent.includes('专家'), false);
    assert.match(ask.textContent, /知识问答/);
    assert.match(ask.textContent, /帮我写作/);
    assert.match(ask.textContent, /数据分析/);
    assert.match(ask.textContent, /会议纪要/);
    const skill = [...document.querySelectorAll('.ai-composer-controls button')].find((button) => button.textContent.includes('技能'));
    assert.ok(skill);
    assert.equal(skill.textContent.replace(/\s+/g, ''), '技能');
  });

  test('历史对话按近7天和更早分组，支持搜索、进入会话、重命名和删除', async () => {
    const document = await mount('#/ask');
    await click(api, [...document.querySelectorAll('.ai-workbench-header button')].find((button) => button.textContent.includes('历史')));
    const panel = document.querySelector('[aria-label="历史对话"]');
    assert.ok(panel);
    const groups = [...panel.querySelectorAll('h3')].map((item) => item.textContent);
    assert.deepEqual(groups, ['近7天', '更早']);
    assert.match(panel.textContent, /报销需要哪些材料/);
    assert.match(panel.textContent, /竞品分析需要关注哪些维度/);
    await type(api, panel.querySelector('[aria-label="搜索历史对话"]'), '报销');
    assert.match(panel.textContent, /报销需要哪些材料/);
    assert.equal(panel.textContent.includes('竞品分析需要关注哪些维度'), false);
    await type(api, panel.querySelector('[aria-label="搜索历史对话"]'), '没有这句问法xyz');
    assert.match(panel.textContent, /没有找到相关对话/);
    await click(api, panel.querySelector('[aria-label="清空搜索"]'));
    await click(api, panel.querySelector('[aria-label="更多操作 报销需要哪些材料"]'));
    await click(api, [...panel.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.includes('编辑名称')));
    const input = panel.querySelector('[aria-label="编辑对话名称"]');
    assert.ok(input);
    await type(api, input, '报销材料清单（已更名）');
    await api.act(async () => { input.closest('form').requestSubmit(); });
    const renamed = document.querySelector('[aria-label="历史对话"]');
    assert.match(renamed.textContent, /报销材料清单（已更名）/);
    assert.equal(renamed.textContent.includes('报销需要哪些材料'), false);
    const open = [...renamed.querySelectorAll('.ai-history-item-open')].find((button) => button.textContent === '个人知识库里有哪些文件');
    await click(api, open);
    assert.match(document.querySelector('.ai-thread')?.textContent || '', /个人知识库里有哪些文件/);
    await click(api, [...document.querySelectorAll('.ai-workbench-header button')].find((button) => button.textContent.includes('历史')));
    const again = document.querySelector('[aria-label="历史对话"]');
    await click(api, again.querySelector('[aria-label="更多操作 本周待办事项有哪些"]'));
    await click(api, [...again.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.includes('删除对话')));
    const dialog = document.querySelector('[role="dialog"][aria-label="删除对话「本周待办事项有哪些」？"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('p')?.textContent, '这条对话将从历史中移除。');
    await click(api, [...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === '删除'));
    assert.equal(document.querySelector('[aria-label="历史对话"]')?.textContent.includes('本周待办事项有哪些'), false);
  });

  test('技能窗口提供搜索、内置标签、描述和探索更多技能', async () => {
    const document = await mount('#/ask');
    const skill = [...document.querySelectorAll('.ai-composer-controls button')].find((button) => button.textContent.includes('技能'));
    await click(api, skill);
    const windowEl = document.querySelector('[aria-label="技能"]');
    assert.ok(windowEl);
    assert.equal(windowEl.querySelector('[aria-label="搜索技能"]')?.placeholder, '搜索技能');
    assert.match(windowEl.textContent, /PPT 制作/);
    assert.match(windowEl.textContent, /根据知识库和要求，生成PPT/);
    assert.ok([...windowEl.querySelectorAll('.ai-skill-tag')].every((tag) => tag.textContent === '内置'));
    assert.equal(windowEl.textContent.includes('专家'), false);
    await click(api, [...windowEl.querySelectorAll('button')].find((button) => button.textContent.trim() === '探索更多技能'));
    const more = document.querySelector('[aria-label="探索更多技能"]');
    assert.ok(more);
    assert.match(more.textContent, /帮我写作/);
    assert.match(more.textContent, /会议纪要/);
  });

  test('文档问AI入口只保留技能，不再出现专家', async () => {
    const document = await mount('#/doc/doc-faq?view=shared');
    const picker = document.querySelector('.doc-capability-picker .capability-trigger, .capability-trigger');
    assert.ok(picker);
    assert.equal(picker.textContent.replace(/\s+/g, ''), '技能');
    assert.equal(picker.getAttribute('aria-label'), '技能');
    await click(api, picker);
    const dialog = document.querySelector('[role="dialog"][aria-label="技能"]');
    assert.ok(dialog);
    assert.equal(dialog.textContent.includes('专家'), false);
    assert.match(dialog.textContent, /PPT 制作|帮我写作|知识图解/);
  });
});
