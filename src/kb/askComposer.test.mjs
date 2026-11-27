import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, normalizeState } from './store.js';
import {
  AGENT_MODE,
  ASK_MODELS,
  ASK_SKILL_BATCHES,
  DEFAULT_ASK_MODEL_ID,
  QA_MODE,
  QA_MODE_HINT,
  AGENT_MODE_HINT,
  OPTIMIZE_PROMPT_HINT,
  attachmentsAfterModeChange,
  availableKnowledgeSelection,
  filterKnowledgeGroups,
  formatRecordTime,
  knowledgePoolFromSelection,
  knowledgeTeamGroups,
  nextSkillBatch,
  optimizePrompt,
  recentKnowledgeItems,
  selectionKey,
  toggleKnowledgeSelection,
} from './askComposer.js';

const state = normalizeState(seedState());
const userId = 'zhou-ning';

test('知识库按现有个人、团队和组织分组，不使用标注里的示例名', () => {
  const groups = knowledgeTeamGroups(state, userId);
  assert.deepEqual(groups.map((group) => group.name), ['个人', '产品团队', '交付项目', '北辰制造']);
  assert.deepEqual(groups.find((group) => group.id === 'personal').libraries.map((item) => item.name), ['周宁的个人知识库']);
  assert.deepEqual(groups.find((group) => group.id === 'team-product').libraries.map((item) => item.name), ['产品手册库']);
  assert.deepEqual(groups.find((group) => group.id === 'team-delivery').libraries.map((item) => item.name), ['交付复盘库']);
  assert.deepEqual(groups.find((group) => group.id === 'org').libraries.map((item) => item.name).sort(), ['公司协作资料', '组织知识广场']);
  assert.equal(JSON.stringify(groups).includes('刘思家'), false);
});

test('知识多选按条目计数，父级与子级可同时存在', () => {
  const library = { type: 'library', id: 'space-handbook', name: '产品手册库' };
  const folder = { type: 'node', id: 'folder-guide', name: '功能说明', spaceId: 'space-handbook' };
  const file = { type: 'node', id: 'doc-guide', name: '知识库怎么授权', spaceId: 'space-handbook' };
  const selected = [library, folder, file].reduce((list, item) => toggleKnowledgeSelection(list, item), []);
  assert.equal(selected.length, 3);
  assert.equal(selectionKey(library), 'library:space-handbook');
  const removed = toggleKnowledgeSelection(selected, folder);
  assert.equal(removed.length, 2);
  assert.equal(removed.some((item) => item.id === 'folder-guide'), false);
});

test('已选知识可用于过滤提问范围，并在不可访问时剔除', () => {
  const selected = [
    { type: 'library', id: 'space-personal', name: '周宁的个人知识库' },
    { type: 'node', id: 'folder-guide', name: '功能说明', spaceId: 'space-handbook' },
  ];
  const pool = knowledgePoolFromSelection(state, userId, selected);
  assert.deepEqual(pool.map((node) => node.id).sort(), ['doc-guide', 'doc-note']);
  const valid = availableKnowledgeSelection(state, userId, [...selected, { type: 'library', id: 'space-chen-personal' }]);
  assert.equal(valid.some((item) => item.id === 'space-chen-personal'), false);
  assert.equal(recentKnowledgeItems(state, userId).map((item) => item.id).includes('doc-faq'), true);
  const filtered = filterKnowledgeGroups(knowledgeTeamGroups(state, userId), '报销', new Map([
    ['space-handbook', state.nodes.filter((node) => node.spaceId === 'space-handbook')],
  ]));
  assert.deepEqual(filtered.map((group) => group.name), ['产品团队']);
});

test('技能批次可循环切换，模型列表与提示词优化使用模拟数据', () => {
  assert.equal(ASK_SKILL_BATCHES.length >= 2, true);
  assert.deepEqual(ASK_SKILL_BATCHES[0].map((item) => item.name), ['知识问答', '帮我写作', '数据分析', '会议纪要']);
  assert.deepEqual(ASK_SKILL_BATCHES[1].map((item) => item.name), ['一键翻译文档', '一键搭建知识库', '长文秒变知识图解', '制作调研 PPT']);
  assert.equal(nextSkillBatch(0), 1);
  assert.equal(nextSkillBatch(1), 0);
  assert.equal(DEFAULT_ASK_MODEL_ID, 'deepseek-v4.1-flash');
  assert.equal(ASK_MODELS[0].name, 'DeepSeek-V4.1-Flash');
  assert.equal(ASK_MODELS.some((item) => item.badge === '限时折扣'), true);
  assert.equal(optimizePrompt('报销怎么走'), '请基于当前可见知识，围绕以下问题给出结构化回答，先列出要点和依据，再给出可执行建议：\n报销怎么走');
  assert.equal(optimizePrompt('  '), '');
  assert.equal(formatRecordTime(6), '0:06');
  assert.equal(formatRecordTime(75), '1:15');
  assert.deepEqual(attachmentsAfterModeChange(QA_MODE, [{ name: 'a.png' }]), []);
  assert.equal(attachmentsAfterModeChange(AGENT_MODE, [{ name: 'a.png' }]).length, 1);
  assert.equal(QA_MODE_HINT, '基于知识库搜索，优先保证回答速度');
  assert.equal(AGENT_MODE_HINT, 'Agent 可自主规划与执行复杂任务');
  assert.equal(OPTIMIZE_PROMPT_HINT, '点我帮你优化提示词');
});
