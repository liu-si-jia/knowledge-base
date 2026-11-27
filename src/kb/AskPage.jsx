import { useEffect, useState } from 'react';
import {
  ArrowUp, BookBookmark, Books, Briefcase, CaretDown, CaretRight, ChartBar, CheckSquare,
  Clock, FileText, Globe, Microphone, PencilLine, Plus, Robot, Sparkle, UploadSimple, X,
} from '@phosphor-icons/react';
import { can, nodeRole, visibleNodes, visibleSpaces } from './store.js';
import { AI_SKILLS } from './aiCatalog.js';
import { createSeedHistory, upsertHistory } from './askHistory.js';
import AskHistoryPanel from './AskHistoryPanel.jsx';
import AskSkillPicker from './AskSkillPicker.jsx';
import './askAi.css';

export default function AskPage({ state, userId, onOpen, mockAnswer, answerAllowed }) {
  const spaces = visibleSpaces(state, userId);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [skills, setSkills] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const availableKnowledge = spaces.map((space) => space.id).join('|');
  useEffect(() => {
    setKnowledge((ids) => ids.filter((id) => spaces.some((space) => space.id === id)));
  }, [availableKnowledge, userId]);
  const [webSearch, setWebSearch] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [picker, setPicker] = useState('');
  const [history, setHistory] = useState(() => createSeedHistory());
  const [activeId, setActiveId] = useState('');
  const [notice, setNotice] = useState('');
  const pool = visibleNodes(state, userId).filter((node) => node.type === 'doc' && (!knowledge.length || knowledge.includes(node.spaceId)));

  const startNew = () => {
    setMessages([]);
    setMessage('');
    setActiveId('');
    setPicker('');
    setSkills([]);
    setAttachments([]);
  };

  const submit = (given) => {
    const question = (given ?? message).replace(/[/@]$/, '').trim();
    if (!question) return;
    const answer = mockAnswer(state, userId, pool, question);
    const task = skills.length
      ? {
        title: skills[0],
        status: '已完成',
        output: skills[0] === '会议纪要'
          ? '已生成会议结论、待办和负责人。'
          : `已基于 ${knowledge.length ? knowledge.map((id) => state.spaces.find((space) => space.id === id)?.name || '不可访问知识').join('、') : '全部可见知识'} 生成可继续编辑的结果。`,
      }
      : null;
    const turn = { id: Date.now(), question, answer, task, skills: [...skills], knowledge: [...knowledge], webSearch };
    const nextMessages = [...messages, turn];
    const conversationId = activeId || `ask-live-${turn.id}`;
    const title = messages.length ? (history.find((item) => item.id === conversationId)?.title || question) : question;
    const conversation = { id: conversationId, title, messages: nextMessages };
    setMessages(nextMessages);
    setActiveId(conversationId);
    setHistory((current) => upsertHistory(current, conversation));
    setMessage('');
    setPicker('');
  };

  const openHistory = (item) => {
    setActiveId(item.id);
    setMessages(item.messages || []);
    setMessage('');
    setPicker('');
    setSkills([]);
    setAttachments([]);
  };

  const chooseSkill = (name) => {
    setSkills((current) => (current.includes(name) ? current : [...current, name]));
    setPicker('');
    setMessage((current) => current.replace(/\/[^\s]*$/, ''));
  };
  const chooseKnowledge = (id) => {
    setKnowledge((current) => (current.includes(id) ? current : [...current, id]));
    setPicker('');
    setMessage((current) => current.replace(/@[^\s]*$/, ''));
  };
  const onMessageChange = (value) => {
    setMessage(value);
    const trigger = value.match(/([/@])[^\s]*$/)?.[1];
    setPicker(trigger === '/' ? 'slash' : trigger === '@' ? 'knowledge' : '');
  };
  const toggleVoice = () => {
    if (recording) {
      setRecording(false);
      setMessage((value) => `${value}${value ? ' ' : ''}请根据当前知识整理三条可执行建议。`);
      setNotice('已完成语音转写');
    } else {
      setRecording(true);
      setNotice('正在录音 00:00，再次点击结束');
    }
  };
  const runTemplate = (name) => {
    setSkills((current) => (current.includes(name) ? current : [...current, name]));
    setMessage(name === '数据分析' ? '请分析当前知识中的关键数据、风险和建议。' : `请使用${name}处理当前知识。`);
  };

  return (
    <section className={`knowledge-ai-workspace ai-workbench${messages.length ? ' has-thread' : ''}`}>
      <header className="ai-workbench-header">
        <div><Sparkle size={20} weight="fill" /><h1>问AI</h1><span>企业知识工作台</span></div>
        <div>
          <button type="button" onClick={startNew}>新对话</button>
          <button type="button" className={picker === 'history' ? 'active' : ''} onClick={() => setPicker(picker === 'history' ? '' : 'history')}>
            <Clock size={17} />历史
          </button>
        </div>
      </header>
      {picker === 'history' && (
        <AskHistoryPanel
          items={history}
          onOpen={openHistory}
          onRename={(id, title) => setHistory((current) => current.map((item) => (item.id === id ? { ...item, title } : item)))}
          onDelete={(id) => {
            setHistory((current) => current.filter((item) => item.id !== id));
            if (activeId === id) startNew();
          }}
          onClose={() => setPicker('')}
        />
      )}
      {!messages.length && (
        <div className="ai-welcome">
          <div className="greeting">
            <p>企业知识助手</p>
            <h2>今天想从哪里开始？</h2>
            <span>提问、调用技能，或让 AI 直接完成一项工作。</span>
          </div>
          <div className="ai-template-grid">
            {[['知识问答', '快速查找制度、流程与项目资料', FileText], ['帮我写作', '基于企业知识起草内容', PencilLine], ['数据分析', '总结指标、风险和行动建议', ChartBar], ['会议纪要', '沉淀结论并生成待办', Briefcase]].map(([name, description, Icon]) => (
              <button key={name} type="button" onClick={() => runTemplate(name)}>
                <Icon size={20} weight="fill" /><strong>{name}</strong><span>{description}</span><CaretRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      {!!messages.length && (
        <main className="ai-thread" aria-live="polite">
          {messages.map((item) => (
            <article key={item.id} className="ai-turn">
              <div className="knowledge-ai-user">{item.question}</div>
              <div className="ai-answer-card">
                <div className="answer-brand">
                  <span><Robot size={18} /></span>
                  <div>
                    <strong>知识库助手</strong>
                    <small>
                      {item.knowledge?.length ? `已引用 ${item.knowledge.map((id) => state.spaces.find((space) => space.id === id)?.name || '不可访问知识').join('、')}` : '已检索全部可见知识'}
                      {item.webSearch ? ' · 已开启联网搜索' : ''}
                    </small>
                  </div>
                </div>
                <p>{answerAllowed(state, userId, item.answer) ? item.answer.text : '来源权限已变化，此回答暂不可查看。'}</p>
                {item.task && (
                  <div className="ai-task-result">
                    <span>任务结果</span>
                    <strong>{item.task.title}</strong>
                    <em>{item.task.status}</em>
                    <p>{item.task.output}</p>
                    <button type="button" onClick={() => setNotice('结果已保存到本次对话，可继续编辑或引用。')}>查看结果</button>
                  </div>
                )}
                <div className="kb-citations">
                  {(item.answer?.citations || []).filter((cite) => can(nodeRole(state, state.nodes.find((node) => node.id === cite.id), userId), 'view')).map((cite) => (
                    <button key={cite.id} type="button" onClick={() => onOpen(cite.id)}><FileText size={14} />{cite.name}</button>
                  ))}
                </div>
                <footer>
                  <button type="button" onClick={() => setNotice('回答已复制')}>复制</button>
                  <button type="button" onClick={() => setMessage(`请继续展开：${item.question}`)}>继续追问</button>
                  <button type="button" onClick={() => setNotice('已收到反馈')}>有帮助</button>
                </footer>
              </div>
            </article>
          ))}
        </main>
      )}
      <AIComposer
        message={message}
        onMessageChange={onMessageChange}
        submit={submit}
        skills={skills}
        setSkills={setSkills}
        knowledge={knowledge}
        setKnowledge={setKnowledge}
        webSearch={webSearch}
        setWebSearch={setWebSearch}
        recording={recording}
        toggleVoice={toggleVoice}
        attachments={attachments}
        setAttachments={setAttachments}
        picker={picker}
        setPicker={setPicker}
        spaces={spaces}
        chooseSkill={chooseSkill}
        chooseKnowledge={chooseKnowledge}
        stateName={(id) => state.spaces.find((space) => space.id === id)?.name || '不可访问知识'}
      />
      <p className="knowledge-ai-disclaimer">回答基于当前身份可见的知识生成；重要内容请核实来源。</p>
      {notice && <div className="knowledge-product-toast" role="status">{notice}<button type="button" onClick={() => setNotice('')}>知道了</button></div>}
    </section>
  );
}

function AIComposer({
  message, onMessageChange, submit, skills, setSkills, knowledge, setKnowledge,
  webSearch, setWebSearch, recording, toggleVoice, attachments, setAttachments,
  picker, setPicker, spaces, chooseSkill, chooseKnowledge, stateName,
}) {
  const showSkills = picker === 'slash' || picker === 'capability';
  return (
    <div className={`knowledge-ai-composer ai-composer${skills.length || knowledge.length || attachments.length ? ' has-chips' : ''}`}>
      <div className="ai-composer-chips">
        {skills.map((item) => (
          <span className="composer-skill-chip" key={item}>
            <Sparkle size={13} weight="fill" />{item}
            <button type="button" aria-label={`移除技能${item}`} onClick={() => setSkills((current) => current.filter((value) => value !== item))}><X size={11} /></button>
          </span>
        ))}
        {knowledge.map((item) => (
          <span className="composer-skill-chip knowledge-chip" key={item}>
            <Books size={13} weight="fill" />{stateName(item)}
            <button type="button" aria-label={`移除知识${item}`} onClick={() => setKnowledge((current) => current.filter((value) => value !== item))}><X size={11} /></button>
          </span>
        ))}
        {attachments.map((item) => (
          <span className="composer-skill-chip attachment-chip" key={item.name}>
            <FileText size={13} />{item.name}
            <button type="button" aria-label={`移除附件${item.name}`} onClick={() => setAttachments((current) => current.filter((value) => value.name !== item.name))}><X size={11} /></button>
          </span>
        ))}
      </div>
      {showSkills && <AskSkillPicker onSelect={chooseSkill} onClose={() => setPicker('')} />}
      {(picker === 'knowledge' || picker === 'knowledge-center') && (
        <section className="ai-inline-picker knowledge-picker">
          <header>
            <strong>{picker === 'knowledge-center' ? '从知识中心选择' : '指定知识'}</strong>
            <button type="button" onClick={() => setPicker('')}><X size={15} /></button>
          </header>
          <p>{picker === 'knowledge-center' ? '可多选知识库；选择后会作为本次对话的可追溯上下文。' : '选择后仅在对应知识范围内检索和引用。'}</p>
          {spaces.map((space) => (
            <button className="ai-picker-row" key={space.id} type="button" onClick={() => chooseKnowledge(space.id)}>
              <BookBookmark size={16} />
              <span><strong>{space.name}</strong><small>{space.description}</small></span>
              {knowledge.includes(space.id) ? <CheckSquare size={16} /> : <Plus size={16} />}
            </button>
          ))}
          <footer>
            {picker === 'knowledge'
              ? <button type="button" onClick={() => setPicker('knowledge-center')}>从知识中心选择更多 <CaretRight size={14} /></button>
              : <button type="button" onClick={() => setPicker('')}>完成选择 <CheckSquare size={14} /></button>}
          </footer>
        </section>
      )}
      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setPicker('');
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (showSkills) chooseSkill(AI_SKILLS[0][0]);
            else if (picker === 'knowledge' && spaces[0]) chooseKnowledge(spaces[0].id);
            else submit();
          }
        }}
        placeholder="输入问题；“/”调用技能，“@”指定知识"
      />
      <div className="ai-composer-bottom">
        <div className="ai-composer-controls">
          <button className={showSkills || skills.length ? 'selected' : ''} type="button" onClick={() => setPicker(showSkills ? '' : 'capability')}>
            <Sparkle size={16} />技能<CaretDown size={13} />
          </button>
          <button className={knowledge.length ? 'selected' : ''} type="button" onClick={() => setPicker('knowledge')}>
            <Books size={16} />{knowledge.length ? `${knowledge.length} 个知识` : '知识'}<CaretDown size={13} />
          </button>
        </div>
        <div className="send-tools">
          <label className="ai-attachment" title="添加附件">
            <UploadSimple size={19} />
            <input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) setAttachments((current) => [...current, file]); event.target.value = ''; }} />
          </label>
          <button className={webSearch ? 'web-search active' : 'web-search'} type="button" aria-label="联网搜索" aria-pressed={webSearch} onClick={() => setWebSearch((value) => !value)}>
            <Globe size={20} />
          </button>
          <i />
          <button className={recording ? 'voice-input active' : 'voice-input'} type="button" aria-label={recording ? '停止语音输入' : '开始语音输入'} onClick={toggleVoice}>
            <Microphone size={20} />
          </button>
          <button className="send" aria-label="发送" onClick={() => submit()}><ArrowUp size={21} weight="bold" /></button>
        </div>
      </div>
    </div>
  );
}
