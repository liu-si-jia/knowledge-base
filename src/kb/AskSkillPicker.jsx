import { ChartBar, Compass, GraduationCap, Lightbulb, ListBullets, Notepad, PencilLine, PlusCircle, Presentation, ShareNetwork, Sparkle, X } from '@phosphor-icons/react';
import { AI_MORE_SKILLS, AI_SKILLS, filterSkills } from './aiCatalog.js';
import { useState } from 'react';

const SKILL_META = {
  ppt: { Icon: Presentation, color: '#f3a13c' },
  diagram: { Icon: Lightbulb, color: '#3db88a' },
  learn: { Icon: GraduationCap, color: '#4a7fee' },
  mindmap: { Icon: ShareNetwork, color: '#7b6cff' },
  create: { Icon: PlusCircle, color: '#2eb5c9' },
  compete: { Icon: Compass, color: '#e07a5f' },
  write: { Icon: PencilLine, color: '#5b8def' },
  summary: { Icon: ListBullets, color: '#6b8ca8' },
  data: { Icon: ChartBar, color: '#4aa0d5' },
  meeting: { Icon: Notepad, color: '#6a7bdb' },
};

function SkillRow({ name, description, tone, onSelect }) {
  const meta = SKILL_META[tone] || { Icon: Sparkle, color: '#4a7fee' };
  const Icon = meta.Icon;
  return (
    <button type="button" className="ai-skill-row" onClick={() => onSelect(name)}>
      <span className="ai-skill-icon" style={{ background: meta.color }} aria-hidden="true"><Icon size={18} weight="fill" /></span>
      <span>
        <strong>{name}<em className="ai-skill-tag">内置</em></strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

export default function AskSkillPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [explore, setExplore] = useState(false);
  const list = filterSkills(explore ? AI_MORE_SKILLS : AI_SKILLS, query);
  return (
    <section className="ai-inline-picker ai-skill-window" role="dialog" aria-label={explore ? '探索更多技能' : '技能'}>
      <header>
        <strong>{explore ? '探索更多技能' : '技能'}</strong>
        <div>
          {explore && <button type="button" onClick={() => { setExplore(false); setQuery(''); }}>返回</button>}
          <button type="button" aria-label="关闭技能窗口" onClick={onClose}><X size={15} /></button>
        </div>
      </header>
      <label className="ai-skill-search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能" aria-label="搜索技能" />
      </label>
      <div className="ai-skill-list">
        {list.map(([name, description, tone]) => (
          <SkillRow key={name} name={name} description={description} tone={tone} onSelect={onSelect} />
        ))}
        {!list.length && <p className="ai-skill-empty">没有匹配的技能</p>}
      </div>
      {!explore && <footer><button type="button" className="ai-skill-explore" onClick={() => { setExplore(true); setQuery(''); }}>探索更多技能</button></footer>}
    </section>
  );
}
