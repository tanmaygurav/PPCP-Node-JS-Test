import { AppError, normalize } from './domain.mjs';
import { digest } from './domain.mjs';
export function listSpec(params, profile) {
  const staff = ['faculty', 'admin'].includes(profile.role), limit = Number(params.get('limit') || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AppError(400, 'Page size must be 1–50.');
  const searchBy = params.get('searchBy') || '', search = normalize(params.get('search') || '');
  if (search.length > 300 || (search && !['id', 'email', 'domain', 'name', 'title'].includes(searchBy))) throw new AppError(400, 'Choose a supported search field.');
  const filters = [], facet = {};
  if (!staff) filters.push(['ownerUid', '==', profile.uid]);
  const domain = params.get('domain'); if (domain) facet.domain = normalize(domain);
  for (const [param, field] of [['locked', 'locked'], ['remarked', 'hasRemarks']]) {
    const value = params.get(param); if (value && value !== 'all') { if (!['true', 'false'].includes(value)) throw new AppError(400, 'Invalid filter.'); facet[field] = value === 'true'; }
  }
  for (const [param, operator] of [['from', '>='], ['to', '<=']]) {
    const value = params.get(param);
    if (value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new AppError(400, 'Invalid date.'); filters.push(['createdAt', operator, `${value}T${param === 'from' ? '00:00:00.000' : '23:59:59.999'}Z`]); }
  }
  if (params.get('from') && params.get('to') && params.get('from') > params.get('to')) throw new AppError(400, 'Start date must precede end date.');
  let prefix = '';
  if (search) {
    const field = { id: 'displayId', email: 'emailNormalized', domain: 'domainNormalized', name: 'nameNormalized', title: 'titleNormalized' }[searchBy];
    if (['name', 'title'].includes(searchBy)) { prefix = field; filters.push([field, '>=', search], [field, '<=', search + '\uf8ff']); }
    else if (searchBy === 'domain') { if (facet.domain && facet.domain !== search) throw new AppError(400, 'Search domain conflicts with the domain filter.'); facet.domain = search; }
    else filters.push([field, '==', searchBy === 'id' ? search.toUpperCase() : search]);
  }
  const sort = params.get('sort') || 'newest';
  if (!['newest', 'oldest', 'edited', 'id'].includes(sort)) throw new AppError(400, 'Invalid sort.');
  const order = prefix ? [[prefix, 'asc']] : [[{ newest: 'createdAt', oldest: 'createdAt', edited: 'lastEditedAt', id: 'sequence' }[sort], ['newest', 'edited'].includes(sort) ? 'desc' : 'asc']];
  if ((params.get('from') || params.get('to')) && order[0][0] !== 'createdAt') order.push(['createdAt', 'asc']);
  order.push(['__name__', 'asc']);
  filters.push(['facets', 'array-contains', digest(facet)]);
  return { filters, order, limit, orderLabel: prefix ? `${searchBy} A–Z` : sort, fingerprint: digest({ filters, order, limit, uid: profile.uid, role: profile.role }) };
}
