<script>
  // @ts-check
  // The light rays on the blue first-launch band (task 2026-11-22-320, #98; docs/system-design.md, « Light rays in the
  // first-launch header »). The light comes from a sun far beyond the top right corner: four wide, barely diverging
  // rays, each with its own width and opacity, blurred 2 px, fading out from the top to about 65 % of the band's
  // height. The drawing is the one of the 390 px phone band; on a wider band the whole drawing, sun included, is scaled
  // by the band's width / 390 and never repeated (task 2026-11-23-355). The rays never move.
  const BASE = 390;
  /** The sun, in the 390 px drawing. */
  const SUN = { x: 760, y: -900 };
  /** Where each ray meets the bottom of the reference band (330 px high): its left and right ends, and its opacity (white). */
  const REFERENCE = 330;
  const RAYS = [
    { left: -115, right: 0, opacity: 0.035 },
    { left: 80, right: 145, opacity: 0.03 },
    { left: 195, right: 315, opacity: 0.04 },
    { left: 275, right: 390, opacity: 0.035 },
  ];
  /** Share of the band's height where the rays are gone. */
  const FADE = 0.65;

  const id = $props.id();

  let width = $state(0);
  let height = $state(0);

  /** The band's height in the units of the 390 px drawing. */
  const bottomUnits = $derived(width ? (height * BASE) / width : 0);

  /** The four polygons, in the units of the 390 px drawing (the SVG's viewBox scales them). */
  const polygons = $derived.by(() => {
    if (!width || !height) return [];
    const scale = width / BASE;
    const bottom = height / scale;
    const k = (bottom + -SUN.y) / (REFERENCE + -SUN.y);
    const at = (/** @type {number} */ x) => SUN.x + (x - SUN.x) * k;
    return RAYS.map((ray) => ({ points: `${SUN.x},${SUN.y} ${at(ray.right)},${bottom} ${at(ray.left)},${bottom}`, opacity: ray.opacity }));
  });
</script>

<svg class="bc-first-launch-rays" bind:clientWidth={width} bind:clientHeight={height} viewBox="0 0 {BASE} {width ? (height * BASE) / width : 0}" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="{id}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={bottomUnits * FADE}>
      <stop offset="0" stop-color="#fff" />
      <stop offset="1" stop-color="#000" />
    </linearGradient>
    <mask id="{id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={BASE} height={bottomUnits}>
      <rect width={BASE} height={bottomUnits} fill="url(#{id}-fade)" />
    </mask>
    <filter id="{id}-blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation={2 * BASE / (width || BASE)} /></filter>
  </defs>
  <g mask="url(#{id}-mask)">
    <g filter="url(#{id}-blur)">
      {#each polygons as polygon}<polygon points={polygon.points} fill="#fff" fill-opacity={polygon.opacity} />{/each}
    </g>
  </g>
</svg>

<style>
  @layer bc.components {
    .bc-first-launch-rays {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      pointer-events: none;
    }
  }
</style>
