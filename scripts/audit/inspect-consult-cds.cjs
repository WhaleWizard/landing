const fs = require('fs');
const html = fs.readFileSync('dist/consult/index.html', 'utf8');
const idx = html.indexOf('class="cds"');
if (idx !== -1) {
  console.log(html.substring(idx - 50, idx + 2000));
} else {
  console.log('cds not found');
}
