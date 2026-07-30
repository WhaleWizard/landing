import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const sourceUrl = new URL('../src/app/data/marketingGlossary.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = await transform(source, {
  loader: 'ts',
  format: 'cjs',
  target: 'node20',
});

const glossaryModule = { exports: {} };
new Function('module', 'exports', compiled.code)(
  glossaryModule,
  glossaryModule.exports,
);

const {
  GLOSSARY_SECTIONS,
  glossaryCollections,
  glossarySources,
  marketingGlossary,
} = glossaryModule.exports;

const normalized = (value) => String(value || '')
  .toLocaleLowerCase('ru')
  .replace(/[^a-zа-яё0-9]+/g, '');

const duplicates = (values) => {
  const seen = new Map();
  for (const value of values) {
    const key = normalized(value);
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1);
};

test('glossary has unique canonical ids and terms', () => {
  assert.equal(duplicates(marketingGlossary.map((item) => item.id)).length, 0);
  assert.equal(duplicates(marketingGlossary.map((item) => item.term)).length, 0);
});

test('ambiguous abbreviations are explicitly disambiguated', () => {
  const byAbbreviation = new Map();

  for (const item of marketingGlossary) {
    const key = normalized(item.abbreviation);
    if (!key) continue;
    byAbbreviation.set(key, [...(byAbbreviation.get(key) || []), item]);
  }

  for (const [abbreviation, items] of byAbbreviation) {
    if (items.length < 2) continue;
    assert.ok(
      items.every((item) => item.disambiguation?.trim()),
      `Abbreviation "${abbreviation}" must be disambiguated on every term`,
    );
  }
});

test('sections, related terms and sources reference existing records', () => {
  const sectionIds = new Set(GLOSSARY_SECTIONS.map((section) => section.id));
  const termIds = new Set(marketingGlossary.map((item) => item.id));
  const sourceIds = new Set(glossarySources.map((source) => source.id));

  for (const item of marketingGlossary) {
    assert.ok(sectionIds.has(item.primarySection), `${item.id}: unknown section`);
    assert.ok(item.definition.trim(), `${item.id}: definition is required`);
    assert.ok(item.simple.trim(), `${item.id}: simple explanation is required`);
    assert.ok(item.useWhen.trim(), `${item.id}: useWhen is required`);

    for (const relatedId of item.relatedIds || []) {
      assert.ok(termIds.has(relatedId), `${item.id}: unknown related term ${relatedId}`);
      assert.notEqual(relatedId, item.id, `${item.id}: must not relate to itself`);
    }

    for (const sourceId of item.sourceIds) {
      assert.ok(sourceIds.has(sourceId), `${item.id}: unknown source ${sourceId}`);
    }
  }
});

test('Meta Apps collection is complete and has no repeated term ids', () => {
  const metaApps = glossaryCollections.find((collection) => collection.id === 'meta-apps');
  assert.ok(metaApps, 'Meta Apps collection is required');

  const termIds = metaApps.groups.flatMap((group) => group.termIds);
  const knownIds = new Set(marketingGlossary.map((item) => item.id));

  assert.ok(termIds.length >= 50, 'Meta Apps collection must stay substantial');
  assert.equal(new Set(termIds).size, termIds.length);
  for (const termId of termIds) {
    assert.ok(knownIds.has(termId), `Meta Apps collection references unknown term ${termId}`);
  }
});
