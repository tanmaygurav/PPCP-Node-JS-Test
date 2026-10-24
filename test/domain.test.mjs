import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFiles, responseRow, parseResponse, validateSubmission } from '../src/domain.mjs';
import { sign, verify } from '../src/security.mjs';

test('M01-U01 attachment boundaries use decimal MB and enforce total and file count', () => {
  assert.equal(validateFiles(Array.from({ length: 4 }, () => ({ name: 'file.pdf', size: 5_000_000 }))).length, 4);
  assert.throws(() => validateFiles([{ name: 'file.pdf', size: 5_000_001 }]), /5 MB/);
  assert.throws(() => validateFiles(Array.from({ length: 5 }, () => ({ name: 'file.pdf', size: 5_000_000 }))), /20 MB/);
  assert.throws(() => validateFiles(Array.from({ length: 11 }, () => ({ name: 'file.pdf', size: 1 }))), /10 files/);
  assert.throws(() => validateFiles([{ name: 'empty.pdf', size: 0 }]), /1 byte/);
  assert.deepEqual(validateFiles([]), []);
  assert.throws(() => validateFiles([null]), /name and size/);
});
test('M01-U02 file type is derived from extension and executable, macro, path names are rejected', () => {
  assert.equal(validateFiles([{ name: 'test.PDF', size: 1, mimeType: 'text/html' }])[0].mimeType, 'application/pdf');
  for (const name of ['bad.exe', 'bad.docm', '../bad.pdf', 'x\\bad.pdf', 'x\n.pdf']) {
    assert.throws(() => validateFiles([{ name, size: 1 }]));
  }
});
test('M01-U03 response mapping preserves exactly 18 columns, puts description in R and preserves literal formula text', () => {
  const data = { email: 'a@example.com', name: 'Test', studentId: '001', program: 'Program', domain: 'Domain',
    title: '=IMPORTXML("example", "x")', description: 'New description', solution: 'Solution' };
  const row = responseRow('fixed-id', data, [], 'now');
  assert.equal(row.length, 18); assert.equal(row[17], data.description); assert.equal(row[1], 'fixed-id');
  assert.equal(row[8], data.title); assert.equal(parseResponse(row).description, data.description);
  row[9] = 'Who'; row[12] = 'What';
  assert.equal(parseResponse(row).description, 'Who\n\nWhat\n\nNew description');
});
test('M01-U04 signed tickets reject tampering, expiry, and use as a different credential type', () => {
  const key = 's'.repeat(40), ticket = sign(key, { kind: 'upload', exp: Date.now() + 10000 });
  assert.equal(verify(key, ticket, 'upload').kind, 'upload');
  assert.throws(() => verify(key, ticket + 'x', 'upload'));
  assert.throws(() => verify(key, ticket, 'session'));
  assert.throws(() => verify(key, sign(key, { kind: 'upload', exp: 1 }), 'upload'));
});
test('M01-U05 submission metadata rejects missing fields', () => { assert.throws(() => validateSubmission({}), /email/); });
