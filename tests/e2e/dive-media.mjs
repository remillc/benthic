// SPDX-License-Identifier: GPL-2.0
// « Photos et vidéos » of the dive detail (task 2026-11-23-359), run by tests/e2e/navigation.mjs (`--dive-media-only`): the
// section is hidden for a free account and the demo, shown for Benthic+ with thumbnails, a play disc and length on a video,
// the « Ajouter » tile, the green cloud line and « Tout voir »; the gallery opens and an original shows. The media folder is
// the desktop's (desktop/media.cjs) through the stand-in bridge, the files are made in the page (a PNG from a canvas, a short
// WebM from a recorder), the server is absent (the uploads wait, quietly). With BC_SHOTS=<folder> each state is saved as a
// screenshot, light and dark, for a look against the task's description.
// BC_THEME=ios gives the iPhone look.

/** @param {object} h the harness of navigation.mjs */
export async function diveMediaFlows(h) {
  const { openTab, makePlus, sleep, expect, shot } = h;
  const suffix = process.env.BC_THEME === 'ios' ? 'ios' : 'android';

  /** Chooses files in the section's input: made in the page, handed over as the picker would. */
  const choose = (tab, photos, videos) =>
    tab.run(
      async (photos, videos) => {
        const files = [];
        for (let i = 0; i < photos; i++) {
          const c = document.createElement('canvas');
          c.width = 640 + i * 40;
          c.height = 480;
          const g = c.getContext('2d');
          const grad = g.createLinearGradient(0, 0, c.width, c.height);
          grad.addColorStop(0, ['#2f6fb0', '#1c8a6e', '#b5651d'][i % 3]);
          grad.addColorStop(1, '#0b2a44');
          g.fillStyle = grad;
          g.fillRect(0, 0, c.width, c.height);
          g.fillStyle = '#fff';
          g.font = '64px sans-serif';
          g.fillText(`Photo ${i + 1}`, 40, 120);
          const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
          files.push(new File([blob], `photo-${i + 1}.png`, { type: 'image/png', lastModified: Date.now() - i * 86400000 }));
        }
        for (let i = 0; i < videos; i++) {
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 240;
          const g = c.getContext('2d');
          const recorder = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
          const chunks = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          const done = new Promise((r) => (recorder.onstop = r));
          recorder.start();
          for (let f = 0; f < 20; f++) {
            g.fillStyle = `hsl(${f * 12}, 70%, 40%)`;
            g.fillRect(0, 0, 320, 240);
            await new Promise((r) => setTimeout(r, 70));
          }
          recorder.stop();
          await done;
          files.push(new File(chunks, `video-${i + 1}.webm`, { type: 'video/webm', lastModified: Date.now() }));
        }
        const input = document.querySelector('.bc-dive-media--file');
        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return files.length;
      },
      photos,
      videos,
    );

  const read = (tab) =>
    tab.run(() => {
      const root = document.querySelector('.bc-dive-media');
      if (!root) return { present: false };
      const tiles = [...root.querySelectorAll('.bc-dive-media--tile')];
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
      };
      const add = root.querySelector('.bc-dive-media--add');
      return {
        present: true,
        title: root.querySelector('.bc-dive-media--title')?.textContent.trim(),
        tiles: tiles.length,
        tileBox: box(tiles[0]),
        loaded: tiles.filter((t) => t.querySelector('img')?.naturalWidth > 0).length,
        discs: root.querySelectorAll('.bc-dive-media--play').length,
        durations: [...root.querySelectorAll('.bc-dive-media--duration')].map((e) => e.textContent.trim()),
        add: add ? { text: add.textContent.trim(), ...box(add), dashed: getComputedStyle(add).borderTopStyle } : null,
        summary: (root.querySelector('.bc-dive-media--summary')?.firstChild?.textContent ?? '').replace(/[\s  ]+/g, ' ').trim(),
        all: root.querySelector('.bc-dive-media--all')?.textContent.trim() ?? null,
        old: document.body.textContent.includes('seule leur référence'),
        radius: tiles[0] ? getComputedStyle(tiles[0]).borderTopLeftRadius : '',
      };
    });

  const openDive = async (tab, desktop) => {
    if (desktop) {
      await tab.run(() => document.querySelector('.bc-desktop-logbook--row')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    } else {
      const box = await tab.run(() => {
        const a = document.querySelector('.page-current a[href^="/dives/"], .page-master a[href^="/dives/"]');
        const r = a?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
      });
      await tab.tapAt(box.x, box.y);
    }
    await sleep(1500);
  };
  const scrollToSection = (tab) =>
    tab.run(() => {
      const root = document.querySelector('.bc-dive-media') ?? document.querySelector('.bc-dive-detail--end');
      root?.scrollIntoView({ block: 'center' });
      return 1;
    });
  const configs = [
    { name: 'phone', w: 390, h: 844, mobile: true, desktop: false },
    { name: 'tablet', w: 1280, h: 800, mobile: false, desktop: false },
    { name: 'desktop', w: 1400, h: 900, mobile: false, desktop: true },
  ];
  for (const c of configs) {
    console.log(`Dive media, ${c.name}: free account, then Benthic+`);
    // Free: the demo and the free version never see the section, whatever the setting says.
    let tab = await openTab(c.w, c.h, c.mobile, false, c.desktop, { theme: process.env.BC_THEME || 'md' });
    await tab.send('Emulation.setLocaleOverride', { locale: 'fr-FR' }).catch(() => {});
    await sleep(800);
    await openDive(tab, c.desktop);
    await scrollToSection(tab);
    expect(`${c.name}: free account, the section is hidden`, { present: false }, await read(tab));
    if (process.env.BC_SHOTS) await shot(tab, `359-${c.name}-${suffix}-free`);
    tab.ws.close();

    // Benthic+.
    tab = await openTab(c.w, c.h, c.mobile, false, c.desktop, { theme: process.env.BC_THEME || 'md' });
    await tab.send('Emulation.setLocaleOverride', { locale: 'fr-FR' }).catch(() => {});
    await makePlus(tab);
    // The previous device's pictures are forgotten: the page storage is shared by the tabs of this browser.
    await tab.run(async () => {
      const { store } = (await import('/src/lib/profile.svelte.js')).accountDataDeps();
      for (const path of await store.list('media/')) await store.remove(path);
      const m = await import('/src/lib/dive-media.svelte.js');
      m.refreshMedia();
      return 1;
    });
    await sleep(800);
    await openDive(tab, c.desktop);
    await scrollToSection(tab);
    await sleep(500);
    const empty = await read(tab);
    expect(`${c.name}: Benthic+, the section and its « Ajouter » tile`, { present: true, title: 'Photos et vidéos', tiles: 0, old: false }, empty);
    expect(`${c.name}: the « Ajouter » tile is 76 dp and dashed`, { w: 76, h: 76, dashed: 'dashed', text: 'Ajouter' }, empty.add ?? {});
    expect(`${c.name}: nothing yet, the line says so`, { summary: 'Aucune photo ni vidéo, sur tous vos appareils', all: null }, empty);

    await choose(tab, 3, 1);
    await sleep(4000);
    await scrollToSection(tab);
    const full = await read(tab);
    expect(`${c.name}: three photos and a video, as thumbnails of 76 dp with 12 dp corners`, { tiles: 4, loaded: 4, discs: 1, radius: '12px' }, full);
    expect(`${c.name}: a tile is 76 dp`, { w: 76, h: 76 }, full.tileBox ?? {});
    expect(`${c.name}: the video shows its length at the bottom right`, { n: 1, ok: /^0:\d\d$/.test(full.durations[0] ?? '') }, { n: full.durations.length, ok: /^0:\d\d$/.test(full.durations[0] ?? '') });
    expect(`${c.name}: the cloud line`, { summary: '3 photos et 1 vidéo, sur tous vos appareils', all: 'Tout voir' }, full);
    if (process.env.BC_SHOTS) await shot(tab, `359-${c.name}-${suffix}-plus`);

    // The thumbnails are small JPEGs of their own, not the originals.
    const sizes = await tab.run(() => [...document.querySelectorAll('.bc-dive-media--image')].map((i) => Math.max(i.naturalWidth, i.naturalHeight)));
    expect(`${c.name}: thumbnails are at most 256 px`, { ok: sizes.length === 4 && sizes.every((s) => s > 0 && s <= 256) }, { ok: sizes.length === 4 && sizes.every((s) => s > 0 && s <= 256), sizes });

    // « Tout voir »: the gallery.
    await tab.run(() => document.querySelector('.bc-dive-media--all').click());
    await sleep(1200);
    const gallery = await tab.run(() => ({ cells: document.querySelectorAll('.bc-dive-gallery--cell').length, title: document.querySelector('.bc-dive-gallery--title')?.textContent.trim() }));
    expect(`${c.name}: « Tout voir » opens the gallery of the dive`, { cells: 4, title: 'Photos et vidéos' }, gallery);
    if (process.env.BC_SHOTS) await shot(tab, `359-${c.name}-${suffix}-gallery`);
    await tab.run(() => document.querySelector('.bc-dive-gallery--cell').click());
    await sleep(1500);
    const original = await tab.run(() => {
      const img = document.querySelector('.bc-dive-gallery--original');
      return { shown: !!img, width: img?.naturalWidth ?? 0 };
    });
    expect(`${c.name}: a tap opens the original (the 640 px photo)`, { shown: true, width: 640 }, original);
    await tab.run(() => document.querySelector('.bc-dive-gallery--close').click());
    await tab.run(() => document.querySelector('.bc-dive-gallery--close').click());
    await sleep(800);

    // Dark mode: the dark tokens.
    await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await tab.run(async () => {
      const s = await import('/src/lib/settings.svelte.js');
      s.setAppSetting('theme', 'dark');
      return 1;
    }).catch(() => {});
    await sleep(1200);
    await scrollToSection(tab);
    const dark = await tab.run(() => {
      const css = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
      return { card: css('.bc-dive-media--card', 'backgroundColor'), cloud: css('.bc-dive-media--cloud', 'color'), all: css('.bc-dive-media--all', 'color') };
    });
    expect(`${c.name}: dark mode uses the dark tokens (not the light card, green and link)`, { card: true, cloud: true, all: true }, {
      card: dark.card !== 'rgb(255, 255, 255)',
      cloud: dark.cloud !== 'rgb(30, 107, 58)',
      all: dark.all !== 'rgb(31, 92, 153)',
    });
    if (process.env.BC_SHOTS) await shot(tab, `359-${c.name}-${suffix}-plus-dark`);
    await tab.run(async () => (await import('/src/lib/settings.svelte.js')).setAppSetting('theme', 'system')).catch(() => {});
    tab.ws.close();
  }
}
