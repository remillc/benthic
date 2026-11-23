// @ts-check
// Contract between the interface and the native BenthicCore plugin.
// All values are in integer SI units, as in the core:
// mm, s, mK, mbar, ml, per mille. Conversion happens at display time.
import { registerPlugin } from '@capacitor/core';
import { waterTypeOf } from './water-type.js';
import { sortCylinderTypes } from './cylinder-sort.js';

export { waterTypeOf };

/**
 * The column mapping of a CSV import (import_csv in core/libbenthic/benthic.h): `format` is `samples` (a
 * profile per file), `dives` (a dive per line), `seabear` or `poseidon`; `template` the stylesheet of `samples`
 * (`csv`, `SensusCSV`); the other keys are the stylesheets' own: a column index (`timeField`, `depthField`, ...,
 * -1 for none), an option index (`separatorIndex`, `units`, `datefmt`, `durationfmt`) or a text (`date`, `time`, `hw`).
 * Key order counts: `date` comes first when given.
 * @typedef {{ format: 'samples'|'dives'|'seabear'|'poseidon', template?: string, [key: string]: string|number|undefined }} CsvParams
 */

/**
 * Trip identifiers change on every load: never store them.
 * @typedef {Object} DiveTrip
 * @property {number} id
 * @property {string} location empty string when the trip has no name
 * @property {boolean} autogen trip created by the core's automatic grouping
 */

/**
 * @typedef {Object} LogbookComputer
 * @property {string} model
 * @property {string} serial empty string when unknown
 * @property {string} firmware empty string when unknown
 * @property {string} nickname empty string when none
 * @property {number} dives
 * @property {boolean} listed it has an entry in the core's device list
 * @property {{model: string, serial: string, dives: number, same: number}[]} shared other computers in the same dives: in how many, and in how many as the same recording
 */

/**
 * Every visible text of the gauge camera (it is native: the app passes the translated texts).
 * @typedef {Object} GaugeCameraOptions
 * @property {string} title "Pression de début"
 * @property {string} subtitle cylinder and gas
 * @property {string} hintMain
 * @property {string} hintSub
 * @property {string} flash accessible name of the flash button
 * @property {string} photos "Photos"
 * @property {string} photosDescription accessible name of the gallery button
 * @property {string} shutter
 * @property {string} manual "Saisir à la main"
 * @property {string} close
 * @property {string} nothingTitle
 * @property {string} nothingText
 * @property {string} permissionReason why the camera permission is asked
 * @property {string} permissionButton
 * @property {string} permissionDenied
 * @property {string} cameraFailed
 * @property {boolean} [nothingRead] open on the "nothing read" alert
 */

/**
 * Every visible text of the QR scanner (it is native: the app passes the translated texts).
 * The panel counts the codes with the header of app/src/lib/qr-transfer.js.
 * @typedef {Object} QrScanOptions
 * @property {'transfer'|'text'} [mode] 'transfer' (default): the codes of a dive or a plan (`OD1~...`), several of them;
 *   'text': the first code, whatever it holds, ends the scan (the account pairing codes, which the web layer checks)
 * @property {string} title "Scanner un code QR"
 * @property {string} close accessible name of the close button
 * @property {string} hint "Gardez la caméra sur l'autre écran. ..."
 * @property {string} hintFirst shown before the first code: what to point the camera at
 * @property {string} kindDive "Plongée" (the panel reads "Plongée · <site>")
 * @property {string} kindPlan "Plan"
 * @property {string} progress "{n} codes lus sur {total}": with the placeholders {n} and {total}
 * @property {string} progressOne "1 code lu sur {total}"
 * @property {string} progressBar accessible name of the segmented bar
 * @property {string} foreign "Ce code QR ne vient pas d'Benthic."
 * @property {string} newerVersion a Benthic code of a later format
 * @property {string} otherTitle asked when a code of another transfer arrives
 * @property {string} otherText
 * @property {string} otherRestart
 * @property {string} otherKeep
 * @property {string} permissionReason
 * @property {string} permissionButton
 * @property {string} permissionDeniedTitle
 * @property {string} permissionDenied
 * @property {string} permissionSettings "Ouvrir les réglages"
 * @property {string} cameraFailed
 */

/**
 * How the QR scanner ended: closed, or every code of one transfer read (the raw texts of
 * the codes, to be decoded by lib/qr-transfer.js).
 * @typedef {{action: 'cancelled'} | {action: 'done', codes: string[]}} QrScanResult
 */

/**
 * A piece of text found in a picture; the box is in fractions (0 to 1) of the analysed picture.
 * @typedef {{text: string, left: number, top: number, right: number, bottom: number, confidence: number}} GaugeTextBlock
 */

/**
 * How the gauge camera ended: closed, "Saisir à la main", or a picture that contained text
 * (a picture with none keeps the camera open on its alert). thumbnail: base64 JPEG of the
 * analysed area; the picture itself is never kept.
 * @typedef {{action: 'cancelled'|'manual'} | {action: 'photo', thumbnail: string, blocks: GaugeTextBlock[]}} GaugeCameraResult
 */

/**
 * A dive in the logbook list.
 * @typedef {Object} Dive
 * @property {number} id identifier valid until the next load (for getDive)
 * @property {number} number
 * @property {string} date local time of the dive, e.g. 2012-11-05T10:15:00
 * @property {string} site empty string when there is no site
 * @property {number} maxDepthMm
 * @property {number} durationSeconds
 * @property {number[]} profile thumbnail: flat [time s, depth mm] pairs, about 40
 * @property {DiveTrip|null} trip
 */

/**
 * @typedef {Object} Cylinder
 * @property {string} description e.g. AL80; empty string when unknown
 * @property {number} sizeMl
 * @property {number} workingPressureMbar
 * @property {number} startMbar 0 when unknown
 * @property {number} endMbar 0 when unknown
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {string} gas mix name given by the core: Air, EAN32, (18/45)…
 * @property {string} use OC-gas, diluent, oxygen, not used
 * @property {boolean} used the cylinder is breathed during the dive
 * @property {number} gasUsedMl gas used, computed by the core (compressibility included); 0 when unknown
 * @property {number} switchDepthMm depth of the first switch to this cylinder after the start (core's get_depth_at_time); 0 when none
 * @property {number} depthMm gas switch depth as stored (editor's "Changement de gaz à"); 0 when not set
 * @property {boolean} protected used by the profile: cannot be removed
 */

/**
 * Profile computed by the core (profile.cpp), one point per plot entry.
 * @typedef {Object} DiveSamples
 * @property {number[]} timeSeconds
 * @property {number[]} depthMm
 * @property {number[]} cylinder open-circuit cylinder being breathed; -1 when unknown or rebreather
 * @property {number[]|null} ceilingMm the ceiling the dive computer reported (its deco stop while in deco, never below the diver),
 *   as Subsurface for desktop draws it; computed with the app's gradient factors only when the computer recorded no deco
 *   data (see ceilingSource); null when zero for the whole dive
 * @property {'computer'|'calculated'} ceilingSource where ceilingMm comes from; with the computer's, it follows the dcCeiling setting
 * @property {number[]|null} calcCeilingMm the ceiling the core computes with the app's gradient factors, beside the computer's,
 *   when the calcCeiling setting is on; null otherwise
 * @property {number[]} ppo2Mbar
 * @property {number[]|null} temperatureMk water temperature in mK (0 where unknown); null when the dive has none
 * @property {number[]|null} tissues loading of the 16 compartments in percent (100 = M-value limit with the gradient factors), flat: compartment c at sample i is tissues[16 * i + c]; null without profile
 */

/**
 * @typedef {Object} DiveDetail
 * @property {number} id
 * @property {number} number
 * @property {string} date
 * @property {string} site
 * @property {{latUdeg: number, lonUdeg: number}|null} siteCoordinates the site's GPS position, in millionths of a degree
 * @property {{city: string, region: string, country: string}} siteLocation from the site's taxonomy; empty strings when unknown
 * @property {number} maxDepthMm
 * @property {number} meanDepthMm
 * @property {number} durationSeconds
 * @property {number} waterTempMk 0 when unknown
 * @property {number} airTempMk 0 when unknown
 * @property {number} sacMlMin 0 when unknown
 * @property {number} cns
 * @property {number} otu
 * @property {number} rating 0 to 5 stars; 0: not filled in
 * @property {number} visibility 0 to 5 stars; 0: not filled in
 * @property {{wavesize: number, current: number, surge: number, chill: number}} conditions 0 to 5 stars each
 * @property {number} salinity the dive's salinity as the core works it out (kg per 10000 L; the diver's choice, else the computer's); 0 when unknown
 * @property {''|'fresh'|'brackish'|'en13319'|'salt'} waterType named from `salinity` by waterTypeOf, in JavaScript
 * @property {number} surfacePressureMbar as stored; 0 when not stored
 * @property {number} userSalinity water type chosen by the diver (kg per 10000 L); 0 when none
 * @property {boolean} invalid marked invalid
 * @property {boolean} manual entered by hand: duration and depth can be edited
 * @property {number} pictures number of pictures and videos referenced
 * @property {{model: string, nickname: string, divemode: string, serial: string}[]} diveComputers the first is the main one; `serial` as « Ordinateurs du carnet » names it
 * @property {string} divemode OC, CCR, PSCR, Freedive
 * @property {string} computer model of the first dive computer
 * @property {number} computers number of dive computers
 * @property {string[]} buddies
 * @property {string[]} guides
 * @property {string} suit
 * @property {{grams: number, description: string}[]} weights description as stored, e.g. integrated, belt
 * @property {string[]} tags
 * @property {string} notes
 * @property {DiveTrip|null} trip
 * @property {Cylinder[]} cylinders
 * @property {{type: 'gaschange', timeSeconds: number, cylinder: number}[]} events
 * @property {DiveSamples} samples
 */

/**
 * Units, one per quantity (Subsurface's preferences; the log's when it has a
 * "units" line).
 * @typedef {Object} Units
 * @property {'m'|'ft'} length
 * @property {'C'|'F'} temperature
 * @property {'bar'|'psi'} pressure
 * @property {'l'|'cuft'} volume
 * @property {'kg'|'lbs'} weight
 */

/**
 * The core's preferences shown in Settings (core/pref.h), in integer units;
 * the keys accepted by setPrefs.
 * @typedef {Units & {
 *   unitSystem: 'metric'|'imperial'|'personalize',
 *   verticalSpeed: 'min'|'s',
 *   duration: 'mixed'|'minutes'|'hours',
 *   dateFormat: string, dateFormatOverride: boolean,
 *   timeFormat: string, timeFormatOverride: boolean,
 *   displayInvalidDives: boolean, extraEnvironmental: boolean, salinityEdit: boolean,
 *   defaultCylinder: string, includeUnusedTanks: boolean, displayDefaultTankInfos: boolean,
 *   showAverageDepth: boolean, threeMGrid: boolean, dcCeiling: boolean, redCeiling: boolean,
 *   calcCeiling: boolean, tankbar: boolean,
 *   decoModel: 'buehlmann'|'vpmb', gfLow: number, gfHigh: number, vpmbConservatism: number,
 *   o2narcotic: boolean, bestMixEndMm: number,
 *   po2MinMbar: number, po2MaxMbar: number, pn2Mbar: number, pheMbar: number, modPo2Mbar: number,
 *   setpointMbar: number, showCcrSensors: boolean, showCcrSetpoint: boolean,
 *   allowOcGasAsDiluent: boolean, showScrOcPo2: boolean,
 *   o2ConsumptionMlMin: number, pscrRatio: number,
 *   bottomPo2Mbar: number, decoPo2Mbar: number, bottomSacMlMin: number, decoSacMlMin: number,
 *   descentMmMin: number, ascent75MmMin: number, ascent50MmMin: number, ascentStopsMmMin: number,
 *   ascentLast6mMmMin: number, lastStop6m: boolean, safetyStop: boolean, switchAtRequiredStop: boolean,
 *   minSwitchSeconds: number, o2Breaks: boolean, dropStone: boolean, reserveMbar: number, problemSolvingMinutes: number,
 *   sacFactor: number,
 * }} CorePrefValues
 * The planner's own values (rates in mm per minute, sacFactor x100) are set from the planner screen.
 */

/**
 * @typedef {CorePrefValues & {
 *   autogroup?: boolean,
 *   diveComputers?: {slot: number, vendor: string, product: string, device: string, name: string}[],
 *   diveComputerList?: string[],
 *   planner?: {bottomPo2Mbar: number, decoPo2Mbar: number, bottomSacMlMin: number, decoSacMlMin: number},
 *   defaults?: CorePrefValues,
 * }} Prefs
 * `autogroup` is the log's; `diveComputers` the remembered ones (`diveComputerList`: the last
 * one used then the four remembered, vendor, product, device, name each, as setPrefs takes it); `defaults`
 * Subsurface's default of each value.
 */

/**
 * @typedef {Object} CylinderType
 * @property {string} name
 * @property {number} ml
 * @property {number} mbar working pressure; 0 when unknown
 * @property {number} dives how many dives of the logbook use it
 * @property {boolean} standard in the core's default list
 * @property {boolean} library in the device's library (can be removed)
 */

/**
 * What deleting one of the diver's types does to the dives (cylinder_type_delete in benthic.h).
 * @typedef {Object} CylinderTypeDeletion
 * @property {number} removed dives that lose the cylinder
 * @property {number} kept dives where a cylinder stays, its type cleared (it is the dive's only
 *   cylinder, or a gas change or the pressure graph depends on it)
 */

/**
 * @typedef {Object} CylinderTypes
 * @property {CylinderType[]} types the runtime table, sorted by name
 * @property {string[]} library the device's library, to keep as is and set again at start
 * @property {CylinderTypeDeletion} [deletion] after 'delete' and 'deletePreview'
 * @property {string} undo
 * @property {string} redo
 */

/**
 * Planner settings (plan_dive in benthic.h). The deco model, gradient
 * factors and VPM-B conservatism are the shared preferences (Settings); the
 * others are the planner's own, rates in mm per minute.
 * @typedef {Object} PlannerSetup
 * @property {'buehlmann'|'vpmb'|'recreational'} model
 * @property {number} gfLow
 * @property {number} gfHigh
 * @property {number} vpmbConservatism
 * @property {number} bottomSacMlMin
 * @property {number} decoSacMlMin
 * @property {number} bottomPo2Mbar
 * @property {number} decoPo2Mbar
 * @property {number} descentMmMin
 * @property {number} ascent75MmMin
 * @property {number} ascent50MmMin
 * @property {number} ascentStopsMmMin
 * @property {number} ascentLast6mMmMin
 * @property {boolean} lastStop6m
 * @property {boolean} safetyStop
 * @property {boolean} switchAtRequiredStop
 * @property {number} minSwitchSeconds
 * @property {boolean} o2Breaks
 * @property {boolean} dropStone instant descent (Subsurface's drop_stone_mode)
 * @property {number} reserveMbar
 * @property {number} problemSolvingMinutes
 * @property {number} sacFactor x100
 */

/**
 * @typedef {Object} PlanCylinderRequest
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {number} sizeMl
 * @property {number} [sizeMl] with startMbar; both absent: volumes only (reserveMl)
 * @property {number} [startMbar]
 * @property {number} [switchDepthMm] deco gases: 0 or absent for the MOD at the ppO2 for deco
 * @property {number} [sourceCylinder] the cylinder of the dive this gas stands for (sourceDiveId)
 * @property {number} [carriedMl] kept with a saved plan, not used by the core
 */

/**
 * The profile (levels, the waypoints of a logged dive, or a square one) and the
 * settings for this plan. Each level's time is at depth; the transit is added.
 * With both sourceDiveId and levels, the levels are the profile and the dive
 * gives the date and the surface interval (it stays out of the tissue loading).
 * @typedef {Partial<Omit<PlannerSetup, 'model'>> & {
 *   levels?: {depthMm: number, durationSeconds: number}[], sourceDiveId?: number,
 *   depthMm?: number, bottomTimeSeconds?: number, cylinders: PlanCylinderRequest[],
 *   surfacePressureMbar?: number, salinity?: number, when?: number, decoModel?: 0|1
 * }} PlanRequest
 */

/**
 * A planned dive of the logbook (list_plans).
 * @typedef {Object} PlannedDive
 * @property {number} id
 * @property {string} date
 * @property {number} when
 * @property {string} site
 * @property {number} maxDepthMm
 * @property {number} durationSeconds
 * @property {number} salinity
 * @property {number} surfacePressureMbar
 * @property {number[]} profile
 * @property {{depthMm: number, durationSeconds: number}[]} levels
 * @property {{o2Permille: number, hePermille: number}[]} gases
 * @property {string} request the plan as saved by Benthic (JSON), or "" for one made elsewhere
 * @property {string} title the title the diver gave it (extra data "Benthic title" of the first dive computer), or ""
 */

/**
 * @typedef {Object} PlanCylinder
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {number} sizeMl
 * @property {number} startMbar
 * @property {number} endMbar
 * @property {number} gasUsedMl
 * @property {number} decoGasUsedMl
 * @property {number} reserveMl the minimum gas for the last bottom gas, the gas of the ascent for the others
 * @property {number} decoPressureMbar
 * @property {number} switchDepthMm
 * @property {number} bottomModMm
 * @property {''|'MORE_THAN_AVAILABLE'|'NO_RESERVE_FOR_SHARING'|'NO_GAS_FOR_PROBLEM_SOLVING'} warning
 */

/**
 * Result of the core's planner.
 * @typedef {Object} PlanResult
 * @property {''|'TIMEOUT'|'INAPPROPRIATE_GAS'|'NO_SUITABLE_BAILOUT_GAS'|'RECREATIONAL_EXCEEDS_NDL'} error
 * @property {PlannerSetup} setup the settings used
 * @property {number} effGfLow VPM-B only
 * @property {number} effGfHigh
 * @property {number} runtimeSeconds
 * @property {number} maxDepthMm
 * @property {number} cns
 * @property {number} otu
 * @property {number} when local time of the plan, seconds
 * @property {number} surfaceIntervalSeconds
 * @property {[number, number][]} points seconds, mm
 * @property {[number, number][]} ceiling the plan's decompression ceiling, seconds, mm, as the
 *   detail's "Plafond" layer computes it (profile.cpp); empty when the plan never has one
 * @property {{timeSeconds: number, depthMm: number, cylinder: number, entered: boolean}[]} segments
 * @property {{depthMm: number, durationSeconds: number, runtimeSeconds: number, cylinder: number, gasChange: boolean}[]} stops
 * @property {PlanCylinder[]} cylinders
 * @property {{cylinder: number, depthMm: number, pressureMbar: number, deltaMbar: number, sacFactor: number, problemSolvingMinutes: number}|null} minimumGas
 *   deltaMbar negative: that much short of the minimum gas
 */

/**
 * A folder of the previous version's cloud cache.
 * @typedef {Object} AlphaCacheFolder
 * @property {string} id the folder name (a hash)
 * @property {string} branch the branch the folder holds
 * @property {number} bytes size of the folder
 * @property {number} modified last change, seconds since 1970
 * @property {number} dives number of dives of the branch
 */

/**
 * Result of reading the cloud. `available` is false when no credentials are
 * configured; the other fields are then absent.
 * @typedef {Object} CloudDives
 * @property {boolean} available
 * @property {boolean} [cached] false when a cached read found no copy on the device
 * @property {string} [server] e.g. ssrf-cloud-eu.subsurface-divelog.org
 * @property {string} [head] commit read: the server's, or the device copy's for a cached read
 * @property {boolean} [synced] false: device copy only (cached read, or the server did not answer)
 * @property {string} [offlineReason] reason, when the server did not answer
 * @property {boolean} [unchanged] the server's head is the log already loaded: `dives` is absent
 *   and the dives already listed (and their identifiers) stay valid
 * @property {Dive[]} [dives]
 */

/**
 * A trip of the loaded log; tripId is 0 when it no longer exists.
 * @typedef {Object} TripDetail
 * @property {number} tripId valid until the next load; never stored
 * @property {string} location empty when not named
 * @property {string} notes
 * @property {boolean} autogen grouped automatically by the core
 * @property {{id: number, number: number, date: string, durationSeconds: number, site: string}[]} dives
 */

/**
 * @typedef {Object} SiteSummary
 * @property {number} uuid
 * @property {string} name
 * @property {boolean} hasLocation
 * @property {number} latUdeg micro-degrees
 * @property {number} lonUdeg
 * @property {string} country
 * @property {number} dives number of dives at this site
 * @property {string} lastDate local time of the latest dive; empty without dives
 * @property {number} maxDepthMm deepest dive at this site
 */

/**
 * One free-filter rule, in the text form of Subsurface's filter presets
 * (benthic.h, filter_rule): type token ("suit", "depth", "dive_mode"…, or
 * the Benthic bc_country, bc_region, bc_trip), modes as tokens or empty,
 * data in core units.
 * @typedef {{type: string, stringMode?: ''|'starts_with'|'substring'|'exact',
 *   rangeMode?: ''|'equal'|'less'|'greater'|'range', negate?: boolean, data: string}} FilterRule
 */

/**
 * A filter preset of the log (Subsurface's filter_presets). `index` is its
 * place in the list, valid until the next change.
 * @typedef {{index: number, name: string, filter: {fulltext: string, mode: string, rules: FilterRule[]}}} FilterPreset
 */

/**
 * A sync conflict after an automatic merge (sync_conflicts): for each file,
 * the lines both sides changed differently.
 * @typedef {{conflict: false} | {conflict: true, deviceTime: string, cloudTime: string,
 *   items: {path: string, diveId: number, number: number, date: string,
 *   lines: {key: string, device: string, cloud: string}[]}[]}} SyncConflicts
 */

/**
 * Values present in the loaded log for each filter criterion (filter_options).
 * @typedef {{modes: string[], years: [number, number], suits: string[], computers: string[],
 *   cylinderTypes: string[], tags: string[], people: string[], sites: string[], countries: string[],
 *   regions: string[], helium: boolean, oxygen: boolean, cylinderSize: boolean, sac: boolean,
 *   waterTemp: boolean, airTemp: boolean, planned: boolean, notes: boolean, rating: boolean,
 *   visibility: boolean, current: boolean, wavesize: boolean, surge: boolean, chill: boolean}} FilterOptions
 */

/**
 * A site; uuid is 0 when it no longer exists. Region and city say whether the
 * diver corrected them (manual), in which case a lookup never replaces them.
 * @typedef {SiteSummary & {description: string, notes: string,
 *   countryTaxonomy: {value: string, manual: boolean}, region: {value: string, manual: boolean},
 *   city: {value: string, manual: boolean},
 *   diveList: {id: number, number: number, date: string, durationSeconds: number, maxDepthMm: number}[]}} SiteDetail
 */

/**
 * @typedef {Object} GasCylinderTypes
 * @property {string} default the default cylinder preference; empty when none
 * @property {{name: string, ml: number, workingPressureMbar: number}[]} types
 */

/**
 * Tissues now, loaded by the core with the logbook dives before now
 * (desaturation in benthic.h).
 * @typedef {Object} Desaturation
 * @property {string} now local time used
 * @property {number} surfaceSeconds since the end of the last dive; -1 when no dive counts
 * @property {'buehlmann'|'vpmb'|'recreational'} model planner model
 * @property {number} gfLow
 * @property {number} gfHigh
 * @property {number} vpmbConservatism
 * @property {{id: number, number: number, date: string, endDate: string, site: string, maxDepthMm: number, durationSeconds: number}[]} dives
 * @property {{percent: number, surfaceGf: number, n2Bar: number, heBar: number, halfTimeMin: number}[]} tissues
 *   16 compartments, fastest first; percent as in Subsurface's tissue graph (50 = ambient, 100 = M-value)
 */

/**
 * @typedef {Object} EditResult
 * @property {DiveDetail} [dive] the dive after a dive step
 * @property {SiteDetail} [site] the site after a site step
 * @property {TripDetail} [trip] the trip after a trip step
 * @property {{types: CylinderType[], library: string[]}} [cylinderTypes] after a cylinder type rename
 * @property {{listChange: true, dives: number, id: number}} [list] after a dive was added or
 *   imported, or such a step undone: the dives in the log, the first dive added (0 if none)
 * @property {{presetList: FilterPreset[]}} [presets] after a filter preset step
 * @property {string} undo text of the step that Undo would revert ("Edit notes [#12]"); empty when none
 * @property {string} redo text of the step that Redo would apply; empty when none
 */

/**
 * Bluetooth on this device: `bluetooth` "none" (no adapter, e.g. the
 * emulator), "off" or "on"; `permission` for the scan and the connection.
 * @typedef {{bluetooth: 'none'|'off'|'on', permission: 'granted'|'denied'|'prompt'}} BluetoothStatus
 */

/**
 * A device found by the Bluetooth scan or paired with the phone, by MAC
 * address; reported again when what is known of it changes. `le`: reached
 * over Bluetooth Low Energy (seen by the scan, or paired as LE); `classic`:
 * paired as Bluetooth Classic. `computer`: the dive computer its name stands
 * for (Subsurface's list of names), or null.
 * @typedef {{mac: string, name: string, le: boolean, classic: boolean, bonded: boolean, rssi: number,
 *   computer: {vendor: string, product: string}|null}} BluetoothDevice
 */

/**
 * @typedef {{vendor: string, products: {name: string, ble: boolean, classic: boolean}[]}} BluetoothVendor
 */

/**
 * A dive received during a download (not in the logbook yet).
 * @typedef {{date: string, maxDepthMm: number, durationSeconds: number, profile: number[]}} ReceivedDive
 */

/**
 * @typedef {{state: 'connecting'|'connected'|'retrying', fraction: number, dives: number, newDives: ReceivedDive[]}} DownloadProgress
 */

/**
 * End of a download: `downloaded` new dives added to the logbook as one
 * undoable step (`list`, `undo`), the computer as it identified itself, and
 * the remembered computers to keep (setPrefs diveComputerList).
 * @typedef {{downloaded: number, vendor: string, product: string, serial: number, firmware: number,
 *   list?: {listChange: true, dives: number, id: number}, undo: string, diveComputerList: string[]}} DownloadResult
 */

/**
 * Answer of gitCheck. `branches` are the names under refs/heads/; `empty`: the
 * repository holds no reference at all.
 * @typedef {{status: 'public'|'auth'|'none'|'ok'|'denied', empty: boolean, branches: string[]}} GitCheck
 */

/**
 * Git on the device (core/libbenthic/bgit.h). `dir` names a working copy: the folder `bgit/<dir>` of the app's
 * data (Capacitor's Directory.Data on a phone, <userData> on the desktop), where JavaScript reads and writes the
 * files (@capacitor/filesystem) and the core commits them. Credentials are the session's (serverSessionAccess).
 * Every call rejects with a code: BAD_ADDRESS, BAD_CREDENTIALS, BAD_PATH, EXISTS, NO_WORKING_COPY, UNREACHABLE,
 * REFUSED, REJECTED (push: pull first), CANCELLED, GIT_ERROR.
 * @typedef {{dir: string, username: string, token: string, branch: string}} GitAccess
 * @typedef {{phase: 'receiving'|'resolving'|'checkout'|'sending', done: number, total: number, dir?: string}} GitProgress
 * @typedef {{path: string, base: string|null, ours: string|null, theirs: string|null}} GitConflictFile
 * @typedef {{result: 'upToDate'|'fastForward'|'merged'|'empty', head: string|null}
 *   | {result: 'conflict', ours: string, theirs: string, files: GitConflictFile[]}} GitPullResult
 */

/**
 * @typedef {Object} BenthicCorePlugin
 * @property {() => Promise<{count: number}>} importSample
 *   Saves the sample log as a local git repository.
 * @property {() => Promise<{exists: boolean, dives: Dive[]}>} listDives
 *   Reads the local git repository again. `exists` is false until a repository has been created.
 * @property {() => Promise<{available: boolean, email: string, mode?: 'git', repository?: string}>} configureCloud
 *   Sets the cloud account (development credentials), without network.
 *   `available` is false when none is configured; `email` is the account's.
 *   When the logbook lives in the user's own git repository (gitConnect), that
 *   repository is set instead: `mode` is 'git', `email` is the user name and
 *   `repository` is "host/owner/name".
 * @property {(options: {url: string, username?: string, token?: string, useStored?: boolean}) => Promise<GitCheck>} gitCheck
 *   Asks the repository's server for its references (`git ls-remote`). Without
 *   a token: anonymous ('public', 'auth', 'none'). With one (or `useStored`
 *   with no token typed): as for a push, which checks the token and its right
 *   to write ('ok', 'denied', 'none'). Network only; nothing is stored.
 *   Rejects with BAD_ADDRESS (not HTTPS, or holding credentials) or BAD_CREDENTIALS.
 * @property {(options: GitAccess & {url: string}) => Promise<{result: 'cloned'|'empty', head: string|null}>} bgitClone
 *   Makes the working copy from the branch of the repository ('empty': the server has no such branch yet).
 * @property {(options: GitAccess & {authorName?: string, authorEmail?: string}) => Promise<GitPullResult>} bgitPull
 *   Fetch and merge. On a conflict nothing changes on disk: resolve the files in JavaScript, write them in the working
 *   copy and call bgitCommit with `mergeParent` = `theirs`.
 * @property {(options: {dir: string, paths: string[], message: string, mergeParent?: string, authorName?: string, authorEmail?: string}) => Promise<{commit: string|null}>} bgitCommit
 *   Stages the files (a missing file is a deletion) and commits; `commit` is null when nothing changed.
 * @property {(options: GitAccess) => Promise<{result: 'pushed'|'upToDate', head: string|null}>} bgitPush
 * @property {(options: {dir: string, paths?: string[]}) => Promise<{changes: {path: string, state: 'new'|'modified'|'deleted'}[]}>} bgitStatus
 * @property {(options: {dir: string, branch: string}) => Promise<{ahead: number, behind: number}>} bgitUnpushed
 *   The commits the server does not have, as of the last fetch or push.
 * @property {(options: {dir: string, branch: string}) => Promise<{head: string|null, remote: string|null}>} bgitHead
 * @property {(options: {dir: string, prefix?: string}) => Promise<{files: string[]}>} bgitListFiles
 * @property {(options: {dir: string, files: {path: string, text: string|null}[]}) => Promise<{written: number, deleted: number}>} bgitWrite
 *   Writes (text) or deletes (text = null) files in the working copy, nothing staged or committed. Rejects with
 *   BAD_PATH (absolute, `..`, `.git`, empty part, a symbolic link on the way) before any file is touched.
 * @property {(options: {dir: string, paths: string[]}) => Promise<{texts: (string|null)[]}>} bgitRead
 *   The text of each path as of HEAD, in order (null: absent or not UTF-8 text). BAD_PATH. No network.
 * @property {(options: {dir: string, fromCommit: string, toCommit?: string}) => Promise<{changes: {path: string, state: 'new'|'modified'|'deleted'}[]}>} bgitDiff
 *   Between two commits; an empty `fromCommit` lists everything at `toCommit` (empty or 'HEAD': HEAD). UNKNOWN_COMMIT.
 * @property {(options: {dir: string}) => Promise<{files: string[]}>} bgitFiles
 *   The paths of every file as of HEAD (the committed tree, unlike bgitListFiles' index).
 * @property {(options: {dir: string}) => Promise<void>} bgitRemove
 * @property {() => Promise<void>} bgitCancel
 *   Stops the running git call, which rejects with CANCELLED.
 * @property {(options: {email: string, sessionToken: string, repositoryUrl: string, branch: string, gitUsername: string, gitToken: string}) => Promise<void>} serverSessionSave
 *   Release edition: keeps the Benthic server's session (session token and git token) in the platform's secure
 *   storage (Android Keystore, iOS Keychain, Electron safeStorage). Rejects with BAD_ARGUMENT or CREDENTIALS_NOT_SAVED.
 * @property {() => Promise<{signedIn: boolean, email: string, repositoryUrl: string, branch: string}>} serverSessionInfo
 *   Who is signed in to the Benthic server, without any token.
 * @property {() => Promise<{repositoryUrl: string, branch: string, username: string, token: string, sessionToken: string}>} serverSessionAccess
 *   The access to the repository, for the download, and the session token for the account calls (the health-data
 *   consent). Rejects with NOT_SIGNED_IN.
 * @property {() => Promise<void>} serverSessionClear
 *   Signs out of the Benthic server: the tokens are erased.
 * @property {(options?: {keepAlpha?: boolean}) => Promise<void>} devResetApp
 *   DEVELOPMENT ONLY (debug builds: rejects NOT_DEBUG otherwise): the app's own data is erased as on a first install. The
 *   core closes its log; the device logbook, the working copies of the server, every credential and the data key, the
 *   staged imports and exports go. Kept: the alpha's cache (`.subsurface`) unless `keepAlpha` is false, the development
 *   authority file. No server is called.
 * @property {() => Promise<{key: string}>} dataKeyRead
 *   Release edition (docs/architecture.md, section 11.5): the device's data key for the sensitive items (blood group,
 *   emergency contact, certifications), 32 random bytes as base64, from the platform's secure storage (Android
 *   Keystore, iOS Keychain, Electron safeStorage). `key` is '' when the device has none yet.
 * @property {(options: {key: string}) => Promise<void>} dataKeyWrite
 *   Keeps the data key. Rejects with BAD_ARGUMENT or CREDENTIALS_NOT_SAVED.
 * @property {() => Promise<{url: string, username: string, branch: string}>} gitConfig
 *   The connected repository without its token, empty strings when none (for editing it).
 * @property {(options: {url: string, username: string, token: string, branch: string, empty?: boolean}) => Promise<{created: boolean}>} gitConnect
 *   Connects the logbook to the repository (an empty token keeps the stored one): checks the
 *   branch on the server, creates it when `empty` says the repository holds no reference,
 *   then stores the access (Android Keystore). Rejects with BAD_ADDRESS, BAD_CREDENTIALS,
 *   BAD_BRANCH, DENIED, NETWORK, NO_LOG, CREATE_FAILED, LOG_EXISTS, NOT_EMPTY; the previous
 *   access is then set again. signOut forgets it and erases the token.
 * @property {() => Promise<{exists: boolean, head: string}>} probeCloud
 *   Head of the log branch on the server, network only; may run during a load.
 * @property {(options?: {cached?: boolean}) => Promise<CloudDives>} listCloudDives
 *   Read-only access to the Subsurface cloud log (development credentials).
 *   `cached`: the device's copy only, without network, to show the log at once
 *   (after configureCloud).
 * @property {() => Promise<AlphaCacheFolder[]>} alphaCacheList
 *   The previous version's cloud cache on this device (`.subsurface/cloudstorage/<folder>`): one entry per folder that
 *   holds a logbook. Read-only, no network, no credentials.
 * @property {(options: {id: string}) => Promise<{id: number}[]>} alphaCacheOpen
 *   Reads that folder's logbook into the core, without address (exportable, not editable), and returns its dives.
 * @property {() => Promise<{id: string, summary: string, message: string}[]>} pendingChanges
 * @property {(action: string, args?: string[]) => Promise<any>} history The versions of the configured logbook (benthic.h, history_call): `info`, `log` [skip, limit, changes], `stats` [commit...], `diff` [from, to], `read` [commit, path], `files` [commit, prefix], `restore` [commit, message, path...], `open` [commit] (read only), `close`, `adopt` (no argument: brings in the history of this device's own logbook from before the account, `{result: 'adopted'|'unchanged'|'none'}`; `log` then lists those commits after the logbook's own).
 *   Local commits of the loaded cloud log not yet on the server, newest first;
 *   empty for a log without account.
 * @property {(options?: {deleteCopy?: boolean}) => Promise<void>} signOut
 *   Closes the cloud log and forgets the account and its credentials; the
 *   device copy is kept unless deleteCopy (refused with changes not sent).
 * @property {(options: {password: string, keepDives: boolean}) => Promise<{deleted: boolean, status: number, reply: string}>} deleteAccount
 *   Deletes the cloud account; `deleted` only when the server confirmed it.
 *   Rejects with WRONG_PASSWORD, PENDING_CHANGES or NETWORK when nothing was deleted.
 * @property {(options: {email: string, password: string}) => Promise<{exists: boolean, email: string}>} signIn
 *   Signs in with typed credentials (checked by the server); stored in the Android
 *   Keystore when the account has a logbook, otherwise kept for createLog.
 *   Rejects with INCORRECT or NETWORK.
 * @property {(options: {email: string, password: string}) => Promise<{status: 'verified'|'need_pin'|'incorrect', email: string}>} createAccount
 *   New account (a cloud write: WRITE_LOCKED except on the test account); need_pin: a code was mailed.
 * @property {() => Promise<{status: 'verified'|'need_pin'|'incorrect'}>} resendCode
 *   Asks again for the account being created, so that the server mails its code again.
 * @property {(options: {pin: string}) => Promise<{status: 'verified'|'need_pin'|'incorrect'}>} verifyPin
 *   The confirmation code of the account being created; need_pin: wrong code.
 * @property {(options: {user: string, password: string}) => Promise<{dives: number, path: string}>} divelogsDownload
 *   Import step 1: the divelogs.de logbook, downloaded once into the app's cache (path empty
 *   without dives). The credentials are only passed through. Rejects with LOGIN_FAILED,
 *   NETWORK, INVALID_RESPONSE, INVALID_ARCHIVE.
 * @property {(options: {user: string, password: string}) => Promise<{dives: number}>} divelogsCheck
 *   Checks the divelogs.de credentials before the import (LOGIN_FAILED, NETWORK…).
 * @property {(options: {name?: string, data: string, path?: string, append?: boolean}) => Promise<{path: string}>} stageImport
 *   A picked file (base64 data) written to the app's cache for the import steps. A big file goes in pieces
 *   (lib/staged-file.js): the first call gives `name` and the first piece, the next ones `path` and
 *   `append: true`. A logbook never crosses the bridge as one string (it ran the Android Java heap out of memory).
 * @property {(options: {uri: string}) => Promise<{name: string, size: number, path: string}>} stageSharedFile
 *   A file another app handed over (Android content://, iOS file://), streamed into the app's cache: only its path
 *   comes back. Rejects TOO_BIG (above 2 GB or no room), NOT_FOUND, FAILED, BAD_ARGUMENT, CANCELLED (cancelStage).
 *   While it copies, the event stageProgress {uri, done, total} gives the bytes copied (total 0 when the provider
 *   gives no size).
 * @property {(options: {uri: string}) => Promise<void>} cancelStage
 *   Stops the copy of `uri` (stageSharedFile) at its next piece and deletes the partial file; the copy rejects CANCELLED.
 * @property {(options: {path: string, offset: number, length: number}) => Promise<{data: string, size: number}>} readFileChunk
 *   Up to 4 MB of a staged file, base64, with the file's size: to look at the start of a logbook or scan it.
 * @property {(options: {name: string, parts: ({path: string, start: number, end: number}|{text: string})[]}) => Promise<{path: string}>} assembleFile
 *   A new staged file made of byte ranges of staged files and literal text, copied in order.
 * @property {(options: {path: string}) => Promise<{dives: number}>} importCount
 *   Import step 2, read-only: the dives of the downloaded file (IMPORT_FAILED).
 * @property {(options: {path: string, companionPath?: string, name: string, params: CsvParams, dryRun: boolean}) => Promise<any>} importCsv
 *   A CSV file (staged with stageImport) with its column mapping, as import_csv in benthic.h. `companionPath`: for
 *   Poseidon MkVI, the staged .txt of the same dive. With `dryRun` nothing is added and the answer is the preview
 *   {dives:[{when, number, durationSeconds, maxDepthMm, profile:[[seconds, mm]]}]}; otherwise the dives are
 *   imported (EditResult), one undoable step. Rejects with IMPORT_FAILED, NO_DIVES, BAD_REQUEST.
 * @property {(options: {path: string}) => Promise<void>} discardImport
 *   Deletes a downloaded file (cancelled or failed import).
 * @property {(options: {name: string}) => Promise<{path: string, created: boolean}>} createIcloudLogbook
 *   iOS only (task 2026-11-16-261): the logbook `name` (a file name) is created in the OpenDives folder of the
 *   app's iCloud Drive container, which uses the device's Apple account, so there is no sign-in. `path` is the
 *   folder's path; `created` is false when it already existed. Rejects with NOT_AVAILABLE (Android, or iCloud Drive
 *   turned off or signed out on the iPhone) or BAD_REQUEST (empty name). Only the iOS side has an implementation;
 *   the JavaScript calls it on an iPhone only.
 * @property {(options: {source: 'empty'|'import'|'device', path?: string}) => Promise<CloudDives & {imported: number}>} createLog
 * @property {(options: {action: 'exists'|'count'|'import'}) => Promise<any>} deviceLog
 *   The dives logged on this device without an account: "exists" ({exists}) checks for a logbook without loading it,
 *   "count" ({count}),
 *   read apart; "import" adds them to the account's log, one undoable step (EditResult).
 *   First logbook of the new account (the only step that writes to it), then its
 *   credentials are stored. "import": the downloaded file, deleted afterwards.
 * @property {(options: {id: number, changes: Record<string, string|number|string[]>}) => Promise<EditResult>} editDive
 *   One undoable step; only the fields named change (edit_dive in benthic.h).
 *   `cylinders` is the list of JSON entries ({index, ...fields}, index -1 for a new cylinder): the order of
 *   the entries that have an index is the new order of those cylinders, and the dive's gas changes and
 *   tank-sensor mappings follow them (Subsurface's cylinder_renumber()). New cylinders stay at the end.
 * @property {(options?: {redo?: boolean}) => Promise<EditResult>} undo
 * @property {(options: {kind: 'list'|'site'|'nearby'|'duplicates'|'without', uuid?: number, lat?: number, lon?: number, a?: number, b?: number, text?: string}) => Promise<any>} siteQuery
 *   Read-only site queries (benthic.h): list of SiteSummary, a SiteDetail, the site
 *   within a metres of lat/lon (or null), possible duplicates (a: same name within a m,
 *   b: other names within b m), dives without a site, and place: {country, region, city,
 *   offline} at lat/lon in the language text (Nominatim, else offline Natural Earth), or null.
 * @property {(options: {kind: 'cylinders'|'weights'|'desaturation'}) => Promise<any>} toolQuery
 *   Read-only tools (benthic.h): cylinders, the GasCylinderTypes;
 *   weights, {types: [{name, grams}]}: Subsurface's weight types (untranslated built-in names),
 *   each with the weight last used for it (0 when none); desaturation, the Desaturation now.
 * @property {(options: {kind: 'options'} | {kind: 'search', fulltext: string} | {kind: 'dives', fulltext?: string, mode?: string, rules: FilterRule[]}) => Promise<any>} filterQuery
 *   "search": the Logbook's search box (search_dives), the matching dive ids.
 *   Read-only free filter (benthic.h): FilterOptions, or the identifiers of the
 *   dives matching every rule and the fulltext query (number[]).
 * @property {(options: {fields: Record<string, string|number|string[]>}) => Promise<EditResult>} createDive
 *   Logs a dive by hand, one undoable step (create_dive in benthic.h).
 * @property {(options: {id?: number, ids?: number[]}) => Promise<EditResult>} deleteDive
 *   Deletes one dive (id) or several (ids) and shifts later numbered dives, in one undoable step.
 * @property {(options: {ids: number[]}) => Promise<EditResult>} mergeDives
 *   Merges two or more dives into one, one undoable step (merge_dives in benthic.h): Subsurface's own merge;
 *   the merged dive keeps the first numbered dive's number. The result's `id` is the merged dive.
 * @property {(options: {ids: number[], changes: Record<string, string|number|string[]>}) => Promise<EditResult>} editDives
 *   The same changes on several dives, one undoable step (edit_dives in benthic.h): site (uuid), notes, suit,
 *   userSalinity, diveguide, and the chip lists buddiesAdd/buddiesRemove, diveguideAdd/diveguideRemove,
 *   tagsAdd/tagsRemove (only those names are added or removed, per dive).
 * @property {(options: {ids: number[], start: number, numbers?: number[]}) => Promise<EditResult>} renumberDives
 *   Renumbers the dives (all if ids is empty) in date order from start, one undoable step (renumber_dives);
 *   with numbers (one per id), each dive gets its own number instead.
 * @property {(options: {name: string, data?: string, path?: string}) => Promise<EditResult>} importDives
 *   Imports a file, one undoable step (import_dives): a small one as base64 `data`, a logbook as `path`, a staged
 *   file the core reads where it is and that is deleted afterwards. `name` is the original name (the format).
 * @property {(options: {files: {name: string, data: string}[]}) => Promise<EditResult>} importDivesFiles
 *   Imports several files chosen together (base64 contents, original names), one undoable step
 *   (import_dives_files): a Suunto app .json and the .fit with the same base name are read as one
 *   dive (the .fit brings the gas mix and the gradient factors), the other files on their own.
 * @property {(options: {action: 'list'} | {action: 'save', name: string, fulltext?: string, mode?: string, rules: FilterRule[]} | {action: 'delete', index: number}) => Promise<any>} filterPresets
 *   Filter presets: the list ({presetList}), or an undoable save or delete (EditResult).
 * @property {() => Promise<SyncConflicts>} syncConflicts
 *   Read-only: the conflicts left by the last automatic merge.
 * @property {() => Promise<void>} cancelConflictResolution takes back the last choice while it is not sent
 * @property {(options: {choices: Record<string, 'device'|'cloud'>}) => Promise<void>} resolveConflicts
 *   Keeps the chosen side of each conflicting file (by path), then reads the log again (no network).
 * @property {(options: {kind: 'stats', criteria: Record<string, string[]>} | {kind: 'values', field: string}) => Promise<any>} statsQuery
 *   Read-only statistics (benthic.h, stats and stats_values): the StatsResult of the
 *   dives meeting the criteria ({field: [keys]}; any key of a field, every field), or the
 *   values of one field in the log, [{key, dives, location?}]. Rejects with BAD_REQUEST.
 * @property {(options: {url: string}) => Promise<{status: number, body: string}>} placesSearch
 *   A Nominatim request sent with the app's User-Agent; only nominatim.openstreetmap.org addresses.
 * @property {(options: {action: 'create'|'edit'|'geocode'|'merge'|'delete'|'deleteSite', uuid?: number, other?: number, uuids?: number[], field?: string, value?: string, lat?: number, lon?: number, country?: string, region?: string, county?: string, city?: string}) => Promise<EditResult>} siteAction
 *   One undoable site change, as Subsurface's site commands. "geocode" writes the place the
 *   JavaScript found (place-lookup.js: Nominatim, else the offline file) in the site's taxonomy
 *   (country, region, county, city; an empty one is left out), keeping a value the diver
 *   corrected; it rejects with NO_RESULT when all four are empty.
 * @property {(options: {tripId: number}) => Promise<TripDetail>} getTrip
 *   "remove" takes diveId, or diveIds for several dives in one step.
 * @property {(options: {action: 'location'|'notes'|'remove'|'split'|'merge'|'add'|'ungroup'|'create', tripId?: number, diveId?: number, otherId?: number, diveIds?: number[], value?: string}) => Promise<EditResult>} tripAction
 *   One undoable trip change, as Subsurface's trip commands. Benthic never groups dives
 *   into trips by itself, so there is no "autogroup" action.
 * @property {(options?: {includeInvalid?: boolean}) => Promise<Dive[]>} listLoadedDives
 *   The dives of the log in memory, without loading anything. includeInvalid also returns hidden invalid dives.
 * @property {(options: {name: string, base64: string}) => Promise<{uri: string}>} writeShareFile
 *   A file to share (the profile image), written in the app's cache; its file URI.
 * @property {(options: {ids: number[], format: 'ssrf'|'uddf'|'csv'|'csvProfiles', anonymize: boolean, name: string, text?: boolean, stage?: boolean}) => Promise<{uri: string, text?: string, path?: string, size?: number}>} exportDives
 *   The dives exported by the core (export_dives) into the app's cache; the logbook is not changed. `text`: the
 *   contents come back (a few dives only: TOO_BIG above 8 MB). `stage`: the file is a staged file, only its `path`
 *   and `size` come back (read it with readFileChunk, import it with importDives, delete it with discardImport).
 * @property {(options: {uri: string, mime: string}) => Promise<{apps: number}>} grantShareFile
 *   Read access to a shared file for every app that can receive it (Gmail sends attachments later).
 * @property {(options: {html: string, name: string, letter?: boolean}) => Promise<{uri: string}>} htmlToPdf
 *   A page of HTML rendered to a PDF in the cache by the system's print engine (US Letter or A4); its file URI.
 * @property {() => Promise<void>} saveLocal
 *   Local save only, without network (manual synchronisation).
 * @property {() => Promise<{status: string, pending: number, reloaded: boolean, cause?: 'auth'|'server'}>} syncChanges
 *   Local save, then the cloud sync (refused with WRITE_LOCKED except on the test account).
 * @property {(options: {id: number}) => Promise<DiveDetail>} getDive
 *   Detail of one dive of the last loaded log.
 * @property {() => Promise<Prefs>} getPrefs
 *   The core's preferences: units (the loaded log's when it has them), the Settings values.
 * @property {(options: {changes: Partial<CorePrefValues> & {forgetDiveComputer?: number, diveComputerList?: string[]}}) => Promise<void>} setPrefs
 *   Sets core preferences (set_prefs in benthic.h); a device setting, kept by the app.
 * @property {(options: {action: 'list'|'library'|'standard'|'add'|'size'|'remove'|'rename'|'delete'|'deletePreview', name?: string, value?: string, ml?: number, mbar?: number}) => Promise<CylinderTypes>} cylinderTypes
 *   Cylinder types of Settings; "rename" (to value) changes the log as one undoable step,
 *   "delete" removes one of the diver's types and its cylinders from the dives (one undoable
 *   step; `deletion` has the counts), "deletePreview" only returns the counts,
 *   "library" sets the device's library (value: JSON {"library": [...]}).
 * @property {() => Promise<PlannerSetup>} plannerSetup
 *   The planner's settings as the core's preferences hold them.
 * @property {(request: PlanRequest) => Promise<PlanResult>} planDive
 *   Runs Subsurface's planner; read only, nothing is added to the logbook.
 * @property {() => Promise<LogbookComputer[]>} diveComputers the computers the logbook's dives come from
 * @property {(options: {action: 'rename'|'remove'|'merge', model: string, serial: string, value?: string, intoModel?: string, intoSerial?: string}) => Promise<EditResult>} diveComputerAction
 *   One undoable step (benthic.h).
 * @property {() => Promise<{json: string}>} pendingCrashReport
 *   Error reports (task #102): the crash that Kotlin or Swift code saved before the app died, as JSON text
 *   `{ occurredAt, osVersion, device, message, stack }`, or an empty `json` when there is none. Nothing is sent.
 * @property {() => Promise<void>} clearCrashReport forgets the saved crash (after the user answered)
 * @property {() => Promise<{wifi: boolean}>} networkStatus whether the device is on Wi-Fi or Ethernet
 * @property {() => Promise<{level: number}>} contrastLevel
 *   The system contrast level: Android 14+ UiModeManager.getContrast() (0 by default, up to 1),
 *   iOS 1 with « Augmenter le contraste », else 0.
 * @property {() => Promise<PlannedDive[]>} listPlans
 * @property {(options: {request: PlanRequest, replaceId?: number, title?: string}) => Promise<EditResult>} savePlan
 *   Saves the plan as a planned dive, or replaces one: one undoable step. `title` is kept
 *   with the plan as extra data "Benthic title" of its first dive computer; empty or
 *   missing writes no key (a replaced plan loses its previous title).
 * @property {() => Promise<BluetoothStatus>} bluetoothStatus
 * @property {() => Promise<BluetoothStatus>} requestBluetoothPermission
 *   Asks for the Bluetooth permissions (Android 12+: nearby devices; before: location).
 * @property {() => Promise<BluetoothStatus>} enableBluetooth
 *   The system dialog that turns Bluetooth on.
 * @property {() => Promise<void>} openAppSettings
 *   The app's page of the system settings (a permission refused for good).
 * @property {(options: GaugeCameraOptions) => Promise<GaugeCameraResult>} gaugeCamera
 *   Android: the full-screen camera that reads cylinder pressures (see GaugeCameraResult).
 * @property {(options: QrScanOptions) => Promise<QrScanResult>} qrScan
 *   The full-screen camera that reads the QR codes of a dive or a plan (see QrScanResult).
 *   Android: ML Kit; iOS: AVFoundation. Asks the camera permission itself.
 * @property {() => Promise<{action: 'cancelled'|'unavailable'|'done', image?: string, text?: string}>} scanDocument
 *   The system document scanner for a certification card, then text recognition on the device. Android: ML Kit
 *   Document Scanner + ML Kit Text Recognition; iOS: VisionKit + Vision. `image` is a base64 JPEG, `text` the
 *   recognised lines. Desktop: rejects as unavailable (the app falls back to its own image flow).
 * @property {(options: {on: boolean}) => Promise<void>} keepScreenAwake
 *   While on: the screen stays on and at full brightness (the QR sending screen); off restores both.
 * @property {(options: {from: number, to: number}) => Promise<{available: boolean, depth: {id: string, at: number, value: number}[], temperature: {id: string, at: number, value: number}[]}>} healthDives
 *   iPhone only (to-do #67): the depth (m) and water temperature (°C) samples an Apple Watch Ultra
 *   wrote into Apple Health between `from` and `to` (ms since 1970), read only. `available` is
 *   false where Health has no such data. A refused reading looks like no data (HealthKit does not
 *   tell). Not on Android, where the call is rejected.
 * @property {() => Promise<{store: boolean, installer: string}>} installSource
 *   Whether the app was installed from Google Play (installer "com.android.vending") or the
 *   App Store (not a TestFlight or development build); `installer` is the package name, "" on iOS.
 * @property {() => Promise<{requested: boolean}>} requestReview
 *   The system's in-app review dialog (Google Play In-App Review; iOS requestReview). The store
 *   decides whether it shows: `requested` only says the request was made.
 * @property {() => Promise<void>} openStorePage
 *   The app's page in the store, to write a review (Android market://, with the https fallback; iOS action=write-review).
 * @property {(options: {uri: string}) => Promise<{name: string, size: number, data: string}>} readSharedFile
 *   Small files only: a file another app handed over, its name, its size in bytes and its contents in base64.
 *   Rejects TOO_BIG (above 8 MB), NOT_FOUND, FAILED, BAD_ARGUMENT. A logbook goes through stageSharedFile.
 * @property {() => Promise<void>} contentShown
 *   The first screen is drawn: the launch screen (splash) can go (Android; no effect elsewhere).
 * @property {(options?: {durationMs?: number}) => Promise<void>} startBluetoothScan
 *   Looks for devices (default 60 s): "bluetoothDevice" events, then "bluetoothScanStopped".
 *   Rejects with NO_BLUETOOTH, BLUETOOTH_OFF, PERMISSION.
 * @property {() => Promise<void>} stopBluetoothScan
 * @property {() => Promise<BluetoothVendor[]>} bluetoothModels
 *   The models that download over Bluetooth, for a device whose name says nothing.
 * @property {(options: {vendor: string, product: string, address: string, name: string, classicAddress?: string, forceDownload?: boolean, defaultSalinity?: number}) => Promise<DownloadResult>} downloadDives
 *   Downloads the new dives and adds them as one undoable step (download_dives in
 *   benthic.h); "downloadProgress" events meanwhile. `address`: "LE:" + MAC for
 *   Bluetooth Low Energy, the MAC for Classic. Rejects with the core's code first in
 *   the message: NOT_FOUND, FAILED, CANCELLED, UNKNOWN_COMPUTER, WRITE_LOCKED…, or
 *   NO_BLUETOOTH, BLUETOOTH_OFF, PERMISSION.
 *   `classicAddress`: the MAC of the same device paired as Bluetooth Classic, tried once when the
 *   BLE link fails (progress state "retrying").
 *   `defaultSalinity`: 10000, 10200 or 10300 (0 or absent: none); written as the water type of the
 *   received dives that have none, from the computer or their own.
 * @property {(options: {action: 'count'|'keep'|'discard'}) => Promise<any>} downloadPartial
 *   The dives received before a download failed or was cancelled: count ({dives}), keep (one
 *   undoable step, a DownloadResult) or discard. Rejects with NO_PARTIAL.
 * @property {() => Promise<void>} cancelDownload
 * @property {(event: 'bluetoothDevice'|'bluetoothScanStopped'|'downloadProgress'|'syncProgress'|'gitProgress'|'sharedFile'|'stageProgress', listener: (data: any) => void) => Promise<{remove: () => Promise<void>}>} addListener
 *   bluetoothDevice gives a BluetoothDevice, downloadProgress a DownloadProgress, syncProgress
 *   {message}: each message of the core's git work while the cloud log syncs (benthic.h,
 *   set_sync_progress), in English, e.g. "Transfer from storage (30/80)".
 */

/** @type {any} */
// On Android and iOS the native plugin answers. In the desktop app (Electron, which runs as a "web"
// platform) desktop.js does, through window.benthicDesktop; in a plain browser its methods reject with
// UNAVAILABLE.
const plugin = registerPlugin('BenthicCore', {
  web: () => import('./desktop.js').then((m) => new m.BenthicCoreDesktop()),
});

/** @type {((method: string, error: any, caller?: string) => void)|null} */
let coreErrorHook = null;

/**
 * The core answers some expected states with a generic CORE_ERROR and only the message tells them apart: no account is set
 * (the beta's local logbook has none). They are never a fault, so never a report.
 * @param {unknown} message
 */
export function isExpectedCoreMessage(message) {
  return typeof message === 'string' && /account not configured|repository not configured/i.test(message);
}

/**
 * Error reports (task #102): `hook(method, error)` is called for every call the core fails (code CORE_ERROR), before the
 * error goes on to the caller. The hook only offers a report to the user; it never changes the outcome of the call.
 * @param {((method: string, error: any, caller?: string) => void)|null} hook
 */
export function setCoreErrorHook(hook) {
  coreErrorHook = hook;
}

// The plugin, seen through a proxy that tells the hook about the core's failures. The listeners are not wrapped: their
// handle (remove) must stay the plugin's own.
const native = new Proxy(plugin, {
  get(target, name, receiver) {
    const value = Reflect.get(target, name, receiver);
    if (typeof value !== 'function' || typeof name !== 'string' || name === 'then' || name.startsWith('add') || name.startsWith('remove')) return value;
    return (/** @type {any[]} */ ...args) => {
      // The bridge's own stack only shows its frames: the caller's is kept for the report.
      const caller = new Error().stack ?? '';
      const result = value.apply(target, args);
      if (!result || typeof result.then !== 'function') return result;
      return result.then(undefined, (/** @type {any} */ e) => {
        if (coreErrorHook && e?.code === 'CORE_ERROR' && !isExpectedCoreMessage(e?.message)) {
          try {
            coreErrorHook(name, e, caller.split('\n').slice(2).join('\n'));
          } catch {
            // The hook never changes the outcome of the call.
          }
        }
        throw e;
      });
    };
  },
});


/**
 * The native side passes the lists as JSON text (`json`), parsed here once:
 * much faster than converting them into bridge objects.
 * @type {BenthicCorePlugin}
 */
export const BenthicCore = {
  importSample: () => native.importSample(),
  configureCloud: () => native.configureCloud(),
  async gitCheck(options) {
    return JSON.parse((await native.gitCheck(options)).json);
  },
  async bgitClone(options) {
    return JSON.parse((await native.bgitClone(options)).json);
  },
  async bgitPull(options) {
    return JSON.parse((await native.bgitPull(options)).json);
  },
  async bgitCommit(options) {
    return JSON.parse((await native.bgitCommit(options)).json);
  },
  async bgitPush(options) {
    return JSON.parse((await native.bgitPush(options)).json);
  },
  async bgitStatus(options) {
    return JSON.parse((await native.bgitStatus({ paths: [], ...options })).json);
  },
  async bgitUnpushed(options) {
    return JSON.parse((await native.bgitUnpushed(options)).json);
  },
  async bgitHead(options) {
    return JSON.parse((await native.bgitHead(options)).json);
  },
  async bgitListFiles(options) {
    return JSON.parse((await native.bgitListFiles({ prefix: '', ...options })).json);
  },
  async bgitWrite(options) {
    return JSON.parse((await native.bgitWrite(options)).json);
  },
  async bgitRead(options) {
    return JSON.parse((await native.bgitRead(options)).json);
  },
  async bgitDiff(options) {
    return JSON.parse((await native.bgitDiff({ toCommit: '', ...options })).json);
  },
  async bgitFiles(options) {
    return JSON.parse((await native.bgitFiles(options)).json);
  },
  bgitRemove: (options) => native.bgitRemove(options),
  bgitCancel: () => native.bgitCancel(),
  gitConfig: () => native.gitConfig(),
  serverSessionSave: (options) => native.serverSessionSave(options),
  serverSessionInfo: () => native.serverSessionInfo(),
  serverSessionAccess: () => native.serverSessionAccess(),
  serverSessionClear: () => native.serverSessionClear(),
  devResetApp: (options) => native.devResetApp(options ?? {}),
  dataKeyRead: () => native.dataKeyRead(),
  dataKeyWrite: (options) => native.dataKeyWrite(options),
  gitConnect: (options) => native.gitConnect(options),
  async probeCloud() {
    const { json } = await native.probeCloud();
    return JSON.parse(json);
  },
  async listDives() {
    const { exists, json } = await native.listDives();
    return { exists, dives: JSON.parse(json) };
  },
  async listCloudDives(options = {}) {
    const { available, json } = await native.listCloudDives(options);
    if (!available) return { available: false };
    if (!json) return { available: true, cached: false };
    return { available: true, ...JSON.parse(json) };
  },
  async alphaCacheList() {
    const { json } = await native.alphaCache({ action: 'list' });
    return JSON.parse(json);
  },
  async alphaCacheOpen(options) {
    const { json } = await native.alphaCache({ action: 'open', id: options.id });
    return JSON.parse(json);
  },
  async history(action, args = []) {
    const { json } = await native.history({ action, args });
    return JSON.parse(json);
  },
  async pendingChanges() {
    const { json } = await native.pendingChanges();
    return JSON.parse(json);
  },
  signOut: (options = {}) => native.signOut(options),
  signIn: (options) => native.signIn(options),
  createAccount: (options) => native.createAccount(options),
  resendCode: () => native.resendCode(),
  verifyPin: (options) => native.verifyPin(options),
  divelogsCheck: (options) => native.divelogsCheck(options),
  stageImport: (options) => native.stageImport(options),
  stageSharedFile: (options) => native.stageSharedFile(options),
  cancelStage: (options) => native.cancelStage(options),
  readFileChunk: (options) => native.readFileChunk(options),
  assembleFile: (options) => native.assembleFile(options),
  divelogsDownload: (options) => native.divelogsDownload(options),
  importCount: (options) => native.importCount(options),
  discardImport: (options) => native.discardImport(options),
  createIcloudLogbook: (options) => native.createIcloudLogbook(options),
  async importCsv(options) {
    const result = await native.importCsv({ ...options, params: JSON.stringify(options.params) });
    return JSON.parse(result.json);
  },
  async createLog(options) {
    return JSON.parse((await native.createLog(options)).json);
  },
  async deviceLog(options) {
    const result = await native.deviceLog(options);
    if (options.action === 'exists') return { exists: result.exists };
    return options.action === 'count' ? { count: result.count } : JSON.parse(result.json);
  },
  async deleteAccount(options) {
    const { json } = await native.deleteAccount(options);
    return JSON.parse(json);
  },
  async editDive(options) {
    return JSON.parse((await native.editDive(options)).json);
  },
  async siteQuery(options) {
    return JSON.parse((await native.siteQuery(options)).json);
  },
  async toolQuery(options) {
    return JSON.parse((await native.toolQuery(options)).json);
  },
  async filterQuery(options) {
    return JSON.parse((await native.filterQuery(options)).json);
  },
  async createDive(options) {
    return JSON.parse((await native.createDive(options)).json);
  },
  async deleteDive(options) {
    return JSON.parse((await native.deleteDive(options)).json);
  },
  async mergeDives(options) {
    return JSON.parse((await native.mergeDives(options)).json);
  },
  async editDives(options) {
    return JSON.parse((await native.editDives(options)).json);
  },
  async renumberDives(options) {
    return JSON.parse((await native.renumberDives(options)).json);
  },
  async importDives(options) {
    return JSON.parse((await native.importDives(options)).json);
  },
  async importDivesFiles(options) {
    return JSON.parse((await native.importDivesFiles(options)).json);
  },
  async filterPresets(options) {
    return JSON.parse((await native.filterPresets(options)).json);
  },
  async syncConflicts() {
    return JSON.parse((await native.syncConflicts()).json);
  },
  resolveConflicts: (options) => native.resolveConflicts(options),
  cancelConflictResolution: () => native.cancelConflictResolution(),
  async statsQuery(options) {
    return JSON.parse((await native.statsQuery(options)).json);
  },
  async siteAction(options) {
    return JSON.parse((await native.siteAction(options)).json);
  },
  async getTrip(options) {
    return JSON.parse((await native.getTrip(options)).json);
  },
  async diveComputers() {
    return JSON.parse((await native.diveComputers()).json);
  },
  async diveComputerAction(options) {
    return JSON.parse((await native.diveComputerAction(options)).json);
  },
  async tripAction(options) {
    return JSON.parse((await native.tripAction(options)).json);
  },
  async undo(options = {}) {
    return JSON.parse((await native.undo(options)).json);
  },
  saveLocal: () => native.saveLocal(),
  writeShareFile: (options) => native.writeShareFile(options),
  htmlToPdf: (options) => native.htmlToPdf(options),
  grantShareFile: (options) => native.grantShareFile(options),
  exportDives: (options) => native.exportDives(options),
  /** Desktop only: the extra columns of the logbook's table, for every listed dive. */
  async diveColumns() {
    return JSON.parse((await native.diveColumns()).json);
  },
  async listLoadedDives(options) {
    return JSON.parse((await native.listLoadedDives(options)).json);
  },
  async syncChanges() {
    return JSON.parse((await native.syncChanges()).json);
  },
  /** One dive in full; its water type is named here from the core's salinity. */
  async getDive(options) {
    const dive = await native.getDive(options);
    return { ...dive, waterType: waterTypeOf(dive.salinity) };
  },
  async getPrefs() {
    return JSON.parse((await native.getPrefs()).json);
  },
  setPrefs: (options) => native.setPrefs(options),
  async cylinderTypes(options) {
    const result = JSON.parse((await native.cylinderTypes(options)).json);
    const list = result.cylinderTypes ?? {};
    // Sorted by name for the screen here, not in the façade (cylinder-sort.js).
    if (Array.isArray(list.types)) list.types = sortCylinderTypes(list.types);
    return { ...list, undo: result.undo, redo: result.redo };
  },
  async plannerSetup() {
    return JSON.parse((await native.plannerSetup()).json);
  },
  async planDive(request) {
    return JSON.parse((await native.planDive({ request })).json);
  },
  async listPlans() {
    return JSON.parse((await native.listPlans()).json);
  },
  async savePlan(options) {
    return JSON.parse((await native.savePlan(options)).json);
  },
  pendingCrashReport: () => native.pendingCrashReport(),
  clearCrashReport: () => native.clearCrashReport(),
  networkStatus: () => native.networkStatus(),
  contrastLevel: () => native.contrastLevel(),
  placesSearch: (options) => native.placesSearch(options),
  bluetoothStatus: () => native.bluetoothStatus(),
  requestBluetoothPermission: () => native.requestBluetoothPermission(),
  enableBluetooth: () => native.enableBluetooth(),
  openAppSettings: () => native.openAppSettings(),
  contentShown: () => native.contentShown(),
  readSharedFile: (options) => native.readSharedFile(options),
  gaugeCamera: (options) => native.gaugeCamera(options),
  qrScan: (options) => native.qrScan(options),
  scanDocument: () => native.scanDocument(),
  keepScreenAwake: (options) => native.keepScreenAwake(options),
  healthDives: (options) => native.healthDives(options),
  installSource: () => native.installSource(),
  requestReview: () => native.requestReview(),
  openStorePage: () => native.openStorePage(),
  startBluetoothScan: (options = {}) => native.startBluetoothScan(options),
  stopBluetoothScan: () => native.stopBluetoothScan(),
  async bluetoothModels() {
    return JSON.parse((await native.bluetoothModels()).json);
  },
  async downloadDives(options) {
    return JSON.parse((await native.downloadDives(options)).json);
  },
  async downloadPartial(options) {
    return JSON.parse((await native.downloadPartial(options)).json);
  },
  cancelDownload: () => native.cancelDownload(),
  addListener(event, listener) {
    if (event === 'bluetoothDevice')
      return native.addListener(event, (/** @type {any} */ d) => listener({ ...d, computer: JSON.parse(d.computer || 'null') }));
    if (event === 'downloadProgress') return native.addListener(event, (/** @type {any} */ p) => listener(JSON.parse(p.json)));
    return native.addListener(event, listener);
  },
};
