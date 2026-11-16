// @ts-check
// MapLibre and its style sheet, loaded together when a map is first drawn (not with the first screen).

/** @returns {Promise<any>} the maplibre-gl module */
export async function loadMapLibre() {
  const [module] = await Promise.all([import('maplibre-gl'), import('../maplibre.css')]);
  return module;
}
