<script>
  // @ts-check
  // The signature frame of « Faire valider la plongée » (docs/mockups/validation-signature-android.dc.html): a white
  // canvas the signer draws on with a finger or a mouse (pointer events, so the same code serves both). Black ink on white
  // whatever the app's mode, so the saved image reads in the PDF and in the dark theme. `clear()` empties it; `toDataUrl()`
  // gives the PNG (the class no-swipeback keeps a stroke from being taken for the page swipe back); `onchange(hasInk)` tells the screen when it goes from empty to signed and back.
  import { onMount } from 'svelte';

  /** @type {{ label: string, onchange?: (hasInk: boolean) => void }} */
  let { label, onchange } = $props();

  /** The drawing's own resolution; CSS scales it to the frame. */
  const WIDTH = 720;
  const HEIGHT = 288;

  /** @type {HTMLCanvasElement|undefined} */
  let canvas = $state();
  /** @type {CanvasRenderingContext2D|null} */
  let ctx = null;
  let hasInk = false;
  /** @type {number|null} the pointer that is drawing */
  let active = null;
  /** @type {{ x: number, y: number }|null} */
  let last = null;

  onMount(() => {
    ctx = canvas?.getContext('2d') ?? null;
    paper();
  });

  /** White paper, black ink: the variables of the QR card, which keep their values in every mode. */
  function paper() {
    if (!ctx || !canvas) return;
    const style = getComputedStyle(canvas);
    ctx.fillStyle = style.getPropertyValue('--bc-qr-paper').trim() || '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = style.getPropertyValue('--bc-qr-ink').trim() || '#000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  /** @param {PointerEvent} e */
  function point(e) {
    const box = /** @type {HTMLCanvasElement} */ (canvas).getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * WIDTH, y: ((e.clientY - box.top) / box.height) * HEIGHT };
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (!ctx || !canvas || active !== null) return;
    active = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser does not know (a synthetic event): the strokes still follow the events on the canvas.
    }
    last = point(e);
    // A tap leaves a dot.
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.01, last.y);
    ctx.stroke();
    mark();
    e.preventDefault();
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!ctx || e.pointerId !== active || !last) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (e.pointerId !== active) return;
    active = null;
    last = null;
  }

  function mark() {
    if (hasInk) return;
    hasInk = true;
    onchange?.(true);
  }

  export function clear() {
    paper();
    active = null;
    last = null;
    if (hasInk) {
      hasInk = false;
      onchange?.(false);
    }
  }

  /** The signature as a PNG data URL; '' when nothing was drawn. */
  export function toDataUrl() {
    return hasInk && canvas ? canvas.toDataURL('image/png') : '';
  }
</script>

<canvas
  bind:this={canvas}
  class="bc-signature-pad no-swipeback"
  width={WIDTH}
  height={HEIGHT}
  role="img"
  aria-label={label}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
></canvas>

<style>
  @layer od.components {
    .bc-signature-pad {
      display: block;
      width: 100%;
      aspect-ratio: 5 / 2;
      border-radius: 16px;
      border: 1px solid var(--bc-separator);
      background: var(--bc-qr-paper);
      /* The finger draws; the page does not scroll under it. */
      touch-action: none;
      cursor: crosshair;
    }
  }
</style>
