import React, { useEffect, useRef } from 'react';
export default function NavigationGuard({ blocker, pending, onDiscard }) {
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => { if (element.open) element.close(); }; }, []);
  return <dialog ref={dialog} className="navigation-guard" aria-labelledby="navigation-guard-title" onCancel={event => { event.preventDefault(); blocker.reset(); }}>
    <h2 id="navigation-guard-title">{pending ? 'Finish this operation before leaving' : 'Leave without saving?'}</h2>
    <p>{pending ? 'Stay on this page and finish or reconcile the current operation.' : 'Your unsaved changes and selected new files will be discarded.'}</p>
    <div className="actions"><button autoFocus onClick={() => blocker.reset()}>{pending ? 'Stay on this page' : 'Keep editing'}</button>{!pending && <button className="secondary" onClick={() => { onDiscard(); blocker.proceed(); }}>Discard changes and leave</button>}</div>
  </dialog>;
}
