// Task 2026-11-27-420: « Nouveau site » without instructions, Visibilité and Courant behind a setting, signature cards,
// tag chips; and the Informations tab laid out as the tablet mock-up draws it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const fields = read('app/src/components/DesktopDiveFields.svelte');
const fr = JSON.parse(read('app/src/i18n/fr.json'));

test('Informations on a tablet in landscape: Date et heure, Site, Appréciation, Conditions | Personnes, Signatures, Étiquettes, Plongée invalide', () => {
  const columns = fields.slice(fields.indexOf('bc-desktop-dive-fields--info-columns">'), fields.indexOf('{:else}', fields.indexOf('bc-desktop-dive-fields--info-columns">')));
  const renders = [...columns.matchAll(/\{@render (\w+)\(\)\}/g)].map((m) => m[1]);
  assert.deepEqual(renders, ['datetimeCard', 'siteCard', 'ratingCard', 'conditionsCard', 'peopleCard', 'signaturesCard', 'tagsCard', 'invalidCard']);
  assert.match(fields, /\{#if layout\.split && !layout\.desktop && !layout\.portrait\}\s*<div class="bc-desktop-dive-fields--info bc-desktop-dive-fields--info-columns">/);
});

test('elsewhere one column in the phone\'s order', () => {
  const single = fields.slice(fields.indexOf('<div class="bc-desktop-dive-fields--equipment bc-desktop-dive-fields--info">'), fields.indexOf("{:else if tab === 'equipment'}"));
  const renders = [...single.matchAll(/\{@render (\w+)\(\)\}/g)].map((m) => m[1]);
  assert.deepEqual(renders, ['datetimeCard', 'siteCard', 'peopleCard', 'signaturesCard', 'ratingCard', 'conditionsCard', 'tagsCard', 'invalidCard']);
});

test('Appréciation keeps only Note; the five conditions are star rows of Conditions, behind the renamed switch', () => {
  const rating = fields.slice(fields.indexOf('{#snippet ratingCard()}'), fields.indexOf('{#snippet conditionsCard()}'));
  assert.equal(rating.match(/<DesktopStarsRow/g)?.length, 1);
  assert.match(rating, /name="rating"/);
  assert.match(fields, /\{#each starConditions as key \(key\)\}/);
  assert.equal(fr.settings.extraConditions.label, 'Visibilité, courant, vagues de surface, flux-reflux et froid');
  assert.equal(fr.settings.extraConditions.text, 'Ajoute ces cinq conditions à l’onglet Informations');
  assert.match(read('docs/ui-specification.md'), /\| Visibilité, courant, vagues de surface, flux-reflux et froid \| switch \| off \| `extraEnvironmentalDefault` \|/);
});

test('« Nouveau site »: no instruction over the map and no supporting text under the fields; 420 px search, 320 px map on a tablet', () => {
  const edit = read('app/src/pages/SiteEdit.svelte');
  assert.doesNotMatch(edit, /diveSite\.touchToPlace|diveSite\.computerPosition/);
  assert.match(edit, /\{:else if editing\}\s*<span class="chip bc-site-edit--chip"/);
  assert.match(edit, /supporting=\{coordsBad \? t\('sites\.coordinatesInvalid'\) : editing \? t\('sites\.coordinatesHint'\) : ''\}/);
  assert.match(edit, /\{#if editing\}<p class="bc-site-edit--explain">\{t\('sites\.placeExplain'\)\}<\/p>\{\/if\}/);
  assert.match(edit, /const flatMap = \$derived\(!editing && !layout\.phone && !layout\.portrait\);/);
  assert.match(read('app/src/components/MapPlaceSearch.svelte'), /&\.bc-map-place-search--wide \{\s*width: min\(420px, calc\(100% - 80px\)\);/);
  const desktop = read('app/src/components/DesktopSiteNew.svelte');
  assert.doesNotMatch(desktop, /clickOrShared|clickToPlace|computerPosition|sites\.fromPosition|desktopSites\.placeExplain|coordinatesExample/);
});

test('tags are grey chips like the people\'s: 40 px, 15 px text, a 32 px × named « Retirer l’étiquette … »', () => {
  const chips = read('app/src/components/DesktopChipsField.svelte');
  assert.match(chips, /\.bc-desktop-chips--chip \{[^}]*height: 40px;[^}]*border-radius: 20px;\s*background: var\(--bc-chip-fill\);[^}]*font-size: 15px;/);
  assert.doesNotMatch(chips, /\.bc-desktop-chips--chip-tag \{[^}]*box-shadow/);
  assert.match(chips, /t\(variant === 'tag' \? 'desktopDetail\.removeTag' : 'desktopDetail\.removeItem', \{ name: item \}\)/);
  assert.equal(fr.desktopDetail.removeTag, 'Retirer l’étiquette {name}');
  const theme = read('app/src/theme.css');
  assert.match(theme, /--bc-chip-fill: #ECEAE4;/);
  assert.match(theme, /--bc-chip-fill: #2A2B2E;/);
});
