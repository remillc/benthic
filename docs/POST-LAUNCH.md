# Idées à évaluer après le lancement

Christian's list of ideas to look at again once the public version is out. Created on 19 November 2026. Nobody works on these items before the launch.

Rules:
- Same numbering as `docs/TODOS.md` and `docs/IDEAS.md` (shared "Next number" in `docs/TODOS.md`). A number is never reused or changed.
- Same tags: `[design]`, `[code]` or `[site]`, then `[hors compat. SS]` when it applies.
- After the launch, Christian moves an item to the to-dos or the ideas, or drops it.
- No other content in this file: no history, no notes from agents.

## List
- #104 [design] Rappel d’entretien pour la pile des ordinateurs de plongée qui ont une pile à changer soi-même (par exemple le Shearwater Perdix 2, pile AA) : un rappel toutes les X heures sous l’eau. Retiré des maquettes le 19 novembre 2026 : pour l’instant, un ordinateur n’a aucun rappel d’entretien.
- #105 [design] Faire des rappels d'entretien basés sur le nombre d'heures plongées plutôt que le nombre de plongées ou une date calendrier.
- #109 [design] Permettre d’ajouter plus d’un contact d’urgence dans le profil du plongeur (pour l’instant, un seul). Numéro corrigé le 19 novembre 2026 : la tâche 311 le cite comme #107.
- #110 [design] Afficher la fiche d’urgence sans déverrouiller le téléphone (comme la fiche médicale d’Android et d’iPhone) : notification fixe, widget ou fiche médicale du système. Écarté du lancement le 19 novembre 2026. Numéro corrigé le 19 novembre 2026 : la tâche 311 le cite comme #108.
- #111 [design] Vérifier périodiquement s’il existe de nouveaux modèles d’ordinateurs de plongée à ajouter (photos et base de modèles).
- #114 [code] Après le lancement, prévoir une tâche récurrente pour mettre à jour les listes d'agences de certification et leurs certifications.
- #170 [code] prévoir mettre à jour régulièrement les données provenant de [OpenDiving Commons](https://github.com/opendiving/opendiving-commons) dans la carte commune des sites de plongée. Implementation in progress: the server fetches the complete catalogue at startup and every 24 hours, validates it before applying changes, and retains the previous data if the download or validation fails. Not yet activated on the development server.
