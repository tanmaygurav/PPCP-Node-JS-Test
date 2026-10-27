import { writeFileSync } from 'node:fs';
// Eight materialized facet keys per submission let every domain/lock/remark
// combination share the same indexes rather than multiplying index definitions.
const indexes = [], seen = new Set();
function add(collectionGroup, fields) {
  const key = JSON.stringify([collectionGroup, fields]); if (seen.has(key)) return; seen.add(key);
  indexes.push({ collectionGroup, queryScope: 'COLLECTION', fields });
}
const ascending = fieldPath => ({ fieldPath, order: 'ASCENDING' });
for (const owner of [false, true]) for (const exact of ['', 'displayId', 'emailNormalized']) for (const [sort, order] of [['createdAt', 'DESCENDING'], ['createdAt', 'ASCENDING'], ['lastEditedAt', 'DESCENDING'], ['sequence', 'ASCENDING'], ['nameNormalized', 'ASCENDING'], ['titleNormalized', 'ASCENDING']]) {
  if (exact && ['nameNormalized', 'titleNormalized'].includes(sort)) continue;
  for (const date of [false, true]) {
    const fields = [{ fieldPath: 'facets', arrayConfig: 'CONTAINS' }, ...(owner ? [ascending('ownerUid')] : []), ...(exact ? [ascending(exact)] : []), { fieldPath: sort, order }, ...(date && sort !== 'createdAt' ? [ascending('createdAt')] : []), ascending('__name__')];
    add('submissions', fields);
  }
}
add('remarks', [ascending('submissionId'), ascending('createdAt'), ascending('__name__')]);
add('domains', [ascending('active'), ascending('name')]);
add('uploads', [ascending('status'), ascending('expiresAt')]);
const result = { indexes, fieldOverrides: ['description', 'solution', 'media'].map(fieldPath => ({ collectionGroup: 'submissions', fieldPath, indexes: [] })) };
if (process.argv.includes('--check')) {
  const { readFileSync } = await import('node:fs');
  if (JSON.stringify(JSON.parse(readFileSync('firestore.m04.indexes.json'))) !== JSON.stringify(result)) throw new Error('M04 index manifest needs regeneration.');
} else writeFileSync('firestore.m04.indexes.json', JSON.stringify(result, null, 2) + '\n');
console.log(`${indexes.length} M04 composite indexes.`);
