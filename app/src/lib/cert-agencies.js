// @ts-check
import { CERT_LEVELS } from './cert-levels.js';
// The diving certification agencies of the « Agence » menu (task of 19 Nov 2026).
//
// An agency is one that certifies divers (recreational, technical, freediving, occupational or scientific, or a national federation). Divers
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
//  - additions consulted 20 Nov 2026: WRSTC's US and European councils https://wrstc.com/wrstc-member-councils/,
//    https://www.divecalc.app/references/dive-agencies, https://quebecsubaquatique.ca/,
//    https://www.divercertification.com/certification/, and https://www.aaus.org/AAUS/AAUS/Certification_Program.aspx.
//
// The shared list keeps its original order; the edit page sorts its displayed labels. The name under `name` is the official full
// name; `country` is where it is based or serves ('INT' international).

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
  { id: 'AAUS', name: 'American Academy of Underwater Sciences', country: 'US', status: 'active', site: 'aaus.org' },
  { id: 'AIDA', name: 'AIDA International (freediving)', country: 'INT', status: 'active', site: 'aidainternational.org' },
  { id: 'ANDI', name: 'American Nitrox Divers International', country: 'US', status: 'active', site: 'andi.org' },
  { id: 'ANMP', name: 'Association Nationale des Moniteurs de Plongée', country: 'FR', status: 'active', site: 'anmp.org' },
  { id: 'Apnea Academy', name: 'Apnea Academy (freediving)', country: 'INT', status: 'active', site: 'apnea.academy' },
  { id: 'CDAA', name: 'Cave Divers Association of Australia', country: 'AU', status: 'active', site: 'cavedivers.com.au' },
  { id: 'CMAS-CH', name: 'CMAS Swiss Diving', country: 'CH', status: 'active', site: 'cmas.ch' },
  { id: 'CUA', name: 'Chinese Underwater Association', country: 'CN', status: 'active', site: '' },
  { id: 'DCBC', name: 'Diver Certification Board of Canada', country: 'CA', status: 'active', site: 'divercertification.com' },
  { id: 'DDI', name: 'Disabled Divers International', country: 'INT', status: 'active', site: 'ddi-international.org' },
  { id: 'DSF', name: 'Dansk Sportsdykker Forbund', country: 'DK', status: 'active', site: 'dsf.dk' },
  { id: 'ERDI', name: 'Emergency Response Diving International', country: 'US', status: 'active', site: '' },
  { id: 'FEDAS', name: 'Federación Española de Actividades Subacuáticas', country: 'ES', status: 'active', site: 'fedas.es' },
  { id: 'FIAS', name: 'Federazione Italiana Attività Subacquee', country: 'IT', status: 'active', site: 'fias.it' },
  { id: 'FIPSAS', name: 'Federazione Italiana Pesca Sportiva e Attività Subacquee', country: 'IT', status: 'active', site: 'fipsas.it' },
  { id: 'FPAS', name: 'Federação Portuguesa de Actividades Subaquáticas', country: 'PT', status: 'active', site: 'fpas.pt' },
  { id: 'FQAS', name: 'Fédération québécoise des activités subaquatiques (Québec Subaquatique)', country: 'CA', status: 'active', site: 'quebecsubaquatique.ca' },
  { id: 'HSA', name: 'Handicapped Scuba Association', country: 'US', status: 'active', site: '' },
  { id: 'IAC', name: 'International Aquanautic Club', country: 'DE', status: 'active', site: 'diveiac.de' },
  { id: 'IAHD', name: 'International Association for Handicapped Divers', country: 'NL', status: 'active', site: 'iahd.org' },
  { id: 'IART', name: 'International Association of Rebreather Trainers', country: 'INT', status: 'active', site: '' },
  { id: 'IDA', name: 'International Diving Association', country: 'DE', status: 'active', site: 'ida-worldwide.com' },
  { id: 'IDDA', name: 'IDDA (diveidda.com)', country: 'DE', status: 'active', site: 'diveidda.com' },
  { id: 'IDDA-DIVERS', name: 'International Discovery Divers Association', country: 'INT', status: 'active', site: 'idda-diving.com' },
  { id: 'IDEA', name: 'International Diving Educators Association', country: 'US', status: 'active', site: '' },
  { id: 'ISC', name: 'International Scuba Certification', country: 'INT', status: 'active', site: 'diveisc.com' },
  { id: 'ISE', name: 'InnerSpace Explorers', country: 'INT', status: 'active', site: 'is-expl.com' },
  { id: 'JCIA', name: 'Japan CMAS Instructor Association', country: 'JP', status: 'active', site: '' },
  { id: 'KUA', name: 'Korea Underwater Association', country: 'KR', status: 'active', site: 'kua.or.kr' },
  { id: 'MOLCHANOVS', name: 'Molchanovs Freediving Education', country: 'INT', status: 'active', site: 'molchanovs.com' },
  { id: 'NASDS', name: 'National Association of Scuba Diving Schools', country: 'US', status: 'historical', site: '' },
  { id: 'NASE', name: 'National Academy of Scuba Educators', country: 'US', status: 'active', site: '' },
  { id: 'NSS-CDS', name: 'National Speleological Society Cave Diving Section', country: 'US', status: 'active', site: 'nsscds.org' },
  { id: 'PDA', name: 'Professional Diving Association', country: 'DE', status: 'active', site: 'pdaww.eu' },
  { id: 'PFI', name: 'Performance Freediving International', country: 'INT', status: 'active', site: 'pfi.net' },
  { id: 'ProTec', name: 'Professional Technical and Recreational Diving', country: 'INT', status: 'active', site: 'protec-diving.com' },
  { id: 'PSS', name: 'Professional Scuba Schools', country: 'INT', status: 'active', site: 'pssworldwide.org' },
  { id: 'RAID', name: 'Rebreather Association of International Divers', country: 'INT', status: 'active', site: 'diveraid.com' },
  { id: 'SAA', name: 'Sub-Aqua Association', country: 'GB', status: 'active', site: 'saa.org.uk' },
  { id: 'SEI', name: 'Scuba Educators International', country: 'US', status: 'active', site: 'scubaeducators.org' },
  { id: 'SNSI', name: 'Scuba and Nitrox Safety International', country: 'INT', status: 'active', site: 'snsi.com' },
  { id: 'SSDF', name: 'Svenska Sportdykarförbundet', country: 'SE', status: 'active', site: 'ssdf.se' },
  { id: 'SUSV', name: 'Schweizer Unterwassersport-Verband', country: 'CH', status: 'active', site: 'susv.ch' },
  { id: 'SwedTech', name: 'SwedTech Diving', country: 'SE', status: 'active', site: 'swedtechdiving.se' },
  { id: 'UTD', name: 'Unified Team Diving', country: 'US', status: 'active', site: '' },
  { id: 'VDST', name: 'Verband Deutscher Sporttaucher', country: 'DE', status: 'active', site: 'vdst.de' },
  { id: 'VIT', name: 'Verband Internationaler Tauchschulen', country: 'DE', status: 'active', site: 'vit.info' },
  { id: 'WOSD', name: 'World Organisation of Scuba Diving', country: 'INT', status: 'active', site: 'wosd.com' },
  { id: 'YMCA', name: 'YMCA SCUBA Program', country: 'US', status: 'historical', site: '' },
].sort((a, b) => a.id.localeCompare(b.id, 'en'));

/** Every agency of the menu, « Autre » last. `other` is the free-text one. @type {CertAgency[]} */
export const CERT_AGENCIES = [
  ...COMMON,
  ...OTHERS.map((a) => ({ ...a, tone: /** @type {const} */ ('neutral') })),
  { id: 'other', tone: 'neutral', name: '', country: '', status: 'active', site: '' },
];

/** @param {string} locale */
export function certAgencyOptions(locale) {
  return CERT_AGENCIES.filter((a) => a.id !== 'other' && CERT_LEVELS[a.id]?.length).map((a) => ({
    value: a.id,
    label: a.name ? `${a.id} · ${a.name}` : a.id,
  })).sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }));
}

/** @param {string} agency @param {string} agencyName @param {{value: string, label: string}[]} options */
export function certAgencyText(agency, agencyName, options) {
  return agency === 'other' ? agencyName : options.find((o) => o.value === agency)?.label ?? agency;
}

/**
 * @param {string} text
 * @param {{value: string, label: string}[]} options
 * @param {{agency: string, text: string}} original
 */
export function certAgencySelection(text, options, original) {
  const value = text.trim();
  if (!value) return { agency: '', agencyName: '' };
  if (value === original.text && original.agency) {
    return { agency: original.agency, agencyName: original.agency === 'other' ? value : '' };
  }
  const option = options.find((o) => o.label === value || o.value.toLocaleLowerCase() === value.toLocaleLowerCase());
  const known = CERT_AGENCIES.find((a) => a.id !== 'other' && a.id.toLocaleLowerCase() === value.toLocaleLowerCase());
  if (option) return { agency: option.value, agencyName: '' };
  if (known) return { agency: known.id, agencyName: '' };
  return { agency: 'other', agencyName: value };
}
