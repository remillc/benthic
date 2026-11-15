# Writing the interface text

How to write every text the diver reads in OpenDives: labels, help lines, buttons, messages, empty states. The rules come from Christian's corrections on the mock-ups. Read this before writing or changing any visible text, on the canvas or in `app/src/i18n/*.json`.

The examples are in French, the app's reference language. The rules apply to every language.

## The test

Before keeping a sentence, ask: **what does the diver learn here that the screen does not already tell them?** If the answer is "nothing", cut the sentence.

## Rules

### 1. No introduction sentence

A help line starts with the useful information. It does not restate the screen's title or describe what the list contains.

- Before: « Les ordinateurs d'où viennent vos plongées. Le nom choisi s'affiche dans le carnet et le détail des plongées. »
- After: « Le nom choisi s'affiche dans le carnet et le détail des plongées. »

### 2. Say what a setting does or where it acts, not what it is

The help line under a setting tells where the choice has an effect in the app. It does not list the possible values: the choice list already shows them.

- Before: « Eau douce, eau de mer ou EN 13319, pour… »
- After: say which screens or calculations use the value, without the list.

### 3. One idea per sentence, and no vague words

Each sentence makes one precise claim. Avoid words that leave the diver guessing ("certains", "parfois", "selon le cas", "etc."). If a sentence needs to be re-read to be understood, rewrite it.

- Christian's reactions to avoid: « C'est un peu vague », « La formulation est floue », « On ne comprend pas la dernière phrase ».

### 4. Say exactly what is affected

When an action touches some data and not other data, name what it touches. The diver must not have to guess the scope.

- Before: « Carnet complet (.ssrf) · Tout le contenu… » (reads as if the selection were ignored, or the reverse)
- After: name the format and state clearly whether the selection or the whole logbook is exported.

### 5. No reassurance or status text that adds nothing

Do not add "saved", "stored", "kept" or advice the diver did not ask for when the screen already makes it obvious.

- Before: « Regrouper les plongées en voyages · Enregistré… »
- After: « Regrouper les plongées en voyages »
- Before: « Plafond de décompression : remonter au-dessus… »
- After: « Plafond de décompression »

### 6. Do not mention Subsurface

The app is OpenDives. Mention Subsurface only where the diver must know it to act (file format names, the Subsurface cloud account). Never as a comparison or an explanation.

- Christian's correction: « Arrête d'évoquer SS. Ce n'est pas utile. »

### 7. Short labels, plain verbs

- Buttons: a verb, then what it acts on if needed (« Exporter », « Supprimer la plongée »).
- Section titles: one or two nouns.
- Keep the diver's words: « bouteille », « plongée », « carnet », « palier ».

### 8. Typography (French)

- No semicolons. Use a full stop or a line break.
- fr-CA formats: « 10 h 44 » with non-breaking spaces, « pi », « pi³ ».
- Non-breaking space before « : », « ? », « ! » and inside « ».
- Never break a line between a number and its unit, in every language: join them with a non-breaking space (U+00A0) — « 27,6 m », « 1,6 bar », « 302 Mo », « 90 % », « 14 h 30 », « 9 plongées », en « 27.6 m », « 302 MB » (decided on 13 November 2026).
- Never break a line inside a relative time: « il y a 2 min », « dans 3 h », « hier à 14 h 30 », en « 2 min ago », « in 3 h » stay on one line, joined with non-breaking spaces, so a long status breaks before them (« Synchronisé / il y a 2 min ») (decided on 14 November 2026).
- A counter line that ends with « dernière … il y a … » keeps that whole clause on one line: « 9 plongées · 4 sites · / dernière plongée il y a 9 mois », en « 9 dives · 4 sites · / last dive 9 months ago ». A « · » separator never starts a line (decided on 15 November 2026).
- Sentence case, no title case.

### 9. Vocabulary (French)

- **Canadian French (fr-CA): « courriel »; French (fr): « e-mail »** (to-do #18, tasks 140 and 141 of 14 November 2026). fr-CA: « Adresse courriel », « Courriel » as a short row label, « envoyé par courriel », « Cette adresse courriel n’est pas valide »; fr: « Adresse e-mail », « E-mail », « envoyé par e-mail », « Cette adresse e-mail n’est pas valide ». The fr-CA words go in `fr-CA.json`, which holds only what differs from `fr.json`. The mock-ups are in Canadian French. English keeps « email ». Code comments and identifiers are not concerned.


### 8. No promise about where the data never goes

Do not write that dives or data are never sent to OpenDives, or similar promises about the future. Paid hosting on an OpenDives server may come later, and such a line would then be false. Say where the logbook is kept, not where it will never go.

- Removed on 15 November 2026: « Aucune plongée n’est envoyée à OpenDives. »

## Before publishing a text

1. Read it out loud once. Cut every word that does not change the meaning.
2. Apply the test above to each sentence.
3. Check it against rules 1 to 8.
4. When in doubt between two wordings, keep the shorter one.
