export const DEFAULT_THEME = 'innovation';
export const EVENT_THEMES = Object.freeze([
  { id: 'innovation', name: 'Innovation', description: 'Electric blue and cyan for fresh ideas and new possibilities.' },
  { id: 'festival', name: 'Festival', description: 'Violet and coral for an energetic, celebratory event.' },
  { id: 'conference', name: 'Conference', description: 'Midnight navy and gold for a focused, formal gathering.' },
  { id: 'classic', name: 'Classic', description: 'Forest green and lime for a calm, familiar atmosphere.' }
]);
export const isEventTheme = value => EVENT_THEMES.some(theme => theme.id === value);
