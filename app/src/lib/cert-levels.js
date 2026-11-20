// @ts-check
// The levels suggested in « Niveau » for each agency (task of 19 Nov 2026). The field stays free text: a level that is not here is
// typed. Each list runs from the entry level to the professional ladder; the technical and specialty levels that were suggested
// before stay (a saved value is never dropped). Keys are the ids of lib/cert-agencies.js.
//
// Sources (consulted 19 Nov 2026):
//  - PADI: https://blog.padi.com/padi-courses/ and the ISO 24801 mapping at https://www.padi.com/node/14681 (Scuba Diver,
//    Open Water Diver, Advanced Open Water Diver, Rescue Diver, Master Scuba Diver, Divemaster; Open Water Scuba Instructor,
//    Specialty Instructor, Master Scuba Diver Trainer, IDC Staff Instructor, Master Instructor, Course Director).
//  - SSI: https://www.divessi.com/en/join-ssi/recognition/professional-recognition (Advanced Open Water Instructor, Divemaster
//    Instructor, Master Instructor, Assistant Instructor Trainer) and https://www.divessi.com/en/join-ssi/recognition/diver-recognition.
//  - NAUI: https://www.naui.org/certifications (Tandem Diver, Scuba Diver, Open Water Scuba Diver, Enriched Air Nitrox Diver,
//    Advanced Open Water Diver, Master Scuba Diver, Rescue Scuba Diver, Skin Diving Instructor, Assistant Instructor, Divemaster,
//    Instructor).
//  - CMAS and BSAC equivalences: https://en.wikipedia.org/wiki/Recreational_scuba_certification_levels and BSAC's own pages
//    https://www.bsac.com/equivalency/ and https://www.bsac.com/divergrades/ (Discovery Diver, Ocean Diver, Sports Diver, Dive Leader,
//    Advanced Diver, First Class Diver; instructor grades from the BSAC instructor programme).
//  - FFESSM: the federation's training manuals at https://plongee.ffessm.fr (Niveau 1 to 3, PE and PA qualifications, Plongeur de
//    bronze, d'argent, d'or, Initiateur E1 to E3, MF1, MF2; Niveau 4 is Guide de palanquée).
//  - SDI, PDIC, ACUC, RAID: each agency's published course list (tdisdi.com, pdic-intl.com, acuc.net, diveraid.com).
//  - ISO 24801-1/-2/-3 and 24802-1/-2 (levels 1 to 3, instructor 1 and 2) as the common frame.
//  - Further lists: https://quebecsubaquatique.ca/ressources-et-reglementation/reglementation-plongee/,
//    https://www.cavedivers.com.au/training, https://nsscds.org/cave-courses/,
//    https://www.scubaeducators.org/course-list/, https://www.pssworldwide.org/corsi-recreational-pss.htm,
//    https://saa.org.uk/diver-grades/, https://us.molchanovs.com/pages/molchanovs-freediving-education,
//    https://apnea.academy/en/didattica/, https://www.aidainternational.org/Education/AIDAFreedivingCourses,
//    https://www.divercertification.com/training/diving-types/, https://www.aaus.org/AAUS/AAUS/Certification_Program.aspx,
//    https://www.swedtechdiving.se/kurser/extended-basic-skills/plus/2022-08-09/, and
//    https://wosd.com/en/educations/professional (consulted 20 Nov 2026).
//  - DDI https://www.ddivers.org/blog/category/articles/programs/, IAHD https://iahd-americas.org/lets-get-started/diver-certification/,
//    HSA https://hsascuba.org/body/AboutTraining.htm, ERDI https://www.tdisdi.com/erdi-psd/,
//    IART https://www.iart.de/kursfinder/rebreather/?lang=en, IDA https://www.ida-worldwide.com/media/ida-rstc_standards_1.pdf,
//    IDDA https://diveidda.com/beginner-courses/, IDDA-DIVERS https://idda-diving.com/beginners-to-advanced/,
//    IDEA https://idea-scuba.com/dive-courses/,
//    KUA https://www.cmaskorea.co.kr/sub_about/certification.php, NASDS https://www.nasds.com/en/diving-en/dive-training/,
//    NASE https://www.naseworldwide.org/nase-courses/recreational-diving, PDA https://www.pdaww.eu/kurse/sporttauchen,
//    VIT https://www.vit.info/beginner and https://www.vit.info/tauchlehrer,
//    YMCA https://en.wikipedia.org/wiki/YMCA_SCUBA_Program (consulted 20 Nov 2026).
//  - ANMP https://anmp-plongee.com/diploma-recognition.html, FEDAS https://elearning.fedas.es/cursos/buceador-1-estrella/,
//    FIAS https://www.fias.it/corsi/corsi-di-formazione-ara.html,
//    FIPSAS http://web.tiscali.it/fipsasfc/sub_didattica.html, DSF https://tekniskudvalg.sportsdykning.dk/wp-content/uploads/sites/10/2024/10/Bindende-krav-P2_2024_v1.pdf,
//    SSDF https://ssdf.se/om-forbundet/organisation/cmas, VDST https://tauchen.psv-stuttgart.de/ausbildung-psv-stuttgart/portfolio/,
//    SNSI https://www.scubasnsi.com/start-diving/open-water-diver/, ISC https://iscdiver.com/courses/,
//    UTD https://utdscubadiving.com/utd-foundational-courses/, PFI https://www.tdisdi.com/pfi/get-certified/intermediate/,
//    ProTec https://www.protecdive.com/all-certifications/, IAC https://www.trimix-tauchen.de/sporttauchen/dive-i-a-c,
//    ANDI and ISE https://open.divekit.app/datasets/certifications.json (consulted 20 Nov 2026).
//  - CMAS Swiss Diving https://mail.cmas.ch/fr/apprendre-a-plonger/plongeur-d1-d4/plongeur-d1.php (consulted 20 Nov 2026).

/** @type {Record<string, string[]>} */
export const CERT_LEVELS = {
  PADI: [
    'Scuba Diver', 'Junior Open Water Diver', 'Open Water Diver', 'Junior Advanced Open Water Diver', 'Advanced Open Water Diver', 'Adventure Diver',
    'Rescue Diver', 'Rescue Diver, Emergency First Response', 'Enriched Air Diver (Nitrox)', 'Deep Diver', 'Master Scuba Diver',
    'Divemaster', 'Assistant Instructor', 'Open Water Scuba Instructor', 'Specialty Instructor', 'Master Scuba Diver Trainer', 'IDC Staff Instructor', 'Master Instructor', 'Course Director',
    'Tec 40', 'Tec 45', 'Tec 50',
  ],
  SSI: [
    'Scuba Diver', 'Open Water Diver', 'Advanced Adventurer', 'Advanced Open Water Diver', 'Stress & Rescue (Sauveteur)', 'Enriched Air Nitrox', 'Deep Diving', 'Master Diver',
    'Dive Guide', 'Divemaster', 'Dive Control Specialist', 'Assistant Instructor', 'Open Water Instructor', 'Advanced Open Water Instructor', 'Divemaster Instructor', 'Master Instructor', 'Assistant Instructor Trainer',
  ],
  NAUI: [
    'Tandem Diver', 'Scuba Diver', 'Open Water Scuba Diver', 'Advanced Scuba Diver', 'Advanced Open Water Diver', 'Enriched Air Nitrox', 'Rescue Scuba Diver', 'Master Scuba Diver', 'Deep Diver', 'Night Diver',
    'Divemaster', 'Assistant Instructor', 'Instructor', 'Skin Diving Instructor',
  ],
  CMAS: ['1 star diver', '2 star diver', '3 star diver', '4 star diver', 'Instructor 1 star', 'Instructor 2 star', 'Instructor 3 star'],
  FFESSM: [
    'Niveau 1', 'Niveau 2', 'Niveau 3', 'Niveau 4', 'Guide de palanquée', 'PE12', 'PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40',
    'Plongeur Nitrox', 'Plongeur Nitrox confirmé', 'Plongeur de bronze', 'Plongeur d’argent', 'Plongeur d’or',
    'Initiateur', 'E1', 'E2', 'E3', 'E4', 'MF1', 'MF2',
  ],
  BSAC: [
    'Discovery Diver', 'Ocean Diver', 'Sport Diver', 'Sports Diver', 'Dive Leader', 'Advanced Diver', 'First Class Diver',
    'Assistant Diving Instructor', 'Open Water Instructor', 'Club Instructor', 'Theory Instructor', 'Instructor Trainer', 'National Instructor',
  ],
  SDI: [
    'Scuba Diver', 'Open Water Scuba Diver', 'Advanced Diver', 'Rescue Diver', 'Solo Diver', 'Nitrox Diver', 'Master Scuba Diver', 'Divemaster', 'Assistant Instructor', 'Instructor',
  ],
  TDI: ['Nitrox Diver', 'Advanced Nitrox Diver', 'Decompression Procedures', 'Extended Range', 'Trimix Diver'],
  IANTD: ['Open Circuit Nitrox', 'Advanced Nitrox', 'Technical Decompression', 'Normoxic Trimix'],
  GUE: ['Fundamentals', 'Recreational Diver 1', 'Recreational Diver 2', 'Tech 1', 'Tech 2'],
  PDIC: ['Scuba Diver', 'Open Water Diver', 'Advanced Diver', 'Rescue Diver', 'Master Diver', 'Divemaster', 'Assistant Instructor', 'Instructor'],
  ACUC: ['Scuba Diver', 'Open Water Diver', 'Advanced Diver', 'Rescue Diver', 'Master Diver', 'Divemaster', 'Instructor'],
  RAID: ['Open Water 20', 'Advanced Open Water 35', 'Master Diver 40', 'Rescue Diver', 'Divemaster', 'Instructor'],
  AAUS: ['Scientific Diver'],
  AIDA: ['AIDA 1', 'AIDA 2', 'AIDA 3', 'AIDA 4', 'AIDA 2 Pool', 'AIDA 3 Pool', 'Instructor'],
  ANDI: ['Level 1 — Sport Diver'],
  ANMP: ['Niveau 1', 'Niveau 2', 'Niveau 3'],
  'Apnea Academy': ['First Level', 'Second Level', 'Third Level', 'Indoor Freediver', 'Freediver Instructor'],
  CDAA: ['Basic Cave Diver', 'Cave Diver', 'Advanced Cave Diver'],
  'CMAS-CH': ['Plongeur D1'],
  DCBC: ['Restricted Surface-Supplied Diver', 'Unrestricted Surface Supplied Diver', 'Closed Bell Diver'],
  DDI: ['Pool Diver', 'Scuba Diver', 'Open Water Diver', 'Advanced Open Water Diver', 'Nitrox 36%', 'Assistant Diver'],
  DSF: ['CMAS 1-stjernet dykker', 'CMAS 2-stjernet dykker', 'CMAS 1-stjernet instruktør', 'CMAS 2-stjernet instruktør'],
  ERDI: ['Awareness', 'Operations', 'Technician'],
  FEDAS: ['Buceador 1 Estrella'],
  FIAS: ['ARA Estensione', 'Accompagnatore Subacqueo'],
  FIPSAS: ['Subacqueo 1 grado', 'Subacqueo 2 grado', 'Istruttore 1 grado', 'Istruttore 2 grado'],
  FQAS: ['Plongeur classe A', 'Plongeur classe B', 'Plongeur classe C', 'Plongeur classe D', 'Moniteur classe A', 'Moniteur classe B', 'Moniteur classe C'],
  HSA: ['Open Water Scuba Diver Level A', 'Open Water Scuba Diver Level B', 'Open Water Scuba Diver Level C', 'Advanced'],
  IAC: ['Advanced Open Water Diver'],
  IAHD: ['Confined Water Diver', 'Sport Diver', 'Open Water Diver', 'Advanced Open Water Diver', 'Instructor'],
  IART: ['Rebreather Level 1', 'Rebreather Level 2', 'Rebreather Level 3'],
  IDA: ['Basic Diver', 'Open Water Diver', 'IDA 1 star diver'],
  IDDA: ['Open Water Diver', 'Junior Open Water Diver'],
  'IDDA-DIVERS': ['Open Water Diver', 'Advanced Open Water Diver'],
  IDEA: ['Open Water Diver', 'Advanced Open Water Diver', 'Apprentice Decompression Diver', 'Hypoxic Trimix', 'Technical Divemaster', 'Cavern Diver'],
  ISC: ['Open Water Diver', 'Advanced Open Water Diver', 'Rescue Diver', 'Divemaster', 'Instructor Trainer', 'Cavern Diver', 'Basic Free Diver', 'Free Diver 16m', 'Advanced Free Diver 24m', 'Master Free Diver 32m'],
  ISE: ['Technical Foundation'],
  KUA: ['One star diver', 'Two star diver'],
  MOLCHANOVS: ['Lap 1', 'Wave 1', 'Lap 2', 'Wave 2', 'Lap 3', 'Wave 3', 'Lap 4', 'Wave 4'],
  NASDS: ['Pool Diver', 'Basic Diver', 'Open Water Diver', 'Advanced Open Water Diver', 'Master Diver'],
  NASE: ['Open Water Diver', 'Master Diver'],
  'NSS-CDS': ['Single Tank Cavern Diver', 'Cavern Tech Diver', 'Nitrox Diver', 'Apprentice Cave Diver', 'Cave Diver', 'Advanced Cave Diver', 'CCR Cave Diver', 'Stage Cave Diver', 'DPV Cave Diver', 'Advanced Sidemount Diver', 'Trimix Cave Diver', 'CCR Trimix Cave Diver', 'Tech Nitrox and Cave Decompression Diver'],
  PDA: ['Supervised Open Water Diver', 'Open Water Diver', 'Advanced Open Water Diver', 'Advanced Open Water Diver Pro', 'Rescue Diver', 'Divemaster'],
  PFI: ['Freediver', 'Intermediate Freediver', 'Advanced Freediver'],
  ProTec: ['Open Water Diver', 'Junior Open Water Diver', 'Advanced Open Water Diver'],
  PSS: ['Scuba Diver', 'Open Water Diver', 'Advanced Open Water Diver', 'Master Scuba Diver', 'Specialty Diver', 'Nitrox / EANx Diver', 'Deep Diver', 'Deep Diver Plus', 'Night Diving', 'Limited Visibility Diving', 'Wreck Diving', 'Drift Diving', 'Search & Salvage', 'Underwater Ecology', 'Digital Underwater Photography', 'Experienced Nitrox/EANx Diver', 'Scuba Rescue Diver', 'Scuba Rescue Diver Plus', 'Divemaster', 'Assistant Instructor', 'Scuba Instructor', 'M.S.D. Trainer', 'IT Staff Instructor', 'Master Instructor', 'Instructor Trainer'],
  SAA: ['One Star Diver', 'Two Star Diver', 'Dive Leader', 'Dive Supervisor', 'Elementary Diver', 'Open Water Diver', 'Club Diver'],
  SEI: ['Supervised Diver', 'Open Water Scuba Diver', 'Nitrox', 'Advanced Open Water Diver', 'Dive Rescue Accident Management', 'Navigation', 'Deep Diver', 'Night / Limited Visibility', 'Search and Recovery', 'Master Scuba Diver', 'Advanced Specialty Explorer', 'Divemaster', 'Assistant Instructor', 'Instructor', 'Instructor Trainer', 'Course Director', 'Altitude Diver', 'Drift Diving', 'Drysuit', 'Full Face Mask', 'Wreck', 'Ice Diver', 'Side Mount'],
  SNSI: ['Open Water Diver'],
  SSDF: ['Enstjärnig dykare', 'Tvåstjärnig dykare', 'Trestjärnig dykare', 'Fyrstjärnig dykare'],
  SwedTech: ['Scuba Diver Basic Skills', 'Extended Basic Skills', 'Triple Fifty Diver', 'Technical Diver', 'Extended Range Technical Diver', 'Wreck Diver', 'JJ Rebreather Diver', 'Technical JJ CCR Diver', 'Cave Diver', 'Mine Diver', 'Diver Propulsion Vehicle'],
  UTD: ['Open Water Diver', 'Recreational 1', 'Essentials of Rec'],
  VDST: ['DTSA Grundtauchschein', 'DTSA Basic', 'DTSA Bronze', 'DTSA Silber', 'DTSA Gold'],
  VIT: ['Basic Diver', 'Open Water Diver ★', 'Experienced Diver ★★', 'Dive Master ★★★', 'Assistant Instructor', 'Tauchlehrer ★', 'Tauchlehrer ★★'],
  WOSD: ['Supervised Diver', 'Autonomous Diver', 'Dive Leader', 'Underwater Navigator', 'Night Diver', 'Multi-level Deep Diver', 'Equipment Specialist', 'Rescue Diver'],
  YMCA: ['Open Water Diver', 'Advanced Open Water Diver', 'Silver Advanced Diver', 'Divemaster', 'Gold Master Diver'],
  other: [],
};
