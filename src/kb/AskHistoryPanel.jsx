import { useEffect, useRef, useState } from 'react';
import { DotsThree, MagnifyingGlass, PencilSimple, Trash, X } from '@phosphor-icons/react';
import { HISTORY_DELETE_COPY, filterHistory, groupHistory } from './askHistory.js';

function MoreMenu({ item, onRename, onDelete, onClose }) {
  const root = useRef(null);
  useEffect(() => {
    const onPointer = (event) => { if (!root.current?.contains(event.target)) onClose(); };
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey, true); };
  }, [onClose]);
  return (
    <div ref={root} className="ai-history-menu" role="menu" aria-label={`${item.title} 的操作`}>
      <button type="button" role="menuitem" onClick={() => { onClose(); onRename(item); }}><PencilSimple size={15} />编辑名称</button>
      <button type="button" role="menuitem" className="danger" onClick={() => { onClose(); onDelete(item); }}><Trash size={15} />删除对话</button>
    </div>
  );
}

function HistoryRow({ item, menuFor, onOpen, onToggleMenu, onRename, onDelete, onCloseMenu, renaming, draft, setDraft, onCommitRename, onCancelRename }) {
  const input = useRef(null);
  useEffect(() => { if (renaming) input.current?.focus(); }, [renaming]);
  return (
    <div className="ai-history-item">
      {renaming ? (
        <form className="ai-history-rename" onSubmit={(event) => { event.preventDefault(); onCommitRename(item); }}>
          <input
            ref={input}
            value={draft}
            aria-label="编辑对话名称"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onCancelRename(); } }}
            onBlur={() => onCommitRename(item)}
          />
        </form>
      ) : (
        <button type="button" className="ai-history-item-open" onClick={() => onOpen(item)} title={item.title}>{item.title}</button>
      )}
      <button type="button" className="ai-history-item-more" aria-label={`更多操作 ${item.title}`} aria-haspopup="menu" aria-expanded={menuFor === item.id} onClick={(event) => { event.stopPropagation(); onToggleMenu(item.id); }}>
        <DotsThree size={18} weight="bold" />
      </button>
      {menuFor === item.id && <MoreMenu item={item} onRename={onRename} onDelete={onDelete} onClose={onCloseMenu} />}
    </div>
  );
}

export default function AskHistoryPanel({ items, now, onOpen, onRename, onDelete, onClose }) {
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState('');
  const [renamingId, setRenamingId] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const draftRef = useRef('');
  const visible = filterHistory(items, query);
  const grouped = groupHistory(visible, now);
  const startRename = (item) => { setRenamingId(item.id); setDraft(item.title); draftRef.current = item.title; setMenuFor(''); };
  const changeDraft = (value) => { draftRef.current = value; setDraft(value); };
  const commitRename = (item) => {
    if (renamingId !== item.id) return;
    const title = draftRef.current.trim();
    setRenamingId('');
    if (title && title !== item.title) onRename(item.id, title);
  };
  return (
    <section className="ai-history-panel" role="dialog" aria-label="历史对话">
      <header>
        <strong>历史对话</strong>
        <button type="button" aria-label="关闭历史对话" onClick={onClose}><X size={15} /></button>
      </header>
      <label className="ai-history-search">
        <MagnifyingGlass size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索历史对话" aria-label="搜索历史对话" />
        {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={14} /></button>}
      </label>
      <div className="ai-history-body">
        {!!grouped.recent.length && (
          <section className="ai-history-group">
            <h3>近7天</h3>
            {grouped.recent.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                menuFor={menuFor}
                onOpen={onOpen}
                onToggleMenu={(id) => setMenuFor((current) => current === id ? '' : id)}
                onRename={startRename}
                onDelete={(target) => { setPendingDelete(target); setMenuFor(''); }}
                onCloseMenu={() => setMenuFor('')}
                renaming={renamingId === item.id}
                draft={draft}
                setDraft={changeDraft}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingId('')}
              />
            ))}
          </section>
        )}
        {!!grouped.earlier.length && (
          <section className="ai-history-group">
            <h3>更早</h3>
            {grouped.earlier.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                menuFor={menuFor}
                onOpen={onOpen}
                onToggleMenu={(id) => setMenuFor((current) => current === id ? '' : id)}
                onRename={startRename}
                onDelete={(target) => { setPendingDelete(target); setMenuFor(''); }}
                onCloseMenu={() => setMenuFor('')}
                renaming={renamingId === item.id}
                draft={draft}
                setDraft={changeDraft}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingId('')}
              />
            ))}
          </section>
        )}
        {!visible.length && <p className="ai-history-empty">{query.trim() ? '没有找到相关对话' : '还没有历史对话'}</p>}
      </div>
      {pendingDelete && (
        <div className="knowledge-product-dialog-backdrop" onMouseDown={() => setPendingDelete(null)}>
          <section className="knowledge-product-dialog" role="dialog" aria-modal="true" aria-label={`删除对话「${pendingDelete.title}」？`} onMouseDown={(event) => event.stopPropagation()}>
            <h2>删除对话「{pendingDelete.title}」？</h2>
            <p>{HISTORY_DELETE_COPY}</p>
            <div className="kb-dialog-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>取消</button>
              <button type="button" className="danger-primary" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}>删除</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
