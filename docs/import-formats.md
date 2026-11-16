# Import formats

What OpenDives reads when a file is opened with « + › Importer un fichier » (task 2026-11-16-221, for the website's selling points, to-do #80). Every line below was checked with real files: the sample files of Subsurface's `third_party/subsurface/dives/` (pinned commit `258beb44`), through the façade's `import_dives()`.

## How it was checked

- `tests/import_formats_test.cpp`, built by `poc/build.sh` as `build/poc/import-formats`. For each sample it creates a logbook (one dive of Subsurface's `test1.xml`), imports the sample into it with `import_dives()` (the way the app does, and `parse_file()` picks the reader from the extension), and looks at the dives the import added.
- Where Subsurface keeps a reference file next to a sample (`TestDiveDM4.xml`, `test-apd-inspiration-reference.xml`, the `.dlf.xml` files, `suunto_*.xml`, and so on), the imported dives are written as Subsurface XML and compared with the reference line by line, trimmed, as `third_party/subsurface/tests/testparse.cpp` does (`FILE_COMPARE`). Where there is none, the test checks the number of dives and that every dive has a profile.
- Three things are left out of the comparison, because they are the import's own work and not the reader's (Subsurface's tests call the parsers, not its import): the number of a dive (new dives are numbered after the dives already in the log), the depth of a cylinder (`normalize_imported_cylinder_depths()`, which Subsurface's own import runs), and the dive computer entries of `<settings>` (the test writes the imported dives only). Of the 20 samples that have a reference, 1 (Shearwater Cloud) is identical as it comes, 18 differ only by these lines (a `depth='…'` on a cylinder, a `number='…'` on a dive), and 1 differs in content (`suunto_ocean_nitrox.json` read alone, see its line): with them left out, every other reference matches line for line.
- On Android: the same program, built with the NDK from the same sources and the same dependencies as `libopendives.so` (sqlite, libzip, libxml2, libxslt, XSLT stylesheets copied to a folder), run on `emulator-5554` (x86_64, Android 17) by `tests/android/run-import-formats.sh`. Result: 108 checks passed, 0 failed, and the `result:` lines are identical to the host's, line for line. Mind that the stylesheet folder must be an absolute path (the app passes its files folder to `set_xslt_dir()`): with a relative one, the UDDF and UDCF stylesheets cannot find `commonTemplates.xsl` and nothing is read.

```sh
poc/build.sh
build/poc/import-formats third_party/subsurface/dives build/imp     # host
native/install-ndk.sh; tests/android/build.sh x86_64                # NDK build
tests/android/run-import-formats.sh x86_64                          # on the emulator
```

## Result per format

Results: **works** (every dive read, a profile on each, identical to Subsurface's reference where there is one), **works with differences**, **fails**, **not reachable** (the core has no reader for the file as the app opens it).

| Format | Extension(s) | Sample used | Result | Note |
|---|---|---|---|---|
| Subsurface log and XML | `.ssrf`, `.xml` | `SampleDivesV2.ssrf`, `TwoTimesTwo.ssrf`, `abitofeverything.ssrf`, `test1.xml` | works | 29, 4, 18 and 1 dives, a profile on each. Also covered by the 98 round-trip files. |
| UDDF 3.0 to 3.2 | `.uddf` | `test42.uddf`, `test-uddf-ccr-3.1.uddf`, `test-uddf-ccr-3.2.uddf`, `test-uddf-export-events.uddf`, `test-uddf-zero-before-positive.uddf` | works | Five references, all matched. A file whose namespace only looks like UDDF gives no dive, as Subsurface's own test expects (`test-uddf-non-version-namespace.uddf`). |
| UDDF of the APD Inspiration | `.uddf` | `test-apd-inspiration.uddf` | works | Reference matched. |
| UDCF | `.udcf` | `TestDiveDivelogsDE.udcf` | works | 1 dive with profile; no reference. |
| Suunto Dive Manager 3 | `.SDE` | `TestDiveDM3.SDE` | works | 1 dive with profile; no reference. |
| Suunto Dive Manager 4 | `.db` | `TestDiveDM4.db` | works | Reference matched. |
| Suunto Dive Manager 5 | `.db` | `TestDiveDM5.db` | works | 4 dives, reference matched. |
| divelogs.de | `.DLD` | `TestDiveDivelogsDE.DLD` | works | Reference matched. |
| divelogs.de export | `.divelogs` | `test40.divelogs` | works | 1 dive with profile; no reference. |
| JDiveLog | `.jlb` | `TestDiveJDiveLog.jlb` | works | 1 dive with profile; no reference. |
| Shearwater Cloud | `.db` | `TestDiveShearwaterCloud.db` | works | 2 dives, identical to the reference. The other sample (`…GpsError.db`) is broken on purpose: the core drops that dive, as Subsurface's own test expects. |
| Seac Sync | `.db` | `TestDiveSeacSync.db` | works | 2 dives with profile; no reference. |
| Diving Log 4.1 | `.sql` (an SQLite database) | `TestDivingLog4.1.1.sql` | works | 1 dive with profile; no reference. |
| OSTCtools | `.dive` | `ostc_00087_….dive`, `ostc_00173_….dive` | works | 1 dive each, with profile; no reference. |
| Divesoft Freedom and Liberty | `.dlf` | five `.dlf` files (Freedom MIX v1 and v2, MIX2, factory test, Liberty CCR) | works | One dive each, references matched. |
| DataTrak | `.log` | `Example.log` | works | 76 dives with profile; no reference. A `.add` file next to it (WLog extensions) is read if present; none in the sample. |
| FIT (Garmin Descent, Suunto) | `.fit` | `garmin_2023-08-17-08-51-59.fit`, `garmin_2023-10-21-12-13-38.fit`, `suunto_ocean_nitrox.fit` | works | 1 dive each, with profile. The values are checked in `tests/fit_import_test.cpp`. A Garmin Connect `.zip` is not read by the core; the app takes the `.fit` out first. |
| Suunto app JSON | `.json` | `suunto_eon_core_nitrox.json`, `suunto_nautic_multigas.json`, `suunto_nautic_sidemount.json`, `suunto_ocean_air.json`, `suunto_ocean_nitrox.json` | works with differences | Four are identical to the references. `suunto_ocean_nitrox.json` alone lacks the gas mix and gradient factors, which the Suunto app puts in the `.fit` of the same dive: the core reads the two files as one dive when both are given (`suunto_json_fit_pair_import()`, identical to the reference; checked in the test), but `import_dives()` reads one file, so the app does not pair them today. |
| SmartTrak | `.slg` | `Demo_SmartTrak.slg` | not reachable | The core has no reader: Subsurface reads it with a separate program (`smtk-import/`, not part of the core). |
| DL7 | `.zxu` | `DL7.zxu` | not reachable | Read only through the column-mapping dialog. |
| CSV: Seabear | `.csv` | `TestDiveSeabearHUDC.csv`, `TestDiveSeabearH3_0002SBDT.CSV` | not reachable | The core refuses any `.csv` opened directly. Needs the column-mapping dialog. |
| CSV: Poseidon | `.csv` | `Poseidon_MkVILog.csv` | not reachable | Same. |
| CSV: Sensus | `.csv` | `TestSensusSingle.csv` | not reachable | Same. |
| CSV: generic and TSV | `.csv`, `.tsv` | `TestComma.csv`, `test41.csv`, `test41.tsv` | not reachable | Same; a `.tsv` is not known to the core at all. |

Total: **18 formats work** (17 without differences, 1 with differences: Suunto app JSON); 7 are not reachable (SmartTrak, DL7, and CSV in four families); none fails. Counting only the formats other than Subsurface's own log, 17 work.

## What differs from Subsurface's references

- Nothing in what the readers produce. The only lines that differ are added by the import itself, as in Subsurface: the depth of each cylinder that has none (`depth='66.0 m'`: the gas's maximum operating depth at the deco pO2, `calculate_deco_switch_depth()`) and the dive number after the dives already in the log.
- `suunto_ocean_nitrox.json` read alone (see above): 8 lines differ (the cylinder and the gas mix, `GF Low`/`GF High`, and a gas change event that only appears without the `.fit`).

## Suunto app JSON

`core/import-suunto-json.cpp` is now built (`core/compat/core-files.txt`), without any change to Subsurface. It uses Qt's JSON classes (`QJsonDocument`, `QJsonObject`, `QJsonArray`, `QJsonValue`), `QFile::encodeName` and `QFileInfo`; the replacement for them is `core/compat/qtshim/qtjson.h` (about 300 lines: a JSON reader and the few members the file calls), with one-line forwarding headers in `core/compat/qtshim/` and `QByteArray::fromRawData` in `qtshim.h`. The stub in `core/compat/qthelper_compat.cpp` is removed. Also built for Android and iOS, which read the same file list (the NDK build is checked on the emulator above; the iOS one is not built here, there is no Mac).

## Formats in the core without a sample

The core reads these too, but Subsurface has no sample file for them, so they were not checked: Shearwater (desktop `.db`), Atomic Cobalt (`.db`), Cochran (`.CAN`, and the `.DPT`, `.TMP`, `.HP1` exports), Liquivision (`.LVD`), Scubapro Logtrak (`.script`), Scubapro ASD (`.asd`), and the XML exports of MacDive, Mares, DiveLog, AV1, Suunto Dive Manager (SDM) and Diving Log, JDiveLog (`.xml`). They are not counted in the total.

## Samples that need the column mapping (CSV)

Out of scope; the core refuses them as `.csv` and asks for its mapping dialog.

- Seabear: `TestDiveSeabearHUDC.csv`, `TestDiveSeabearH3_0002SBDT.CSV` to `…0005…`, `TestDiveSeabearT1_0001SBDT.CSV` to `…0005…`.
- Poseidon: `Poseidon_MkVILog.csv` (and `Poseidon_MkVILog.txt`).
- Sensus: `TestSensusSingle.csv`.
- Generic CSV and TSV: `TestComma.csv`, `test41.csv`, `test41.tsv`, `test-csv-detail-bare-samples.csv`.
- Subsurface's own CSV exports: `test-export-sensors-detail.csv`, `test-export-sensors-summary.csv`, `exportprofilereference.csv`, `exportprofilereferenceVPMB.csv`.
- DL7: `DL7.zxu` (read through the same dialog).

## Not a dive log

`gps-import.gpx`, a GPS track, imports as one dive without a profile. It is not counted as a format.
