import fs from 'node:fs';

const filePath = 'src/styles/cases-finder.css';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Search input height & font-size to prevent iOS Safari auto-zoom
const target1 = '.cases-search input {\r\n  min-width: 0;\r\n  flex: 1;\r\n  border: 0;\r\n  outline: 0;\r\n  color: #f5f5f7;\r\n  background: transparent;\r\n  font-size: 15px;\r\n}';
const replace1 = '.cases-search input {\r\n  min-width: 0;\r\n  min-height: 44px;\r\n  flex: 1;\r\n  border: 0;\r\n  outline: 0;\r\n  color: #f5f5f7;\r\n  background: transparent;\r\n  font-size: 16px;\r\n}';

// 2. Cases result copy h2 text-wrap: balance
const target2 = '.cases-result-copy h2 {\r\n  max-width: 780px;\r\n  font-size: clamp(17px, 1.5vw, 21px);\r\n  line-height: 1.23;\r\n  letter-spacing: -0.025em;\r\n  text-wrap: pretty;\r\n}';
const replace2 = '.cases-result-copy h2 {\r\n  max-width: 780px;\r\n  font-size: clamp(17px, 1.5vw, 21px);\r\n  line-height: 1.23;\r\n  letter-spacing: -0.025em;\r\n  text-wrap: balance;\r\n}';

if (content.includes(target1)) {
  content = content.replace(target1, replace1);
  console.log('✅ Updated .cases-search input in cases-finder.css');
} else {
  console.warn('⚠️ Could not find target1 in cases-finder.css');
}

if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  console.log('✅ Updated .cases-result-copy h2 in cases-finder.css');
} else {
  console.warn('⚠️ Could not find target2 in cases-finder.css');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating cases-finder.css');
