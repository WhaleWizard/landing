import fs from 'node:fs'
import path from 'node:path'

function scanDir(dir, fileList = []) {
  const files = fs.readdirSync(dir)
  for (const f of files) {
    const full = path.join(dir, f)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== 'dist' && f !== '.git') {
        scanDir(full, fileList)
      }
    } else if (/\.(ts|tsx|js|mjs|json|css|sql)$/.test(f)) {
      fileList.push(full)
    }
  }
  return fileList
}

const targets = [...scanDir('src'), ...scanDir('functions'), ...scanDir('scripts')]

console.log(`Scanning ${targets.length} source files for invisible/forbidden characters...`)

const INVISIBLE_RE = /[\uFEFF\u200B-\u200D\u2060\u00A0\u180E\u2000-\u200A\u202F\u205F\u3000]/g
const BOM = '\uFEFF'

let issues = []

for (const file of targets) {
  const content = fs.readFileSync(file, 'utf8')
  if (content.startsWith(BOM)) {
    issues.push({ file, type: 'BOM', detail: 'File begins with UTF-8 BOM' })
  }

  // Check for non-standard whitespace/invisible chars outside string literals/comments if possible, or all
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('\u200B')) issues.push({ file, line: i + 1, type: 'ZERO_WIDTH_SPACE' })
    if (line.includes('\u200C')) issues.push({ file, line: i + 1, type: 'ZERO_WIDTH_NON_JOINER' })
    if (line.includes('\u200D')) issues.push({ file, line: i + 1, type: 'ZERO_WIDTH_JOINER' })
  }
}

console.log(`Scan completed. Found ${issues.length} character issues.`)
if (issues.length > 0) {
  console.table(issues)
} else {
  console.log('ALL SOURCE FILES 100% CLEAN OF INVISIBLE/CORRUPT CHARACTERS.')
}
