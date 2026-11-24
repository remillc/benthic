# Equipment fields by piece type

Decided by Christian on 19 November 2026 (Benthic+, « Mon profil de plongeur › Équipement »). The form of « Nouvelle pièce » and « Modifier la pièce » shows only the fields of the chosen type. On a new piece, no type is selected initially; choosing one transitions to its form within the same dialog (full screen on phones). The diver can return to the type choices before saving.

- **Required:** the piece type only. Every other field is optional.
- **Common to every type:** « Date d’achat » and « Notes ». Nothing else is common.
- **Storage:** the equipment inventory, maintenance and certifications are kept on the Benthic server, next to the logbook (decision of 19 November 2026; closes #42 and #61). Nothing is written into the Subsurface logbook.
- **Wording:** fr-CA. The buoyancy compensator is « Veste » (fr-FR would say « Gilet stabilisateur »).

Updated by Christian on 23 November 2026 (task 334). Labels as the app shows them in French. Every type also has « Date d’achat » and « Notes ».

| Type | Photo | Identification | Fields of the type | Maintenance and reminders |
|---|---|---|---|---|
| Ordinateur | ✓ | Marque, modèle, n° de série | Micrologiciel (read at download, never typed) | None |
| Détendeur | ✓ | Marque, modèle, n° de série | N° de série du deuxième étage · Raccord (DIN / Étrier) · Nombre de deuxièmes étages · Compatible nitrox · Eau froide | Révision every 12 months or 100 dives, whichever comes first |
| Combinaison | — | Marque, modèle, n° de série | Type (Humide / Semi-étanche / Étanche) · Épaisseur · Taille · Matériau (Néoprène / Néoprène compressé / Trilaminé / Autre) | Étanche only: révision every 12 months |
| Sous-vêtement | — | Marque, modèle | Taille | None |
| Bouteille | — | Nom (« AL80 jaune »), **marque** (new) | Type de bouteille · Matériau (Aluminium / Acier) · Robinet (DIN / Étrier) · n° de série · Propre O₂ · Dernière inspection visuelle · Dernier test hydrostatique (« 03/22 ») | Inspection visuelle every 12 months · test hydrostatique every 5 years |
| Recycleur | ✓ | Marque, modèle, n° de série | Dernière révision (its O₂ cells are a piece of their own since task 397) | Révision every 12 months |
| Cellules O₂ | — | Marque (no model, no photo, no serial number) | Numéro (« Sur l’étiquette de la cellule ») · Date de fabrication · Date d’installation (one row; no « Date d’achat ») | « Rappel de remplacement »: due at the **earlier** of manufacture date + 18 months and installation date + 12 months |
| Veste | ✓ | Marque, modèle, n° de série | Type de veste (Veste / Wing / Side-mount) · Portance · Lest intégré · Taille | Révision every 12 months |
| Lampe | ✓ | Marque, modèle | Puissance (lumens) · Batterie · Autonomie | None |
| Lest | — | Nom | Type (À plombs / À poches / Harnais) | None |
| Masque | — | Marque, modèle | Verres correcteurs | None |
| Palmes | — | Marque, modèle | Type (Chausson / Réglables) · Taille | None |
| Scooter | ✓ | Marque, modèle, n° de série | — (**removed:** Batterie, Autonomie, Vitesse) | None |
| Appareil photo | ✓ | Marque, modèle, n° de série | — (**removed:** Profondeur du caisson) | None |
| Parachute de palier | — | Marque, modèle | Portance | None |
| Bouée de surface | — | Marque, modèle | — (**removed:** Couleur) | None |
| Coupe-ligne | — | Marque, modèle | — | None |
| Couteau | — | Marque, modèle | — | None |
| Compas | — | Marque, modèle | — | None |
| Autre | ✓ | Nom de la pièce | Type de pièce (free text, before the name) | None |

Reminders exist only for Bouteille, Veste, Détendeur, Recycleur, Cellules O₂ and Combinaison étanche (to-do #148): no free reminder on the other types. A piece whose name is not typed is named « Marque Modèle », else the type's name; the name is typed by hand only for Bouteille, Lest and Autre (the cylinder's brand does not make its name).

The original `knife` type is displayed as « Coupe-ligne »; `diveKnife` is the distinct « Couteau » type. Existing pieces retain their original type and are therefore displayed as line cutters.

An active piece's menu offers permanent deletion after confirmation. The piece, its photos and maintenance history are erased, and its links to kits and dives are removed; the dives stay in the logbook. A retired piece can still be deleted from its sheet.

The general Maintenance entries in the profile and equipment views appear only while a non-retired piece has an active reminder. A piece's own maintenance link remains available to add a first reminder.
