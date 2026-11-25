import { librariesForView } from './access.js';
import { responsibleId } from './ownership.js';
import { didShareLibrary } from './sharing.js';

// Organization-wide, single-level library categories. Not the library kind or cover group.
export const LIBRARY_CATEGORIES = [
  { id: 'policy', name: '制度规范' },
  { id: 'project', name: '项目资料' },
  { id: 'training', name: '培训学习' },
];

export const LIBRARY_CATEGORY_FILTERS = [
  { id: 'all', name: '全部分类' },
  ...LIBRARY_CATEGORIES,
  { id: 'uncategorized', name: '未分类' },
];

// Sample arrangement from the category requirements, section 4.4.
export const SEED_LIBRARY_CATEGORY_IDS = {
  'space-personal': [],
  'space-chen-personal': ['training'],
  'space-handbook': ['policy'],
  'space-retro': ['project'],
  'space-company-share': ['policy', 'project'],
  'space-plaza': ['policy', 'training'],
};

const allowed = new Set(LIBRARY_CATEGORIES.map(item => item.id));

function ordered(ids) {
  const picked = new Set(ids);
  return LIBRARY_CATEGORIES.filter(item => picked.has(item.id)).map(item => item.id);
}

// A present array is a saved choice, including an empty one. Unknown ids are dropped.
// Seed libraries missing the field are filled from the sample arrangement.
export function libraryCategoryIds(space) {
  if (Array.isArray(space?.categoryIds)) return ordered(space.categoryIds.filter(id => allowed.has(id)));
  if (space?.id && Object.prototype.hasOwnProperty.call(SEED_LIBRARY_CATEGORY_IDS, space.id)) return [...SEED_LIBRARY_CATEGORY_IDS[space.id]];
  return [];
}

export function assertLibraryCategoryIds(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !allowed.has(id))) throw Error('分类不在组织名单中');
  return ordered(value);
}

export function libraryCategoryNames(space) {
  const ids = new Set(libraryCategoryIds(space));
  return LIBRARY_CATEGORIES.filter(item => ids.has(item.id)).map(item => item.name);
}

export function libraryMatchesCategory(space, filter = 'all') {
  if (!filter || filter === 'all') return true;
  const ids = libraryCategoryIds(space);
  if (filter === 'uncategorized') return ids.length === 0;
  return ids.includes(filter);
}

export function filterLibrariesByCategory(libraries, filter = 'all') {
  return libraries.filter(space => libraryMatchesCategory(space, filter));
}

export function librariesInList(state, userId, section, scope = 'all', category = 'all') {
  const inScope = librariesForView(state, userId, section).filter(space => {
    if (section !== 'shared' || scope === 'all') return true;
    if (scope === 'created') return didShareLibrary(state, space, userId);
    if (scope === 'joined') return responsibleId(space) !== userId;
    return true;
  });
  return filterLibrariesByCategory(inScope, category);
}
