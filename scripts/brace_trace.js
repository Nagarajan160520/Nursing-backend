const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'controllers', 'adminController.js');
const s = fs.readFileSync(file, 'utf8');
const lines = s.split(/\r?\n/);
let depth = 0;
let start = 2436; // last zero
for (let i = start; i < lines.length; i++) {
  const l = lines[i];
  let old = depth;
  for (let ch of l) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  if (depth !== old) console.log((i+1) + ' depth:' + old + '->' + depth + ' | ' + l.trim());
}
console.log('final depth', depth);
