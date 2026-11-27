import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise, ArrowUp, Books, ChartBar, Clock, FileText, Image as ImageIcon,
  Microphone, Paperclip, Plus, Robot, SidebarSimple, Sparkle, Square, Translate,
  TreeStructure, UploadSimple, X,
} from '@phosphor-icons/react';
import { can, nodeRole, visibleSpaces } from './store.js';
import { AI_SKILLS } from './aiCatalog.js';
import { createSeedHistory, renameHistory, upsertHistory } from './askHistory.js';
import {
  AGENT_MODE, AGENT_MODE_HINT, ASK_MODELS, ASK_SKILL_BATCHES, DEFAULT_ASK_MODEL_ID,
  OPTIMIZE_PROMPT_DELAY_MS, OPTIMIZE_PROMPT_HINT, QA_MODE, QA_MODE_HINT, RECORDING_TRANSCRIPT,
  attachmentsAfterModeChange, availableKnowledgeSelection, formatConversationTime, formatRecordTime,
  isImageAttachment, knowledgeLabel, knowledgePoolFromSelection, modelById, nextSkillBatch, optimizePrompt,
  selectionKey, toggleKnowledgeSelection,
} from './askComposer.js';
import AskHistoryPanel from './AskHistoryPanel.jsx';
import AskKnowledgePicker from './AskKnowledgePicker.jsx';
import AskSkillPicker from './AskSkillPicker.jsx';
import ContentIcon from './ContentIcon.jsx';
import { LibraryIcon } from './libraryIcons.jsx';
import './askAi.css';

const CARD_ICONS = {
  qa: FileText,
  write: Sparkle,
  data: ChartBar,
  meeting: FileText,
  translate: Translate,
  create: Books,
  diagram: TreeStructure,
  ppt: ChartBar,
};

export default function AskPage({ state, userId, onOpen, mockAnswer, answerAllowed }) {
  const spaces = visibleSpaces(state, userId);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [skills, setSkills] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const availableKnowledge = spaces.map((space) => space.id).join('|');
  useEffect(() => {
    setKnowledge((items) => availableKnowledgeSelection(state, userId, items));
  }, [availableKnowledge, userId]);
  const [webSearch, setWebSearch] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [recording, setRecording] = useState('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [attachments, setAttachments] = useState([]);
  const [picker, setPicker] = useState('');
  const [mode, setMode] = useState(QA_MODE);
  const [modelId, setModelId] = useState(DEFAULT_ASK_MODEL_ID);
  const [skillBatch, setSkillBatch] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [focusHistory, setFocusHistory] = useState(0);
  const [optimizing, setOptimizing] = useState(false);
  const [history, setHistory] = useState(() => createSeedHistory());
  const [activeId, setActiveId] = useState('');
  const [notice, setNotice] = useState('');
  const pool = knowledgePoolFromSelection(state, userId, knowledge);

  useEffect(() => {
    if (recording !== 'recording') return undefined;
    const timer = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(() => () => {
    attachmentsRef.current.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
  }, []);

  const startNew = () => {
    setMessages([]);
    setMessage('');
    setActiveId('');
    setPicker('');
    setSkills([]);
    setAttachments((current) => {
      current.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
      return [];
    });
    setRecording('idle');
    setRecordSeconds(0);
    setOptimizing(false);
  };

  const submit = (given) => {
    const question = (given ?? message).replace(/[/@]$/, '').trim();
    if (!question) return;
    const answer = mockAnswer(state, userId, pool, question);
    const task = skills.length && mode === AGENT_MODE
      ? {
        title: skills[0],
        status: '已完成',
        output: skills[0] === '会议纪要'
          ? '已生成会议结论、待办和负责人。'
          : `已基于 ${knowledge.length ? knowledge.map((item) => knowledgeLabel(state, item)).join('、') : '全部可见知识'} 生成可继续编辑的结果。`,
      }
      : null;
    const turn = {
      id: Date.now(),
      question,
      answer,
      task,
      skills: mode === AGENT_MODE ? [...skills] : [],
      knowledge: [...knowledge],
      webSearch: mode === QA_MODE && webSearch,
      deepThink,
      modelId,
      mode,
    };
    const nextMessages = [...messages, turn];
    const conversationId = activeId || `ask-live-${turn.id}`;
    const title = messages.length ? (history.find((item) => item.id === conversationId)?.title || question) : question;
    const conversation = { id: conversationId, title, messages: nextMessages };
    setMessages(nextMessages);
    setActiveId(conversationId);
    setHistory((current) => upsertHistory(current, conversation));
    setMessage('');
    setPicker('');
    setRecording('idle');
    setRecordSeconds(0);
  };

  const openHistory = (item) => {
    setActiveId(item.id);
    setMessages(item.messages || []);
    setMessage('');
    setPicker('');
    setSkills([]);
    setAttachments((current) => {
      current.forEach((entry) => { if (entry.preview) URL.revokeObjectURL(entry.preview); });
      return [];
    });
    setRecording('idle');
    setDrawerOpen(true);
  };

  const chooseSkill = (name) => {
    setSkills((current) => (current.includes(name) ? current : [...current, name]));
    setPicker('');
    setMessage((current) => current.replace(/\/[^\s]*$/, ''));
  };
  const chooseKnowledge = (item) => {
    if (!item || item.type === 'more') return;
    setKnowledge((current) => {
      const exists = current.some((entry) => selectionKey(entry) === selectionKey(item));
      return exists ? current : toggleKnowledgeSelection(current, item);
    });
    setPicker('');
    setMessage((current) => current.replace(/@[^\s]*$/, ''));
  };
  const onMessageChange = (value) => {
    setMessage(value);
    const trigger = value.match(/([/@])[^\s]*$/)?.[1];
    if (trigger === '@') setPicker('knowledge');
    else if (trigger === '/' && mode === AGENT_MODE) setPicker('slash');
    else if (picker === 'knowledge' || picker === 'slash' || picker === 'capability') setPicker('');
  };
  const startRecording = () => {
    setPicker('');
    setRecording('recording');
    setRecordSeconds(0);
  };
  const cancelRecording = () => {
    setRecording('idle');
    setRecordSeconds(0);
  };
  const stopRecording = () => setRecording('stopped');
  const sendRecording = () => submit(RECORDING_TRANSCRIPT);
  const runTemplate = (name) => {
    if (mode === AGENT_MODE) setSkills((current) => (current.includes(name) ? current : [...current, name]));
    setMessage(['数据分析', '制作调研 PPT'].includes(name) ? '请分析当前知识中的关键数据、风险和建议。' : `请使用${name}处理当前知识。`);
  };
  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setAttachments((current) => {
      const next = attachmentsAfterModeChange(nextMode, current);
      if (next !== current) current.filter((item) => !next.includes(item)).forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
      return next;
    });
    if (nextMode === QA_MODE && (picker === 'slash' || picker === 'capability' || picker === 'settings')) {
      setPicker(picker === 'settings' ? 'settings' : '');
    }
  };
  const addFiles = (files, kind) => {
    const incoming = [...files].map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      file,
      kind: kind || (isImageAttachment(file) ? 'image' : 'file'),
      preview: isImageAttachment(file) ? URL.createObjectURL(file) : '',
    }));
    if (incoming.length) setAttachments((current) => [...current, ...incoming]);
  };
  const removeAttachment = (id) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
  };
  const runOptimize = () => {
    if (!message.trim() || optimizing) return;
    setOptimizing(true);
    window.setTimeout(() => {
      setMessage((current) => optimizePrompt(current));
      setOptimizing(false);
    }, OPTIMIZE_PROMPT_DELAY_MS);
  };
  const openHistoryDrawer = () => {
    setDrawerOpen(true);
    setFocusHistory((value) => value + 1);
  };
  const activeConversation = history.find((item) => item.id === activeId);

  return (
    <section className={`knowledge-ai-workspace ai-workbench${messages.length ? ' has-thread' : ''}${drawerOpen ? ' has-drawer' : ''}`}>
      {drawerOpen && (
        <aside className="ai-session-drawer" aria-label="会话抽屉">
          <header className="ai-session-drawer-head">
            <strong>问 AI</strong>
            <button type="button" aria-label="收起侧边栏" title="收起侧边栏" onClick={() => setDrawerOpen(false)}><SidebarSimple size={18} /></button>
          </header>
          <button type="button" className="ai-session-new" onClick={startNew}>
            <Plus size={16} />新会话
          </button>
          <AskHistoryPanel
            variant="drawer"
            items={history}
            activeId={activeId}
            autoFocusSearch={focusHistory > 0}
            onOpen={openHistory}
            onRename={(id, title) => setHistory((current) => renameHistory(current, id, title))}
            onDelete={(id) => {
              setHistory((current) => current.filter((item) => item.id !== id));
              if (activeId === id) startNew();
            }}
          />
        </aside>
      )}
      <div className="ai-workbench-main">
        <header className="ai-workbench-header">
          <div className="ai-workbench-tools">
            {!drawerOpen && <button type="button" aria-label="展开侧边栏" title="展开侧边栏" onClick={() => setDrawerOpen(true)}><SidebarSimple size={18} /></button>}
            <button type="button" aria-label="展开历史记录" title="展开历史记录" onClick={openHistoryDrawer}><Clock size={18} /></button>
            <button type="button" aria-label="新建会话" title="新建会话" onClick={startNew}><Plus size={18} /></button>
          </div>
          {!!messages.length && (
            <div className="ai-thread-heading">
              <h1>{activeConversation?.title || messages[0]?.question || '会话'}</h1>
              <time>{formatConversationTime(activeConversation?.updatedAt || Date.now())}</time>
            </div>
          )}
        </header>
        {!messages.length && (
          <div className="ai-welcome">
            <div className="greeting">
              <p>企业知识助手</p>
              <h2>今天想从哪里开始？</h2>
            </div>
            <div className="ai-template-grid ai-skill-cards">
              {ASK_SKILL_BATCHES[skillBatch].map((card) => {
                const Icon = CARD_ICONS[card.tone] || Sparkle;
                return (
                  <button key={card.name} type="button" className={`ai-skill-card tone-${card.tone}`} onClick={() => runTemplate(card.name)}>
                    <span className="ai-skill-card-icon" aria-hidden="true"><Icon size={22} weight="fill" /></span>
                    <strong>{card.name}</strong>
                    <span>{card.description}</span>
                    <i className="ai-skill-card-art" aria-hidden="true"><Icon size={72} weight="duotone" /></i>
                  </button>
                );
              })}
            </div>
            <button type="button" className="ai-skill-refresh" onClick={() => setSkillBatch((current) => nextSkillBatch(current))}>
              <ArrowClockwise size={15} />换一换
            </button>
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
                        {item.knowledge?.length ? `已引用 ${item.knowledge.map((entry) => knowledgeLabel(state, entry)).join('、')}` : '已检索全部可见知识'}
                        {item.webSearch ? ' · 已开启联网搜索' : ''}
                        {item.deepThink ? ' · 已开启深度思考' : ''}
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
          state={state}
          userId={userId}
          message={message}
          onMessageChange={onMessageChange}
          submit={submit}
          skills={skills}
          setSkills={setSkills}
          knowledge={knowledge}
          setKnowledge={setKnowledge}
          webSearch={webSearch}
          setWebSearch={setWebSearch}
          deepThink={deepThink}
          setDeepThink={setDeepThink}
          recording={recording}
          recordSeconds={recordSeconds}
          startRecording={startRecording}
          cancelRecording={cancelRecording}
          stopRecording={stopRecording}
          sendRecording={sendRecording}
          attachments={attachments}
          addFiles={addFiles}
          removeAttachment={removeAttachment}
          picker={picker}
          setPicker={setPicker}
          spaces={spaces}
          chooseSkill={chooseSkill}
          chooseKnowledge={chooseKnowledge}
          mode={mode}
          changeMode={changeMode}
          modelId={modelId}
          setModelId={setModelId}
          optimizing={optimizing}
          runOptimize={runOptimize}
        />
        <p className="knowledge-ai-disclaimer">回答基于当前身份可见的知识生成；重要内容请核实来源。</p>
        {notice && <div className="knowledge-product-toast" role="status">{notice}<button type="button" onClick={() => setNotice('')}>知道了</button></div>}
      </div>
    </section>
  );
}

function useDismiss(open, onClose, root) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!root.current?.contains(event.target)) onClose(); };
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, root]);
}

function SettingsMenu({ mode, changeMode, webSearch, setWebSearch, deepThink, setDeepThink, onOpenSkills, onUpload, onClose }) {
  const root = useRef(null);
  useDismiss(true, onClose, root);
  return (
    <section ref={root} className="ai-settings-pop" role="dialog" aria-label="输入设置">
      <div className="ai-mode-tabs" role="tablist" aria-label="问答模式 / Agent 模式">
        <button type="button" role="tab" aria-selected={mode === QA_MODE} className={mode === QA_MODE ? 'active' : ''} onClick={() => changeMode(QA_MODE)}>问答模式</button>
        <button type="button" role="tab" aria-selected={mode === AGENT_MODE} className={mode === AGENT_MODE ? 'active' : ''} onClick={() => changeMode(AGENT_MODE)}>Agent 模式</button>
      </div>
      <p className="ai-mode-hint">{mode === QA_MODE ? QA_MODE_HINT : AGENT_MODE_HINT}</p>
      <div className="ai-settings-list">
        {mode === QA_MODE ? (
          <>
            <label className="ai-settings-switch">
              <span>联网搜索</span>
              <input type="checkbox" checked={webSearch} aria-label="联网搜索" onChange={() => setWebSearch((value) => !value)} />
            </label>
            <label className="ai-settings-switch">
              <span>深度思考</span>
              <input type="checkbox" checked={deepThink} aria-label="深度思考" onChange={() => setDeepThink((value) => !value)} />
            </label>
          </>
        ) : (
          <>
            <button type="button" className="ai-settings-action" onClick={onOpenSkills}><Sparkle size={16} />技能</button>
            <button type="button" className="ai-settings-action" onClick={() => onUpload('file')}><Paperclip size={16} />上传附件</button>
            <button type="button" className="ai-settings-action" onClick={() => onUpload('image')}><ImageIcon size={16} />上传图片</button>
            <label className="ai-settings-switch">
              <span>深度思考</span>
              <input type="checkbox" checked={deepThink} aria-label="深度思考" onChange={() => setDeepThink((value) => !value)} />
            </label>
          </>
        )}
      </div>
    </section>
  );
}

function ModelMenu({ modelId, setModelId, onClose }) {
  const root = useRef(null);
  useDismiss(true, onClose, root);
  return (
    <section ref={root} className="ai-model-menu" role="listbox" aria-label="选择模型">
      {ASK_MODELS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={item.id === modelId}
          className={item.id === modelId ? 'is-selected' : ''}
          onClick={() => { setModelId(item.id); onClose(); }}
        >
          <span>
            {item.name}
            {item.badge && <em>{item.badge}</em>}
          </span>
          {item.id === modelId && <span className="ai-model-check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </section>
  );
}

function AIComposer({
  state, userId, message, onMessageChange, submit, skills, setSkills, knowledge, setKnowledge,
  webSearch, setWebSearch, deepThink, setDeepThink, recording, recordSeconds, startRecording, cancelRecording,
  stopRecording, sendRecording, attachments, addFiles, removeAttachment, picker, setPicker, spaces, chooseSkill,
  chooseKnowledge, mode, changeMode, modelId, setModelId, optimizing, runOptimize,
}) {
  const fileInput = useRef(null);
  const imageInput = useRef(null);
  const showSkills = mode === AGENT_MODE && (picker === 'slash' || picker === 'capability');
  const showMention = picker === 'knowledge';
  const showSettings = picker === 'settings';
  const showModels = picker === 'models';
  const hasChips = knowledge.length || (mode === AGENT_MODE && (skills.length || attachments.length));
  const visibleSkills = mode === AGENT_MODE ? skills : [];
  const visibleAttachments = mode === AGENT_MODE ? attachments : [];
  const openUpload = (kind) => {
    setPicker('');
    (kind === 'image' ? imageInput : fileInput).current?.click();
  };

  if (recording !== 'idle') {
    return (
      <div className={`knowledge-ai-composer ai-composer ai-recording-bar${recording === 'stopped' ? ' is-stopped' : ''}`}>
        <button type="button" className="ai-plus-btn" aria-label="打开设置" title="打开设置" onClick={() => setPicker(showSettings ? '' : 'settings')}><Plus size={18} /></button>
        {showSettings && (
          <SettingsMenu
            mode={mode}
            changeMode={changeMode}
            webSearch={webSearch}
            setWebSearch={setWebSearch}
            deepThink={deepThink}
            setDeepThink={setDeepThink}
            onOpenSkills={() => setPicker('capability')}
            onUpload={openUpload}
            onClose={() => setPicker('')}
          />
        )}
        <div className={`ai-waveform${recording === 'stopped' ? ' is-paused' : ''}`} aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 0.08}s` }} />)}
        </div>
        <span className="ai-record-time" aria-label="录音时长">{formatRecordTime(recordSeconds)}</span>
        <button type="button" className="ai-record-cancel" aria-label="取消录音" onClick={cancelRecording}><X size={16} /></button>
        <button type="button" className="ai-record-stop" aria-label="停止录音" disabled={recording === 'stopped'} onClick={stopRecording}><Square size={14} weight="fill" /></button>
        <button type="button" className="ai-record-send" aria-label="发送录音" onClick={sendRecording}><ArrowUp size={18} weight="bold" /></button>
      </div>
    );
  }

  return (
    <div className={`knowledge-ai-composer ai-composer${hasChips ? ' has-chips' : ''}`}>
      {hasChips && (
        <div className="ai-composer-chips">
          {knowledge.map((item) => (
            <span className="composer-skill-chip knowledge-chip" key={selectionKey(item)}>
              {item.type === 'library'
                ? <LibraryIcon library={state.spaces.find((space) => space.id === item.id)} size={16} />
                : <ContentIcon node={state.nodes.find((node) => node.id === item.id) || { type: 'doc', name: item.name }} size={14} />}
              {knowledgeLabel(state, item)}
              <button type="button" aria-label={`移除知识${knowledgeLabel(state, item)}`} onClick={() => setKnowledge((current) => current.filter((entry) => selectionKey(entry) !== selectionKey(item)))}><X size={11} /></button>
            </span>
          ))}
          {visibleSkills.map((item) => (
            <span className="composer-skill-chip" key={item}>
              <Sparkle size={13} weight="fill" />{item}
              <button type="button" aria-label={`移除技能${item}`} onClick={() => setSkills((current) => current.filter((value) => value !== item))}><X size={11} /></button>
            </span>
          ))}
          {visibleAttachments.map((item) => (
            <span className={`composer-skill-chip attachment-chip${item.kind === 'image' ? ' is-image' : ''}`} key={item.id}>
              {item.preview ? <img src={item.preview} alt="" /> : item.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
              {item.name}
              <button type="button" aria-label={`移除附件${item.name}`} onClick={() => removeAttachment(item.id)}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      {showSkills && <AskSkillPicker onSelect={chooseSkill} onClose={() => setPicker('')} />}
      <AskKnowledgePicker
        open={showMention}
        mode={picker === 'knowledge-more' ? 'more' : 'list'}
        state={state}
        userId={userId}
        spaces={spaces}
        selected={knowledge}
        onSelect={chooseKnowledge}
        onMore={() => setPicker('knowledge-more')}
        onConfirmMore={(items) => { setKnowledge(items); setPicker(''); onMessageChange(message.replace(/@[^\s]*$/, '')); }}
        onClose={() => setPicker('')}
      />
      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setPicker('');
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (showSkills) chooseSkill(AI_SKILLS[0][0]);
            else if (showMention && spaces[0]) chooseKnowledge({ type: 'library', id: spaces[0].id, name: spaces[0].name });
            else submit();
          }
        }}
        placeholder={mode === AGENT_MODE ? '输入问题；“/”调用技能，“@”指定知识' : '输入问题；“@”指定知识库'}
      />
      <div className="ai-composer-bottom">
        <div className="ai-composer-controls">
          <button type="button" className={`ai-plus-btn${showSettings ? ' selected' : ''}`} aria-label="打开设置" title="打开设置" onClick={() => setPicker(showSettings ? '' : 'settings')}>
            <Plus size={18} />
          </button>
          <button type="button" className={knowledge.length ? 'selected' : ''} aria-label="指定知识库" title="指定知识库" onClick={() => setPicker(showMention ? '' : 'knowledge')}>
            <Books size={16} />@
          </button>
          {mode === AGENT_MODE && (
            <button type="button" className="ai-upload-btn" aria-label="上传附件" title="上传附件" onClick={() => openUpload('file')}>
              <UploadSimple size={16} />
            </button>
          )}
          {showSettings && (
            <SettingsMenu
              mode={mode}
              changeMode={changeMode}
              webSearch={webSearch}
              setWebSearch={setWebSearch}
              deepThink={deepThink}
              setDeepThink={setDeepThink}
              onOpenSkills={() => setPicker('capability')}
              onUpload={openUpload}
              onClose={() => setPicker('')}
            />
          )}
        </div>
        <div className="send-tools">
          {!!message.trim() && (
            <button
              type="button"
              className={`ai-optimize${optimizing ? ' is-loading' : ''}`}
              aria-label={OPTIMIZE_PROMPT_HINT}
              title={OPTIMIZE_PROMPT_HINT}
              onClick={runOptimize}
            >
              {optimizing ? <span className="ai-optimize-spinner" aria-hidden="true" /> : <Sparkle size={16} weight="fill" />}
            </button>
          )}
          <div className="ai-model-picker">
            <button type="button" className="ai-model-trigger" aria-haspopup="listbox" aria-expanded={showModels} aria-label="选择模型" onClick={() => setPicker(showModels ? '' : 'models')}>
              {modelById(modelId).name}
            </button>
            {showModels && <ModelMenu modelId={modelId} setModelId={setModelId} onClose={() => setPicker('')} />}
          </div>
          <i />
          <button className="voice-input" type="button" aria-label="开始语音输入" onClick={startRecording}>
            <Microphone size={20} />
          </button>
          <button className="send" aria-label="发送" onClick={() => submit()}><ArrowUp size={21} weight="bold" /></button>
        </div>
      </div>
      <input ref={fileInput} className="ai-file-input" data-testid="ask-attachment-input" type="file" hidden aria-label="选择附件" onChange={(event) => { addFiles(event.target.files, 'file'); event.target.value = ''; }} />
      <input ref={imageInput} className="ai-file-input" data-testid="ask-image-input" type="file" accept="image/*" hidden aria-label="选择图片" onChange={(event) => { addFiles(event.target.files, 'image'); event.target.value = ''; }} />
    </div>
  );
}
