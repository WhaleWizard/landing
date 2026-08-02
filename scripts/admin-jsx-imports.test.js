import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ловит компоненты, которые используются в разметке, но не импортированы.
 *
 * Такая ошибка не видна ни сборке (Vite не резолвит идентификаторы), ни
 * типам (корневого tsconfig в проекте нет), и проявляется только в браузере
 * как ReferenceError с белым экраном раздела. Ровно так в админке падал
 * раздел «Заявки» из-за незаимпортированной иконки.
 */

const DIRECTORIES = ['src/app/components/admin', 'src/app/pages'];

// Встроенные типы и дженерики выглядят как JSX, но ими не являются.
const BUILTIN_PREFIXES = /^(HTML|SVG|Element|Node|Event|Blob|File|Response|Request|Promise|Map|Set|Array|Record|Partial|Omit|Pick|T$)/;

function collectFiles() {
  const files = [];
  for (const directory of DIRECTORIES) {
    for (const name of readdirSync(directory)) {
      if (name.endsWith('.tsx')) files.push(join(directory, name));
    }
  }
  return files;
}

function resolvableNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]/g)) {
    for (const part of match[1].replace(/[{}]/g, ',').split(',')) {
      const clean = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (clean) names.add(clean);
    }
  }
  for (const match of source.matchAll(/(?:function|const|class|let|var)\s+([A-Z][A-Za-z0-9_]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/(?:interface|type)\s+([A-Za-z0-9_]+)/g)) names.add(match[1]);
  // Переименованные пропсы вида `{ icon: Icon }` тоже доступны в разметке.
  for (const match of source.matchAll(/:\s*([A-Z][A-Za-z0-9_]*)\s*[,}]/g)) names.add(match[1]);
  return names;
}

test('every component used in admin markup is imported or defined', () => {
  const failures = [];

  for (const file of collectFiles()) {
    const source = readFileSync(file, 'utf8');
    const available = resolvableNames(source);

    for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)) {
      const name = match[1];
      if (BUILTIN_PREFIXES.test(name)) continue;
      if (available.has(name)) continue;
      failures.push(`${file}: <${name}> используется, но нигде не объявлен`);
    }
  }

  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});
