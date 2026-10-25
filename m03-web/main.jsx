import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from 'firebase/auth';
import styles from './portal.module.css';
import EditPainPoint from './EditPainPoint.jsx';

async function api(path, data) {
  const response = await fetch(`/api/${path}`, { credentials: 'same-origin', ...(data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function App() {
  const pendingSubmission = useRef(null);
  const [auth, setAuth] = useState(null), [account, setAccount] = useState(null), [me, setMe] = useState(null);
  const [mode, setMode] = useState('login'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]), [domains, setDomains] = useState([]), [detail, setDetail] = useState(null), [remarks, setRemarks] = useState([]);
  async function loadPortal() {
    const current = await api('me'); setMe(current);
    if (current.profile) {
      const [list, active] = await Promise.all([api('submissions'), api('domains')]);
      setItems(list.items); setDomains(active.domains);
    }
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { emulator, ...config } = await api('auth/config');
        const instance = getAuth(initializeApp(config));
        if (emulator) connectAuthEmulator(instance, emulator, { disableWarnings: true });
        await setPersistence(instance, inMemoryPersistence);
        if (alive) setAuth(instance);
        try { await loadPortal(); } catch { /* No saved server session on first visit. */ }
      } catch (error) { console.error('Firebase initialization:', error.code || error.name); if (alive) setMessage('Portal configuration is unavailable. Contact the administrator.'); }
    })();
    return () => { alive = false; };
  }, []);
  async function run(action) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function enter(user) {
    await user.reload();
    if (!user.emailVerified) { setAccount(user); setMessage('Check your inbox and verify your email, then select Continue.'); return; }
    await api('auth/session', { idToken: await user.getIdToken(true) });
    await signOut(auth); setAccount(null); await loadPortal();
  }
  async function authenticate(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    await run(async () => {
      const email = values.email.trim().toLowerCase();
      if (!/^[^\s@]+@welingkar\.org$/.test(email)) throw new Error('Use your @welingkar.org email address.');
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email); setMessage('If an account exists, a password reset email will arrive shortly.'); return;
      }
      const result = mode === 'register' ? await createUserWithEmailAndPassword(auth, email, values.password)
        : await signInWithEmailAndPassword(auth, email, values.password);
      if (!result.user.emailVerified && mode === 'register') await sendEmailVerification(result.user);
      await enter(result.user);
    });
  }
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    const files = [...form.elements.attachments.files];
    await run(async () => {
      if (files.length > 10 || files.some(file => file.size > 5000000 || !file.size) || files.reduce((n, f) => n + f.size, 0) > 20000000) {
        throw new Error('Choose up to 10 files, at most 5 MB each and 20 MB total.');
      }
      if (!pendingSubmission.current) {
      const upload = await api('upload-sessions', { files: files.map(file => ({ name: file.name, size: file.size })) });
      for (let i = 0; i < files.length; i++) {
        const response = await fetch(upload.uploads[i].uploadUrl, { method: 'PUT', headers: { 'Content-Type': upload.uploads[i].mimeType }, body: files[i] });
        if (!response.ok) throw new Error('An attachment did not finish uploading. Retry with a new submission.');
      }
      pendingSubmission.current = { ...values, ticket: upload.ticket, operationId: crypto.randomUUID() };
      }
      await api('submissions', pendingSubmission.current); pendingSubmission.current = null; form.reset(); await loadPortal(); setMessage('Your pain point was saved.');
    });
  }
  async function open(item) {
    const [result, feedback] = await Promise.all([api(`submissions/${item.id}`), api(`submissions/${item.id}/remarks`)]);
    setDetail(result.item); setRemarks(feedback.items);
  }
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.brand}>REDX · WELINGKAR</span><h1>Pain Points Collection Portal</h1><p>Observe a problem. Share an opportunity to improve it.</p></div><span className={styles.badge}>M03-B pilot</span></header>
    <main>
      {message && <p className={styles.message} role="status">{message}</p>}
      {!me ? <section className={styles.card}>
        <h2>{account ? 'Verify your email' : mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h2>
        {account ? <><p>We need to verify {account.email} before you can enter.</p><div className={styles.actions}>
          <button disabled={busy} onClick={() => run(() => enter(account))}>Continue after verification</button>
          <button disabled={busy} onClick={() => run(async () => { await sendEmailVerification(account); setMessage('Verification email sent.'); })}>Resend email</button>
          <button disabled={busy} onClick={() => run(async () => { await signOut(auth); setAccount(null); })}>Back to sign in</button>
        </div></> : <><form onSubmit={authenticate}>
          <label>Organization email<input name="email" type="email" autoComplete="email" placeholder="you@welingkar.org" required maxLength={254}/></label>
          {mode !== 'reset' && <label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required/></label>}
          <button disabled={busy || !auth}>{busy ? 'Please wait…' : mode === 'register' ? 'Register' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
        </form><nav className={styles.actions} aria-label="Account options">{['login', 'register', 'reset'].filter(value => value !== mode).map(value => <button key={value} disabled={busy} onClick={() => setMode(value)}>{value === 'login' ? 'Sign in' : value === 'register' ? 'Create account' : 'Forgot password'}</button>)}</nav></>}
      </section> : !me.profile ? <section className={styles.card}><h2>Complete your profile</h2><form onSubmit={event => {
        event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); run(async () => { await api('profile', values); await loadPortal(); });
      }}><label>Name<input name="name" required maxLength={200}/></label><label>Program<input name="program" required maxLength={200}/></label><label>Student ID<input name="studentId" required maxLength={200}/></label><button disabled={busy}>Continue</button></form><button disabled={busy} onClick={() => run(async () => { await api('auth/logout', {}); setMe(null); setMode('login'); })}>Sign out</button></section> : <>
        <div className={styles.toolbar}><p>{me.profile.name} · {me.profile.role}</p><button disabled={busy} onClick={() => run(async () => {
          await api('auth/logout', {}); await signOut(auth); setMe(null); setItems([]); setDetail(null); setMode('login');
        })}>Sign out</button></div>
        <div className={styles.columns}><section className={styles.card}><h2>Share a pain point</h2><form onSubmit={submit}>
          <fieldset disabled={busy || !!pendingSubmission.current}>
          <label>Title<input name="title" required maxLength={300}/></label>
          <label>Domain<select name="domain" required><option value="">Choose a domain</option>{domains.map(domain => <option key={domain}>{domain}</option>)}</select></label>
          <label>What is the problem?<textarea name="description" required maxLength={20000} rows={5}/></label>
          <label>Possible solution<textarea name="solution" maxLength={10000} rows={3}/></label>
          <label>Attachments<input name="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.ppt,.pptx"/></label>
          <small>Up to 10 files · 5 MB per file · 20 MB total</small></fieldset><button disabled={busy}>{busy ? 'Saving…' : pendingSubmission.current ? 'Check or retry this submission' : 'Submit pain point'}</button>
        </form></section><section className={styles.card}><h2>{me.profile.role === 'student' ? 'Your pain points' : 'Review pain points'}</h2>
          <button disabled={busy} onClick={() => run(loadPortal)}>Refresh</button>
          {!items.length && <p>No pain points yet.</p>}<ul className={styles.list}>{items.map(item => <li key={item.id}><button disabled={busy} onClick={() => run(() => open(item))}>{item.title}</button><small>{item.domain} · {item.name}</small></li>)}</ul>
          <small>Showing the latest 20 visible records.</small>
        </section></div>
        {detail && <section className={styles.card}><h2>{detail.title}</h2><p className={styles.prose}>{detail.description}</p><p className={styles.prose}>{detail.solution}</p>
          {detail.lastEdited && <p>Last edited: <time dateTime={detail.lastEdited}>{new Date(detail.lastEdited).toLocaleString()}</time></p>}
          <ul>{detail.media.map((file, index) => <li key={index}><a href={file.downloadUrl}>{file.filename}</a></li>)}</ul>
          {detail.ownerUid === me.identity.uid && <EditPainPoint key={`${detail.id}:${detail.lastEdited || ''}`} item={detail} domains={domains} api={api} saved={async item => { setDetail(item); await loadPortal(); }}/>}<h3>Remarks</h3>
          {remarks.map((remark, index) => <p key={index} className={styles.prose}>{remark.remark}<small>{remark.givenBy}</small></p>)}
          {me.profile.role !== 'student' && <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, remark = new FormData(form).get('remark'); run(async () => { await api(`submissions/${detail.id}/remarks`, { remark }); form.reset(); await open(detail); }); }}>
            <label>Faculty remark<textarea name="remark" required maxLength={5000}/></label><button disabled={busy}>Add remark</button></form>}
        </section>}
      </>}
    </main><footer>Test environment · Use synthetic submission data only.</footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
