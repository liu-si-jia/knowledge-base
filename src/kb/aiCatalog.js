export const AI_SKILLS = [
  ['PPT 制作', '根据知识库和要求，生成PPT', 'ppt'],
  ['知识图解', '为复杂知识，生成要点图解', 'diagram'],
  ['学习模式', '通过AI问答，引导掌握知识', 'learn'],
  ['思维导图', '梳理知识脉络，生成思维导图', 'mindmap'],
  ['乐享技能创建', '用于在乐享知识库中快速新建并配置技能', 'create'],
  ['竞品分析', '整理竞品信息，输出对比与建议', 'compete'],
];

export const AI_MORE_SKILLS = [
  ['帮我写作', '将零散材料整理成可交付初稿', 'write'],
  ['知识总结', '提炼要点、行动项与结论', 'summary'],
  ['数据分析', '解读表格与指标，输出洞察', 'data'],
  ['会议纪要', '整理会议记录并分配待办', 'meeting'],
];

export function filterSkills(list, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter(([name, description]) => `${name}${description}`.toLowerCase().includes(needle));
}
