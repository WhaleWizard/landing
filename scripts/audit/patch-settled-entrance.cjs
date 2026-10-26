const fs = require('fs');

const files = [
  'src/app/pages/MarketingGlossaryPage.tsx',
  'src/app/pages/FAQPage.tsx',
  'src/app/pages/CasesPage.tsx',
  'src/app/pages/BlogPage.tsx',
];

for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  const importTarget = "import { hasGeneratedFirstScreen } from '../utils/firstScreen';";
  const importReplacement = "import { hasGeneratedFirstScreen, isInitialEntry } from '../utils/firstScreen';";
  
  const usageTarget = "const settledEntrance = hasGeneratedFirstScreen(location.pathname, location.key);";
  const usageReplacement = "const settledEntrance = isInitialEntry(location.key) || hasGeneratedFirstScreen(location.pathname, location.key);";

  const normalized = s.replace(/\r\n/g, '\n');
  if (!normalized.includes(importTarget)) {
    console.error('Import target not found in ' + file);
    process.exit(1);
  }
  if (!normalized.includes(usageTarget)) {
    console.error('Usage target not found in ' + file);
    process.exit(1);
  }

  let patched = normalized.replace(importTarget, importReplacement).replace(usageTarget, usageReplacement);
  fs.writeFileSync(file, patched.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully patched ' + file);
}
