# Changelog

All notable changes to Benthic are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the app uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). This file is updated at
each release; the app's own "What's new" list (About) describes the current version
in fewer words.

## [0.3.0] - 2026-11-24

This release covers everything since 0.2.0 (8 November 2026): the app became Benthic,
gained a desktop version and an iPhone and iPad build, a paid offer (Benthic+) with its
own server, and a rebuilt planner, equipment and interface. It is not published on
Google Play.

### Added

- **Benthic+ (paid offer).** Sign in with your e-mail address and a 6-digit code, no
  password. The logbook, the diver profile, the equipment, the certifications and the
  documents are saved on the Benthic server and follow the diver on every device. The
  offer page lists what is included, with "Continue without a subscription" under
  "Subscribe". Without Benthic+, the logbook stays on the device and every other
  function stays free.
- **Sign in with Apple.** "Continue with Apple" (iPhone, iPad) signs in or creates the
  account, with Apple's official button ("Continue with Google" is shown but not active
  yet). An existing Benthic+ account with the same address is reused; deleting the
  account also revokes the access Apple gave.
- **New devices.** A new device is paired by asking for access: a device already paired
  shows the request with a 6-digit code to compare before approving, or a 26-character
  recovery key can be used. Benthic notifies you, even when closed, when a device asks
  (phone and tablet). Encrypted data (the date of birth included) is readable only on
  paired devices.
- **Automatic sync.** The logbook syncs by itself with the server: offline with
  changes waiting, failures explained with what to do, conflicts resolved from a dialog
  with readable differences and "Later". "Wi-Fi or cable only" stays an option. A white
  line drawn on the header's faint profile shows the progress while the app talks to the
  server.
- **Backup and restore (Benthic+).** "What do you want to recover?" offers a deleted
  dive, a version of a dive or the whole logbook at a date, each on its own screen. The
  logbook is browsed on a timeline by day showing what changed since each version, and a
  version shows what will change if you restore it. Deleted dives are shown as readable
  cards, including those deleted before the account was created. A restored dive takes
  the missing number at its position.
- **Photos and videos (Benthic+).** A dive shows its photos and videos as thumbnails,
  with "Add" and "See all", which opens a gallery in shooting order with the profile
  depth at the moment of each picture. Pictures are sent to the account (10 GB):
  thumbnails stay on every device, originals follow on Wi-Fi. Select to share or remove.
  They are included in the Benthic file by default.
- **Diver profile (Benthic+).** A "Profile" entry with its own home page: full name,
  information (date of birth, blood group, phone, relationship), certifications and
  documents, equipment, maintenance and the emergency sheet. A red badge counts overdue
  maintenance reminders.
- **Certifications and documents (Benthic+).** Each certification is drawn like the
  physical card in the agency's colours, with a long list of agencies and levels (free
  entry for others), an optional number and the instructor's number. A card or a document
  can be scanned and read on the device. The emergency sheet shows your highest
  certification.
- **Equipment (Benthic+).** "New piece" in two steps with 20 types (dive computer,
  regulator, suit, undersuit, cylinder, rebreather, O₂ cells, BCD, mask, fins, lamp,
  scooter, camera, knife, line cutter, compass, weight belt, surface buoy, other), a photo
  and a suggested reminder. Kits can be applied to a dive, copied from the previous
  dive, edited, and show how many dives used them. Dive computers belong to the
  equipment and show their photo wherever the model appears. A piece can be retired
  (sold, lost, broken, other) or deleted for good.
- **Maintenance reminders (Benthic+).** A reminder by time, by number of dives or both
  (the first reached counts), for cylinders (two deadlines: visual inspection and
  hydrostatic test), BCDs, regulators, rebreathers (service every year), drysuits
  (annual service, valve included) and O₂ cells (earlier of 18 months after manufacture
  and 12 months after installation). "Note a service" keeps the date and who did it.
  Notifications, a "Service" list and a card in Equipment show what is overdue, coming up
  or up to date.
- **Dive signatures (Benthic+).** "Get the dive signed" asks a buddy or an instructor to
  sign a dive; on tablet and desktop, several dives can be signed at once.
- **Desktop app (Windows, macOS, Linux).** Built with Electron on the same interface,
  with a three-pane layout, a sortable and resizable logbook table that stays fast with
  thousands of dives, a dive page in five tabs, right-click menus, several windows on several
  logbooks, and dive computers over Bluetooth.
- **iPhone and iPad.** Benthic runs on iPhone and iPad with the iOS look: a tab bar at
  the bottom (Logbook, Sites, Statistics, Tools), a side menu, tablet layouts, dive
  computer download over Bluetooth, and "Import from Apple Health" for the dives of an
  Apple Watch Ultra (depth and temperature). Files from other apps open in Benthic from
  "Open with" and the share sheet.
- **First launch.** New choices: sign in, start a logbook on this device, import a
  logbook, try the sample logbook, discover Benthic+. Creating an account asks for a
  6-digit code in six boxes; a screen says where a local logbook stays. A user of the
  alpha is offered a copy of the alpha's logbook (read from the device, without the
  network, the alpha's files untouched).
- **Benthic file (.benthic).** Export writes the whole logbook and your data (equipment,
  profile, certifications, settings), checked file by file against its fingerprints when
  imported; an incomplete file imports nothing. "Replace this logbook?" protects a
  logbook that is already there. Export is one dialog of plain rows, one per format
  (UDDF, SSRF, CSV…), with "Send to divelogs.de" that resumes after a lost connection.
- **Import.** Several files at once; Suunto app .json files; dives from Garmin watches
  (.fit, also the .zip of Garmin Connect's "Export Original"); one progress line for a
  logbook or a dive sites file. A logbook file (.ssrf, .xml, .benthic) sent from a mail
  or file app opens to be imported, after a confirmation.
- **Shared sites.** A shared map of dive sites (OpenDiving Commons) next to your own
  sites, with names from a view about 75 km wide, nearby sites grouped, and a list that
  follows the visible area.
- **Heat map.** Statistics gets "Where I dive most": the dives of the filter on a map you
  can pan and zoom, blue (few dives) to red (the most), with the leading site; up close,
  the sites' pins replace the halos.
- **Clean up the sites.** One row "Clean up the sites" opens a status page with the
  possible duplicates on a map strip, a pencil to edit each site and "Not duplicates"; it
  also lists the dives without a site (with the nearest site within 500 m) and the sites
  without a dive. A search field on Sites, a sort menu and a long press to merge sites.
- **Planned dives.** The planner is rebuilt: plans are saved in the logbook as planned
  dives and synced, with several levels and gases, volumes per gas with a bar for the
  consumed part and the reserve, a CNS bar, a decompression model for each plan, and
  sharing. A plan can start from a logbook dive; from a rebreather dive it starts on the
  diluent. The result lists every row of the dive (descent, levels, ascents, stops, the
  final ascent) with start, duration, end, speeds and gas; two SAC fields, "At the
  bottom" and "During deco"; a reserve with a SAC factor under stress and a number of
  divers; "Simplify profile" turns a measured profile into editable levels; "Save" asks
  for a title.
- **Plan sharing.** "Share plan" offers the water slate (a pocket card to print at actual
  size with cut marks, with backup plans: 5 min more, 3 m / 10 ft deeper or a lost deco
  gas, each calculated again), the PDF sheet, the table image, the planned dive's .ssrf
  file and the text summary. A dive or a plan can be shared as scrolling QR codes.
- **Best mix.** Two tabs, Nitrox and Trimix; the maximum END only applies to the trimix.
  "Prepare this mix" opens the gas blender with that mix.
- **Desaturation and flying.** A "Last dive" section with the time since surfacing, and
  "You can fly" once the wait is over; a "Wait before flying" setting (12, 18 or 24
  hours, or from the dives) puts the wait above the logbook.
- **Rebreather dives.** The Gas section draws the rebreather seen from the back, diluent
  on the left and oxygen on the right, with the bailout and stage cylinders beside it;
  "Edit dive" draws the same unit. Dive mode (open circuit, rebreather, freediving)
  chooses what the form shows.
- **Reading a gauge with the camera (Android).** In "Edit dive", a camera button in the Start and
  End fields of each cylinder reads the pressure on a digital gauge or dive computer
  display (one or two gauges, bar or psi), or on a photo. On-device text recognition;
  the photo is not kept.
- **Dive computers.** In Settings and the logbook's ⋮ menu: rename, remove or merge
  duplicates, found by serial number, then by comparing the profiles. A dive with
  several computers shows them all and "Make main" chooses one. After a download from a
  computer that is not in your equipment, "Complete the dive" offers to add it.
- **Several dives at once.** "Merge into one dive" and "Edit together…" (four tabs, a
  "Several values" state) in the logbook's selection menu, and "Shift date and time…".
- **The dives of a statistic.** Each row of My statistics and of the "By …" sections
  opens the list of its dives, newest first, under the filter in force.
- **Trips and the logbook list.** A trip can be selected and deleted while its dives stay;
  "Remove from trip" is in the dive's ⋮ menu; a bar shows where a dragged dive would
  land; dives are grouped by year; while scrolling, the band shows the month; the logbook
  can be renamed from its ⋮ menu.
- **Site map on the dive page.** When the site has GPS coordinates, a map of the site
  sits behind the header.
- **Settings.** An overview in three cards (General, Diving, Devices and data); a "Tool
  conditions" group (water type and altitude) for the planner and the gas tools; the
  water type written on downloaded dives that have none; default cylinders for open
  circuit and rebreather (diluent, oxygen, bailout); a "Download" group for Bluetooth
  devices and remembered computers; "Partial pressures" in bar or ATA; "Paper size
  (printing)": Automatic, Letter or A4; "Cylinder types" with a "Delete" for your own
  types.
- **Links.** `benthic://` and `https://benthicdivelog.app/` addresses open a dive, a
  site, the planner or a tool; a dive and a site can be shared as a link.
- **Leaving a form.** Leaving a form whose values changed (←, ✕, Android Back, the iOS
  swipe) asks "Leave without saving?" with Stay, Save and Leave. Forms are checked as you
  type.
- **Accessibility and languages.** A high-contrast mode follows the system setting
  (Android 14 and later, iOS "Increase Contrast"). French (Canada) is a language of its
  own ("courriel", "nuage"; times read "10 h 44") and a phone set to it picks it.
- **Statistics.** The "By …" sections fold; a total of time under water from 24 h is
  written in days.
- **Sample logbook.** 40 dives from 2023 to 2026 at 8 sites to try the app.
- **Scrollbar.** A dialog, a sheet or a page whose content is taller than its viewport
  shows a scrollbar on the part that scrolls, for as long as it can scroll, on every
  device.
- **Release check for the planner and the tools** (`tests/release-check.sh`, no tag
  without a green report for the commit): the 17 cases of Subsurface's planner tests
  through the façade, an independent ZH-L16C checker over 360 plans, the app chain
  (units, request, displayed values, alarms), the gas calculator, the blender against an
  independent real-gas solution and the desaturation against an independent ZH-L16C
  replay of real dives, proof that wrong inputs make each fail, the same tests compiled
  with the NDK and run on the emulator, and planner scenarios in the real app.

### Changed

- **New name.** The app is called Benthic, the paid offer Benthic+, and the name under
  the icon and in notifications Benthic Log (stores: "Benthic – Dive Log", site
  benthicdivelog.app). Installed data and sign-ins keep working.
- **New look.** The three-wave logo (a deep-blue disc with a white wave) for the app icon
  (blue to its edge on iPhone, iPad and Mac, a full blue disc on Android), the launch
  screen and About; ocean-blue header bands with a wave, side menu, profile water,
  thumbnails, cylinder drawings, selections and progress bars; rust and sand for data such
  as water temperature. Light rays and the name Benthic in its own typeface on first
  launch, with a "Beta" badge.
- **Release edition.** The default build only offers the Benthic server: it no longer
  offers to open a logbook in OneDrive, Google Drive or a personal git repository, or
  to sign in to the Subsurface cloud. A logbook that was on the Subsurface cloud is not
  opened; its files stay on the device as they were.
- **Icons.** 89 icons move to the rounded glyphs of Material Symbols; the equipment types
  take new drawings (rebreather, BCD, mask, fins, scooter); the reminder card of a new
  piece uses a bell with a plus.
- **Navigation.** On Android phones, a bottom navigation bar (Logbook, Sites, Statistics,
  Tools), an account avatar at the top right that opens a sheet (account, sync,
  Settings, About) and a back arrow on every other page; iPhone has a tab bar; tablets
  keep a sidebar or navigation rail, and no rail in portrait on Android. Back, Escape and
  the edge swipe go through one path, so a page change can no longer leave the app
  half-way.
- **Material 3 Expressive (Android).** Springy motion; dates and times in the Material
  date picker and clock; dropdown menus under their field instead of wheels and radio
  buttons; connected button groups; large titles that shrink as you scroll; a floating
  toolbar for the actions of a dive, a trip, a site and a selection; a wavy progress
  line; one snackbar style above the + button.
- **Dive page.** Follows the mock-up: top bar with the site's name once scrolled, trip
  as a link, people and tags as chips, full-width profile with entry and exit times and
  the average depth, cylinder pressure bars from 0 to the working pressure, Gas and
  Equipment as two sections (a drawing of each cylinder with its gas, use, size and
  pressures; unused cylinders show), Conditions with the average of its stars, Tags and
  Notes under the equipment. Swiping to the next or previous dive moves both dives side
  by side. No curve is on by default, "Ceiling" shows the one given by the dive
  computer, and curves are thinner.
- **Edit dive.** A Gas group before Equipment with the dive mode and the cylinder
  drawings, each cylinder in its own sheet or card with its gas in plain words and its
  size from the type; cylinders can be reordered; deleting one asks first; Conditions
  start collapsed; People and Notes are two cards; the suggested weight comes from the
  latest dive with the same suit.
- **Dive rows.** No dividers; the dive number comes before the date; on Android the
  duration above and the depth below; the dives of an open trip are indented and can be
  checked in selection mode; "Last dive … ago" no longer breaks across lines.
- **Durations and dates.** From one hour, durations follow the language ("1 h 11" in
  French, "1:11" in English); every date follows the format chosen in Settings; relative
  times read "2 min ago".
- **Cylinder drawings.** A slimmer, more realistic shape with shoulders and a neck, no
  valve, in every screen, with a thin outline; a cylinder with only one pressure or none
  is hatched in grey. Cylinder types are one list: the types of the logbook's dives and
  your own.
- **Planner.** One "Result" card with the total time and the deco stops as key figures,
  the stops (the starting gas highlighted), the volume per gas (large type, a bar and
  its legend) and the oxygen exposure; SAC fields are dropdowns (steps of 0.01 cu ft/min
  in cubic feet); oxygen, helium and altitude are dropdowns of the usual values; the SAC
  factor under stress is 2.0 by default.
- **Sync conflict.** A dialog with readable differences, "Later" and "Undo" before
  anything is sent. With several dives, a full-screen dialog with a "Same choice for all"
  switch.
- **Filter.** The Android page is rebuilt: cylinder and gas criteria grouped, a saved
  filter fills the page and can be deleted at once with "Undo"; trips are sorted
  alphabetically.
- **Statistics.** Rows no longer show the maximum depth; charts that do not measure depth
  are blue.
- **Settings.** "Reset all settings" asks first, then keeps your list of cylinders; the
  chosen units and sort orders are kept in the system's preferences; "Renumber dives"
  moves to the logbook's menu; "Group dives into trips", "Sync automatically" and
  "Show photo and video fields" are gone (Benthic never groups on its own, sync is
  always automatic, and a Benthic+ subscriber always sees the photos).
- **Export and About.** The description says "Open-source dive logbook"; each open
  source library opens its website; the privacy policy's links can be tapped; a "Rate
  Benthic" row; the version date shows in "What's new".
- **Tablets.** The logbook list is wider in landscape and opens the first dive when none
  is shown; Settings and About open full width; the detail pane's back arrow only goes
  back inside the pane; first launch fills the screen with a blue panel and every choice
  in view.
- **Secure connections.** The OpenSSL library is replaced by Mbed TLS, compatible with
  the app's licence.
- **Editing a piece of equipment.** The piece type is a dropdown with the type's icon
  (iPhone: a "Type" row under the title); the grid of type tiles stays only in step 1 of
  "New piece" on tablet and desktop. Rebreather: its O₂ cell dates move into a new
  O₂ cells piece with the rebreather's brand left empty, and its suggested reminder is a
  service every year.
- **Interface texts.** Shorter and clearer, following the writing guide; "courriel" in
  French everywhere.

### Fixed

- **Slow buttons.** Navigation buttons reacted a fraction of a second late, and a tap that
  slid a little was sometimes ignored.
- **Large logbooks.** A logbook of a thousand dives with profiles loads faster and with
  far less memory; a long profile is drawn with fewer points; the dives behind a
  statistic open faster.
- **Units.** The units chosen on the device no longer go back to the logbook's at
  restart, and a single unit changed after "Imperial" or "Metric" is kept.
- **Saved plans.** A plan keeps its rates, reserve and other settings, and gives the same
  result when reopened.
- **Gas blender.** The helium step of a trimix was about 0.8 % short (the core read pure
  helium as air in its compressibility), and the oxygen step as much too long.
- **Planner.** The keyboard closed while typing in a level, gas or GF field; in cubic feet,
  the SAC from Settings was rounded to 0.01 cu ft/min before the calculation (20 L/min
  became 20.1).
- **Dates (desktop).** In edit mode, the date fields of the equipment and profile forms
  followed another format than Settings › "Date format".
- **Windows.** "Edit dive" and the quick entry saved only part of their fields.
- **Offline.** An unreachable server no longer opens an error report: the logbook shows
  that it is offline and tries again later. Changes made on another device reach an open
  dive without closing it.
- **Sync.** Changes received appear in Sites and in the logbook without reopening the
  app; a server that does not answer is no longer shown as a refused token; dropping a
  dive back on its own place changes nothing.
- **Dive computers.** Downloading no longer freezes the screen; a lamp or a scale whose
  name starts with "S1" is no longer taken for a dive computer.
- **Trips and numbers.** A trip of one dive is shown as a dive, and a dive on its own no
  longer shows a trip. Deleting or merging dives adjusts the numbers of later dives,
  also when some are unnumbered.
- **Sharing.** The app no longer stays stuck under a grey veil after sharing a dive or a
  plan.
- **Start-up.** The app no longer stays on a white screen before its look has loaded, and
  the launch screen stays until the first real screen is drawn.
- **Navigation.** Back no longer misbehaves after swiping to the neighbouring dive; after
  signing out on a tablet, the last dive no longer stays beside the empty logbook.
- **Statistics and layout.** A value is no longer cut in the middle of a number or word;
  a row no longer stays tinted grey after turning a large phone to landscape and back; the
  header band no longer stays darkened after touching the logbook search.
- **Logbook margins (Android).** Dive rows had 8 dp too much on each side.
- **What's new.** The list stopped after 20 entries.

## [0.2.0] - 2026-11-08

### Added

- **Dive editor with every field Subsurface desktop edits**: date and time, site, trip,
  rating, people and tags, notes, suit, dive mode, every cylinder field (type, use,
  size, working pressure, start and end pressures, O₂, He, gas switch depth with the
  MOD as helper), weights, conditions, air and water temperatures, water type,
  atmospheric pressure and "Invalid dive". Duration and maximum depth are shown, as
  measured by the dive computer. Cylinders and weights can be added and removed (a
  cylinder used by the profile cannot be removed).
- **Weights**: choosing a weight location fills in the last weight used for it, from
  Subsurface's own table.
- **Site and trip typed or chosen**: the list narrows with every word typed, in any
  order, case and accents aside; a new name creates the site or the trip. The same
  applies to the suit.
- **Renumber a dive** from the dive's ⋮ menu: the dives in between shift by one, so
  numbers stay unique and without gaps; said live under the field. One undoable step,
  as Subsurface's RenumberDives.
- **Share a dive** from its ⋮ menu: a one-page PDF sheet (profile, gas, equipment,
  people, conditions, notes), or a short text with the profile image, through the
  system share sheet.
- **Export the selected dives** from the logbook's selection menu: full logbook
  (.ssrf), UDDF, CSV list of dives, CSV profiles or PDF sheets (one page per dive),
  with Subsurface's Anonymize option. The last format is remembered.
- **Dive profile**: graduated depth and time axes, and layers to show or hide as filter
  chips: water temperature (on by default), gas, ppO₂ (0 to 1.6 bar with the 1.4 and
  1.6 limits), decompression ceiling and the 16 tissue compartments at the cursor. The
  cursor readout adds the value of each layer shown.
- **Download from the dive computer**: a "Stop download" button; the progress bar moves
  steadily while each dive is transferred.
- **Planner**: settings on their own screen (rates, stops, gas, reserve), plan data
  edited in place, the decompression ceiling on the planned profile, the SAC chosen
  from a menu.
- **Sync**: the current stage and a progress bar in the side menu; "Sync now" shows its
  progress in the button and a message confirms the end or reports the error.
- **Tablets**: list and detail side by side for Statistics, Tools and Sites (list and
  map); the dive editor opens as a sheet (iPad) or a pane (Android) over the logbook.
- **Settings**: paper size of the PDF sheets ("System" follows the region: US Letter
  where it is used, A4 elsewhere).
- **Sites**: map, site page, dives without a site, sites without coordinates and
  duplicate clean-up.
- **Delete a dive** from its ⋮ menu, with "Undo" for 10 seconds.
- **About**: privacy policy (also published as a web page) and "Question / report a
  problem" by email.
- **Swipes** between the sections of the side menu and back from a sub-screen.

### Changed

- **Units**: every measure follows the units of the settings; round defaults in each
  system (45 ft, 3,000 psi, 30 and 60 ft/min, 500 psi); the SAC in cubic feet has two
  decimals; imperial symbols are translated in the language of use.
- **Planner**: a single ascent rate; the last stop as a choice of depth.
- **Gas blender**: nitrox by default, the last mode chosen is remembered.
- **Snackbars** stay at least 4 seconds, 6 seconds when they offer "Undo".
- **Text**: Source Sans 3 at the size of the mock-ups; shorter profile hint.
- **Addresses** inside the app: collections end with a slash, resources do not
  (`/dives/42`, `/sites/`).
- The "What's new" list is headed by the app's version, read from `package.json`.

### Fixed

- **Downloads**: new dives are numbered after the last dive of the logbook even when
  the download also reads older dives again.
- **Sharing by email**: Gmail sent a broken attachment, as it reads the file after the
  share sheet closes; the receiving apps now keep read access to the shared file.
- **Exports and imports through XSLT** (UDDF, CSV): Subsurface's stylesheets are shipped
  with the app, and stylesheets that include another one load again.
- **Back key**: closes only the search of the screen shown.
- **Sync now**: the list and the menu stay in place while it runs.

## [0.1.0] - 2026-11-07

First test version, for Android: logbook synced with the Subsurface cloud or kept on
the device only, dive pages with the profile, trips, sites on a map, download from the
dive computer over Bluetooth, statistics, planner and gas tools.

[0.3.0]: https://github.com/remillc/opendives/releases/tag/v0.3.0
[0.2.0]: https://github.com/remillc/opendives/releases/tag/v0.2.0
