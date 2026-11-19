# Explore: nearby dive sites (to-do #23): closed

**Decision, 14 November 2026 (Christian):** to-do #23 is closed. Sharing dive sites worldwide turned out to be hard to achieve and laborious, so Benthic does not offer it. Sites stays limited to the diver's own sites.

Read this before reopening the idea.

## What had been decided for the navigation

Explore would have lived in Sites, not as a fifth destination. Two filter chips at the top of Sites: « Mes sites » (default) and « Explorer ». « Explorer » would have added nearby sites where the diver has never dived, in a separate colour, on the same map. Tapping one would have opened the site sheet, with « Ajouter à mes sites » and « Planifier une plongée ici ». Nothing was drawn.

## Data sources checked on 14 November 2026

- **Wikidata:** rejected. A place listed there is not necessarily a place where people dive.
- **OpenStreetMap (ODbL, share-alike):**
  - Tags: `sport=scuba_diving` with `scuba_diving:divespot=yes`, `amenity=dive_centre`, and the older `sport=diving` and `amenity=dive_site`.
  - Worldwide counts (taginfo): 4,770 `sport=scuba_diving`, 1,448 `scuba_diving:divespot=yes` (largely the same objects), 2,385 `amenity=dive_centre`. That is about 5,000 sites for the whole planet, unevenly spread.
- **Test against a real logbook.** The St. Lawrence between Cornwall and Rockport (bbox 44.25,−76.05,45.15,−74.55) was compared with the roger.bourdieu logbook (`plongees.ssrf`, 1,353 dives).
  - The logbook has about 38 distinct sites in that area.
  - OSM has 12 dive sites there, all of them already in the logbook: about 30 % coverage.
  - Seven of the 12 come from one import from dive-links.com, still tagged `verified=no`. Eastcliffe Hall is about 1.7 km off.
  - None of them holds anything useful to divers (depth, entry point, current).
- **Diveboard** (about 39,000 citizen-science observations with site names and coordinates): EurOBIS says CC0, but GBIF publishes it under CC BY-NC 4.0. That licence conflict, and the non-commercial clause, rule it out for now.
- **Wannadive, divesitedirectory, dive-links:** no open licence found. They cannot be reused.

## The only way found to cover the world

Divers contribute their own sites from their logbook, site by site, never in bulk, because some sites are private or confidential. There were two options:
- a shared base hosted by Benthic, with a server, deduplication and moderation;
- the app adds each site to OpenStreetMap under the diver's own OSM account. Uploading a whole logbook at once would be an OSM "import" and would need the community's agreement first.

Starting point if the idea comes back: OSM dive sites and dive centres, plus contributions from divers.
