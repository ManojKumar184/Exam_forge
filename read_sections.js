const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'Pasted text(133).txt'), 'utf8');
const lines = content.split(/\r?\n/);

console.log('Total lines:', lines.length);

let plainIndex = -1;
let htmlIndex = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line === 'text/plain') {
    plainIndex = i;
  } else if (line === 'text/html') {
    htmlIndex = i;
  }
}

console.log('text/plain starts at line:', plainIndex);
console.log('text/html starts at line:', htmlIndex);

if (plainIndex !== -1) {
  console.log('Line after text/plain:', lines[plainIndex + 1]);
  console.log('Line 2 after text/plain:', lines[plainIndex + 2]);
}
if (htmlIndex !== -1) {
  console.log('Line after text/html:', lines[htmlIndex + 1]);
  console.log('Line 2 after text/html:', lines[htmlIndex + 2]);
}
