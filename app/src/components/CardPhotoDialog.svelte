<script>
  // @ts-check
  // The photo of a certification card on the desktop (tasks 2026-11-18-275 and 277, bureau-profil-brevet-photo and
  // bureau-profil-brevet-photo-verifier): a computer has no camera, so the diver chooses, drops or pastes (Ctrl+V) a
  // picture. The card is found, cropped and straightened; « Vérifier la photo » shows the photo and the result side by
  // side, with « Retirer les reflets » and « Ajuster les coins ». The picture never leaves the device.
  import { onDestroy, onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { imageOf, loadPixels, findCard, straighten, pixelsToJpeg, moveCorner } from '../lib/card-screen.js';
  import { t } from '../lib/i18n.js';

  /** `onuse` receives the straightened card as a JPEG. @type {{ side: 'front'|'back', oncancel: () => void, onuse: (image: Blob) => void }} */
  let { side, oncancel, onuse } = $props();

  /** @typedef {import('../lib/card-image.js').Quad} Quad */
  /** @type {Blob|null} */
  let source = $state(null);
  /** @type {import('../lib/card-screen.js').Pixels|null} */
  let photo = $state.raw(null);
  let photoSrc = $state('');
  /** @type {Quad|null} */
  let corners = $state(null);
  let found = $state(false);
  let glare = $state(true);
  let adjusting = $state(false);
  let failed = $state(false);
  let over = $state(false);
  let busy = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();
  /** @type {HTMLCanvasElement|undefined} */
  let after = $state();
  /** @type {HTMLElement|undefined} */
  let before = $state();

  const result = $derived(photo && corners ? straighten(photo, corners, { glare }) : null);

  $effect(() => {
    const r = result;
    if (!r || !after) return;
    after.width = r.image.width;
    after.height = r.image.height;
    after.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(r.image.data), r.image.width, r.image.height), 0, 0);
  });

  /** @param {Blob} blob */
  async function take(blob) {
    failed = false;
    try {
      const pixels = await loadPixels(blob);
      const card = findCard(pixels);
      if (photoSrc) URL.revokeObjectURL(photoSrc);
      source = blob;
      photo = pixels;
      photoSrc = URL.createObjectURL(blob);
      corners = card.corners;
      found = card.found;
      adjusting = !card.found;
    } catch {
      failed = true;
    }
  }

  /** @param {Event} e */
  const chosen = (e) => {
    const file = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0];
    if (file) void take(file);
  };
  /** @param {DragEvent} e */
  function dropped(e) {
    e.preventDefault();
    over = false;
    const file = imageOf(e.dataTransfer);
    if (file) void take(file);
    else failed = true;
  }
  /** @param {ClipboardEvent} e */
  function pasted(e) {
    const file = imageOf(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    void take(file);
  }
  onMount(() => {
    window.addEventListener('paste', pasted);
    return () => window.removeEventListener('paste', pasted);
  });
  onDestroy(() => photoSrc && URL.revokeObjectURL(photoSrc));

  /** The corner being dragged. @type {number} */
  let dragging = -1;
  /** @param {PointerEvent} e @param {number} index */
  function grab(e, index) {
    dragging = index;
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
  }
  /** @param {PointerEvent} e */
  function drag(e) {
    if (dragging < 0 || !before || !photo || !corners) return;
    const r = before.querySelector('img')?.getBoundingClientRect();
    if (!r) return;
    corners = moveCorner(corners, dragging, { x: ((e.clientX - r.left) / r.width) * photo.width, y: ((e.clientY - r.top) / r.height) * photo.height }, photo.width, photo.height);
  }

  async function use() {
    if (!result || busy) return;
    busy = true;
    try {
      onuse(await pixelsToJpeg(result.image));
    } catch {
      failed = true;
      busy = false;
    }
  }
</script>

<Md3Dialog title={photo ? t('diverProfile.cert.photoDialog.title') : t(side === 'front' ? 'diverProfile.cert.photoDialog.titleFront' : 'diverProfile.cert.photoDialog.titleBack')} {oncancel} class="bc-card-photo">
  <div class="bc-card-photo--body">
  {#if !photo}
    <div
      class="bc-card-photo--drop"
      class:bc-card-photo--over={over}
      role="group"
      aria-label={t('diverProfile.cert.photoDialog.drop')}
      ondragover={(e) => (e.preventDefault(), (over = true))}
      ondragleave={() => (over = false)}
      ondrop={dropped}
    >
      <Icon name="image" size={32} />
      <p class="bc-card-photo--drop-title">{t('diverProfile.cert.photoDialog.drop')}</p>
      <p class="bc-card-photo--drop-hint">{t('diverProfile.cert.photoDialog.paste')}</p>
      <button type="button" class="bc-tonal-button" onclick={() => input?.click()}>{t('diverProfile.cert.photoDialog.choose')}</button>
      <input bind:this={input} type="file" accept="image/*" hidden onchange={chosen} />
    </div>
  {:else}
    <div class="bc-card-photo--pair">
      <figure class="bc-card-photo--figure" bind:this={before}>
        <figcaption>{t('diverProfile.cert.photoDialog.before')}</figcaption>
        <div class="bc-card-photo--frame">
          <img src={photoSrc} alt="" draggable="false" />
          {#if corners}
            <svg class="bc-card-photo--quad" viewBox="0 0 {photo.width} {photo.height}" onpointermove={drag} onpointerup={() => (dragging = -1)} role="presentation">
              <polygon points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />
              {#if adjusting}
                {#each corners as c, i (i)}
                  <circle class="bc-card-photo--corner" cx={c.x} cy={c.y} r={Math.max(photo.width, photo.height) / 60} onpointerdown={(e) => grab(e, i)} role="presentation" />
                {/each}
              {/if}
            </svg>
          {/if}
        </div>
      </figure>
      <figure class="bc-card-photo--figure">
        <figcaption>{t('diverProfile.cert.photoDialog.after')}</figcaption>
        <div class="bc-card-photo--frame bc-card-photo--after"><canvas bind:this={after}></canvas></div>
      </figure>
    </div>
    <div class="bc-card-photo--checks">
      <span class="bc-card-photo--check" class:bc-card-photo--check-off={!found}><Icon name={found ? 'check' : 'close'} size={20} />{t(found ? 'diverProfile.cert.photoDialog.framed' : 'diverProfile.cert.photoDialog.notFramed')}</span>
      <span class="bc-card-photo--check"><Icon name="check" size={20} />{t('diverProfile.cert.photoDialog.straightened')}</span>
      <label class="bc-card-photo--glare">
        <span>{t('diverProfile.cert.photoDialog.glare')}</span>
        <span class="toggle"><input type="checkbox" bind:checked={glare} /><span class="toggle-icon"></span></span>
      </label>
    </div>
    <p class="bc-card-photo--note">{t('diverProfile.cert.photoDialog.local')}</p>
    {#if failed}<p class="bc-card-photo--error" role="alert">{t('diverProfile.cert.photoFailed')}</p>{/if}
  {/if}
  </div>
  {#snippet actions()}
    {#if photo}
      <button type="button" class="bc-card-photo--adjust" aria-pressed={adjusting} onclick={() => (adjusting = !adjusting)}><Icon name="fullscreen" size={20} />{t(adjusting ? 'diverProfile.cert.photoDialog.adjustDone' : 'diverProfile.cert.photoDialog.adjust')}</button>
      <button type="button" onclick={() => { photoSrc && URL.revokeObjectURL(photoSrc); photo = null; photoSrc = ''; corners = null; source = null; }}>{t('diverProfile.cert.photoDialog.other')}</button>
      <button type="button" onclick={use} disabled={busy}>{t('diverProfile.cert.photoDialog.use')}</button>
    {:else}
      <button type="button" onclick={oncancel}>{t('gear.addSheet.cancel')}</button>
    {/if}
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-card-photo--body {
      padding: 0 24px;
    }
    .bc-card-photo--drop {
      min-width: min(560px, 80vw);
      padding: 32px 16px;
      border: 2px dashed var(--bc-outline);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }
    .bc-card-photo--over {
      border-color: var(--bc-secondary);
      background: var(--bc-selected-container);
    }
    .bc-card-photo--drop-title {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }
    .bc-card-photo--drop-hint {
      margin: 0 0 8px;
      color: var(--bc-text-2);
      font-size: 14px;
    }
    .bc-card-photo--pair {
      display: flex;
      gap: 24px;
      align-items: flex-start;
    }
    .bc-card-photo--figure {
      margin: 0;
      flex: 1;
      min-width: 0;
      & figcaption {
        margin-bottom: 4px;
        color: var(--bc-text-2);
        font-size: 13px;
        font-weight: 600;
      }
    }
    .bc-card-photo--frame {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      background: var(--bc-surface);
      line-height: 0;
    }
    .bc-card-photo--frame img,
    .bc-card-photo--frame canvas {
      width: 100%;
      max-height: 280px;
      object-fit: contain;
      user-select: none;
    }
    .bc-card-photo--quad {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      touch-action: none;
      & polygon {
        fill: rgb(255 255 255 / 0.12);
        stroke: var(--bc-secondary);
        stroke-width: 3;
        vector-effect: non-scaling-stroke;
      }
    }
    .bc-card-photo--corner {
      fill: #FFFFFF;
      stroke: var(--bc-secondary);
      stroke-width: 3;
      vector-effect: non-scaling-stroke;
      cursor: grab;
    }
    .bc-card-photo--checks {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 24px;
      background: var(--bc-surface);
    }
    .bc-card-photo--check {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .bc-card-photo--check-off {
      color: var(--bc-text-2);
    }
    .bc-card-photo--glare {
      margin-inline-start: auto;
      display: inline-flex;
      align-items: center;
      gap: 12px;
    }
    .bc-card-photo--note,
    .bc-card-photo--error {
      margin: 8px 0 0;
      color: var(--bc-text-2);
      font-size: 13px;
    }
    .bc-card-photo--error {
      color: var(--bc-alarm);
    }
    .bc-card-photo--adjust {
      margin-inline-end: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  }
</style>
