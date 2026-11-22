<script>
  // @ts-check
  // The light rays on the blue first-launch band (task 2026-11-22-320, #98; docs/system-design.md, « Light rays in the
  // first-launch header »). The light comes from a sun far beyond the top right corner: a few wide, barely diverging
  // rays, each with its own width and opacity, blurred 2 px, fading out from the top to about 65 % of the band's
  // height. Three rays per 390 px of band width; on a wider band the same pattern repeats every 390 px. Drawn once,
  // from the size of the band, so that it fits every band (phone, tablet, desktop). The rays never move.
  const TILE = 390;
  /** The sun, relative to a 390 px tile: 370 px right of its right edge and 900 px above its top. */
  const SUN = { x: TILE + 370, y: -900 };
  /** Where each ray meets the bottom of a 330 px band: its centre, its width and its opacity (white). */
  const REFERENCE = 330;
  const RAYS = [
    { centre: 60, width: 120, opacity: 0.035 },
    { centre: 190, width: 35, opacity: 0.04 },
    { centre: 300, width: 75, opacity: 0.03 },
  ];
  /** Share of the band's height where the rays are gone. */
  const FADE = 0.65;

  const id = $props.id();

  let width = $state(0);
  let height = $state(0);

  /** The polygons of every ray of every tile that can reach the band. */
  const polygons = $derived.by(() => {
    if (!width || !height) return [];
    const scale = (height + -SUN.y) / (REFERENCE + -SUN.y);
    const at = (/** @type {number} */ x) => SUN.x + (x - SUN.x) * scale;
    const out = [];
    for (let tile = 0; tile <= Math.ceil(width / TILE) + 1; tile++) {
      const shift = tile * TILE;
      for (const ray of RAYS) {
        const left = at(ray.centre - ray.width / 2) + shift;
        const right = at(ray.centre + ray.width / 2) + shift;
        out.push({ points: `${SUN.x + shift},${SUN.y} ${right},${height} ${left},${height}`, opacity: ray.opacity });
      }
    }
    return out;
  });
</script>

<svg class="bc-first-launch-rays" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true">
  <defs>
    <linearGradient id="{id}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={height * FADE}>
      <stop offset="0" stop-color="#fff" />
      <stop offset="1" stop-color="#000" />
    </linearGradient>
    <mask id="{id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" {width} {height}>
      <rect {width} {height} fill="url(#{id}-fade)" />
    </mask>
    <filter id="{id}-blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2" /></filter>
  </defs>
  <g mask="url(#{id}-mask)">
    <g filter="url(#{id}-blur)">
      {#each polygons as polygon}<polygon points={polygon.points} fill="#fff" fill-opacity={polygon.opacity} />{/each}
    </g>
  </g>
</svg>

<style>
  @layer od.components {
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
