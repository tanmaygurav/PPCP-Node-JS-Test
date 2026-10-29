export const FILTER_KEYS = ['searchBy', 'search', 'domain', 'locked', 'remarked', 'from', 'to', 'sort', 'limit', 'testData', 'testRunId'];
export function readFilters(search) {
  const params = new URLSearchParams(search), result = {};
  for (const key of FILTER_KEYS) { const value = params.get(key); if (value && value.length <= 300) result[key] = value; }
  return result;
}
export function listUrl(filters) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key] && filters[key] !== 'all') params.set(key, filters[key]);
  return params.size ? `/?${params}` : '/';
}
export function listState(value) {
  const cursors = Array.isArray(value?.cursors) && value.cursors.length && value.cursors.every(cursor => typeof cursor === 'string' && cursor.length <= 20000) ? value.cursors : [''];
  const index = Number.isInteger(value?.index) && value.index >= 0 && value.index < cursors.length ? value.index : 0;
  return { cursors, index, scroll: Number.isFinite(value?.scroll) && value.scroll >= 0 ? value.scroll : 0 };
}
export function returnList(value, uid) {
  if (value?.ownerUid !== uid || value?.pathname !== '/' || typeof value?.search !== 'string' || (value.search && !value.search.startsWith('?'))) return { pathname: '/', search: '', list: listState(), ownerUid: uid };
  return { pathname: '/', search: value.search, list: listState(value.list), ownerUid: uid };
}
export const isPortalPath = pathname => pathname === '/' || /^\/(submissions|admin)(\/|$)/.test(pathname);
