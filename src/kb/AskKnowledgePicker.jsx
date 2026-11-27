import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { actualNodes, projectedEntries } from './access.js';
import ContentIcon from './ContentIcon.jsx';
import { LibraryIcon } from './libraryIcons.jsx';
import {
  filterKnowledgeGroups,
  knowledgeTeamGroups,
  recentKnowledgeItems,
  selectionKey,
  toggleKnowledgeSelection,
} from './askComposer.js';

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

export function KnowledgeMentionList({ spaces, selected, onSelect, onMore, onClose }) {
  const root = useRef(null);
  useDismiss(true, onClose, root);
  return (
    <section ref={root} className="ai-knowledge-mention" role="listbox" aria-label="选择知识库">
      {spaces.map((space) => (
        <button
          key={space.id}
          type="button"
          role="option"
          aria-selected={selected.some((item) => item.type === 'library' && item.id === space.id)}
          className="ai-knowledge-mention-item"
          onClick={() => onSelect({ type: 'library', id: space.id, name: space.name })}
        >
          <LibraryIcon library={space} size={22} />
          <span>{space.name}</span>
        </button>
      ))}
      <button type="button" className="ai-knowledge-mention-more" onClick={onMore}>
        <span>@ 从知识库选择更多</span>
        <CaretRight size={14} />
      </button>
    </section>
  );
}

function TreeRows({ state, userId, library, query, selected, onToggle, expanded, onToggleExpand }) {
  const keyword = query.trim().toLowerCase();
  const matched = new Set();
  if (library && keyword && !library.name.toLowerCase().includes(keyword)) {
    for (const node of actualNodes(state, library, userId).filter((item) => item.name.toLowerCase().includes(keyword))) {
      matched.add(node.id);
      let parentId = node.parentId;
      while (parentId) {
        matched.add(parentId);
        parentId = state.nodes.find((item) => item.id === parentId)?.parentId;
      }
    }
  }
  const rows = (parentId = '', depth = 0) => {
    if (!library) return null;
    return projectedEntries(state, library, userId, 'all', parentId)
      .filter((node) => !keyword || library.name.toLowerCase().includes(keyword) || matched.has(node.id))
      .map((node) => {
        const folder = node.type === 'folder';
        const open = !!keyword || expanded.has(node.id);
        const item = { type: 'node', id: node.id, name: node.name, spaceId: library.id };
        const checked = selected.some((entry) => selectionKey(entry) === selectionKey(item));
        return (
          <div key={node.id}>
            <div className={`ai-more-tree-row${node.pathOnly ? ' path-only' : ''}`} style={{ paddingLeft: depth * 16 }}>
              {folder ? (
                <button type="button" aria-label={`${open ? '收起' : '展开'} ${node.name}`} aria-expanded={open} onClick={() => onToggleExpand(node.id)}>
                  <CaretRight size={13} className={open ? 'open' : ''} />
                </button>
              ) : <span className="ai-more-caret-slot" />}
              <label>
                <input type="checkbox" disabled={!!node.pathOnly} checked={checked} aria-label={`选择 ${node.name}`} onChange={() => onToggle(item)} />
                <ContentIcon node={node} size={16} />
                <span>{node.name}</span>
              </label>
            </div>
            {folder && open && rows(node.id, depth + 1)}
          </div>
        );
      });
  };
  return rows();
}

export function KnowledgeMoreDialog({ state, userId, selected, onConfirm, onClose }) {
  const groups = knowledgeTeamGroups(state, userId);
  const [tab, setTab] = useState('directory');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(selected);
  const [teamId, setTeamId] = useState(groups[0]?.id || '');
  const [libraryId, setLibraryId] = useState(groups[0]?.libraries[0]?.id || '');
  const [expanded, setExpanded] = useState(new Set());
  const [showSelected, setShowSelected] = useState(false);
  const nodesBySpace = useMemo(() => {
    const map = new Map();
    for (const space of state.spaces) map.set(space.id, actualNodes(state, space, userId));
    return map;
  }, [state, userId]);
  const visibleGroups = filterKnowledgeGroups(groups, query, nodesBySpace);
  const activeGroup = visibleGroups.find((group) => group.id === teamId) || visibleGroups[0];
  const libraries = activeGroup?.libraries || [];
  const library = libraries.find((item) => item.id === libraryId) || libraries[0];
  const recent = recentKnowledgeItems(state, userId).filter((item) => !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (item) => setDraft((current) => toggleKnowledgeSelection(current, item));
  const toggleExpand = (id) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return createPortal(
    <div className="ai-more-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ai-more-dialog" role="dialog" aria-modal="true" aria-label="选择更多" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>选择更多</h2>
          <button type="button" aria-label="关闭选择更多" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="ai-more-toolbar">
          <div className="ai-more-tabs" role="tablist" aria-label="知识来源">
            <button type="button" role="tab" aria-selected={tab === 'recent'} onClick={() => setTab('recent')}>最近使用</button>
            <button type="button" role="tab" aria-selected={tab === 'directory'} onClick={() => setTab('directory')}>知识库目录</button>
          </div>
          <label className="ai-more-search">
            <MagnifyingGlass size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索团队、知识库、知识" aria-label="搜索团队、知识库、知识" />
          </label>
        </div>
        {tab === 'recent' ? (
          <div className="ai-more-recent" aria-label="最近使用">
            {recent.map((item) => {
              const checked = draft.some((entry) => selectionKey(entry) === selectionKey(item));
              const node = state.nodes.find((entry) => entry.id === item.id);
              return (
                <label key={item.id} className="ai-more-recent-row">
                  <input type="checkbox" checked={checked} aria-label={`选择 ${item.name}`} onChange={() => toggle(item)} />
                  {node ? <ContentIcon node={node} size={16} /> : null}
                  <span>{item.name}</span>
                </label>
              );
            })}
            {!recent.length && <p className="ai-more-empty">暂无最近使用的知识</p>}
          </div>
        ) : (
          <div className="ai-more-columns">
            <section aria-label="团队">
              {visibleGroups.map((group) => (
                <button key={group.id} type="button" className={activeGroup?.id === group.id ? 'active' : ''} onClick={() => { setTeamId(group.id); setLibraryId(group.libraries[0]?.id || ''); }}>
                  <span>{group.name}</span>
                </button>
              ))}
              {!visibleGroups.length && <p className="ai-more-empty">没有匹配的团队</p>}
            </section>
            <section aria-label="知识库">
              {libraries.map((item) => {
                const checked = draft.some((entry) => entry.type === 'library' && entry.id === item.id);
                return (
                  <div key={item.id} className={`ai-more-library${library?.id === item.id ? ' active' : ''}`}>
                    <input type="checkbox" aria-label={`选择知识库 ${item.name}`} checked={checked} onChange={() => toggle({ type: 'library', id: item.id, name: item.name })} />
                    <button type="button" onClick={() => setLibraryId(item.id)}>
                      <LibraryIcon library={item} size={22} />
                      <span>{item.name}</span>
                      <CaretRight size={13} />
                    </button>
                  </div>
                );
              })}
              {!libraries.length && <p className="ai-more-empty">没有匹配的知识库</p>}
            </section>
            <section aria-label="知识库目录">
              <TreeRows
                state={state}
                userId={userId}
                library={library}
                query={query}
                selected={draft}
                onToggle={toggle}
                expanded={expanded}
                onToggleExpand={toggleExpand}
              />
              {library && !projectedEntries(state, library, userId).length && <p className="ai-more-empty">暂无可查看内容</p>}
            </section>
          </div>
        )}
        <footer>
          <div className="ai-more-selected">
            <button type="button" aria-expanded={showSelected} onClick={() => setShowSelected((value) => !value)}>
              已选 {draft.length} 个<CaretDown size={12} />
            </button>
            {showSelected && (
              <div className="ai-more-selected-list" role="list" aria-label="已选清单">
                {draft.map((item) => (
                  <div key={selectionKey(item)} role="listitem">{item.name || knowledgeFallback(state, item)}</div>
                ))}
                {!draft.length && <div>还没有选择</div>}
              </div>
            )}
          </div>
          <div className="ai-more-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="button" className="primary" onClick={() => onConfirm(draft)}>确认</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function knowledgeFallback(state, item) {
  if (item.type === 'library') return state.spaces.find((space) => space.id === item.id)?.name || item.id;
  return state.nodes.find((node) => node.id === item.id)?.name || item.id;
}

export default function AskKnowledgePicker({
  open, mode, state, userId, spaces, selected, onSelect, onMore, onConfirmMore, onClose,
}) {
  if (mode === 'more') {
    return <KnowledgeMoreDialog state={state} userId={userId} selected={selected} onConfirm={onConfirmMore} onClose={onClose} />;
  }
  if (!open) return null;
  return (
    <KnowledgeMentionList
      spaces={spaces}
      selected={selected}
      onSelect={onSelect}
      onMore={onMore}
      onClose={onClose}
    />
  );
}
