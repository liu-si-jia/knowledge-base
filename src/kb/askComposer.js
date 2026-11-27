import { contentRights, contentTree, librariesForView } from './access.js';
import { teamRole, visibleNodes } from './store.js';

export const QA_MODE = 'qa';
export const AGENT_MODE = 'agent';
export const QA_MODE_HINT = '基于知识库搜索，优先保证回答速度';
export const AGENT_MODE_HINT = 'Agent 可自主规划与执行复杂任务';
export const OPTIMIZE_PROMPT_HINT = '点我帮你优化提示词';
export const RECORDING_TRANSCRIPT = '请根据刚才的语音整理三条可执行建议。';
export const OPTIMIZE_PROMPT_DELAY_MS = 800;

const DEPT_TO_TEAM = {
  product: 'team-product',
  delivery: 'team-delivery',
};

export function selectionKey(item) {
  return `${item.type}:${item.id}`;
}

export function toggleKnowledgeSelection(selected, item) {
  const key = selectionKey(item);
  const exists = selected.some((entry) => selectionKey(entry) === key);
  if (exists) return selected.filter((entry) => selectionKey(entry) !== key);
  return [...selected, { type: item.type, id: item.id, name: item.name || '', spaceId: item.spaceId || '' }];
}

export function knowledgeLabel(state, item) {
  if (item?.name) return item.name;
  if (item?.type === 'library') return state.spaces.find((space) => space.id === item.id)?.name || '不可访问知识';
  return state.nodes.find((node) => node.id === item.id)?.name || '不可访问知识';
}

export function knowledgeTeamGroups(state, userId) {
  const libraries = librariesForView(state, userId);
  const groups = [];
  const assigned = new Set();
  const personal = libraries.filter((space) => space.kind === 'personal');
  if (personal.length) {
    personal.forEach((space) => assigned.add(space.id));
    groups.push({ id: 'personal', name: '个人', libraries: personal });
  }
  for (const team of (state.teams || []).filter((item) => teamRole(state, item, userId) !== 'none')) {
    const teamLibraries = libraries.filter((space) => {
      if (assigned.has(space.id) || space.kind === 'personal') return false;
      return (space.access?.subjects || []).some((subject) => subject.type === 'department' && DEPT_TO_TEAM[subject.id] === team.id);
    });
    if (teamLibraries.length) {
      teamLibraries.forEach((space) => assigned.add(space.id));
      groups.push({ id: team.id, name: team.name, libraries: teamLibraries });
    }
  }
  const rest = libraries.filter((space) => !assigned.has(space.id));
  if (rest.length) groups.push({ id: 'org', name: state.org?.name || '组织', libraries: rest });
  return groups;
}

export function filterKnowledgeGroups(groups, query, nodesBySpace = new Map()) {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups.map((group) => {
    const teamHit = group.name.toLowerCase().includes(needle);
    const libraries = group.libraries.filter((library) => {
      if (teamHit || library.name.toLowerCase().includes(needle)) return true;
      return (nodesBySpace.get(library.id) || []).some((node) => (node.name || '').toLowerCase().includes(needle));
    });
    if (!teamHit && !libraries.length) return null;
    return { ...group, libraries: teamHit ? group.libraries : libraries };
  }).filter(Boolean);
}

export function recentKnowledgeItems(state, userId) {
  const items = [];
  for (const id of state.recents || []) {
    const node = state.nodes.find((entry) => entry.id === id && !entry.deletedAt);
    if (node && contentRights(state, node, userId).view) {
      items.push({
        type: 'node',
        id: node.id,
        name: node.name,
        spaceId: node.spaceId,
        nodeType: node.type,
      });
    }
  }
  return items;
}

export function availableKnowledgeSelection(state, userId, items) {
  const libraries = new Set(librariesForView(state, userId).map((library) => library.id));
  return items.filter((item) => {
    if (item.type === 'library') return libraries.has(item.id);
    const node = state.nodes.find((entry) => entry.id === item.id);
    return !!(node && contentRights(state, node, userId).view);
  });
}

export function knowledgePoolFromSelection(state, userId, selected) {
  const readable = visibleNodes(state, userId).filter((node) => node.type === 'doc');
  if (!selected.length) return readable;
  const libraries = new Set(selected.filter((item) => item.type === 'library').map((item) => item.id));
  const ids = new Set();
  for (const item of selected.filter((entry) => entry.type === 'node')) {
    const source = state.nodes.find((node) => node.id === item.id);
    if (source) for (const id of contentTree(state, source)) ids.add(id);
  }
  return readable.filter((node) => libraries.has(node.spaceId) || ids.has(node.id));
}

export const ASK_SKILL_BATCHES = [
  [
    { name: '知识问答', description: '快速查找制度、流程与项目资料', tone: 'qa' },
    { name: '帮我写作', description: '基于企业知识起草内容', tone: 'write' },
    { name: '数据分析', description: '总结指标、风险和行动建议', tone: 'data' },
    { name: '会议纪要', description: '沉淀结论并生成待办', tone: 'meeting' },
  ],
  [
    { name: '一键翻译文档', description: '把文档翻译成需要的语言', tone: 'translate' },
    { name: '一键搭建知识库', description: '按主题快速生成知识库结构', tone: 'create' },
    { name: '长文秒变知识图解', description: '把长文提炼成清晰图解', tone: 'diagram' },
    { name: '制作调研 PPT', description: '根据调研材料生成演示文稿', tone: 'ppt' },
  ],
];

export function nextSkillBatch(index) {
  const total = ASK_SKILL_BATCHES.length;
  return ((index % total) + 1) % total;
}

export const ASK_MODELS = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', badge: '限时折扣' },
  { id: 'hy4-flash', name: 'Hy4-Flash' },
  { id: 'hy4', name: 'Hy4' },
  { id: 'hy4-preview', name: 'Hy4-preview', badge: '限时折扣' },
  { id: 'hy3', name: 'Hy3' },
];

export const DEFAULT_ASK_MODEL_ID = ASK_MODELS[0].id;

export function modelById(id) {
  return ASK_MODELS.find((item) => item.id === id) || ASK_MODELS[0];
}

export function optimizePrompt(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (source.startsWith('请基于当前可见知识，围绕以下问题给出结构化回答')) return source;
  return `请基于当前可见知识，围绕以下问题给出结构化回答，先列出要点和依据，再给出可执行建议：\n${source}`;
}

export function formatRecordTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function attachmentsAfterModeChange(mode, attachments) {
  return mode === QA_MODE ? [] : attachments;
}

export function formatConversationTime(value, now = Date.now()) {
  const date = new Date(value || now);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function isImageAttachment(file) {
  return /^image\//.test(file?.type || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file?.name || '');
}
