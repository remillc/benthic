// About, task 2026-11-19-296 (mock-ups apropos-android, android-tablette-apropos-*, bureau-apropos): the new tagline, the
// block « Libre, et votre carnet aussi » with its two buttons and their icons, the desktop paragraph, and the GitHub mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
const about = read('pages/About.svelte');

test('the About texts are the ones of the task, and no text names the logbook file format', () => {
  const fr = langs.fr.about;
  assert.equal(fr.tagline, 'Carnet de plongée libre, bâti sur les bases solides et éprouvées de Subsurface.');
  assert.equal(fr.free.title, 'Libre, et votre carnet aussi');
  assert.equal(fr.free.code, 'L’offre de base reste toujours gratuite. Les apps et leur code sont sur GitHub : chacun peut toujours y télécharger les apps gratuitement, lire le code, le modifier et le partager.');
  assert.equal(fr.free.logbook, 'Exportable en tout temps, votre carnet vous appartient.');
  assert.equal(fr.desktopText, 'Carnet de plongée libre, bâti sur les bases solides et éprouvées de Subsurface. Le code de l’app est sur GitHub : chacun peut le lire, le modifier et le partager. Exportable en tout temps, votre carnet vous appartient.');
  assert.equal(fr.free.github, 'Voir sur GitHub');
  assert.equal(fr.free.export, 'Exporter mon carnet');
  for (const lang of ['fr', 'en']) {
    const a = langs[lang].about;
    for (const text of [a.tagline, a.desktopText, a.free.code, a.free.logbook]) assert.doesNotMatch(text, /ssrf|xml|format|git\b(?!hub)/i, lang);
  }
  assert.doesNotMatch(fr.desktopText, /gratuit/, 'the desktop app is paid');
});

test('the two buttons carry a 20 dp icon 8 dp from the text; the GitHub mark is the supplied file, in the ink colour', () => {
  assert.match(about, /import githubMark from '\.\.\/assets\/brands\/github-invertocat\.svg\?raw'/);
  assert.match(about, /<Icon name="download" size=\{20\}/);
  assert.match(about, /\.od-about--free-actions \{[^}]*flex-direction: column;[^}]*gap: 12px;/s);
  assert.match(about, /height: 48px;[^}]*gap: 8px;/s);
  assert.match(about, /\.od-about--free-desktop \.od-about--free-actions \{[^}]*a,\s*button \{\s*height: 40px;/s);
  assert.match(about, /\.od-about--free-github :global\(path\) \{\s*fill: currentColor;/);
  const svg = read('assets/brands/github-invertocat.svg');
  assert.match(svg, /viewBox="0 0 98 96"/);
  assert.match(svg, /fill="#1F2124"/);
  assert.match(svg, /M41\.4395 69\.3848C28\.8066 67\.8535/);
  assert.match(read('assets/brands/README.md'), /## GitHub/);
});

test('« Tout ce qui est inclus » has its subtitle, 16/24 grey', () => {
  const plus = read('components/FirstLaunchOdPlus.svelte');
  assert.match(plus, /odplus\.all\.subtitle/);
  assert.match(plus, /\.od-plus-all--subtitle \{[^}]*font-size: 16px;\s*line-height: 24px;\s*color: var\(--od-text-2\);/s);
  assert.equal(langs.fr.odplus.all.subtitle, 'Tout ce qui est inclus dans l’offre Benthic+.');
});
