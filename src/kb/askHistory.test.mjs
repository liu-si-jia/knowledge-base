import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MORE_SKILLS, AI_SKILLS, filterSkills } from './aiCatalog.js';
import {
  HISTORY_DELETE_COPY,
  createSeedHistory,
  deleteHistory,
  filterHistory,
  groupHistory,
  renameHistory,
  upsertHistory,
} from './askHistory.js';

const now = Date.UTC(2026, 10, 27, 2, 0, 0);

test('默认历史按近7天和更早分组，标题彼此区分且完整可读', () => {
  const items = createSeedHistory(now);
  const titles = items.map((item) => item.title);
  assert.deepEqual([...titles].sort(), [...new Set(titles)].sort());
  assert.equal(titles.some((title) => title.includes('…') || title.endsWith('Deep')), false);
  assert.equal(titles.includes('报销需要哪些材料'), true);
  assert.equal(titles.includes('个人知识库里有哪些文件'), true);
  const { recent, earlier } = groupHistory(items, now);
  assert.deepEqual(recent.map((item) => item.title), ['报销需要哪些材料', '个人知识库里有哪些文件', '知识库怎么授权给同事']);
  assert.deepEqual(earlier.map((item) => item.title), ['竞品分析需要关注哪些维度', '交付复盘的结论怎么整理', '本周待办事项有哪些']);
  assert.equal(recent.every((item) => now - item.updatedAt <= 7 * 24 * 60 * 60 * 1000), true);
  assert.equal(earlier.every((item) => now - item.updatedAt > 7 * 24 * 60 * 60 * 1000), true);
});

test('历史对话支持搜索、重命名、删除和写回列表', () => {
  const items = createSeedHistory(now);
  const matched = filterHistory(items, '报销');
  assert.deepEqual(matched.map((item) => item.title), ['报销需要哪些材料']);
  const missed = filterHistory(items, '没有这句问法xyz');
  assert.deepEqual(missed, []);
  const renamed = renameHistory(items, 'ask-hist-reimburse', '报销材料清单（已更名）');
  assert.equal(renamed.find((item) => item.id === 'ask-hist-reimburse').title, '报销材料清单（已更名）');
  assert.equal(renameHistory(items, 'ask-hist-reimburse', '   ').length, items.length);
  const removed = deleteHistory(renamed, 'ask-hist-todos');
  assert.equal(removed.some((item) => item.id === 'ask-hist-todos'), false);
  assert.equal(removed.length, items.length - 1);
  const conversation = { id: 'ask-live-1', title: '新建的问题', messages: [] };
  const next = upsertHistory(removed, conversation, now);
  assert.equal(next[0].id, 'ask-live-1');
  assert.equal(next[0].updatedAt, now);
});

test('技能目录对齐搜索、内置列表和更多技能，不含专家', () => {
  assert.deepEqual(AI_SKILLS.map(([name]) => name), ['PPT 制作', '知识图解', '学习模式', '思维导图', '乐享技能创建', '竞品分析']);
  assert.equal(AI_SKILLS[0][1], '根据知识库和要求，生成PPT');
  assert.deepEqual(filterSkills(AI_SKILLS, '思维').map(([name]) => name), ['思维导图']);
  assert.deepEqual(filterSkills(AI_SKILLS, '不存在的技能'), []);
  assert.deepEqual(AI_MORE_SKILLS.map(([name]) => name), ['帮我写作', '知识总结', '数据分析', '会议纪要']);
  assert.equal(JSON.stringify({ AI_SKILLS, AI_MORE_SKILLS }).includes('专家'), false);
  assert.equal(HISTORY_DELETE_COPY, '这条对话将从历史中移除。');
});
