import { LIBRARY_CATEGORIES, libraryCategoryIds } from './libraryCategories.js';

export default function LibraryCategoryField({ value, onChange, disabled = false }) {
  const selected = new Set(value || []);
  const toggle = id => onChange(libraryCategoryIds({ categoryIds: selected.has(id) ? value.filter(item => item !== id) : [...value, id] }));
  return <fieldset className="library-category-field" disabled={disabled}>
    <legend>分类</legend>
    <p>可多选，也可不选。不选时归入「未分类」。分类名单由组织统一维护，不能在这里新增或改名。</p>
    <div className="library-category-options" role="group" aria-label="已选分类">
      {LIBRARY_CATEGORIES.map(item => <label key={item.id}><input type="checkbox" name="library-category-choice" value={item.id} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /><span>{item.name}</span></label>)}
    </div>
  </fieldset>;
}
