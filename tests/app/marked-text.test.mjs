// Git help pages (task 2026-11-16-253): [kbd] and [code] marks in the steps, and their colours.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseMarked, stripMarked } from '../../app/src/lib/marked-text.js';

const read = (p) => fs.readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8');
const catalogs = { fr: JSON.parse(read('src/i18n/fr.json')), en: JSON.parse(read('src/i18n/en.json')) };

test('parseMarked: text, kbd and code segments', () => {
  assert.deepEqual(parseMarked('Tap [kbd]+[/kbd], then [code]a.git[/code].'), [
    { type: 'text', text: 'Tap ' },
    { type: 'kbd', text: '+' },
    { type: 'text', text: ', then ' },
    { type: 'code', text: 'a.git' },
    { type: 'text', text: '.' },
  ]);
  assert.deepEqual(parseMarked('plain'), [{ type: 'text', text: 'plain' }]);
  assert.deepEqual(parseMarked(''), []);
});

test('parseMarked: unbalanced, unknown or nested marks stay text, and HTML is never interpreted', () => {
  assert.equal(stripMarked('a [kbd]b'), 'a [kbd]b');
  assert.equal(stripMarked('a [/kbd] b [bold]c[/bold]'), 'a [/kbd] b [bold]c[/bold]');
  assert.deepEqual(parseMarked('[kbd]<b>x</b>[/kbd]'), [{ type: 'kbd', text: '<b>x</b>' }]);
  assert.deepEqual(parseMarked('[kbd]a[code]b[/code][/kbd]').map((s) => s.type), ['text', 'code', 'text']);
});

/** The step texts of both help pages: [key, text]. */
function steps(lang) {
  const out = [];
  for (const group of ['repoHelp', 'tokenHelp']) {
    for (const [host, node] of Object.entries(catalogs[lang][group])) {
      if (typeof node !== 'object' || node === null) continue;
      for (const [k, v] of Object.entries(node)) {
        if (/^s\d+$/.test(k)) out.push([`${group}.${host}.${k}`, v]);
      }
    }
  }
  return out;
}

for (const lang of ['fr', 'en']) {
  test(`steps (${lang}): marks balanced, each step has a label or a value, no bold`, () => {
    const list = steps(lang);
    assert.equal(list.length, 6 + 7 + 6 + 9 + 7 + 7, 'all the steps of the two pages');
    for (const [key, text] of list) {
      for (const tag of ['kbd', 'code']) {
        assert.equal((text.match(new RegExp(String.raw`\[${tag}\]`, 'g')) ?? []).length, (text.match(new RegExp(String.raw`\[/${tag}\]`, 'g')) ?? []).length, key);
      }
      assert.equal(/\[(kbd|code)\]/.test(stripMarked(text)), false, `${key}: nothing left once marks are read`);
      assert.ok(parseMarked(text).some((s) => s.type === 'kbd'), `${key}: an interface label`);
      assert.doesNotMatch(text, /<|\*\*|\[b\]|\[strong\]/, `${key}: no bold, no HTML`);
    }
  });
}

test('steps: the example values are code (name, address, token name)', () => {
  for (const lang of ['fr', 'en']) {
    for (const [key, text] of steps(lang)) {
      const code = parseMarked(text).filter((s) => s.type === 'code').map((s) => s.text);
      if (/\.git\b/.test(text)) assert.ok(code.some((c) => /^https:\/\/.+\.git$/.test(c)), key);
      if (/carnet-plongee/.test(text.replace(/https:\/\/\S+/, ''))) assert.ok(code.includes('carnet-plongee'), key);
      if (/(par exemple|for example) \[code\]OpenDives/.test(text)) assert.ok(code.includes('OpenDives'), key);
    }
  }
});

test('steps (fr): a no-break space before the colon that follows a label', () => {
  for (const [key, text] of steps('fr')) {
    assert.doesNotMatch(text, /\[\/kbd\] :/, key);
    if (/\[\/kbd\]\s*:/.test(text)) assert.match(text, /\[\/kbd\] :/, key);
  }
});

test('the two pages render the steps through MarkedText, and the component sets no bold', () => {
  for (const page of ['RepositoryHelp', 'TokenHelp']) assert.match(read(`src/pages/${page}.svelte`), /<MarkedText text=\{t\(key\)\} \/>/);
  const component = read('src/components/MarkedText.svelte');
  assert.doesNotMatch(component, /\{@html/);
  assert.equal((component.match(/font-weight: 400/g) ?? []).length, 2);
  assert.match(component, /var\(--od-kbd-background\)/);
  assert.match(component, /var\(--od-code-background\)/);
});

// Colours: WCAG relative luminance of the tokens of theme.css, light and dark.
const css = read('src/theme.css');
const darkAt = css.indexOf('  html.dark {');
function token(name, dark) {
  const re = new RegExp(String.raw`${name}:\s*(#[0-9A-Fa-f]{6})`);
  const m = (dark ? css.slice(darkAt) : css).match(re);
  assert.ok(m, `${name} ${dark ? 'dark' : 'light'}`);
  return m[1];
}
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

for (const dark of [false, true]) {
  test(`kbd and code tokens keep 4.5:1 (${dark ? 'dark' : 'light'})`, () => {
    assert.ok(ratio(token('--od-kbd-text', dark), token('--od-kbd-background', dark)) >= 4.5);
    assert.ok(ratio(token('--od-code-text', dark), token('--od-code-background', dark)) >= 4.5);
    // The chip sits on the card (--od-surface): its text stays readable there too.
    assert.ok(ratio(token('--od-kbd-text', dark), token('--od-surface', dark)) >= 4.5);
  });
}

test('light values are those of the mock-ups', () => {
  assert.equal(token('--od-kbd-background', false), '#F1EFEA');
  assert.equal(token('--od-kbd-outline', false), '#D3D0C8');
  assert.equal(token('--od-code-background', false), '#EAF0F7');
  assert.equal(token('--od-code-text', false), '#1F3F66');
});

test('token help (tasks 254, 255): each host has its own intro, note, link text and steps, in both languages', () => {
  for (const lang of ['fr', 'en']) {
    for (const id of ['github', 'gitlab', 'codeberg']) {
      const h = catalogs[lang].tokenHelp[id];
      for (const k of ['name', 'intro', 'open', 'note']) assert.equal(typeof h[k], 'string', `${lang} ${id} ${k}`);
    }
    const s5 = catalogs[lang].tokenHelp.github.s5;
    assert.deepEqual(parseMarked(s5).filter((x) => x.type === 'kbd').map((x) => x.text), ['Expiration', 'No expiration']);
    assert.doesNotMatch(catalogs[lang].tokenHelp.github.intro, /expir|date/i);
  }
  const page = read('src/pages/TokenHelp.svelte');
  assert.match(page, /https:\/\/gitlab\.com\/-\/user_settings\/personal_access_tokens/);
  assert.match(page, /https:\/\/codeberg\.org\/user\/settings\/applications/);
});

test('repository help (task 256): French labels for GitLab and Codeberg, English ones for GitHub and in en.json', () => {
  const kbd = (lang, id) => Object.entries(catalogs[lang].repoHelp[id]).filter(([k]) => /^s\d+$/.test(k)).flatMap(([, v]) => parseMarked(v).filter((x) => x.type === 'kbd').map((x) => x.text));
  assert.ok(kbd('fr', 'gitlab').includes('Nouveau projet/dépôt'));
  assert.ok(kbd('fr', 'gitlab').includes('Cloner avec HTTPS'));
  assert.ok(kbd('fr', 'codeberg').includes('Rendre le dépôt privé'));
  assert.ok(kbd('fr', 'github').includes('New repository'));
  assert.ok(kbd('en', 'gitlab').includes('New project/repository'));
  assert.ok(kbd('en', 'codeberg').includes('Make repository private'));
  assert.equal(catalogs.fr.repoHelp.gitlab.page, 'Nouveau projet');
  assert.equal(catalogs.fr.repoHelp.codeberg.page, 'Nouveau dépôt');
  assert.match(catalogs.fr.repoHelp.github.intro, /GitHub n’existe qu’en anglais : les libellés ci-dessous sont ceux de son interface\.$/);
  assert.match(catalogs.fr.tokenHelp.github.intro, /GitHub n’existe qu’en anglais : les libellés ci-dessous sont ceux de son interface\.$/);
  for (const id of ['gitlab', 'codeberg']) assert.match(catalogs.fr.repoHelp[id].intro, /Les libellés ci-dessous sont ceux de l’interface française du site\.$/);
});
