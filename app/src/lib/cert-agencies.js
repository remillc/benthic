// @ts-check
// The diving certification agencies of the « Agence » menu (task of 19 Nov 2026).
//
// An agency is one that certifies divers (recreational, technical, freediving, or a national federation that issues cards). Divers
// Alert Network (DAN) trains first aid and is an insurer, not an agency of diving levels: it is left out. The `id` is what a saved
// card keeps: NEVER rename or remove one (data already saved uses them); a new agency gets a new id.
//
// Sources (consulted 19 Nov 2026):
//  - Wikipedia, « List of diver certification organizations » (recreational, technical, cave, freediving and public-safety lists,
//    with the defunct ones): https://en.wikipedia.org/wiki/List_of_diver_certification_organizations
//  - the agencies' own sites, whose address answered on 19 Nov 2026 (HTTP 200, or 403 for a site that blocks automated requests):
//    divessi.com, naui.org, ffessm.fr, bsac.com, saa.org.uk, tdisdi.com, iantd.com, gue.com, diveraid.com, is-expl.com, snsi.com,
//    andi-international.com, ddi-international.org, iahd.org, molchanovs.com, pfi.net, fedas.es, fias.it, fipsas.it, vdst.de,
//    susv.ch, ssdf.se, dsf.dk, kua.or.kr, jcia.org, fpas.pt, anmp.org, diveisc.com, pdsa.org.mt, cmas.org, padi.com, pdic-intl.com,
//    acuc.net, aidainternational.org, andi.org.
//  - for the ones whose site did not answer from the build machine (UTD, NASE, IDEA, ERDI, HSA, PSS, IART, YMCA): the address in
//    the Wikipedia list and the 2013 directory https://www.divetalking.com/?p=8216 (marked `site: ''` when not confirmed).
//
// Order of the menu: the most common first (the original twelve, in their order), then the others alphabetically by id, then
// « Autre ». The name under `name` is the official full name; `country` is where it is based or serves ('INT' international).

/** @typedef {{ id: string, tone: 'blue'|'green'|'amber'|'violet'|'neutral', name: string, country: string, status: 'active'|'historical', site: string }} CertAgency */

/** @type {CertAgency[]} */
const COMMON = [
  { id: 'PADI', tone: 'blue', name: 'Professional Association of Diving Instructors', country: 'INT', status: 'active', site: 'padi.com' },
  { id: 'SSI', tone: 'green', name: 'Scuba Schools International', country: 'INT', status: 'active', site: 'divessi.com' },
  { id: 'NAUI', tone: 'amber', name: 'National Association of Underwater Instructors', country: 'INT', status: 'active', site: 'naui.org' },
  { id: 'CMAS', tone: 'violet', name: 'Confédération Mondiale des Activités Subaquatiques', country: 'INT', status: 'active', site: 'cmas.org' },
  { id: 'FFESSM', tone: 'blue', name: 'Fédération Française d’Études et de Sports Sous-Marins', country: 'FR', status: 'active', site: 'ffessm.fr' },
  { id: 'BSAC', tone: 'green', name: 'British Sub-Aqua Club', country: 'GB', status: 'active', site: 'bsac.com' },
  { id: 'SDI', tone: 'amber', name: 'Scuba Diving International', country: 'INT', status: 'active', site: 'tdisdi.com' },
  { id: 'TDI', tone: 'violet', name: 'Technical Diving International', country: 'INT', status: 'active', site: 'tdisdi.com' },
  { id: 'IANTD', tone: 'blue', name: 'International Association of Nitrox and Technical Divers', country: 'INT', status: 'active', site: 'iantd.com' },
  { id: 'GUE', tone: 'green', name: 'Global Underwater Explorers', country: 'INT', status: 'active', site: 'gue.com' },
  { id: 'PDIC', tone: 'amber', name: 'Professional Diving Instructors Corporation', country: 'INT', status: 'active', site: 'pdic-intl.com' },
  { id: 'ACUC', tone: 'violet', name: 'American Canadian Underwater Certifications', country: 'CA', status: 'active', site: 'acuc.net' },
];

/** @type {Omit<CertAgency, 'tone'>[]} */
const OTHERS = [
  { id: 'AIDA', name: 'AIDA International (freediving)', country: 'INT', status: 'active', site: 'aidainternational.org' },
  { id: 'ANDI', name: 'American Nitrox Divers International', country: 'US', status: 'active', site: 'andi.org' },
  { id: 'ANMP', name: 'Association Nationale des Moniteurs de Plongée', country: 'FR', status: 'active', site: 'anmp.org' },
  { id: 'CUA', name: 'Chinese Underwater Association', country: 'CN', status: 'active', site: '' },
  { id: 'DDI', name: 'Disabled Divers International', country: 'INT', status: 'active', site: 'ddi-international.org' },
  { id: 'DSF', name: 'Dansk Sportsdykker Forbund', country: 'DK', status: 'active', site: 'dsf.dk' },
  { id: 'ERDI', name: 'Emergency Response Diving International', country: 'US', status: 'active', site: '' },
  { id: 'FEDAS', name: 'Federación Española de Actividades Subacuáticas', country: 'ES', status: 'active', site: 'fedas.es' },
  { id: 'FIAS', name: 'Federazione Italiana Attività Subacquee', country: 'IT', status: 'active', site: 'fias.it' },
  { id: 'FIPSAS', name: 'Federazione Italiana Pesca Sportiva e Attività Subacquee', country: 'IT', status: 'active', site: 'fipsas.it' },
  { id: 'FPAS', name: 'Federação Portuguesa de Actividades Subaquáticas', country: 'PT', status: 'active', site: 'fpas.pt' },
  { id: 'HSA', name: 'Handicapped Scuba Association', country: 'US', status: 'active', site: '' },
  { id: 'IAHD', name: 'International Association for Handicapped Divers', country: 'NL', status: 'active', site: 'iahd.org' },
  { id: 'IART', name: 'International Association of Rebreather Trainers', country: 'INT', status: 'active', site: '' },
  { id: 'IDEA', name: 'International Diving Educators Association', country: 'US', status: 'active', site: '' },
  { id: 'ISC', name: 'International Scuba Certification', country: 'INT', status: 'active', site: 'diveisc.com' },
  { id: 'ISE', name: 'InnerSpace Explorers', country: 'INT', status: 'active', site: 'is-expl.com' },
  { id: 'JCIA', name: 'Japan CMAS Instructor Association', country: 'JP', status: 'active', site: 'jcia.org' },
  { id: 'KUA', name: 'Korea Underwater Association', country: 'KR', status: 'active', site: 'kua.or.kr' },
  { id: 'MOLCHANOVS', name: 'Molchanovs Freediving Education', country: 'INT', status: 'active', site: 'molchanovs.com' },
  { id: 'NASDS', name: 'National Association of Scuba Diving Schools', country: 'US', status: 'historical', site: '' },
  { id: 'NASE', name: 'National Academy of Scuba Educators', country: 'US', status: 'active', site: '' },
  { id: 'PFI', name: 'Performance Freediving International', country: 'INT', status: 'active', site: 'pfi.net' },
  { id: 'PSS', name: 'Professional Scuba Schools', country: 'INT', status: 'active', site: 'pssworldwide.org' },
  { id: 'RAID', name: 'Rebreather Association of International Divers', country: 'INT', status: 'active', site: 'diveraid.com' },
  { id: 'SAA', name: 'Sub-Aqua Association', country: 'GB', status: 'active', site: 'saa.org.uk' },
  { id: 'SNSI', name: 'Scuba and Nitrox Safety International', country: 'INT', status: 'active', site: 'snsi.com' },
  { id: 'SSDF', name: 'Svenska Sportdykarförbundet', country: 'SE', status: 'active', site: 'ssdf.se' },
  { id: 'SUSV', name: 'Schweizer Unterwassersport-Verband', country: 'CH', status: 'active', site: 'susv.ch' },
  { id: 'UTD', name: 'Unified Team Diving', country: 'US', status: 'active', site: '' },
  { id: 'VDST', name: 'Verband Deutscher Sporttaucher', country: 'DE', status: 'active', site: 'vdst.de' },
  { id: 'YMCA', name: 'YMCA SCUBA Program', country: 'US', status: 'historical', site: '' },
].sort((a, b) => a.id.localeCompare(b.id, 'en'));

/** Every agency of the menu, « Autre » last. `other` is the free-text one. @type {CertAgency[]} */
export const CERT_AGENCIES = [
  ...COMMON,
  ...OTHERS.map((a) => ({ ...a, tone: /** @type {const} */ ('neutral') })),
  { id: 'other', tone: 'neutral', name: '', country: '', status: 'active', site: '' },
];
