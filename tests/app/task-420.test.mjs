// Task 2026-11-27-420: « Nouveau site » without instructions, Visibilité and Courant behind a setting, signature cards,
// tag chips; and the Informations tab laid out as the tablet mock-up draws it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const fields = read('app/src/components/DesktopDiveFields.svelte');
const fr = JSON.parse(read('app/src/i18n/fr.json'));

test('Informations on a tablet in landscape: Date et heure, Site, Appréciation, Étiquettes, Plongée invalide | Personnes, Signatures, Conditions (task 2026-11-27-422)', () => {
  const columns = fields.slice(fields.indexOf('bc-desktop-dive-fields--info-columns">'), fields.indexOf('{:else}', fields.indexOf('bc-desktop-dive-fields--info-columns">')));
  const renders = [...columns.matchAll(/\{@render (\w+)\(\)\}/g)].map((m) => m[1]);
  assert.deepEqual(renders, ['datetimeCard', 'siteCard', 'ratingCard', 'tagsCard', 'invalidCard', 'peopleCard', 'signaturesCard', 'conditionsCard']);
  assert.match(fields, /\{#if layout\.split && !layout\.desktop && !layout\.portrait\}\s*<div class="bc-desktop-dive-fields--info bc-desktop-dive-fields--info-columns">/);
});

test('elsewhere one column in the phone\'s order', () => {
  const single = fields.slice(fields.indexOf('<div class="bc-desktop-dive-fields--equipment bc-desktop-dive-fields--info">'), fields.indexOf("{:else if tab === 'equipment'}"));
  const renders = [...single.matchAll(/\{@render (\w+)\(\)\}/g)].map((m) => m[1]);
  assert.deepEqual(renders, ['datetimeCard', 'siteCard', 'peopleCard', 'signaturesCard', 'ratingCard', 'tagsCard', 'conditionsCard', 'invalidCard']);
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

test('the detail\'s star rows read « Note ★★★★☆ 4 sur 5 » on one line on a phone and a tablet (76 px label, 44 px targets)', () => {
  const row = read('app/src/components/DesktopStarsRow.svelte');
  assert.match(row, /class:bc-desktop-stars-row--inline=\{inline\}/);
  assert.match(row, /width: var\(--bc-stars-label-width, 76px\);\s*font-size: 15px;/);
  assert.match(row, /& \.bc-desktop-stars-row--star \{\s*width: 44px;\s*height: 44px;/);
  assert.equal(fields.match(/<DesktopStarsRow inline=\{!layout\.desktop\}/g)?.length, 2);
});

test('task 421: « Voyage » under the site on every device, « Ajouter à un voyage » when empty on the desktop', () => {
  const site = fields.slice(fields.indexOf('{#snippet siteCard()}'), fields.indexOf('{#snippet peopleCard()}'));
  assert.doesNotMatch(site, /\{#if layout\.phone\}/);
  assert.match(site, /const tripEmpty = t\(layout\.desktop \? 'desktopDetail\.addToTripShort' : 'edit\.tripNone'\)/);
  assert.match(site, /onclick=\{\(\) => \(tripSheet = true\)\}/);
  assert.equal(fr.desktopDetail.addToTripShort, 'Ajouter à un voyage');
});

test('task 422: Conditions, Type d\'eau | Pression, Air | Eau edited in place on any dive, CNS | OTU outlined, the stars under them', async () => {
  const card = fields.slice(fields.indexOf('{#snippet conditionsCard()}'), fields.indexOf('{#snippet tagsCard()}'));
  const order = [...card.matchAll(/label=\{t\('desktopDetail\.label\.(\w+)'\)\}/g)].map((m) => m[1]);
  assert.deepEqual(order, ['waterType', 'surfacePressure', 'airTemp', 'waterTemp', 'maxDepth', 'duration', 'cns', 'otu']);
  assert.match(card, /<DesktopEditField stacked boxed outlined kind="text" readonly label=\{t\('desktopDetail\.label\.cns'\)\}/);
  assert.ok(card.indexOf("label.otu") < card.indexOf('{#each starConditions'), 'the stars come after CNS and OTU');
  const { RECORDED, fieldChanges } = await import('../../app/src/lib/desktop-edit.js');
  assert.ok(!RECORDED.includes('airTemp') && !RECORDED.includes('waterTemp'));
  assert.ok(RECORDED.includes('maxDepth') && RECORDED.includes('duration'));
  assert.match(read('app/src/components/DesktopEditField.svelte'), /\.bc-desktop-edit-field--outlined \{\s*background: none;\s*box-shadow: inset 0 0 0 1px var\(--bc-chip-outline\);/);
  void fieldChanges;
});

test('task 423: the empty undersuit reads « Choisir… »', () => {
  assert.equal(fr.desktopDetail.invitation.undersuit, 'Choisir…');
  assert.equal(JSON.parse(read('app/src/i18n/en.json')).desktopDetail.invitation.undersuit, 'Choose…');
});
