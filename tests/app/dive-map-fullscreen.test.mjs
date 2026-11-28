import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Task 2026-11-27-415 and its correction 2026-11-27-416: the dive's map (Carte tab / group).
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const fields = read('app/src/components/DesktopDiveFields.svelte');
const map = read('app/src/components/SiteMap.svelte');

test('the dive map has the site map\'s full-screen button, round and 44 px', () => {
  assert.match(fields, /<SiteMap pin=\{dive\.siteCoordinates\}[^>]*roundButton/);
  assert.match(map, /\.bc-site-map--round-button \.bc-map-fullscreen-button[^{]*\{\s*width: 44px;\s*height: 44px;\s*border-radius: 50%;/);
  assert.match(map, /<Icon name=\{full \? 'exitFullscreen' : 'fullscreen'\}/);
});

test('Back and Escape close the full-screen map through the shared mechanisms', () => {
  assert.match(read('app/src/lib/back-button.js'), /document\.querySelector\('\.bc-map-fullscreen'\)[\s\S]{0,80}'map-fullscreen'/);
  assert.match(map, /full && e\.key === 'Escape'\) setFull\(false\)/);
});

test('the map is 5:3 on a tablet, 220 px on a phone and 300 px on the desktop', () => {
  assert.match(fields, /const tabletMap = \$derived\(!layout\.phone && !desktopApp\)/);
  assert.match(fields, /ratio=\{tabletMap \? 5 \/ 3 : 0\}/);
  assert.match(fields, /height=\{layout\.phone \? '220px' : '300px'\}/);
  assert.match(fields, /--map\.bc-desktop-dive-fields--map-tablet \{\s*height: auto;/);
  assert.match(fields, /--map\.bc-desktop-dive-fields--map-phone \{\s*height: 220px;/);
});

test('« Ouvrir dans Maps » is an accent text link with the open-externally icon, after Coordonnées', () => {
  // The link is a snippet drawn after Coordonnées in both layouts (desktop rows; phone and tablet card).
  const last = (s) => fields.lastIndexOf(s);
  assert.ok(last("label={t('desktopDetail.label.coordinates')}") < last('{@render mapLink()}'));
  assert.equal(fields.match(/\{@render mapLink\(\)\}/g)?.length, 2);
  // Android and the desktop read « Ouvrir dans Maps » as drawn (task 2026-11-27-416); iOS keeps « Ouvrir dans Plans ».
  assert.match(fields, /<Icon name="openInNew" size=\{18\} \/>\{t\(ios \? 'sites\.openInPlans' : 'desktopDetail\.openInMaps'\)\}/);
  assert.match(fields, /\.bc-desktop-dive-fields--maps-link \{[^}]*color: var\(--bc-code-active\)/);
  assert.match(fields, /href=\{desktopApp \? webMapUrl\(latUdeg, lonUdeg\) : mapsLink\(/);
});

test('the desktop link opens the browser at the dive\'s coordinates', async () => {
  const { webMapUrl, mapsLinks } = await import('../../app/src/lib/maps-link.js');
  assert.equal(webMapUrl(-43380000, 171520000), 'https://www.openstreetmap.org/?mlat=-43.38&mlon=171.52#map=15/-43.38/171.52');
  assert.match(mapsLinks(-43380000, 171520000, 'X').primary, /^geo:-43\.38,171\.52/);
});

test('the Carte tab has no « Voir le site dans Sites » link; the site chooser dialog keeps a margin and a visible scrollbar (27 November 2026)', async () => {
  const { readFileSync } = await import('node:fs');
  const fields = readFileSync(new URL('../../app/src/components/DesktopDiveFields.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(fields, /openSiteLink/);
  const chooser = readFileSync(new URL('../../app/src/components/DiveSiteChooser.svelte', import.meta.url), 'utf8');
  assert.match(chooser, /max-height: min\(720px, calc\(100% - 96px\)\)/);
  assert.match(chooser, /\.bc-dive-site-chooser--columns \{[^}]*overflow: auto;[\s\S]*?&::-webkit-scrollbar \{\s*width: 8px;/);
});

test('phone and tablet: the Carte tab is one card with its header, Site and Coordonnées side by side with labels above (mock-ups detail-onglets-android, android-tablette-detail-onglet-carte-paysage)', () => {
  const fr = JSON.parse(read('app/src/i18n/fr.json'));
  assert.equal(fr.desktopDetail.card.map, 'Carte');
  assert.equal(fr.desktopDetail.openInMaps, 'Ouvrir dans Maps');
  assert.match(fields, /<DesktopEquipmentCard name="map" title=\{t\('desktopDetail\.card\.map'\)\}>\s*\{#snippet icon\(\)\}<Icon name="map"/);
  assert.match(fields, /<div class="bc-desktop-dive-fields--map-fields">\s*<DesktopEditField stacked tall chevron name="site"[\s\S]*?<DesktopEditField stacked boxed kind="text" readonly label=\{t\('desktopDetail\.label\.coordinates'\)\}/);
  assert.match(fields, /\.bc-desktop-dive-fields--map-fields \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*gap: 12px;/);
  assert.match(fields, /\.bc-desktop-dive-fields--map\.bc-desktop-dive-fields--map-card \{[^}]*border-radius: 16px;/);
});

test('Carte: the Site field has a right chevron and opens « Site de la plongée », in both layouts (task 2026-11-27-417)', () => {
  const site = fields.match(/<DesktopEditField [^>]*name="site" kind="site"[^>]*\/>/g) ?? [];
  const inMap = site.filter((s) => / chevron /.test(s) && !/ card /.test(s));
  assert.equal(inMap.length, 2, 'the desktop row and the phone and tablet card');
  for (const s of inMap) assert.match(s, /onpick=\{openSiteChooser\}/);
  const edit = read('app/src/components/DesktopEditField.svelte');
  assert.match(edit, /\{:else if chevron\}<span class="bc-desktop-edit-field--chevron" aria-hidden="true"><Icon name="chevron" size=\{22\} \/><\/span>/);
});

test('Carte: « Copier les coordonnées » copies them as shown and confirms, without opening the field (task 2026-11-27-418)', () => {
  const fr = JSON.parse(read('app/src/i18n/fr.json'));
  assert.equal(fr.desktopDetail.copyCoordinates, 'Copier les coordonnées');
  assert.equal(fr.desktopDetail.coordinatesCopied, 'Coordonnées copiées');
  assert.match(fields, /<button type="button" class="bc-desktop-dive-fields--copy" aria-label=\{t\('desktopDetail\.copyCoordinates'\)\} title=\{t\('desktopDetail\.copyCoordinates'\)\} onclick=\{copyCoordinates\}><Icon name="copy" size=\{20\} \/><\/button>/);
  assert.equal(fields.match(/trailing=\{copyButton\}/g)?.length, 2, 'desktop row and card');
  assert.match(fields, /navigator\.clipboard\.writeText\(formatCoordinates\(c\.latUdeg, c\.lonUdeg\)\);\s*showSnackbar\(t\('desktopDetail\.coordinatesCopied'\)\)/);
  assert.match(fields, /\.bc-desktop-dive-fields--copy \{[^}]*width: 40px;\s*height: 40px;/);
  // Read-only: the value never becomes an editor.
  assert.match(fields, /<DesktopEditField stacked boxed kind="text" readonly /);
});

test('Carte on a tablet: 48 px each side of the map, which keeps 5:3 (task 2026-11-27-419)', () => {
  assert.match(fields, /\.bc-desktop-dive-fields--map\.bc-desktop-dive-fields--map-tablet \{\s*height: auto;\s*margin-inline: 48px;/);
  assert.match(fields, /ratio=\{tabletMap \? 5 \/ 3 : 0\}/);
});

test('Informations: the Site card\'s chevron opens « Site de la plongée », as in the Carte tab (Christian, 27 November 2026)', () => {
  assert.match(fields, /<DesktopEditField card noLead name="site" kind="site"[^>]*onpick=\{openSiteChooser\}[^>]* chevron \/>/);
  assert.doesNotMatch(fields, /openLabel=\{t\('desktopDetail\.openSite'\)\}/);
});
