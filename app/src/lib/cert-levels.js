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
  other: [],
};
