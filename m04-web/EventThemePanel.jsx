import React, { useEffect, useState } from 'react';
import { EVENT_THEMES } from '../shared/m04-themes.mjs';

export default function EventThemePanel({ appearance, busy, onApply, onReload }) {
  const [selected, setSelected] = useState(appearance.theme);
  useEffect(() => { setSelected(appearance.theme); }, [appearance.theme, appearance.version]);
  const current = EVENT_THEMES.find(theme => theme.id === appearance.theme);
  return <section className="theme-settings">
    <div className="section-heading"><div><p className="section-kicker">SET THE ATMOSPHERE</p><h2>One event. One shared look.</h2></div><span className="role-tag">Admin controls</span></div>
    <p className="section-description">Choose the palette for this event. Your selection applies to sign-in, student submissions, faculty review, and administration for everyone.</p>
    <div className="theme-layout">
      <form className="panel theme-form" onSubmit={event => { event.preventDefault(); onApply(selected); }}>
        <label>Event theme<select aria-label="Event theme" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy}>{EVENT_THEMES.map(theme => <option value={theme.id} key={theme.id}>{theme.name}</option>)}</select></label>
        <p className="muted">Currently applied: <strong>{current?.name}</strong></p>
        <div className="theme-mini-preview" data-preset={selected} role="img" aria-label={`${EVENT_THEMES.find(theme => theme.id === selected)?.name} preview`}><span className="mini-eyebrow">PPCP · EVENT EDITION</span><strong>Ideas worth<br/>coming together for.</strong><span className="mini-button">Make a contribution ↗</span></div>
        <div className="actions"><button disabled={busy || selected === appearance.theme}>Apply to website</button><button className="secondary" type="button" disabled={busy} onClick={onReload}>Reload saved theme</button></div>
        <p className="muted theme-help">Open pages pick up the new theme when refreshed or brought back into focus.</p>
      </form>
      <section className="theme-gallery" aria-label="Available event palettes">{EVENT_THEMES.map(theme => <article className={`theme-preset ${selected === theme.id ? 'preset-selected' : ''}`} data-preset={theme.id} key={theme.id}>
        <div className="preset-swatch" aria-hidden="true"><span className="swatch-orbit"/><span className="swatch-spark">✦</span><span className="swatch-dot"/></div><div className="preset-copy"><div><h3>{theme.name}</h3>{appearance.theme === theme.id && <span className="applied-tag">Applied</span>}</div><p>{theme.description}</p></div>
      </article>)}</section>
    </div>
  </section>;
}
