import React, { useRef, useState } from 'react';

export default function EditPainPoint({ item, domains, api, saved }) {
  const [base, setBase] = useState(item);
  const [draft, setDraft] = useState({ title: item.title, domain: item.domain, description: item.description, solution: item.solution });
  const [retained, setRetained] = useState(item.media.map(file => file.fileId));
  const [files, setFiles] = useState([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(null);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (!pending.current) {
        const old = base.media.filter(file => retained.includes(file.fileId));
        if (old.length + files.length > 10 || files.some(file => file.size < 1 || file.size > 5000000) || old.reduce((n, file) => n + Number(file.size || 0), 0) + files.reduce((n, file) => n + file.size, 0) > 20000000) throw new Error('Choose up to 10 files, 5 MB each and 20 MB total. The server also validates existing attachments.');
        const upload = await api(`submissions/${item.id}/edit-uploads`, { files: files.map(file => ({ name: file.name, size: file.size })) });
        for (let i = 0; i < files.length; i++) {
          const result = await fetch(upload.uploads[i].uploadUrl, { method: 'PUT', headers: { 'Content-Type': upload.uploads[i].mimeType }, body: files[i] });
          if (!result.ok) throw new Error('Upload interrupted. Your draft and saved content are unchanged. Retry the upload.');
        }
        pending.current = { ...draft, retainedFileIds: retained, ticket: upload.ticket, expectedLastEdited: base.lastEdited || '', operationId: crypto.randomUUID() };
      }
      const result = await api(`submissions/${item.id}/edits`, pending.current);
      pending.current = null; await saved(result.item); setMessage('Changes saved.');
    } catch (error) {
      // Keep the exact operation and draft after ambiguous failures. A conflict is
      // resolved by explicitly reloading the saved record, never by overwriting it.
      setMessage(error.message);
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <h3>Edit your pain point</h3>
    {message && <p role="status">{message}</p>}
    <fieldset disabled={busy || !!pending.current}>
      {['title', 'description', 'solution'].map(key => <label key={key}>{key === 'title' ? 'Edit title' : key === 'description' ? 'Edit description' : 'Edit solution'}{key === 'title' ? <input required maxLength={300} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}/> : <textarea required={key === 'description'} maxLength={key === 'description' ? 20000 : 10000} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}/>}</label>)}
      <label>Edit domain<select value={draft.domain} onChange={event => setDraft({ ...draft, domain: event.target.value })}>{[...new Set([item.domain, ...domains])].map(domain => <option key={domain}>{domain}</option>)}</select></label>
      <p>Keep these attachments. Uncheck to remove them after a successful save.</p>
      {base.media.map(file => <label key={file.fileId}><input type="checkbox" checked={retained.includes(file.fileId)} onChange={event => setRetained(event.target.checked ? [...retained, file.fileId] : retained.filter(id => id !== file.fileId))}/>{file.filename}</label>)}
      <label>Add or replace attachments<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.ppt,.pptx" onChange={event => setFiles([...event.target.files])}/></label>
    </fieldset>
    <button disabled={busy}>{busy ? 'Saving changes…' : pending.current ? 'Check or retry this save' : 'Save changes'}</button>
    {pending.current && <><p>Your draft is preserved. Check this save again if its outcome is uncertain. After a conflict, reload the saved version before making a new save.</p><button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const result = await api(`submissions/${item.id}`);
        setBase(result.item); setRetained(result.item.media.map(file => file.fileId)); pending.current = null;
        setMessage('Loaded the current saved version. Your text draft and selected new files are preserved. Review attachments before saving again.');
      } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    }}>Reload saved version, keep my text</button></>}
  </form>;
}
