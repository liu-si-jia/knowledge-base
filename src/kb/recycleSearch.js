import { libraryType, LIBRARY_TYPES } from './access.js';
import { contentText, folderTrail } from './contentCreation.js';
import { creatorId } from './ownership.js';

export function matchesRecycleQuery(haystack, query) {
  const needle = String(query || '').trim();
  if (!needle) return true;
  return String(haystack || '').includes(needle);
}

function memberLabel(state, id) {
  return state.members.find(member => member.id === id)?.name || '';
}

export function recycleLibraryLocation(library) {
  return `${LIBRARY_TYPES[libraryType(library)]} / ${library.name}`;
}

export function recycleNodeLocation(state, node) {
  const library = state.spaces.find(space => space.id === node.spaceId);
  return node.originalLocation || [library?.name, ...folderTrail(state, node.parentId).map(id => state.nodes.find(item => item.id === id)?.name), node.name].filter(Boolean).join(' / ');
}

export function recycleLibraryHaystack(state, library) {
  return [library.name, recycleLibraryLocation(library), memberLabel(state, creatorId(library)), library.description || ''].filter(Boolean).join('\n');
}

export function recycleNodeHaystack(state, node) {
  return [node.name, recycleNodeLocation(state, node), memberLabel(state, creatorId(node)), contentText(node)].filter(Boolean).join('\n');
}
