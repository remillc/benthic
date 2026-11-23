// SPDX-License-Identifier: GPL-2.0
// « Photos et vidéos » of the dive detail (task 2026-11-23-359), run by tests/e2e/navigation.mjs (`--dive-media-only`): the
// section is hidden for a free account and the demo, shown for Benthic+ with thumbnails, a play disc and length on a video,
// the « Ajouter » tile, the green cloud line and « Tout voir »; the gallery opens and an original shows. The media folder is
// the desktop's (desktop/media.cjs) through the stand-in bridge, the files are made in the page (a PNG from a canvas, a short
// WebM from a recorder), the server is absent (the uploads wait, quietly). With BC_SHOTS=<folder> each state is saved as a
// screenshot, light and dark, for a look against the task's description.
// BC_THEME=ios gives the iPhone look.
// Tasks 2026-11-23-367 and 368 (the gallery, the selection, the remove dialog, the viewer with its swipe and its video controls) run
// here on phone, tablet and desktop, in the Android look and with BC_THEME=ios in the iPhone and iPad look.

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
          if (i === 0) {
            // A JPEG with an EXIF block: Make, Model, DateTimeOriginal (little-endian TIFF, APP1).
            const jpeg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg'))).arrayBuffer());
            const asc = (t) => [...t].map((ch) => ch.charCodeAt(0)).concat(0);
            const u16 = (v) => [v & 255, v >> 8];
            const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24];
            const make = asc('OLYMPUS CORPORATION');
            const model = asc('TG-6');
            const date = asc('2014:04:02 10:11:00');
            const ifd0At = 8;
            const ifd0Size = 2 + 3 * 12 + 4;
            const subAt = ifd0At + ifd0Size;
            const dataAt = subAt + 2 + 12 + 4;
            const entry = (tag, bytes, at) => [...u16(tag), ...u16(2), ...u32(bytes.length), ...u32(at)];
            const tiff = [0x49, 0x49, ...u16(42), ...u32(8), ...u16(3), ...entry(0x010f, make, dataAt), ...entry(0x0110, model, dataAt + make.length), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(subAt), ...u32(0), ...u16(1), ...entry(0x9003, date, dataAt + make.length + model.length), ...u32(0), ...make, ...model, ...date];
            const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
            const seg = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
            files.push(new File([new Uint8Array([0xff, 0xd8, ...seg, ...jpeg.slice(2)])], 'photo-1-exif.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
            continue;
          }
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
  const isIos = process.env.BC_THEME === 'ios';
  const flat = (s) => String(s ?? '').replace(/[\s  ]+/g, ' ').trim();

  /** What the gallery shows. */
  const readGallery = (tab) =>
    tab.run(() => {
      const root = document.querySelector('.bc-dive-gallery .bc-dive-gallery--page');
      if (!root) return { present: false };
      const cells = [...root.querySelectorAll('.bc-dive-gallery--cell')];
      const gs = getComputedStyle(root.querySelector('.bc-dive-gallery--grid'));
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
      };
      const fab = root.querySelector('.bc-dive-gallery--fab');
      const text = (sel) => root.querySelector(sel)?.textContent.replace(/[\s  ]+/g, ' ').trim() ?? null;
      return {
        present: true,
        cells: cells.length,
        columns: gs.gridTemplateColumns.split(' ').length,
        gap: gs.columnGap,
        title: text('.bc-dive-gallery--large') ?? text('.bc-dive-gallery--bar-title'),
        subtitle: text('.bc-dive-gallery--subtitle') ?? text('.bc-dive-gallery--bar-subtitle'),
        line: text('.bc-dive-gallery--line'),
        depths: cells.map((c) => c.querySelector('.bc-dive-gallery--depth')?.textContent.trim() ?? ''),
        discs: root.querySelectorAll('.bc-dive-gallery--play').length,
        durations: root.querySelectorAll('.bc-dive-gallery--duration').length,
        fab: fab ? { ...box(fab), radius: getComputedStyle(fab).borderTopLeftRadius, bg: getComputedStyle(fab).backgroundColor } : null,
        cell: box(cells[0]),
        barBg: getComputedStyle(root.querySelector('.bc-dive-gallery--bar') ?? root).backgroundColor,
        selecting: root.classList.contains('bc-dive-gallery--selecting'),
        marks: root.querySelectorAll('.bc-dive-gallery--mark').length,
        marksOn: root.querySelectorAll('.bc-dive-gallery--mark-on').length,
        selectedTitle: text('.bc-dive-gallery--bar-count') ?? text('.bc-dive-gallery--nav-title'),
        toolbar: text('.bc-dive-gallery--tool-text'),
        headButtons: [...root.querySelectorAll('.bc-dive-gallery--head button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
        barButtons: [...root.querySelectorAll('.bc-dive-gallery--bar button, .bc-dive-gallery--nav button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
        hint: text('.bc-dive-gallery--hint'),
      };
    });

  const readViewer = (tab) =>
    tab.run(() => {
      const v = document.querySelector('.bc-media-viewer');
      if (!v || !v.querySelector('.bc-media-viewer--root')) return { open: false };
      const text = (sel) => v.querySelector(sel)?.textContent.replace(/[\s  ]+/g, ' ').trim() ?? null;
      const slides = [...v.querySelectorAll('.bc-media-viewer--slide')];
      const track = v.querySelector('.bc-media-viewer--track');
      const media = v.querySelector('.bc-media-viewer--slide img.bc-media-viewer--media:not(.bc-media-viewer--preview)');
      const top = v.querySelector('.bc-media-viewer--top');
      const bottom = v.querySelector('.bc-media-viewer--bottom');
      const video = v.querySelector('video');
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
      };
      return {
        open: true,
        slides: slides.length,
        position: text('.bc-media-viewer--count') ?? text('.bc-media-viewer--ios-count') ?? text('.bc-media-viewer--desk-title'),
        iosDate: text('.bc-media-viewer--ios-date'),
        line: text('.bc-media-viewer--line'),
        camera: text('.bc-media-viewer--camera'),
        dots: v.querySelectorAll('.bc-media-viewer--dot').length,
        dotsOn: v.querySelectorAll('.bc-media-viewer--dot-on').length,
        scrolled: track ? Math.round(track.scrollLeft / track.clientWidth) : -1,
        loaded: media?.naturalWidth ?? 0,
        barsHidden: v.querySelector('.bc-media-viewer--root')?.classList.contains('bc-media-viewer--hidden'),
        topOpacity: top ? getComputedStyle(top).opacity : null,
        steps: [...v.querySelectorAll('.bc-media-viewer--step')].map((b) => ({ label: b.getAttribute('aria-label'), ...box(b), disabled: b.disabled })),
        strip: v.querySelectorAll('.bc-media-viewer--thumb').length,
        stripOn: v.querySelectorAll('.bc-media-viewer--thumb-on').length,
        topButtons: [...(top?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
        toolButtons: [...v.querySelectorAll('.bc-media-viewer--toolbar button')].map((b) => b.getAttribute('aria-label')),
        controls: v.querySelector('.bc-media-viewer--controls')
          ? {
              play: box(v.querySelector('.bc-media-viewer--play')),
              playLabel: v.querySelector('.bc-media-viewer--play').getAttribute('aria-label'),
              times: [...v.querySelectorAll('.bc-media-viewer--time')].map((e) => e.textContent.trim()),
              seek: !!v.querySelector('.bc-media-viewer--seek'),
              mute: v.querySelector('.bc-media-viewer--mute')?.getAttribute('aria-label'),
            }
          : null,
        disc: !!v.querySelector('.bc-media-viewer--disc'),
        video: video ? { paused: video.paused, muted: video.muted } : null,
        bottom: box(bottom),
      };
    });

  /** ⋮ of the viewer, touched where it is. */
  const viewerOpenMenu = async (tab) => {
    const at = await tab.run(() => {
      const r = document.querySelector('.bc-media-viewer--top button[aria-label="Plus d’options"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await tab.tapAt(at.x, at.y);
    await sleep(500);
    return tab.run(() => [...document.querySelectorAll('.bc-row-menu [role="option"]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  };

  // `expect` compares values with ===: arrays are written as text.
  const norm = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x && typeof x === 'object' ? JSON.stringify(x) : x])) : Array.isArray(v) ? JSON.stringify(v) : v);
  const check = (label, expected, got) => expect(label, norm(expected), norm(got));

  /** The state of the gallery of a dive for one device look: phone, tablet or desktop; Android or iPhone and iPad. */
  async function galleryFlows(tab, c) {
    const name = c.name;
    // The desktop pattern is the same whatever the look of the phone and tablet.
    const ios = isIos && !c.desktop;
    const columns = c.desktop ? 5 : c.mobile ? 3 : 6;
    const gap = c.desktop ? '6px' : ios ? '2px' : c.mobile ? '3px' : '4px';
    const shotName = (what) => `367-${name}-${suffix}-${what}`;

    // The pictures of the dive: one JPEG with an EXIF block gives its time and camera, one photo is put inside the dive so that
    // the profile gives it a depth, the others fall outside it.
    await tab.run(async () => {
      const { store } = (await import('/src/lib/profile.svelte.js')).accountDataDeps();
      const [path] = await store.list('media/');
      const file = await store.read(path);
      const start = new Date(file.diveId);
      const naive = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
      const inside = file.items.find((i) => i.mime.startsWith('image/') && !i.name.includes('exif'));
      inside.takenAt = naive(new Date(start.getTime() + 5 * 60000));
      await store.trackedBatch({ writes: [[path, file]] });
      (await import('/src/lib/dive-media.svelte.js')).refreshMedia();
      return 1;
    });
    await sleep(600);

    // « Tout voir ».
    await tab.run(() => document.querySelector('.bc-dive-media--all').click());
    await sleep(1500);
    const g = await readGallery(tab);
    check(`${name}: « Tout voir » opens the gallery, ${columns} columns, gaps of ${gap}`, { present: true, cells: g.cells >= 4, columns, gap, title: 'Photos et vidéos' }, { present: g.present, cells: g.cells >= 4, columns: g.columns, gap: g.gap, title: g.title });
    check(`${name}: the line under the title reads number, site and date`, { ok: true }, { ok: /^(N° \d+ · )?.+ · \d/.test(g.subtitle ?? ''), subtitle: g.subtitle });
    check(`${name}: the cloud line gives the counts and the size`, { ok: true }, { ok: /^\d+ photos? et 1 vidéo, sur tous vos appareils · \d+ Mo$/.test(g.line ?? ''), line: g.line });
    check(`${name}: a video shows its play disc and length`, { discs: 1, durations: 1 }, { discs: g.discs, durations: g.durations });
    const withDepth = g.depths.filter(Boolean);
    check(`${name}: the depth of the profile is drawn on the picture taken inside the dive, and only on it`, { n: 1, ok: true }, { n: withDepth.length, ok: /^\d+[,.]\d/.test(withDepth[0] ?? ''), depths: g.depths });
    {
      // Android: the FAB, 56 dp, 16 dp corners, #EBEAE5.
      if (!ios && !c.desktop) check(`${name}: the « Ajouter » FAB is 56 dp with 16 dp corners and the tonal colour`, { w: 56, h: 56, radius: '16px', bg: 'rgb(235, 234, 229)' }, g.fab ?? {});
    }
    if (c.desktop) {
      check(`${name}: the header holds « + Ajouter » and ✕; the hint is under the grid`, { head: ['Ajouter', 'Fermer (Échap)'], hint: 'Double-clic pour ouvrir · Ctrl+clic pour sélectionner plusieurs éléments' }, { head: g.headButtons, hint: g.hint });
    }
    if (process.env.BC_SHOTS) await shot(tab, shotName('gallery'));

    // The FAB (or +) opens the same picker as the section: the input is the section's.
    const picker = await tab.run(() => {
      const input = document.querySelector('.bc-dive-media--file');
      let opened = false;
      input.addEventListener('click', (e) => ((opened = true), e.preventDefault()), { once: true });
      const button = document.querySelector('.bc-dive-gallery--fab, .bc-dive-gallery--add, .bc-dive-gallery--nav-plus');
      button?.click();
      return { button: !!button, opened };
    });
    check(`${name}: the add button opens the picker`, { button: true, opened: true }, picker);

    // Selection.
    const cellBox = async (index) => tab.run((i) => {
      const r = document.querySelectorAll('.bc-dive-gallery--cell')[i].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, index);
    if (c.desktop) {
      await tab.run(() => {
        const cells = document.querySelectorAll('.bc-dive-gallery--cell');
        cells[0].click();
        cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      });
    } else if (ios) {
      await tab.run(() => [...document.querySelectorAll('.bc-dive-gallery--nav-text')].find((b) => b.textContent.trim() === 'Sélectionner').click());
      await sleep(300);
      await tab.run(() => {
        const cells = document.querySelectorAll('.bc-dive-gallery--cell');
        cells[0].click();
        cells[1].click();
      });
    } else {
      // A long press on a thumbnail.
      const b0 = await cellBox(0);
      await tab.touch('touchStart', b0.x, b0.y);
      await sleep(700);
      await tab.touch('touchEnd', b0.x, b0.y);
      await sleep(300);
      const b1 = await cellBox(1);
      await tab.tapAt(b1.x, b1.y);
    }
    await sleep(500);
    const s = await readGallery(tab);
    check(`${name}: two thumbnails are selected`, { selecting: true, marksOn: 2 }, { selecting: s.selecting, marksOn: s.marksOn });
    if (!c.desktop) check(`${name}: the bar says « 2 sélectionnées »`, { selectedTitle: '2 sélectionnées' }, { selectedTitle: s.selectedTitle });
    if (ios && !c.desktop) check(`${name}: the toolbar says « 2 photos sélectionnées »`, { toolbar: '2 photos sélectionnées' }, { toolbar: s.toolbar });
    if (c.desktop) check(`${name}: with a selection, Partager and Retirer replace « Ajouter »`, { head: ['Partager', 'Retirer', 'Fermer (Échap)'] }, { head: s.headButtons.map((x) => x.trim()) });
    else if (!ios) check(`${name}: the bar has ✕, Partager and Retirer; no FAB`, { buttons: ['Annuler la sélection', 'Partager', 'Retirer'], fab: null }, { buttons: s.barButtons, fab: s.fab });
    if (!ios && !c.desktop) check(`${name}: the selection bar is tinted`, { bg: 'rgb(212, 226, 242)' }, { bg: s.barBg });
    if (process.env.BC_SHOTS) await shot(tab, shotName('selection'));

    // Retirer asks first.
    if (c.desktop) await tab.run(() => [...document.querySelectorAll('.bc-dive-gallery--head button')].find((b) => b.textContent.trim() === 'Retirer').click());
    else if (ios) await tab.run(() => document.querySelector('.bc-dive-gallery--tool[aria-label="Retirer"]').click());
    else await tab.run(() => document.querySelector('.bc-dive-gallery--bar button[aria-label="Retirer"]').click());
    await sleep(700);
    const dialog = await tab.run(() => {
      const sheet = document.querySelector('.actions-modal.modal-in');
      const d = document.querySelector('.bc-md3-dialog');
      const flatText = (el) => el?.textContent.replace(/[\s  ]+/g, ' ').trim() ?? null;
      return {
        kind: sheet ? 'sheet' : d ? 'dialog' : 'none',
        title: flatText(d?.querySelector('h2')),
        text: flatText(d?.querySelector('.bc-md3-dialog--text')) ?? flatText(sheet?.querySelector('.actions-label')),
        buttons: [...(d ?? sheet ?? document).querySelectorAll(d ? '.bc-md3-dialog--actions button' : '.actions-button')].map((b) => flatText(b)),
        confirmColor: d ? getComputedStyle(d.querySelector('.bc-dive-media-remove--confirm')).color : null,
        closeButton: !!d?.querySelector('.bc-md3-dialog--close'),
      };
    });
    if (ios) {
      check(`${name}: Retirer opens an action sheet with the explanation, the red action and Annuler`, { kind: 'sheet', buttons: ['Retirer 2 photos de la plongée', 'Annuler'], text: 'Elles ne seront plus liées à la plongée, sur aucun de vos appareils. Les fichiers restent dans la photothèque où vous les avez prises.' }, { kind: dialog.kind, buttons: dialog.buttons.filter((x) => x !== dialog.text), text: dialog.text });
    } else {
      check(`${name}: Retirer opens a basic dialog with its explanation and two buttons`, { kind: 'dialog', title: 'Retirer 2 photos de la plongée ?', text: 'Elles ne seront plus liées à la plongée, sur aucun de vos appareils. Les fichiers restent dans la galerie de l’appareil où vous les avez prises.', buttons: ['Annuler', 'Retirer'], closeButton: false, confirmColor: 'rgb(179, 38, 30)' }, dialog);
    }
    if (process.env.BC_SHOTS) await shot(tab, shotName('remove-dialog'));
    // Annuler leaves everything as it was.
    if (ios) await tab.run(() => [...document.querySelectorAll('.actions-button')].find((b) => b.textContent.trim() === 'Annuler').click());
    else await tab.run(() => document.querySelector('.bc-md3-dialog--actions button').click());
    await sleep(600);
    check(`${name}: Annuler keeps the pictures`, { cells: g.cells }, { cells: (await readGallery(tab)).cells });

    // The system Back clears the selection first.
    if (!c.desktop) {
      await tab.run(() => window.dispatchEvent(new Event('bc:back')));
      await sleep(500);
      const afterBack = await readGallery(tab);
      check(`${name}: Back ends the selection and leaves the gallery open`, { present: true, selecting: false }, { present: afterBack.present, selecting: afterBack.selecting });
    }

    // Open the first picture (the one with the EXIF block is the earliest): touch on a phone, double click on the desktop.
    if (c.desktop) await tab.run(() => document.querySelectorAll('.bc-dive-gallery--cell')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    else {
      const b = await cellBox(0);
      await tab.tapAt(b.x, b.y);
    }
    await sleep(1800);
    const v = await readViewer(tab);
    check(`${name}: the viewer opens on the first picture: « 1 sur N », its original loaded`, { open: true, n: g.cells, first: true, loaded: true }, { open: v.open, n: v.slides, first: /^1 sur \d+$/.test(flat(v.position).split(' · ')[0]), loaded: v.loaded > 0 });
    if (ios) {
      check(`${name}: the iOS bar shows the count and the date under it; the toolbar Partager, camera, trash`, { tools: ['Partager', 'Retirer de la plongée'], camera: 'Olympus TG-6', date: true }, { tools: v.toolButtons, camera: v.camera, date: /2014/.test(v.iosDate ?? '') });
    } else if (c.desktop) {
      check(`${name}: the desktop bar reads the position, the time taken and the camera`, { ok: true, buttons: ['Fermer (Échap)', 'Partager', 'Retirer de la plongée', 'Plus d’options'] }, { ok: /^1 sur \d+ · .*2014.* · Olympus TG-6$/.test(v.position ?? ''), buttons: v.topButtons, position: v.position });
      check(`${name}: a strip of 64 px thumbnails, the current one outlined`, { strip: v.slides, on: 1 }, { strip: v.strip, on: v.stripOn });
    } else {
      check(`${name}: the line under the picture says when it was taken and with what camera`, { ok: true }, { ok: /2014.*10.*11.* · Olympus TG-6$/.test(v.line ?? ''), line: v.line });
      check(`${name}: the top bar has back, the count, Partager and ⋮`, { buttons: ['Fermer', 'Partager', 'Plus d’options'] }, { buttons: v.topButtons });
    }
    if (c.desktop || !c.mobile || ios) {
      // ‹ › on each side (tablet, iPad, desktop); the first picture has no previous one.
      if (!(ios && c.mobile)) {
        check(`${name}: ‹ › buttons on each side, Précédente off on the first picture`, { labels: ['Précédente', 'Suivante'], size: 56, first: true }, { labels: v.steps.map((x) => x.label), size: v.steps[0]?.w, first: v.steps[0]?.disabled });
      }
    }
    if (!ios && !c.desktop) check(`${name}: page dots, the current one longer`, { dots: Math.min(v.slides, 9), on: 1 }, { dots: v.dots, on: v.dotsOn });
    if (process.env.BC_SHOTS) await shot(tab, shotName('photo'));

    // Touching the photo hides and shows the bars (not on the desktop, where they stay).
    if (!c.desktop) {
      await tab.run(() => document.querySelector('.bc-media-viewer--slide .bc-media-viewer--tap').click());
      await sleep(400);
      const hiddenState = await readViewer(tab);
      await tab.run(() => document.querySelector('.bc-media-viewer--slide .bc-media-viewer--tap').click());
      await sleep(400);
      const shownState = await readViewer(tab);
      check(`${name}: a touch hides the bars and the next shows them`, { hidden: true, topOpacity: '0', shown: false }, { hidden: hiddenState.barsHidden, topOpacity: hiddenState.topOpacity, shown: shownState.barsHidden });
    }

    // Change picture.
    if (c.mobile) {
      const w = c.w;
      await tab.swipe(w * 0.8, w * 0.15, 400, 10);
    } else if (c.desktop) {
      await tab.run(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    } else {
      await tab.run(() => document.querySelector('.bc-media-viewer--next').click());
    }
    await sleep(1500);
    const second = await readViewer(tab);
    check(`${name}: ${c.mobile ? 'a swipe' : c.desktop ? 'the arrow key' : 'the › button'} goes to the next picture`, { position: true, scrolled: 1 }, { position: /^2 sur \d+/.test(flat(second.position)), scrolled: second.scrolled });
    if (c.desktop) check(`${name}: the strip follows`, { on: 1 }, { on: second.stripOn });

    // ⋮: the site photo and the removal.
    if (!ios || true) {
      const items = await viewerOpenMenu(tab);
      if (ios) check(`${name}: the pull-down menu offers « Remplacer la photo du site »`, { items: ['Remplacer la photo du site'] }, { items });
      else if (c.desktop) check(`${name}: ⋮ offers « Remplacer la photo du site »`, { items: ['Remplacer la photo du site'] }, { items });
      else check(`${name}: ⋮ offers « Remplacer la photo du site » and « Retirer de la plongée »`, { items: ['Remplacer la photo du site', 'Retirer de la plongée'] }, { items });
      if (process.env.BC_SHOTS) await shot(tab, shotName('photo-menu'));
      // « Remplacer la photo du site » keeps the picture as the site's photo.
      await tab.run(() => [...document.querySelectorAll('.bc-row-menu [role="option"]')].find((b) => b.textContent.includes('Remplacer')).click());
      await sleep(800);
      const sitePhoto = await tab.run(async () => {
        const { store } = (await import('/src/lib/profile.svelte.js')).accountDataDeps();
        const paths = (await store.list('media/')).filter((p) => p.includes('site-'));
        const file = paths.length ? await store.read(paths[0]) : null;
        return { files: paths.length, items: file?.items?.length ?? 0 };
      });
      check(`${name}: « Remplacer la photo du site » is kept as the site's photo`, { files: 1, items: 1 }, sitePhoto);
    }

    // Video.
    const videoIndex = await tab.run(() => [...document.querySelectorAll('.bc-media-viewer--slide')].findIndex((s) => /Vidéo/.test(s.getAttribute('aria-label'))));
    await tab.run((i) => {
      const t = document.querySelector('.bc-media-viewer--track');
      t.scrollTo({ left: i * t.clientWidth, behavior: 'instant' });
    }, videoIndex);
    await sleep(2500);
    const vid = await readViewer(tab);
    check(`${name}: a video has its controls (48 dp Lecture, two times, a seek bar, a mute button) and a disc while paused`, { play: { w: 48, h: 48 }, playLabel: 'Lecture', times: 2, seek: true, mute: 'Couper le son', disc: true, paused: true }, { play: { w: vid.controls?.play?.w, h: vid.controls?.play?.h }, playLabel: vid.controls?.playLabel, times: vid.controls?.times.length, seek: vid.controls?.seek, mute: vid.controls?.mute, disc: vid.disc, paused: vid.video?.paused });
    if (process.env.BC_SHOTS) await shot(tab, shotName('video'));
    await tab.run(() => document.querySelector('.bc-media-viewer--play').click());
    await sleep(900);
    const playing = await readViewer(tab);
    check(`${name}: Lecture plays the video; no disc over it, the button says Pause`, { paused: false, disc: false, label: 'Pause' }, { paused: playing.video?.paused, disc: playing.disc, label: playing.controls?.playLabel });
    await tab.run(() => document.querySelector('.bc-media-viewer--mute').click());
    await sleep(200);
    check(`${name}: the mute button mutes`, { muted: true, label: 'Rétablir le son' }, { muted: (await readViewer(tab)).video?.muted, label: (await readViewer(tab)).controls?.mute });
    if (process.env.BC_SHOTS) await shot(tab, shotName('video-playing'));

    // Remove from the viewer (the one picture), then close.
    if (c.desktop) await tab.run(() => document.querySelector('.bc-media-viewer--top button[aria-label="Retirer de la plongée"]').click());
    else if (ios) await tab.run(() => document.querySelector('.bc-media-viewer--tool[aria-label="Retirer de la plongée"]').click());
    else {
      await viewerOpenMenu(tab);
      await tab.run(() => [...document.querySelectorAll('.bc-row-menu [role="option"]')].find((b) => b.textContent.includes('Retirer')).click());
    }
    await sleep(700);
    const one = await tab.run(() => ({ title: document.querySelector('.bc-md3-dialog h2')?.textContent.replace(/[s  ]+/g, ' ').trim() ?? null, sheet: [...document.querySelectorAll('.actions-button')].map((b) => b.textContent.replace(/[\s\u202f\u00a0]+/g, ' ').trim()) }));
    check(`${name}: removing the video asks first`, ios ? { sheet: ['Retirer 1 vidéo de la plongée', 'Annuler'] } : { title: 'Retirer 1 vidéo de la plongée ?' }, ios ? { sheet: one.sheet } : { title: one.title });
    if (ios) await tab.run(() => [...document.querySelectorAll('.actions-button')].find((b) => /^Retirer\s1\sv/.test(b.textContent.trim())).click());
    else await tab.run(() => [...document.querySelectorAll('.bc-md3-dialog--actions button')].find((b) => b.textContent.trim() === 'Retirer').click());
    await sleep(1500);
    const afterRemove = await tab.run(async () => {
      const { store } = (await import('/src/lib/profile.svelte.js')).accountDataDeps();
      const path = (await store.list('media/')).find((p) => !p.includes('site-'));
      const file = await store.read(path);
      return { items: file.items.length, removed: (file.removed ?? []).length, videos: file.items.filter((i) => i.mime.startsWith('video/')).length };
    });
    check(`${name}: the video is gone from the dive and a tombstone is kept`, { videos: 0, removed: 1 }, { videos: afterRemove.videos, removed: afterRemove.removed });
    const after = await readViewer(tab);
    check(`${name}: the viewer stays on a picture that exists`, { open: true, slides: afterRemove.items }, { open: after.open, slides: after.slides });

    // Close the viewer, then the gallery (a selection left in the gallery goes first).
    await tab.run(() => window.dispatchEvent(new Event('bc:back')));
    await sleep(1800);
    check(`${name}: Back closes the viewer and shows the gallery`, { viewer: false, gallery: true }, { viewer: (await readViewer(tab)).open, gallery: (await readGallery(tab)).present });
    if ((await readGallery(tab)).selecting) {
      await tab.run(() => window.dispatchEvent(new Event('bc:back')));
      await sleep(600);
    }
    await tab.run(() => window.dispatchEvent(new Event('bc:back')));
    await sleep(1800);
    check(`${name}: Back closes the gallery`, { gallery: false }, { gallery: (await readGallery(tab)).present });
  }

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
    await tab.run(async () => {
      const s = await import('/src/lib/settings.svelte.js');
      s.setAppSetting('showPhotos', true);
      return 1;
    });
    await sleep(800);
    await openDive(tab, c.desktop);
    await scrollToSection(tab);
    expect(`${c.name}: free account, the section is hidden even with the setting on`, { present: false }, await read(tab));
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
    await tab.run(async () => (await import('/src/lib/settings.svelte.js')).setAppSetting('showPhotos', false));
    await sleep(500);
    await openDive(tab, c.desktop);
    expect(`${c.name}: Benthic+ with « Afficher les champs photos et vidéos » off, the section is hidden`, { present: false }, await read(tab));
    await tab.run(async () => (await import('/src/lib/settings.svelte.js')).setAppSetting('showPhotos', true));
    await sleep(800);
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

    // « Tout voir »: the gallery (tasks 2026-11-23-367 and 368).
    await galleryFlows(tab, c);

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
