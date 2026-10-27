import test from 'node:test';
import assert from 'node:assert/strict';
import { M04Drive } from '../src/m04/drive.mjs';
test('permission creation response must verify public reader without discovery', async () => {
  const drive = new M04Drive({}), file = { id: 'file', name: 'proof.pdf', size: 100, mimeType: 'application/pdf' };
  drive.verify = async () => ({ permissions: [], webViewLink: 'https://drive.google.com/file/d/file/view' });
  const requests = [];
  drive.request = async (url, options) => { requests.push({ url, method: options.method }); return { id: 'permission', type: 'anyone', role: 'reader', allowFileDiscovery: false }; };
  assert.equal((await drive.publish(file, 'owner', 'submission')).webViewLink, 'https://drive.google.com/file/d/file/view');
  assert.equal(requests.length, 1); assert.equal(requests[0].method, 'POST');
  for (const granted of [{ type: 'anyone', role: 'writer', allowFileDiscovery: false }, { type: 'anyone', role: 'reader', allowFileDiscovery: true }, {}]) {
    drive.request = async () => granted; await assert.rejects(drive.publish(file, 'owner', 'submission'), { status: 502 });
  }
});
test('existing verified reader permission requires no further sharing request', async () => {
  const drive = new M04Drive({});
  drive.verify = async () => ({ permissions: [{ type: 'anyone', role: 'reader', allowFileDiscovery: false }], webViewLink: 'https://drive.google.com/file/d/file/view' });
  drive.request = async () => { throw new Error('Unexpected redundant request'); };
  assert((await drive.publish({ id: 'file' }, 'owner', 'submission')).webViewLink);
});
