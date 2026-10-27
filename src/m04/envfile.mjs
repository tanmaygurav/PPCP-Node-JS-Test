// Node dotenv preserves backslashes verbatim inside single quotes. JSON-string
// quoting would corrupt an embedded service-account JSON/private-key value.
export function formatEnv(values) {
  return Object.entries(values).map(([key, raw]) => {
    const value = String(raw);
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /['\r\n]/.test(value)) throw new Error('Environment value cannot be serialized safely.');
    return `${key}='${value}'`;
  }).join('\n') + '\n';
}
