import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextDecoder, TextEncoder } from 'node:util';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

function installBrowser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5176/knowledge-base-prototype/#/home',
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
  if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:mock';
  if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
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
const byText = (root, text, selector = 'button') => [...root.querySelectorAll(selector)].find((item) => item.textContent.includes(text));
const askText = (document) => document.querySelector('.knowledge-ai-workspace, .ai-workbench')?.textContent || '';

test.describe('问AI八项展示与交互', { timeout: 180000 }, () => {
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

  async function openSettings(document) {
    if (!document.querySelector('[aria-label="输入设置"]')) {
      await click(api, document.querySelector('[aria-label="打开设置"]'));
    }
    return document.querySelector('[aria-label="输入设置"]');
  }

  async function switchAgent(document) {
    const settings = document.querySelector('[aria-label="输入设置"]') || await openSettings(document);
    await click(api, byText(settings, 'Agent 模式'));
    return document.querySelector('[aria-label="输入设置"]');
  }

  test('问AI首页去掉两处指定文案，并保留技能卡与换一换', async () => {
    const document = await mount('#/ask');
    const ask = document.querySelector('.knowledge-ai-workspace, .ai-workbench');
    assert.ok(ask);
    assert.equal(document.querySelector('.ask-ai-overlay, .prototype-overlay'), null);
    assert.equal(document.body.textContent.includes('一期暂不开发'), false);
    assert.equal(document.querySelector('.composer-mascot'), null);
    assert.equal(askText(document).includes('试试这样问'), false);
    assert.equal(askText(document).includes('企业知识工作台'), false);
    assert.equal(askText(document).includes('提问、调用技能，或让 AI 直接完成一项工作。'), false);
    assert.equal(askText(document).includes('Workbuddy'), false);
    assert.equal(askText(document).includes('定时任务'), false);
    assert.equal(askText(document).includes('技能广场'), false);
    assert.match(askText(document), /今天想从哪里开始？/);
    assert.match(askText(document), /知识问答/);
    assert.match(askText(document), /帮我写作/);
    assert.match(askText(document), /数据分析/);
    assert.match(askText(document), /会议纪要/);
    assert.ok(byText(ask, '换一换'));
    await click(api, byText(ask, '换一换'));
    assert.match(askText(document), /一键翻译文档/);
    assert.match(askText(document), /制作调研 PPT/);
    assert.equal(askText(document).includes('知识问答'), false);
    const intro = readFileSync(new URL('../../public/product-introduction.html', import.meta.url), 'utf8');
    assert.equal(intro.includes('企业知识工作台'), false);
    assert.equal(intro.includes('提问、调用技能，或让 AI 直接完成一项工作。'), false);
    assert.match(intro, /可提问、调用技能并查看历史对话/);
  });

  test('产品主侧栏仍在，历史改为左侧抽屉并支持搜索、进入、重命名和删除', async () => {
    const document = await mount('#/ask');
    const shell = document.querySelector('.knowledge-shell');
    assert.ok(shell.querySelector('.knowledge-subnav'));
    assert.match(shell.querySelector('.knowledge-subnav').textContent, /问AI|主页|知识广场|回收站/);
    const drawer = document.querySelector('[aria-label="会话抽屉"]');
    assert.ok(drawer);
    const ask = document.querySelector('.ai-workbench');
    const drawerBox = drawer.getBoundingClientRect();
    const navBox = shell.querySelector('.knowledge-subnav').getBoundingClientRect();
    assert.equal(ask.contains(drawer), true);
    assert.equal(shell.querySelector('.knowledge-subnav').contains(drawer), false);
    assert.ok((drawer.compareDocumentPosition(shell.querySelector('.knowledge-subnav')) & api.dom.window.Node.DOCUMENT_POSITION_PRECEDING) || navBox.left <= drawerBox.left);
    const panel = document.querySelector('[aria-label="历史对话"]');
    assert.ok(panel);
    assert.deepEqual([...panel.querySelectorAll('.ai-history-group > h3')].map((item) => item.textContent), ['近7天', '更早']);
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
    await type(api, input, '报销材料清单（已更名）');
    await api.act(async () => { input.closest('form').requestSubmit(); });
    const renamed = document.querySelector('[aria-label="历史对话"]');
    assert.match(renamed.textContent, /报销材料清单（已更名）/);
    await click(api, [...renamed.querySelectorAll('.ai-history-item-open')].find((button) => button.textContent === '个人知识库里有哪些文件'));
    assert.match(document.querySelector('.ai-thread')?.textContent || '', /个人知识库里有哪些文件/);
    assert.ok(document.querySelector('.ai-thread-heading'));
    assert.ok(document.querySelector('[aria-label="会话抽屉"]'));
    await click(api, document.querySelector('[aria-label="收起侧边栏"]'));
    assert.equal(document.querySelector('[aria-label="会话抽屉"]'), null);
    await click(api, document.querySelector('[aria-label="展开历史记录"]'));
    const again = document.querySelector('[aria-label="历史对话"]');
    assert.ok(again);
    await click(api, again.querySelector('[aria-label="更多操作 本周待办事项有哪些"]'));
    await click(api, [...again.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.includes('删除对话')));
    const dialog = document.querySelector('[role="dialog"][aria-label="删除对话「本周待办事项有哪些」？"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('p')?.textContent, '这条对话将从历史中移除。');
    await click(api, [...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === '删除'));
    assert.equal(document.querySelector('[aria-label="历史对话"]')?.textContent.includes('本周待办事项有哪些'), false);
    await click(api, document.querySelector('[aria-label="新建会话"]'));
    assert.equal(document.querySelector('.ai-thread'), null);
    assert.match(askText(document), /今天想从哪里开始？/);
  });

  test('@ 知识库先出列表，选择更多支持多选并在输入区展示标签', async () => {
    const document = await mount('#/ask');
    await click(api, document.querySelector('[aria-label="指定知识库"]'));
    const list = document.querySelector('[aria-label="选择知识库"]');
    assert.ok(list);
    assert.match(list.textContent, /周宁的个人知识库/);
    assert.equal(list.textContent.includes('刘思家'), false);
    assert.match(list.textContent, /从知识库选择更多/);
    await click(api, byText(list, '周宁的个人知识库'));
    assert.match(document.querySelector('.ai-composer-chips')?.textContent || '', /周宁的个人知识库/);
    await click(api, document.querySelector('[aria-label="指定知识库"]'));
    await click(api, byText(document.querySelector('[aria-label="选择知识库"]'), '从知识库选择更多'));
    const dialog = document.querySelector('[role="dialog"][aria-label="选择更多"]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /知识库目录/);
    assert.match(dialog.textContent, /个人/);
    assert.match(dialog.textContent, /产品团队/);
    assert.equal(dialog.querySelector('[aria-label="搜索团队、知识库、知识"]')?.placeholder, '搜索团队、知识库、知识');
    await click(api, byText(dialog.querySelector('[aria-label="团队"]'), '产品团队'));
    await click(api, dialog.querySelector('[aria-label="选择知识库 产品手册库"]'));
    await click(api, byText(dialog.querySelector('[aria-label="知识库"]'), '产品手册库'));
    const folder = dialog.querySelector('[aria-label="选择 功能说明"]');
    if (folder) await click(api, folder);
    const file = dialog.querySelector('[aria-label="选择 报销需要哪些材料"]');
    if (file) await click(api, file);
    assert.match(dialog.textContent, /已选 \d+ 个/);
    const count = Number((dialog.querySelector('.ai-more-selected button')?.textContent || '').match(/已选 (\d+) 个/)?.[1] || 0);
    assert.ok(count >= 2);
    await click(api, byText(dialog, '确认'));
    const chips = document.querySelector('.ai-composer-chips')?.textContent || '';
    assert.match(chips, /产品手册库/);
    assert.equal(document.querySelector('[role="dialog"][aria-label="选择更多"]'), null);
  });

  test('问答与 Agent 模式菜单规则正确，切回问答会去掉附件', async () => {
    const document = await mount('#/ask');
    const settings = await openSettings(document);
    assert.ok(settings);
    assert.match(settings.textContent, /基于知识库搜索，优先保证回答速度/);
    assert.match(settings.textContent, /联网搜索/);
    assert.match(settings.textContent, /深度思考/);
    assert.equal(settings.textContent.includes('信息源'), false);
    assert.equal(settings.textContent.includes('上传附件'), false);
    assert.equal(document.querySelector('[data-testid="ask-attachment-input"]'), document.querySelector('[data-testid="ask-attachment-input"]'));
    assert.equal(document.querySelector('[aria-label="上传附件"]') && document.querySelector('.ai-upload-btn'), null);
    const agent = await switchAgent(document);
    assert.match(agent.textContent, /Agent 可自主规划与执行复杂任务/);
    assert.match(agent.textContent, /技能/);
    assert.match(agent.textContent, /上传附件/);
    assert.match(agent.textContent, /上传图片/);
    assert.equal(agent.textContent.includes('信息源'), false);
    const input = document.querySelector('[data-testid="ask-attachment-input"]');
    const file = new api.dom.window.File(['mock'], '调研附件.pdf', { type: 'application/pdf' });
    await api.act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new api.dom.window.Event('change', { bubbles: true }));
    });
    assert.match(document.querySelector('.ai-composer-chips')?.textContent || '', /调研附件\.pdf/);
    await openSettings(document);
    await click(api, byText(document.querySelector('[aria-label="输入设置"]'), '问答模式'));
    assert.equal((document.querySelector('.ai-composer-chips')?.textContent || '').includes('调研附件.pdf'), false);
  });

  test('技能窗口仍可通过 Agent 菜单打开，并提供搜索和探索更多', async () => {
    const document = await mount('#/ask');
    await switchAgent(document);
    await click(api, byText(document.querySelector('[aria-label="输入设置"]'), '技能'));
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

  test('录音条、优化提示词和模型选择使用模拟交互', async () => {
    const document = await mount('#/ask');
    await click(api, document.querySelector('[aria-label="开始语音输入"]'));
    const bar = document.querySelector('.ai-recording-bar');
    assert.ok(bar);
    assert.ok(bar.querySelector('.ai-waveform'));
    assert.equal(bar.querySelector('[aria-label="录音时长"]')?.textContent, '0:00');
    assert.ok(bar.querySelector('[aria-label="取消录音"]'));
    assert.ok(bar.querySelector('[aria-label="停止录音"]'));
    assert.ok(bar.querySelector('[aria-label="发送录音"]'));
    await click(api, bar.querySelector('[aria-label="停止录音"]'));
    assert.ok(document.querySelector('.ai-recording-bar.is-stopped, .ai-waveform.is-paused'));
    await click(api, document.querySelector('[aria-label="取消录音"]'));
    assert.equal(document.querySelector('.ai-recording-bar'), null);
    const textarea = document.querySelector('.ai-composer textarea');
    assert.equal(document.querySelector('[aria-label="点我帮你优化提示词"]'), null);
    await type(api, textarea, '报销怎么走');
    const optimize = document.querySelector('[aria-label="点我帮你优化提示词"]');
    assert.ok(optimize);
    assert.equal(optimize.getAttribute('title'), '点我帮你优化提示词');
    await click(api, optimize);
    assert.ok(document.querySelector('.ai-optimize.is-loading, .ai-optimize-spinner'));
    await api.act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); });
    assert.match(document.querySelector('.ai-composer textarea')?.value || '', /结构化回答[\s\S]*报销怎么走/);
    await click(api, document.querySelector('[aria-label="选择模型"]'));
    const models = document.querySelector('[aria-label="选择模型"][role="listbox"], [role="listbox"][aria-label="选择模型"]');
    assert.ok(models);
    assert.match(models.textContent, /DeepSeek-V4.1-Flash/);
    assert.match(models.textContent, /Hy4-preview/);
    assert.ok(models.querySelector('.is-selected'));
    await click(api, byText(models, 'Hy4-Flash'));
    assert.match(document.querySelector('[aria-label="选择模型"]')?.textContent || '', /Hy4-Flash/);
  });

  test('文档问AI入口只保留技能，不再出现专家，也不扩展新的问AI输入能力', async () => {
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
    assert.equal(document.querySelector('[aria-label="输入设置"]'), null);
    assert.equal(document.querySelector('[aria-label="选择模型"]'), null);
  });
});
