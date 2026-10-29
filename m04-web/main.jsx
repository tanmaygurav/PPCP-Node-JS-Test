import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from 'firebase/auth';
import './style.css';
import TestRunsPanel from './TestRunsPanel.jsx';
import EventThemePanel from './EventThemePanel.jsx';
import NavigationGuard from './NavigationGuard.jsx';
import { DEFAULT_THEME, isEventTheme } from '../shared/m04-themes.mjs';
import { createBrowserRouter, Link, Outlet, useBeforeUnload, useBlocker, useLocation, useMatches, useNavigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { readFilters, listUrl, listState, returnList } from './navigation.mjs';
const uid = () => crypto.randomUUID();
const allowed = email => /^[^\s@]+@(welingkar\.org|welingkarmail\.org)$/.test(email.trim().toLowerCase());
async function api(path, data, options = {}) {
  const response = await fetch(`/api/${path}`, { ...options, credentials: 'same-origin', ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  let result; try { result = await response.json(); } catch { throw new Error('Response interrupted. Retry the same operation.'); }
  if (!response.ok) { const error = new Error(result.error || 'Request failed.'); error.status = response.status; throw error; } return result;
}
function App() {
  const location = useLocation(), navigate = useNavigate(), route = useMatches().at(-1);
  const view = route.handle?.view || 'not-found', routeId = route.params.id;
  const filters = useMemo(() => readFilters(location.search), [location.search]);
  const [auth, setAuth] = useState(null), [account, setAccount] = useState(null), [me, setMe] = useState(null), [mode, setMode] = useState('login');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [domains, setDomains] = useState([]), [page, setPage] = useState({ items: [] });
  const [appearance, setAppearance] = useState({ theme: DEFAULT_THEME, version: 0, updatedAt: null });
  const appearanceRequest = useRef(null);
  const { cursors, index } = listState(location.state?.ownerUid === me?.profile?.uid ? location.state?.list : undefined);
  const [detail, setDetail] = useState(null);
  const [remarks, setRemarks] = useState([]), [remarkCursor, setRemarkCursor] = useState(null), [editKey, setEditKey] = useState(0), [target, setTarget] = useState(undefined), [testResult,setTestResult]=useState(null);
  const pendingSave = useRef(null), pendingAction = useRef(null), [uncertain, setUncertain] = useState(false), [actionPending, setActionPending] = useState(false);
  const staff = ['faculty', 'admin'].includes(me?.profile?.role);
  const dirtyRef = useRef(false), bypassNavigation = useRef(false), editorDraft = useRef(null), editorForm = useRef(null), lastOwner = useRef(null);
  const [dirty, setDirty] = useState(false), [, updateDraft] = useState(0), [loading, setLoading] = useState(false), [routeError, setRouteError] = useState(null), [reload, setReload] = useState(0), [loadedRoute, setLoadedRoute] = useState('');
  const dataKey = JSON.stringify([view, routeId, location.pathname, location.search, cursors[index], me?.profile?.uid, me?.profile?.role, reload]);
  const waiting = loading || (!!me?.profile && loadedRoute !== dataKey);
  const currentRoute = useRef(null); currentRoute.current = location.pathname;
  function markDirty(value) { dirtyRef.current = value; setDirty(value); }
  function clearDraft() { editorDraft.current = null; markDirty(false); }
  const blocker = useBlocker(() => !bypassNavigation.current && (dirtyRef.current || busy || uncertain || actionPending || !!pendingSave.current));
  useEffect(() => { if (blocker.state === 'blocked' && !busy && !uncertain && !actionPending && !pendingSave.current && !dirtyRef.current) blocker.reset(); }, [blocker, busy, uncertain, actionPending, dirty]);
  useBeforeUnload(useCallback(event => { if (dirtyRef.current || busy || uncertain || actionPending || pendingSave.current) { event.preventDefault(); event.returnValue = ''; } }, [busy, uncertain, actionPending]));
  async function go(to, options = {}, internal = false) {
    if (internal) bypassNavigation.current = true;
    try { await navigate(to, options); } finally { if (internal) bypassNavigation.current = false; }
  }
  function snapshotList() { return { pathname: '/', search: location.search, list: { cursors, index, scroll: window.scrollY }, ownerUid: me?.profile?.uid }; }
  const fromList = returnList(location.state?.returnList, me?.profile?.uid);
  async function rememberList() {
    const saved = snapshotList();
    await go(location.pathname + location.search, { replace: true, state: { ...location.state, list: saved.list, ownerUid: saved.ownerUid } }, true);
    return saved;
  }
  async function openFromList(event, id) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (busy || uncertain || actionPending) return;
    const saved = await rememberList(); await go(`/submissions/${id}`, { state: { returnList: saved } });
  }
  async function changePage(nextIndex, nextCursors) {
    await rememberList(); await go(location.pathname + location.search, { state: { ownerUid: me.profile.uid, list: { cursors: nextCursors, index: nextIndex, scroll: 0 } } });
  }
  async function applyFilters(values) {
    const url = listUrl(values);
    if (url === location.pathname + location.search && index === 0) { setReload(value => value + 1); return; }
    await go(url, { state: { ownerUid: me.profile.uid, list: { cursors: [''], index: 0, scroll: 0 } } });
  }
  function captureEditor(event) {
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form)); delete values.attachments; delete values.retain;
    const chosen = [...form.elements.attachments.files], prior = editorDraft.current;
    editorDraft.current = { ownerUid: me.profile.uid, pathname: location.pathname, values, retainedIds: [...form.querySelectorAll('input[name="retain"]:checked')].map(input => input.value), files: event.target.name === 'attachments' || chosen.length ? chosen : prior?.files || [] };
    markDirty(true); updateDraft(value => value + 1);
  }
  const draft = editorDraft.current?.ownerUid === me?.profile?.uid && editorDraft.current?.pathname === location.pathname ? editorDraft.current : null;
  useEffect(() => {
    if (!me?.profile) return;
    const controller = new AbortController(); let alive = true;
    const request = path => api(path, undefined, { signal: controller.signal });
    setLoading(true); setRouteError(null); setDetail(null); setRemarks([]);
    (async () => {
      try {
        const identity = request('me'); void identity.catch(() => {});
        if (view === 'list') {
          const params = new URLSearchParams(Object.entries({ ...filters, ...(cursors[index] ? { cursor: cursors[index] } : {}) }));
          let result;
          try { result = await request(`submissions?${params}`); }
          catch (error) {
            if (!cursors[index] || ![400, 401].includes(error.status)) throw error;
            params.delete('cursor'); result = await request(`submissions?${params}`);
            if (!alive) return;
            setMessage('This saved page expired. Showing the first page with your filters.');
            await go(location.pathname + location.search, { replace: true, state: { ownerUid: me.profile.uid, list: { cursors: [''], index: 0, scroll: 0 } } }, true);
          }
          const current = await identity; if (!alive) return; setMe(current); setPage(result);
          requestAnimationFrame(() => requestAnimationFrame(() => { if (alive) window.scrollTo(0, listState(location.state?.list).scroll); }));
        } else if (view === 'detail' || view === 'edit') {
          if (!/^[\w-]{1,100}$/.test(routeId || '')) throw Object.assign(new Error('Submission unavailable.'), { status: 404 });
          const [current, saved, notes] = await Promise.all([identity, request(`submissions/${routeId}`), request(`submissions/${routeId}/remarks`)]);
          if (!alive) return; setMe(current);
          if (view === 'edit' && (current.profile?.role !== 'student' || saved.item.ownerUid !== current.profile.uid || saved.item.locked)) {
            clearDraft(); setMessage(saved.item.locked ? 'This submission is locked.' : 'Student editing is not available for this account.');
            await go(`/submissions/${routeId}`, { replace: true, state: location.state }, true); return;
          }
          setDetail(saved.item); setRemarks(notes.items); setRemarkCursor(notes.nextCursor); setEditKey(value => value + 1);
          window.scrollTo(0, 0);
        } else {
          const current = await identity; if (!alive) return; setMe(current);
          if (['admin', 'appearance', 'tests'].includes(view) && current.profile?.role !== 'admin') throw Object.assign(new Error('Administrator access required.'), { status: 403 });
          if (view === 'create' && current.profile?.role !== 'student') throw Object.assign(new Error('Student access required.'), { status: 403 });
          if (view === 'appearance') await refreshAppearance();
          if (alive) window.scrollTo(0, 0);
        }
      } catch (error) {
        if (!alive || error.name === 'AbortError') return;
        if (error.status === 401) setMe(null);
        else setRouteError(error.status === 404 ? 'Submission unavailable.' : error.message);
      } finally { if (alive) { setLoading(false); setLoadedRoute(dataKey); } }
    })();
    return () => { alive = false; controller.abort(); };
  }, [view, routeId, location.pathname, location.search, cursors[index], me?.profile?.uid, me?.profile?.role, reload]);

  const refreshAppearance = useCallback(async () => {
    if (!appearanceRequest.current) appearanceRequest.current = api('appearance').then(result => {
      if (!isEventTheme(result.appearance?.theme)) throw new Error('Event theme is unavailable.');
      setAppearance(current => result.appearance.version >= current.version ? result.appearance : current); return result.appearance;
    }).finally(() => { appearanceRequest.current = null; });
    return appearanceRequest.current;
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = appearance.theme; }, [appearance.theme]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') refreshAppearance().catch(() => {}); };
    refresh(); window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refreshAppearance]);
  async function run(action) { setBusy(true); setMessage(''); try { return await action(); } catch (error) { if (error.status === 401) setMe(null); setMessage(error.message); } finally { setBusy(false); } }
  async function portal() {
    const value = await api('me');
    if (lastOwner.current && lastOwner.current !== value.identity.uid) { pendingSave.current = null; pendingAction.current = null; setUncertain(false); setActionPending(false); clearDraft(); setTarget(undefined); }
    lastOwner.current = value.identity.uid; setMe(value);
    if (value.profile) { const result = await api('domains'); setDomains(result.domains); }
  }
  useEffect(() => { let active = true; (async () => {
    try { const { emulator, ...config } = await api('auth/config'); const instance = getAuth(initializeApp(config)); if (emulator) connectAuthEmulator(instance, emulator, { disableWarnings: true }); await setPersistence(instance, inMemoryPersistence); if (active) setAuth(instance); try { await portal(); } catch (error) { if (error.status !== 401 && active) setMessage(error.message); } }
    catch { if (active) setMessage('Portal configuration is unavailable. Contact the organizer.'); }
  })(); return () => { active = false; }; }, []);
  async function enter(user) { await user.reload(); if (!user.emailVerified) { setAccount(user); setMessage('Verify your email, then select Continue.'); return; } await api('auth/session', { idToken: await user.getIdToken(true) }); await signOut(auth); setAccount(null); await portal(); }
  function authenticate(event) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => { const email = data.email.trim().toLowerCase(); if (!allowed(email)) throw new Error('Use your @welingkar.org or @welingkarmail.org address.');
      if (mode === 'reset') { await sendPasswordResetEmail(auth, email); setMessage('If an account exists, a reset email will arrive shortly.'); return; }
      const result = await (mode === 'register' ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, email, data.password);
      if (mode === 'register' && !result.user.emailVerified) await sendEmailVerification(result.user); await enter(result.user);
    });
  }
  async function refreshDetail(id) { const pathname = location.pathname; const [saved, notes] = await Promise.all([api(`submissions/${id}`), api(`submissions/${id}/remarks`)]); if (currentRoute.current !== pathname) return; setDetail(saved.item); setRemarks(notes.items); setRemarkCursor(notes.nextCursor); }
  async function open(id) { clearDraft(); if (location.pathname === `/submissions/${id}`) return refreshDetail(id); await go(`/submissions/${id}`, { replace: true, state: { returnList: fromList } }, true); }
  async function savePending() {
    const pending = pendingSave.current; if (!pending) return;
    try {
      const observed = await api(`operations/${pending.operationId}`);
      if (observed.status === 'committed') { pendingSave.current = null; setUncertain(false); await open(observed.submissionId); return; }
      if (!pending.upload) pending.upload = await api('upload-sessions', { operationId: pending.operationId, ...(pending.id ? { submissionId: pending.id, expectedVersion: pending.version } : {}), retainedIds: pending.retainedIds, files: pending.files.map(file => ({ name: file.name, size: file.size })) });
      for (let i = 0; i < pending.upload.uploads.length; i++) {
        const session = pending.upload.uploads[i]; if (session.completed || pending.completed.has(session.id)) continue;
        // Reconcile uncertain upload responses against Drive metadata through upload preparation.
        if (pending.attempted.has(session.id)) { const renewed = await api('upload-sessions', { operationId: pending.operationId, ...(pending.id ? { submissionId: pending.id, expectedVersion: pending.version } : {}), retainedIds: pending.retainedIds, files: pending.files.map(file => ({ name: file.name, size: file.size })) }); const check = renewed.uploads[i]; if (check.completed) { pending.completed.add(session.id); continue; } session.uploadUrl = check.uploadUrl; }
        pending.attempted.add(session.id);
        const response = await fetch(session.uploadUrl, { method: 'PUT', headers: { 'Content-Type': session.mimeType }, body: pending.files[i] });
        if (!response.ok) throw new Error('File transfer interrupted. Retry this save.'); pending.completed.add(session.id);
      }
      const result = await api(pending.id ? `submissions/${pending.id}/edits` : 'submissions', { ...pending.values, operationId: pending.operationId, uploadId: pending.upload.uploadId, ...(pending.id ? { expectedVersion: pending.version } : {}) });
      pendingSave.current = null; setUncertain(false); await open(result.submissionId); setMessage(`${result.displayId} saved.`);
    } catch (error) {
      if ([400, 403, 404, 409].includes(error.status)) { pendingSave.current = null; setUncertain(false); }
      else setUncertain(true);
      throw error;
    }
  }
  function save(event) {
    event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form)), selected = form.elements.attachments.files.length ? [...form.elements.attachments.files] : draft?.files || [], retainedIds = [...form.querySelectorAll('input[name="retain"]:checked')].map(input => input.value);
    run(async () => { const retained = detail?.media.filter(file => retainedIds.includes(file.id)) || [], all = [...retained, ...selected];
      if (all.length > 10 || all.some(file => file.size < 1 || file.size > 5000000) || all.reduce((sum, file) => sum + file.size, 0) > 10000000) throw new Error('Choose at most 10 files, 5 MB per file and 10 MB total, including retained files.');
      delete values.attachments; delete values.retain; pendingSave.current = { operationId: uid(), id: view === 'edit' ? detail.id : null, version: detail?.version, values, files: selected, retainedIds, completed: new Set(), attempted: new Set() }; await savePending();
    });
  }
  async function action(path, data) {
    if (!pendingAction.current) pendingAction.current = { path, data: { ...data, operationId: uid() } };
    const pending = pendingAction.current;
    try { const result = await api(pending.path, pending.data); pendingAction.current = null; setActionPending(false); return result; }
    catch (error) { if (error.status && error.status < 500) { pendingAction.current = null; setActionPending(false); } else setActionPending(true); throw error; }
  }
  async function retryAction() { const path = pendingAction.current?.path, result = await action(); if (path === 'admin/appearance') { setAppearance(current => result.appearance.version >= current.version ? result.appearance : current); markDirty(false); setMessage('Event theme applied to the whole website.'); } else if(path?.startsWith('admin/test-')) { setTestResult(result); markDirty(false); setMessage('Test operation reconciled.'); } else if (path?.startsWith('admin/')) { setTarget(undefined); markDirty(false); setMessage('Account access updated. Search again to review.'); } else if (detail) await refreshDetail(detail.id); }
  const blocked = busy || actionPending;
  function renderEditor() { return <form ref={editorForm} onChange={captureEditor} key={editKey} inert={busy || uncertain ? true : undefined} onSubmit={save} className="panel form-grid"><h2>{view === 'edit' ? `Edit ${detail.displayId}` : 'New pain point'}</h2><p className="muted">Your current submission is saved only when all files and fields are ready.</p>
    <label>Title<input name="title" required maxLength={300} defaultValue={draft?.values.title ?? (view === 'edit' ? detail.title : '')}/></label>
    <label>Domain<select aria-label="Domain" name="domain" required defaultValue={draft?.values.domain ?? (view === 'edit' ? detail.domain : '')}><option value="">Select a domain</option>{domains.map(domain => <option key={domain}>{domain}</option>)}</select></label>
    <label>Description<textarea name="description" required maxLength={20000} rows={7} defaultValue={draft?.values.description ?? (view === 'edit' ? detail.description : '')}/></label>
    <label>Proposed solution (optional)<textarea name="solution" maxLength={10000} rows={4} defaultValue={draft?.values.solution ?? (view === 'edit' ? detail.solution : '')}/></label>
    {view === 'edit' && detail.media.length > 0 && <fieldset key={detail.version}><legend>Retain attachments</legend>{detail.media.map(file => <label className="check" key={file.id}><input name="retain" type="checkbox" value={file.id} defaultChecked={draft ? draft.retainedIds.includes(file.id) : true}/>{file.name} · {(file.size / 1000000).toFixed(2)} MB</label>)}</fieldset>}
    <label>Add attachments<input name="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.ppt,.pptx"/></label>
    {draft?.files.length > 0 && <div className="muted">Selected for upload: {draft.files.map(file => file.name).join(", ")}<button type="button" className="link" onClick={() => { editorForm.current.elements.attachments.value = ""; editorDraft.current.files = []; markDirty(true); updateDraft(value => value + 1); }}>Clear selected files</button></div>}
    <p className="muted">Up to 10 files · 5 MB per file · 10 MB total. Attachments can be viewed by anyone with their Drive link.</p>
    <div className="actions">{view === "edit" && <button type="button" className="secondary" disabled={blocked || uncertain} onClick={() => run(async () => { const result = await api(`submissions/${detail.id}`); setDetail(result.item); if (result.item.locked) setMessage("This submission is locked. Keep your draft until faculty unlock it."); else setMessage("Saved version refreshed. Your draft text is preserved; review retained attachments before saving."); })}>Refresh version, keep draft</button>}<button disabled={blocked || uncertain || (view === "edit" && detail.locked)}>Save submission</button><Link className="secondary button-link" to={view === "edit" ? `/submissions/${routeId}` : fromList.pathname + fromList.search} state={view === "edit" ? location.state : { list: fromList.list, ownerUid: fromList.ownerUid }}>Cancel</Link></div>
  </form>; }
  return <><header className="site-header"><Link className="brand" to="/"><span className="brand-mark" aria-hidden="true">✦</span><span className="brand-copy"><strong>PPCP</strong><small>IDEAS · PEOPLE · POSSIBILITIES</small></span></Link>{me?.profile && <div className="identity"><div className="user-chip"><span className="user-avatar" aria-hidden="true">{me.profile.name.slice(0, 1).toUpperCase()}</span><span className="user-info"><strong>{me.profile.name}</strong><small>{me.profile.role}</small></span></div><button className="secondary" disabled={blocked || uncertain} onClick={() => run(async () => { if (dirtyRef.current && !window.confirm('Discard your unsaved changes and sign out?')) return; await api('auth/logout', {}); await signOut(auth); clearDraft(); setMe(null); setDetail(null); setPage({ items: [] }); setTarget(undefined); await go('/', { replace: true }, true); })}>Sign out</button></div>}</header>
  <main><section className="event-hero" aria-label="Event welcome"><div className="hero-copy"><div className="eyebrow"><span className="live-dot"/>WELINGKAR · EVENT EDITION</div><h1>{staff ? <>Ideas in focus.<br/><em>Progress in motion.</em></> : <>Every challenge.<br/><em>A new possibility.</em></>}</h1><p>{staff ? 'Explore student perspectives, share thoughtful feedback, and help promising ideas move forward.' : 'Bring your perspective. Share a real-world challenge. Be part of what comes next.'}</p><div className="hero-caption"><span aria-hidden="true">✧</span> A shared space for ideas that matter</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-outer"/><div className="orbit orbit-inner"/><span className="hero-spark spark-one">✦</span><span className="hero-spark spark-two">+</span><div className="idea-ticket"><span className="ticket-label">YOUR PERSPECTIVE MATTERS</span><span className="ticket-symbol">✧</span><strong>The next big idea<br/>starts with you.</strong><div className="ticket-rule"/><div className="ticket-bottom"><span>PPCP / COLLECTIVE IDEAS</span><span>↗</span></div></div></div></section>
  {blocker.state === 'blocked' && <NavigationGuard blocker={blocker} pending={busy || uncertain || actionPending || !!pendingSave.current} onDiscard={clearDraft}/>}
  {message && <div className="notice" role="status">{message}</div>}
  {uncertain && <div className="notice">This save needs reconciliation. Keep this page open.<button disabled={busy} onClick={() => run(savePending)}>Retry same save</button></div>}
  {actionPending && <div className="notice">The action response was interrupted.<button disabled={busy} onClick={() => run(retryAction)}>Retry same action</button></div>}
  {!me ? <section className="panel auth"><h2>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Welcome back'}</h2><p className="muted">Use your verified @welingkar.org or @welingkarmail.org email.</p>{account ? <div className="actions"><button disabled={busy} onClick={() => run(() => enter(account))}>Continue after verification</button><button className="secondary" disabled={busy} onClick={() => run(async () => { await sendEmailVerification(account); setMessage('Verification email sent.'); })}>Resend verification</button></div> : <form onSubmit={authenticate}><label>Institutional email<input name="email" type="email" required autoComplete="email"/></label>{mode !== 'reset' && <label>Password<input name="password" type="password" required minLength={6} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/></label>}<button disabled={busy || !auth}>{mode === 'register' ? 'Register' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button></form>}<div className="actions">{['login', 'register', 'reset'].filter(value => value !== mode).map(value => <button className="link" key={value} disabled={busy} onClick={() => { setMode(value); setAccount(null); }}>{({ login: 'Sign in', register: 'Create account', reset: 'Forgot password?' })[value]}</button>)}</div></section>
  : !me.profile ? <form className="panel auth" onChange={() => markDirty(true)} onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); run(async () => { await api('profile', data); markDirty(false); await portal(); }); }}><h2>Complete your profile</h2>{[['name', 'Full name'], ['program', 'Program / department'], ['studentId', 'Student / staff ID']].map(([name, label]) => <label key={name}>{label}<input name={name} required maxLength={200}/></label>)}<button disabled={busy}>Continue</button></form>
  : <><nav aria-label="Portal" inert={busy ? true : undefined}><Link className={view === 'list' ? 'button-link' : 'secondary button-link'} to="/">{staff ? 'Faculty dashboard' : 'My submissions'}</Link>{!staff && <Link className="secondary button-link" to="/submissions/new" state={{ returnList: view === 'list' ? snapshotList() : fromList }}>New submission</Link>}{me.profile.role === 'admin' && <><Link className="secondary button-link" to="/admin/users">Manage users</Link><Link className="secondary button-link" to="/admin/test-runs">Test runs</Link><Link className={view === 'appearance' ? 'button-link' : 'secondary button-link'} to="/admin/event-theme">Event theme</Link></>}</nav>
  {waiting && <p className="panel" role="status">Loading page…</p>}
  {!waiting && routeError && <section className="panel"><h2>{routeError === 'Submission unavailable.' ? 'Submission unavailable' : 'Access unavailable'}</h2><p>{routeError}</p><Link to="/">Back to submissions</Link></section>}
  {!waiting && !routeError && view === 'not-found' && <section className="panel"><h2>Page not found</h2><Link to="/">Back to submissions</Link></section>}
  {['detail', 'edit'].includes(view) && <Link className="back-link" to={fromList.pathname + fromList.search} state={{ list: fromList.list, ownerUid: fromList.ownerUid }}>← Back to submissions</Link>}
  {!waiting && !routeError && view === 'list' && <><section className="panel filter-panel"><form className="filters" key={location.search} onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void applyFilters(values).catch(error => setMessage(error.message)); }}>
    {me.profile.role==='admin'&&<><label>Test data<select name="testData" defaultValue={filters.testData||''}><option value="">All data</option><option value="true">Marked test data only</option></select></label><label>Test run ID<input name="testRunId" defaultValue={filters.testRunId||''}/></label></>}<label>Search field<select name="searchBy" defaultValue={filters.searchBy || "id"}><option value="id">Pain-point ID (exact)</option><option value="email">Student email (exact)</option><option value="name">Student name (prefix)</option><option value="title">Title (prefix)</option><option value="domain">Domain (exact)</option></select></label><label>Search<input name="search" defaultValue={filters.search || ""} placeholder="e.g. PP001" maxLength={300}/></label>
    <label>Domain<select name="domain" defaultValue={filters.domain || ""}><option value="">All domains</option>{domains.map(domain => <option key={domain}>{domain}</option>)}</select></label><label>Lock state<select name="locked" defaultValue={filters.locked || "all"}><option value="all">All</option><option value="true">Locked</option><option value="false">Unlocked</option></select></label>
    <label>Remarks<select name="remarked" defaultValue={filters.remarked || "all"}><option value="all">All</option><option value="true">With remarks</option><option value="false">Without remarks</option></select></label><label>Submitted from (UTC)<input name="from" defaultValue={filters.from || ""} type="date"/></label><label>Submitted to (UTC)<input name="to" defaultValue={filters.to || ""} type="date"/></label>
    <label>Sort<select name="sort" defaultValue={filters.sort || "newest"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="edited">Last edited</option><option value="id">ID ascending</option></select></label><label>Page size<select name="limit" defaultValue={filters.limit || "20"}><option>20</option><option>50</option><option>10</option></select></label><button disabled={blocked}>Apply filters</button></form></section>
    <div className="list-heading"><h2>{staff ? 'Submissions' : 'Your submissions'}</h2><span className="muted">Order: {page.orderLabel || 'newest'} · Refresh after concurrent changes</span></div>
    <section className="cards">{page.items.length ? page.items.map(item => <Link className="submission-card" key={item.id} to={`/submissions/${item.id}`} onClick={event => { void openFromList(event, item.id); }}><div><span className="code">{item.displayId}</span>{item.testRunId && <span className="badge">TEST DATA · {item.testRunId.slice(0,8)}</span>}<span className={`badge ${item.locked ? 'locked' : ''}`}>{item.locked ? 'Locked' : 'Unlocked'}</span></div><h3>{item.title}</h3><p className="card-domain">{item.domain}</p><p className="muted">{item.name} · {item.email}</p><footer>{new Date(item.createdAt).toLocaleString()} · {item.hasRemarks ? 'Remarks added' : 'No remarks'}</footer></Link>) : <p className="panel muted">No submissions match this view.</p>}</section>
    <div className="actions pagination"><button className="secondary" disabled={blocked || index === 0} onClick={() => { void changePage(index - 1, cursors).catch(error => setMessage(error.message)); }}>Previous</button><span>Page {index + 1}</span><button className="secondary" disabled={blocked || !page.nextCursor} onClick={() => { const next = page.nextCursor; void changePage(index + 1, [...cursors.slice(0, index + 1), next]).catch(error => setMessage(error.message)); }}>Next</button></div></>}
  {!waiting && !routeError && (view === 'create' || (view === 'edit' && detail?.id === routeId)) && renderEditor()}
  {!waiting && !routeError && view === 'detail' && detail?.id === routeId && <div className="detail-grid"><article className="panel"><div className="actions"><span className="code">{detail.displayId}</span>{detail.testRunId && <span className="badge">TEST DATA · {detail.testRunId}</span>}{detail.testRunId && me.profile.role==='admin' && <Link to={`/admin/test-runs?run=${detail.testRunId}&submission=${detail.id}`}>Delete this test submission</Link>}<span className={"badge " + (detail.locked ? "locked" : "")}>{detail.locked ? 'Locked' : 'Unlocked'}</span></div><h2>{detail.title}</h2><p className="muted">{detail.domain} · {detail.name} · {detail.email}</p><p className="muted">Version {detail.version} · Edited {new Date(detail.lastEditedAt).toLocaleString()}{detail.lockedAt ? ` · Locked ${new Date(detail.lockedAt).toLocaleString()}` : ''}</p><h3>Description</h3><p className="prose">{detail.description}</p>{detail.solution && <><h3>Proposed solution</h3><p className="prose">{detail.solution}</p></>}<h3>Attachments</h3>{detail.media.length ? <ul className="attachments">{detail.media.map(file => <li key={file.id}><a href={file.webViewLink} target="_blank" rel="noopener noreferrer">{file.name} ↗ Open in Drive</a><span className="muted"> · {(file.size / 1000000).toFixed(2)} MB</span></li>)}</ul> : <p className="muted">No attachments.</p>}<div className="actions">{!staff && !detail.locked && <Link className="button-link" to={`/submissions/${detail.id}/edit`} state={location.state}>Edit submission</Link>}{(!detail.locked || staff) && <button className="secondary" disabled={blocked} onClick={() => run(async () => { await action(`submissions/${detail.id}/${detail.locked ? 'unlock' : 'lock'}`, { expectedVersion: detail.version }); await refreshDetail(detail.id); })}>{detail.locked ? 'Unlock submission' : 'Lock submission'}</button>}<button className="link" disabled={blocked} onClick={() => run(() => open(detail.id))}>Refresh saved version</button></div></article>
    <aside className="panel"><h2>Remarks · {detail.displayId}</h2>{remarks.length ? remarks.map(note => <article className="remark" key={note.id}><strong>{note.authorName}</strong><time>{new Date(note.createdAt).toLocaleString()}</time><p className="prose">{note.remark}</p></article>) : <p className="muted">No remarks yet.</p>}{remarkCursor && <button disabled={blocked} onClick={() => run(async () => { const result = await api(`submissions/${detail.id}/remarks?cursor=${encodeURIComponent(remarkCursor)}`); setRemarks([...remarks, ...result.items]); setRemarkCursor(result.nextCursor); })}>More remarks</button>}{staff && <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, remark = new FormData(form).get('remark'); run(async () => { await action(`submissions/${detail.id}/remarks`, { remark }); markDirty(false); form.reset(); await refreshDetail(detail.id); }); }}><label>Add a remark<textarea name="remark" onChange={() => markDirty(true)} required maxLength={5000} rows={4}/></label><button disabled={blocked}>Add remark</button></form>}</aside></div>}
  {!waiting && !routeError && view === 'tests' && <TestRunsPanel api={api} busy={blocked || uncertain} result={testResult} onDirty={markDirty} initialRunId={new URLSearchParams(location.search).get('run')||''} initialSubmissionId={new URLSearchParams(location.search).get('submission')||''} mutate={(path,data)=>run(async()=>{const result=await action(path,data);setTestResult(result);markDirty(false);return result;})}/>}
  {!waiting && !routeError && view === 'admin' && <section className="panel auth"><h2>Manage institutional users</h2><p className="muted">Users register and verify their own institutional account before elevation. Access changes apply on their next protected request.</p><form onSubmit={event => { event.preventDefault(); const email = new FormData(event.currentTarget).get('email'); run(async () => { setTarget((await api(`admin/users?email=${encodeURIComponent(email)}`)).user); }); }}><label>Exact email<input name="email" type="email" required/></label><button disabled={blocked}>Find user</button></form>{target === null && <p>No completed user profile found.</p>}{target && <form key={target.uid} onChange={() => markDirty(true)} onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); run(async () => { await action(`admin/users/${target.uid}`, values); setTarget({ ...target, ...values }); markDirty(false); setMessage('Account access updated.'); }); }}><h3>{target.name}</h3><p>{target.email} · {target.emailVerified ? 'Verified' : 'Unverified'}{target.firebaseDisabled ? ' · Firebase account disabled' : ''}</p><label>Role<select aria-label="Role" name="role" defaultValue={target.role}><option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option></select></label><label>Access<select aria-label="Access" name="status" defaultValue={target.status}><option value="active">Active</option><option value="disabled">Disabled</option></select></label><button disabled={blocked}>Save access</button></form>}</section>}
  </>}
  {!waiting && !routeError && me?.profile?.role === 'admin' && view === 'appearance' && <div onChange={() => markDirty(true)}><EventThemePanel appearance={appearance} busy={blocked || uncertain} onApply={theme => run(async () => { const result = await action('admin/appearance', { theme, expectedVersion: appearance.version }); setAppearance(current => result.appearance.version >= current.version ? result.appearance : current); markDirty(false); setMessage('Event theme applied to the whole website.'); })} onReload={() => run(async () => { await refreshAppearance(); markDirty(false); })}/></div>}<footer className="site-footer">PPCP M04 · Current submissions only · Institutional access</footer><Outlet/></main></>;
}
function RouteMarker() { return null; }
const routes = [['submissions/new', 'create'], ['submissions/:id/edit', 'edit'], ['submissions/:id', 'detail'], ['admin/test-runs', 'tests'], ['admin/users', 'admin'], ['admin/event-theme', 'appearance'], ['*', 'not-found']];
const router = createBrowserRouter([{ path: '/', element: <App/>, children: [{ index: true, element: <RouteMarker/>, handle: { view: 'list' } }, ...routes.map(([path, view]) => ({ path, element: <RouteMarker/>, handle: { view } }))] }]);
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);

