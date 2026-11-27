const DAY = 24 * 60 * 60 * 1000;
export const HISTORY_RECENT_MS = 7 * DAY;

function conversation(id, title, updatedAt, answer) {
  return {
    id,
    title,
    updatedAt,
    messages: [
      {
        id: `${id}-m1`,
        question: title,
        answer: {
          text: answer || `模拟回答：已围绕「${title}」整理当前可见知识中的要点，可继续追问。`,
          citations: [],
        },
        skills: [],
        knowledge: [],
        webSearch: false,
      },
    ],
  };
}

export function createSeedHistory(now = Date.now()) {
  return [
    conversation('ask-hist-reimburse', '报销需要哪些材料', now - 1 * DAY, '模拟回答：差旅报销需要发票、行程单和部门负责人确认。市内交通只保留电子发票。'),
    conversation('ask-hist-personal', '个人知识库里有哪些文件', now - 2 * DAY, '模拟回答：个人知识库里可见的资料会按当前身份列出，可继续指定要查看的文件。'),
    conversation('ask-hist-grant', '知识库怎么授权给同事', now - 5 * DAY, '模拟回答：共享知识库可授权公司、部门和人员；授权范围不会改变知识库类型。'),
    conversation('ask-hist-compete', '竞品分析需要关注哪些维度', now - 20 * DAY, '模拟回答：可从产品能力、定价、客户口碑和近期动态几个维度对比，再归纳差异和建议。'),
    conversation('ask-hist-retro', '交付复盘的结论怎么整理', now - 40 * DAY, '模拟回答：建议先写结论和影响，再补原因、待办和负责人，方便后续跟进。'),
    conversation('ask-hist-todos', '本周待办事项有哪些', now - 60 * DAY, '模拟回答：可先按截止时间和负责人汇总待办，再标出需要协调的事项。'),
  ];
}

export function isRecentHistory(item, now = Date.now()) {
  return now - item.updatedAt <= HISTORY_RECENT_MS;
}

export function groupHistory(items, now = Date.now()) {
  const recent = [];
  const earlier = [];
  for (const item of items) {
    (isRecentHistory(item, now) ? recent : earlier).push(item);
  }
  return { recent, earlier };
}

export function historyMatches(item, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if ((item.title || '').toLowerCase().includes(needle)) return true;
  return (item.messages || []).some((message) => (message.question || '').toLowerCase().includes(needle));
}

export function filterHistory(items, query) {
  return items.filter((item) => historyMatches(item, query));
}

export function renameHistory(items, id, title) {
  const next = title.trim();
  if (!next) return items;
  return items.map((item) => (item.id === id ? { ...item, title: next } : item));
}

export function deleteHistory(items, id) {
  return items.filter((item) => item.id !== id);
}

export function upsertHistory(items, conversationItem, now = Date.now()) {
  const nextItem = { ...conversationItem, updatedAt: now };
  return [nextItem, ...items.filter((item) => item.id !== conversationItem.id)];
}

export const HISTORY_DELETE_COPY = '这条对话将从历史中移除。';
