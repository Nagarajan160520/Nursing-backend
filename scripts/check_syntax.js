const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'controllers', 'adminController.js');
const s = fs.readFileSync(file, 'utf8');
const counts = {
  braceOpen: (s.match(/\{/g) || []).length,
  braceClose: (s.match(/\}/g) || []).length,
  parenOpen: (s.match(/\(/g) || []).length,
  parenClose: (s.match(/\)/g) || []).length,
  bracketOpen: (s.match(/\[/g) || []).length,
  bracketClose: (s.match(/\]/g) || []).length,
  backticks: (s.match(/`/g) || []).length,
  singleQuotes: (s.match(/'/g) || []).length,
  doubleQuotes: (s.match(/"/g) || []).length
};
console.log('Counts:', counts);

// Find the first location where braceClose > braceOpen when scanning, or vice versa
let open = 0;
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (ch === '{') open++;
  if (ch === '}') open--;
  if (open < 0) { console.log('Found extra closing } at index', i); break; }
}
if (open > 0) {
  console.log('Unclosed { count:', open);
}

// Show lines around the end of file
const lines = s.split(/\r?\n/);
const tail = lines.slice(-30).map((l, idx) => `${lines.length-30+idx+1}: ${l}`).join('\n');
console.log('\nLast 30 lines:\n', tail);

// Search for unterminated template literals
const backtickIndex = s.indexOf('`');
if (backtickIndex !== -1 && (s.match(/`/g) || []).length % 2 !== 0) {
  console.log('\nUnterminated template literal near index', backtickIndex);
}
