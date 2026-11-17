// @ts-check
// The dive profile of the tablet's first launch (task 2026-11-16-237; mock-ups
// docs/mockups/android-tablette-premier-lancement-paysage.dc.html and -portrait.dc.html): one curve per
// orientation, drawn at the size of the mock-up and scaled to the box it is given, and the timing of its
// animation. Kept apart from the component so that node:test can read it.

/** The animation (seconds), as in the mock-ups; the component's CSS carries the same values. */
export const PROFILE_TIMING = {
  draw: 2.2,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  dotDelay: 0.7,
  dotDuration: 0.3,
  dotFrom: 0.4,
  labelDelay: 2.1,
  labelDuration: 0.5,
  labelRise: 8,
};

/**
 * Each orientation: the size it is drawn at, its path (absolute cubic curves, in those coordinates),
 * the surface line and the deepest point.
 * @type {Record<'landscape'|'portrait', { width: number, height: number, path: string, surfaceY: number, deepest: { x: number, y: number } }>}
 */
export const PROFILES = {
  landscape: {
    width: 588,
    height: 300,
    path: 'M0.0 12.6 C2.7 30.9 9.8 87.0 16.0 122.2 C22.2 157.6 29.9 199.1 36.8 224.4 C43.7 249.6 50.5 264.0 57.4 274.1 C64.4 284.2 71.3 286.1 78.2 284.7 C85.2 283.3 93.8 270.9 98.9 265.9 C104.0 260.8 104.0 271.6 109.3 254.1 C114.6 236.5 123.9 184.9 130.1 160.4 C136.3 135.9 142.5 116.1 146.4 107.1 C150.3 98.1 151.8 106.3 153.8 106.6 C155.7 106.9 156.2 107.5 158.0 108.9 C159.8 110.4 160.4 115.1 164.9 114.8 C169.6 114.5 178.7 107.1 185.6 107.1 C192.5 107.1 199.5 111.9 206.4 114.5 C213.3 117.0 220.1 122.1 227.1 122.2 C234.0 122.4 240.9 120.2 247.9 115.7 C254.8 111.3 261.6 100.3 268.5 95.7 C275.5 91.1 282.4 89.2 289.3 87.9 C296.3 86.7 303.0 89.7 310.0 87.9 C316.9 86.2 323.9 78.0 330.8 77.8 C337.7 77.5 344.5 87.3 351.4 86.5 C358.4 85.7 365.3 78.0 372.2 73.3 C379.2 68.5 386.0 60.0 392.9 58.3 C399.8 56.5 406.8 62.1 413.7 62.4 C420.6 62.7 427.4 61.3 434.4 60.5 C441.3 59.7 448.2 60.0 455.2 57.8 C462.1 55.6 468.9 49.7 475.8 46.9 C482.8 44.1 489.7 40.4 496.6 40.4 C503.6 40.6 510.4 47.2 517.3 47.4 C524.2 47.5 531.2 43.7 538.1 41.4 C545.0 39.0 551.8 34.1 558.8 33.2 C565.7 32.2 574.7 39.0 579.6 35.5 C584.4 32.1 586.6 16.4 588.0 12.6',
    surfaceY: 12.6,
    deepest: { x: 78.2, y: 284.7 },
  },
  portrait: {
    width: 688,
    height: 220,
    path: 'M0.0 9.3 C3.2 22.7 11.5 63.8 18.7 89.6 C25.9 115.6 34.9 146.0 43.0 164.5 C51.2 183.1 59.1 193.6 67.2 201.0 C75.3 208.4 83.4 209.8 91.6 208.8 C99.7 207.7 109.7 198.7 115.7 195.0 C121.7 191.3 121.7 199.2 127.9 186.3 C134.1 173.5 145.0 135.6 152.2 117.6 C159.5 99.7 166.7 85.1 171.3 78.5 C175.9 71.9 177.6 77.9 179.9 78.2 C182.2 78.4 182.8 78.9 184.9 79.9 C187.0 80.9 187.7 84.4 193.0 84.2 C198.5 83.9 209.0 78.5 217.2 78.5 C225.3 78.5 233.4 82.1 241.5 83.9 C249.6 85.8 257.6 89.5 265.7 89.6 C273.8 89.7 281.9 88.1 290.0 84.9 C298.1 81.6 306.1 73.5 314.2 70.2 C322.3 66.8 330.4 65.4 338.5 64.5 C346.6 63.6 354.6 65.8 362.7 64.5 C370.8 63.2 378.9 57.2 387.0 57.1 C395.2 56.9 403.1 64.0 411.2 63.5 C419.3 62.9 427.4 57.2 435.6 53.7 C443.7 50.3 451.6 44.0 459.7 42.7 C467.8 41.5 476.0 45.5 484.1 45.7 C492.2 46.0 500.1 44.9 508.2 44.3 C516.4 43.8 524.5 44.0 532.6 42.4 C540.7 40.8 548.6 36.5 556.8 34.4 C564.9 32.3 573.0 29.6 581.1 29.6 C589.2 29.8 597.1 34.6 605.3 34.7 C613.4 34.9 621.5 32.1 629.6 30.3 C637.7 28.6 645.7 25.0 653.8 24.3 C661.9 23.6 672.5 28.6 678.1 26.1 C683.8 23.5 686.4 12.0 688.0 9.3',
    surfaceY: 9.3,
    deepest: { x: 91.6, y: 208.8 },
  },
};

/**
 * The profile of an orientation scaled to `width` × `height` (the numbers of a path are x, y pairs).
 * @param {'landscape'|'portrait'} orientation
 * @param {number} width
 * @param {number} height
 * @returns {{ line: string, area: string, surfaceY: number, deepest: { x: number, y: number } }}
 */
export function scaledProfile(orientation, width, height) {
  const p = PROFILES[orientation];
  const sx = width / p.width;
  const sy = height / p.height;
  let index = 0;
  const line = p.path.replace(/-?\d+\.?\d*/g, (n) => (Number(n) * (index++ % 2 === 0 ? sx : sy)).toFixed(1));
  return {
    line,
    area: line + ' Z',
    surfaceY: +(p.surfaceY * sy).toFixed(1),
    deepest: { x: +(p.deepest.x * sx).toFixed(1), y: +(p.deepest.y * sy).toFixed(1) },
  };
}
