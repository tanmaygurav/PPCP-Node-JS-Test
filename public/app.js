const $ = id => document.getElementById(id);
let pending = null;
async function api(path, body) {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
function status(id, message, error = false) { $(id).textContent = message; $(id).classList.toggle('error', error); }
function busy(value) { $('save').disabled = value; $('retry').disabled = value || !pending?.complete; }
function errorMessage(error) { return error.message || 'Request failed. Check your connection.'; }

$('login').addEventListener('submit', async event => {
  event.preventDefault();
  try { await api('/session', { accessKey: $('access-key').value }); $('access-key').value = ''; status('connection', 'API unlocked. Check the Google connection next.'); }
  catch (error) { status('connection', errorMessage(error), true); }
});
$('logout').addEventListener('click', async () => {
  try { await api('/logout', {}); pending = null; $('records').replaceChildren(); $('detail').hidden = true; busy(false); status('connection', 'API locked.'); }
  catch (error) { status('connection', errorMessage(error), true); }
});
$('check').addEventListener('click', async () => {
  status('connection', 'Checking Google authorization, Sheet headers, and Drive folder...');
  try {
    const checks = await api('/checks');
    const { domains } = await api('/domains');
    $('domain').replaceChildren(...domains.map(domain => new Option(domain, domain)));
    status('connection', `Connected: ${checks.spreadsheet}\nMedia folder: ${checks.folder}\n${domains.length} active domains.${domains.length ? '' : ' Add at least one domain in Calculations!C2:C.'}`);
    await refresh();
  } catch (error) { status('connection', errorMessage(error), true); }
});

async function upload(file, plan, index, count) {
  // Google session URI is scoped to this upload. No general Google token enters the browser.
  const started = performance.now();
  let offset = 0, attempts = 0;
  while (offset < file.size && attempts < 4) {
    status('progress', `Uploading ${index + 1}/${count}: ${file.name} (${Math.round(offset / file.size * 100)}%)`);
    try {
      const response = await fetch(plan.uploadUrl, { method: 'PUT', headers: {
        'Content-Type': plan.mimeType, 'Content-Range': `bytes ${offset}-${file.size - 1}/${file.size}`
      }, body: file.slice(offset), signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Math.round(performance.now() - started);
      if (response.status !== 308 && response.status < 500) throw new Error(`Drive upload failed (${response.status}). Start a new upload if its session expired.`);
    } catch (error) {
      if (error.message.startsWith('Drive upload failed')) throw error;
    }
    // Query the acknowledged offset after a lost response before resending bytes.
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 500 * attempts));
    const probe = await fetch(plan.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${file.size}` }, body: new Uint8Array(), signal: AbortSignal.timeout(30_000) });
    if (probe.ok) return Math.round(performance.now() - started);
    if (probe.status !== 308) throw new Error(`Could not resume upload (${probe.status}).`);
    const acknowledged = probe.headers.get('range');
    // Google must expose Range for a partial continuation; avoid guessing when it does not.
    const match = acknowledged?.match(/^bytes=0-(\d+)$/i);
    offset = match ? Number(match[1]) + 1 : 0;
  }
  throw new Error('Upload did not finish after several attempts. No Sheet row was saved.');
}
async function savePending() {
  status('progress', 'Verifying uploaded files and saving the Sheet row...');
  const { item, alreadySaved } = await api('/submissions', { ...pending.data, ticket: pending.ticket });
  status('progress', `${alreadySaved ? 'Already saved' : 'Saved'}: ${item.id}\nUpload + save elapsed: ${Math.round(performance.now() - pending.started)} ms`);
  pending = null;
  await refresh();
  await showDetail(item.id);
}
$('submission').addEventListener('submit', async event => {
  event.preventDefault();
  if (pending && !confirm('Start a new submission? Existing uploaded files will remain in the test folder. Use Retry saving to keep the existing upload.')) return;
  busy(true);
  try {
    const files = [...$('files').files];
    if (files.length > 10 || files.some(file => file.size < 1 || file.size > 5_000_000) || files.reduce((sum, f) => sum + f.size, 0) > 20_000_000) {
      throw new Error('Choose up to 10 nonempty files: 5 MB per file, 20 MB total.');
    }
    const data = Object.fromEntries(new FormData($('submission')));
    const started = performance.now();
    status('progress', 'Creating upload sessions...');
    const plan = await api('/upload-sessions', { files: files.map(file => ({ name: file.name, size: file.size })) });
    pending = { ...plan, data, started, complete: false };
    for (let index = 0; index < files.length; index++) await upload(files[index], plan.uploads[index], index, files.length);
    pending.complete = true;
    await savePending();
  } catch (error) { status('progress', `${errorMessage(error)}${pending?.complete ? '\nUse Retry saving uploaded files. Keep this tab open.' : '\nAny completed files remain in the test folder for manual inspection.'}`, true); }
  finally { busy(false); }
});
$('retry').addEventListener('click', async () => {
  busy(true);
  try { await savePending(); } catch (error) { status('progress', errorMessage(error), true); } finally { busy(false); }
});
async function refresh() {
  const result = await api('/submissions?limit=20');
  $('records').replaceChildren();
  const count = document.createElement('p'); count.textContent = `${result.total} saved records. Showing the most recent 20.`; $('records').append(count);
  for (const item of result.items) {
    const button = document.createElement('button'); button.className = 'record';
    button.textContent = `${item.title} · ${item.domain} · ${item.id}`;
    button.addEventListener('click', () => showDetail(item.id).catch(error => status('progress', errorMessage(error), true)));
    $('records').append(button);
  }
}
async function showDetail(id) {
  const { item } = await api(`/submissions/${encodeURIComponent(id)}`);
  const detail = $('detail'); detail.hidden = false; detail.replaceChildren();
  const title = document.createElement('h3'); title.textContent = item.title; detail.append(title);
  for (const content of [`ID: ${item.id}`, `Description: ${item.description}`, `Solution: ${item.solution}`]) {
    const p = document.createElement('p'); p.textContent = content; detail.append(p);
  }
  for (const file of item.media) {
    if (!/^[a-zA-Z0-9_-]+$/.test(file.fileId || '')) continue;
    const p = document.createElement('p'), link = document.createElement('a');
    link.textContent = file.filename; link.href = `https://drive.google.com/file/d/${file.fileId}/view`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    p.append(link); detail.append(p);
  }
  const { items } = await api(`/submissions/${encodeURIComponent(id)}/remarks`);
  for (const feedback of items) { const p = document.createElement('p'); p.textContent = `${feedback.givenBy}: ${feedback.remark}`; detail.append(p); }
  const form = document.createElement('form'), label = document.createElement('label'), input = document.createElement('textarea'), button = document.createElement('button');
  label.textContent = 'Test remark'; input.maxLength = 5000; input.required = true; label.append(input); button.textContent = 'Save remark'; form.append(label, button); detail.append(form);
  form.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true;
    try { await api(`/submissions/${encodeURIComponent(id)}/remarks`, { remark: input.value }); await showDetail(id); }
    catch (error) { status('progress', `${errorMessage(error)} Check existing remarks before retrying.`, true); }
    finally { button.disabled = false; }
  });
}
$('refresh').addEventListener('click', () => refresh().catch(error => status('progress', errorMessage(error), true)));
