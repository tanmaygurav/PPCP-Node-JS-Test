import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { png } from '../test-tools/runtime.mjs';
const schema = JSON.parse(readFileSync(new URL('../fixtures/m01/schema.json', import.meta.url)));
mkdirSync('output/fixtures/m01', { recursive: true });
for (const [name, headers] of Object.entries(schema.tabs)) {
  writeFileSync(`output/fixtures/m01/${name}.tsv`, headers.join('\t') + '\n' + (name === 'Calculations' ? `\t\t${schema.activeDomain}\n` : ''));
}
writeFileSync('output/fixtures/m01/tiny-a.png', png); writeFileSync('output/fixtures/m01/tiny-b.png', png);
writeFileSync('output/fixtures/m01/oversize.pdf', Buffer.alloc(5_000_001));
console.log('Exported plain headers, an active domain and synthetic manual-test files to output/fixtures/m01. This command does not modify Google resources.');
