// SPDX-License-Identifier: GPL-2.0
// Every import format the core reads, with real files (task 2026-11-16-221).
//
// Each sample file of Subsurface's third_party/subsurface/dives/ goes through the
// façade's import_dives(), as « + › Importer un fichier » does (the core picks
// the reader from the extension, core/file.cpp, parse_file()). Where Subsurface
// keeps a reference next to the sample (TestDiveDM4.xml, test-apd-inspiration-
// reference.xml, ...), the dives that were read are written as Subsurface XML
// (save_dives_logic, the imported dives only) and compared with the reference
// line by line, as tests/testparse.cpp's FILE_COMPARE does. Otherwise the number
// of dives and the profile of each one are checked.
//
// What the import itself changes is left out of the comparison, because Subsurface's own
// tests call the parsers, not its import: the number of a dive (new dives are numbered after
// the dives already in the log), the depth of a cylinder (normalize_imported_cylinder_depths(),
// core/equipment.cpp, which the import runs), and the dive computer entries of <settings>
// (the test writes the imported dives only, and an entry is written when a written dive
// uses it). The first two are counted and printed too ("N lines differ" before the
// normalisation).
//
// usage: import-formats <subsurface-dives-folder> <new-folder> [<xslt-folder>]
// The stylesheets (Subsurface's xslt/) are found from the build, unless a folder is given: on Android
// the app copies them to its own files (set_xslt_dir()), and tests/android/run-import-formats.sh does too.
// Prints one "result:" line per sample: the dives read, how many have a profile, how the
// dives compare with the reference; the first differing lines follow. Exit status 0 when
// every sample gives what the table below says, 1 otherwise.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/file.h"
#include "core/sample.h"

#include <algorithm>
#include <cstdio>
#include <fstream>
#include <regex>
#include <sstream>
#include <string>
#include <vector>

using namespace opendives;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	printf("%s: %s\n", ok ? "ok" : "FAIL", what.c_str());
	if (!ok)
		failures++;
}

// What a sample gives.
//   dives     the number of dives the import adds; 0: the core refuses the file.
//   profile   every dive has a profile (false for a GPS track, which has none).
//   ref       Subsurface's reference file, or "" for none.
//   diffs     lines that differ from the reference after the normalisation above.
struct Sample {
	const char *file;
	const char *format;
	int dives;
	bool profile;
	const char *ref;
	int diffs;
};

static const Sample samples[] = {
	// Subsurface's own files
	{ "SampleDivesV2.ssrf", "ssrf", 29, true, "", 0 },
	{ "TwoTimesTwo.ssrf", "ssrf", 4, true, "", 0 },
	{ "abitofeverything.ssrf", "ssrf", 18, true, "", 0 },
	{ "test1.xml", "xml", 1, true, "", 0 },
	// UDDF, UDCF
	{ "test42.uddf", "uddf", 1, true, "test-42-uddf-import-reference.xml", 0 },
	{ "test-uddf-ccr-3.2.uddf", "uddf", 1, true, "test-uddf-ccr-reference.xml", 0 },
	{ "test-uddf-ccr-3.1.uddf", "uddf", 1, true, "test-uddf-ccr-reference.xml", 0 },
	{ "test-uddf-export-events.uddf", "uddf", 1, true, "test-uddf-export-events-import-reference.xml", 0 },
	{ "test-uddf-zero-before-positive.uddf", "uddf", 1, true, "test-uddf-zero-before-positive-reference.xml", 0 },
	// Subsurface's own test expects no dive here: the namespace is not a UDDF one.
	{ "test-uddf-non-version-namespace.uddf", "uddf", 0, true, "", 0 },
	{ "test-apd-inspiration.uddf", "apd", 1, true, "test-apd-inspiration-reference.xml", 0 },
	{ "TestDiveDivelogsDE.udcf", "udcf", 1, true, "", 0 },
	// Suunto Dive Manager
	{ "TestDiveDM3.SDE", "dm3", 1, true, "", 0 },
	{ "TestDiveDM4.db", "dm4", 1, true, "TestDiveDM4.xml", 0 },
	{ "TestDiveDM5.db", "dm5", 4, true, "TestDiveDM5.xml", 0 },
	// divelogs.de, JDiveLog
	{ "TestDiveDivelogsDE.DLD", "dld", 1, true, "TestDiveDivelogsDE.xml", 0 },
	{ "test40.divelogs", "divelogs", 1, true, "", 0 },
	{ "TestDiveJDiveLog.jlb", "jlb", 1, true, "", 0 },
	// Databases
	{ "TestDiveShearwaterCloud.db", "shearwater-cloud", 2, true, "TestDiveShearwaterCloud.xml", 0 },
	// Subsurface's own test: a record the parser cannot read, the dive is dropped.
	{ "TestDiveShearwaterCloudGpsError.db", "shearwater-cloud", 0, true, "", 0 },
	{ "TestDiveSeacSync.db", "seac", 2, true, "", 0 },
	{ "TestDivingLog4.1.1.sql", "divinglog", 1, true, "", 0 },
	// Other
	{ "ostc_00087_04-05-2014_043m_032min.dive", "ostctools", 1, true, "", 0 },
	{ "ostc_00173_17-08-2013_027m_043min.dive", "ostctools", 1, true, "", 0 },
	{ "Freedom_MIX_header_v1_00000115.dlf", "divesoft", 1, true, "Freedom_MIX_header_v1_00000115.dlf.xml", 0 },
	{ "Liberty_CCR_header_v1_00000011.dlf", "divesoft", 1, true, "Liberty_CCR_header_v1_00000011.dlf.xml", 0 },
	{ "Freedom_MIX_header_v2_00000003.dlf", "divesoft", 1, true, "Freedom_MIX_header_v2_00000003.dlf.xml", 0 },
	{ "Freedom_MIX2_header_v2_00000007.dlf", "divesoft", 1, true, "Freedom_MIX2_header_v2_00000007.dlf.xml", 0 },
	{ "Freedom_MIX2_header_v2_factory_test_00000001.dlf", "divesoft", 1, true,
	  "Freedom_MIX2_header_v2_factory_test_00000001.dlf.xml", 0 },
	{ "Example.log", "datatrak", 76, true, "", 0 },
	{ "garmin_2023-08-17-08-51-59.fit", "fit", 1, true, "", 0 },
	{ "garmin_2023-10-21-12-13-38.fit", "fit", 1, true, "", 0 },
	{ "suunto_ocean_nitrox.fit", "fit", 1, true, "", 0 },
	// Not reachable: SmartTrak is read by Subsurface's separate smtk2ssrf converter (smtk-import/),
	// not by the core; DL7 and the CSV files go through the column-mapping dialog.
	{ "Demo_SmartTrak.slg", "smarttrak", 0, true, "", 0 },
	{ "DL7.zxu", "dl7", 0, true, "", 0 },
	{ "Poseidon_MkVILog.csv", "csv-poseidon", 0, true, "", 0 },
	{ "TestDiveSeabearHUDC.csv", "csv-seabear", 0, true, "", 0 },
	{ "TestDiveSeabearH3_0002SBDT.CSV", "csv-seabear", 0, true, "", 0 },
	{ "TestSensusSingle.csv", "csv-sensus", 0, true, "", 0 },
	{ "TestComma.csv", "csv-generic", 0, true, "", 0 },
	{ "test41.csv", "csv-generic", 0, true, "", 0 },
	{ "test41.tsv", "tsv-generic", 0, true, "", 0 },
	// A GPS track: one dive without a profile per track, to place dives on a map.
	{ "gps-import.gpx", "gpx", 1, false, "", 0 },
	// The Suunto app's JSON: see core/compat/core-files.txt.
	{ "suunto_eon_core_nitrox.json", "suunto-json", 1, true, "suunto_eon_core_nitrox.xml", 0 },
	{ "suunto_nautic_multigas.json", "suunto-json", 1, true, "suunto_nautic_multigas.xml", 0 },
	{ "suunto_nautic_sidemount.json", "suunto-json", 1, true, "suunto_nautic_sidemount.xml", 0 },
	{ "suunto_ocean_air.json", "suunto-json", 1, true, "suunto_ocean_air.xml", 0 },
	// The reference of this one is the JSON read together with its .fit (see the pair below): alone,
	// it has no gas mix (the cylinder) and no gradient factors, and the gas change is added.
	{ "suunto_ocean_nitrox.json", "suunto-json", 1, true, "suunto_ocean_nitrox.xml", 8 },
};

// The lines of a file, trimmed as FILE_COMPARE does. With `normalize`, what the import itself
// changes is left out (see the top of this file).
static std::vector<std::string> trimmed_lines(const std::string &path, bool normalize)
{
	std::ifstream in(path);
	std::vector<std::string> out;
	std::string line;
	static const std::regex number(" number='[0-9]+'"), depth(" depth='[^']*'");
	while (std::getline(in, line)) {
		size_t b = line.find_first_not_of(" \t\r\n"), e = line.find_last_not_of(" \t\r\n");
		line = b == std::string::npos ? "" : line.substr(b, e - b + 1);
		if (normalize && line.compare(0, 15, "<divecomputerid") == 0)
			continue;
		if (normalize && line.compare(0, 6, "<dive ") == 0)
			line = std::regex_replace(line, number, "");
		if (normalize && line.compare(0, 9, "<cylinder") == 0)
			line = std::regex_replace(line, depth, "");
		out.push_back(line);
	}
	return out;
}

// The lines that are in one of the two files only (longest common subsequence); the first
// ones go into `first`.
static int differing_lines(const std::vector<std::string> &a, const std::vector<std::string> &b, std::ostringstream &first)
{
	size_t n = a.size(), m = b.size();
	std::vector<std::vector<int>> l(n + 1, std::vector<int>(m + 1, 0));
	for (size_t i = n; i-- > 0;)
		for (size_t j = m; j-- > 0;)
			l[i][j] = a[i] == b[j] ? l[i + 1][j + 1] + 1 : std::max(l[i + 1][j], l[i][j + 1]);
	int diffs = 0, shown = 0;
	size_t i = 0, j = 0;
	auto report = [&](const char *who, size_t line, const std::string &text) {
		diffs++;
		if (shown++ < 6)
			first << "    " << who << " line " << line + 1 << ": " << text.substr(0, 150) << "\n";
	};
	while (i < n || j < m) {
		if (i < n && j < m && a[i] == b[j]) {
			i++, j++;
		} else if (j == m || (i < n && l[i + 1][j] >= l[i][j + 1])) {
			report("read only,", i, a[i]);
			i++;
		} else {
			report("reference only,", j, b[j]);
			j++;
		}
	}
	return diffs;
}

int main(int argc, char **argv)
{
	if (argc != 3 && argc != 4) {
		fprintf(stderr, "usage: %s <subsurface-dives-folder> <new-folder> [<xslt-folder>]\n", argv[0]);
		return 1;
	}
	std::string dives = argv[1], folder = argv[2], error, result;
	init();
	if (argc == 4)
		set_xslt_dir(argv[3]);
	int index = 0;
	for (const Sample &s: samples) {
		std::string what = std::string(s.file) + " (" + s.format + ")";
		// A logbook to import into: one dive of Subsurface's samples.
		std::string log = folder + "/log" + std::to_string(index++) + "[main]";
		error.clear();
		if (import_file(dives + "/test1.xml", log, error) <= 0) {
			check(false, what + ": the logbook to import into (" + error + ")");
			continue;
		}
		std::vector<const dive *> known;
		for (const auto &x: divelog.dives) {
			known.push_back(x.get());
			x->selected = false;
		}
		int ret = import_dives(dives + "/" + s.file, "Import", result, error);
		if (ret) {
			printf("result: %s: refused (%s)\n", what.c_str(), error.c_str());
			check(s.dives == 0, what + ": " + (s.dives == 0 ? "refused" : "expected to import, not refused"));
			continue;
		}
		std::vector<dive *> added;
		for (const auto &x: divelog.dives)
			if (std::find(known.begin(), known.end(), x.get()) == known.end())
				added.push_back(x.get());
		int with_profile = 0;
		for (dive *d: added) {
			d->selected = true;
			if (!d->dcs.empty() && d->dcs[0].samples.size() > 1)
				with_profile++;
		}

		// Compare with Subsurface's reference, as testparse.cpp does.
		int diffs = 0;
		std::string reference = "none", detail;
		if (*s.ref) {
			std::string out = folder + "/" + s.file + ".out.ssrf";
			if (save_dives_logic(out.c_str(), true, false)) {
				check(false, what + ": the dives could not be written");
				continue;
			}
			std::ostringstream raw_detail, normalized_detail;
			std::string ref = dives + "/" + s.ref;
			int raw = differing_lines(trimmed_lines(out, false), trimmed_lines(ref, false), raw_detail);
			diffs = differing_lines(trimmed_lines(out, true), trimmed_lines(ref, true), normalized_detail);
			reference = raw ? std::to_string(raw) + " lines differ (" + std::to_string(diffs) + " after the import's own changes)"
					: "identical";
			detail = diffs ? normalized_detail.str() : "";
		}
		printf("result: %s: %zu dives, %d with a profile, reference %s\n%s", what.c_str(), added.size(), with_profile,
		       reference.c_str(), detail.c_str());
		if (s.dives == 0) {
			check(false, what + ": expected to be refused");
			continue;
		}
		check((int)added.size() == s.dives, what + ": " + std::to_string(s.dives) + " dives");
		if (s.profile)
			check(with_profile == (int)added.size(), what + ": every dive has a profile");
		else
			check(with_profile == 0, what + ": a track, no profile");
		if (*s.ref)
			check(diffs == s.diffs, what + ": " + std::to_string(s.diffs) + " lines differ from the reference");
	}
	// The Suunto app exports a .json and a .fit for the same dive. Several files chosen together go
	// through import_dives_files(), which reads a pair as one dive first (Subsurface's
	// suunto_json_fit_pair_import(), as its desktop import does), then every other file on its own.
	// The pair gives the reference; a .json alone, and files that are not a pair, still import.
	struct Case {
		const char *label;
		std::vector<std::string> files;
		int dives;          // dives added
		const char *ref;    // reference to compare the added dives with ("" for none)
		const char *error;  // expected refusal ("" for none)
	};
	const std::string nitrox = "suunto_ocean_nitrox";
	const std::vector<Case> cases = {
		{ "suunto_ocean_nitrox.json + .fit (the pair)", { "suunto_ocean_nitrox.json", "suunto_ocean_nitrox.fit" }, 1,
		  "suunto_ocean_nitrox.xml", "" },
		{ "suunto_ocean_nitrox.fit + .json (the other order)", { "suunto_ocean_nitrox.fit", "suunto_ocean_nitrox.json" }, 1,
		  "suunto_ocean_nitrox.xml", "" },
		{ "suunto_ocean_nitrox.json + .fit + suunto_ocean_air.json (the pair and a file of its own)",
		  { "suunto_ocean_nitrox.json", "suunto_ocean_nitrox.fit", "suunto_ocean_air.json" }, 2, "", "" },
		{ "suunto_ocean_nitrox.json + garmin .fit (no pair: each on its own)",
		  { "suunto_ocean_nitrox.json", "garmin_2023-08-17-08-51-59.fit" }, 2, "", "" },
		{ "suunto_ocean_air.json + suunto_eon_core_nitrox.json (two .json files)",
		  { "suunto_ocean_air.json", "suunto_eon_core_nitrox.json" }, 2, "", "" },
		{ "suunto_ocean_nitrox.json alone (one file)", { "suunto_ocean_nitrox.json" }, 1, "", "" },
		{ "suunto_ocean_air.json + a file that is not a log", { "suunto_ocean_air.json", "DL7.zxu" }, 1, "", "" },
	};
	for (const Case &c: cases) {
		std::string what = std::string(c.label) + " through import_dives_files()";
		std::string log = folder + "/log-pair" + std::to_string(index++) + "[main]";
		error.clear();
		if (import_file(dives + "/test1.xml", log, error) <= 0) {
			check(false, what + ": the logbook to import into (" + error + ")");
			return 1;
		}
		std::vector<const dive *> known;
		for (const auto &x: divelog.dives) {
			known.push_back(x.get());
			x->selected = false;
		}
		std::vector<std::string> names;
		for (const std::string &f: c.files)
			names.push_back(dives + "/" + f);
		if (import_dives_files(names, "multiple files", result, error)) {
			check(false, what + ": refused (" + error + ")");
			continue;
		}
		size_t added = 0;
		for (const auto &x: divelog.dives) {
			if (std::find(known.begin(), known.end(), x.get()) != known.end())
				continue;
			x->selected = true;
			added++;
		}
		check((int)added == c.dives, what + ": " + std::to_string(c.dives) + " dives added (got " + std::to_string(added) + ")");
		if (!*c.ref) {
			printf("result: %s: %zu dives\n", what.c_str(), added);
			continue;
		}
		std::string out = folder + "/pair" + std::to_string(index) + ".out.ssrf";
		std::ostringstream detail;
		if (save_dives_logic(out.c_str(), true, false)) {
			check(false, what + ": the dives could not be written");
			continue;
		}
		int d = differing_lines(trimmed_lines(out, true), trimmed_lines(dives + "/" + c.ref, true), detail);
		printf("result: %s: reference %s\n%s", what.c_str(), (d ? std::to_string(d) + " lines differ" : std::string("identical")).c_str(),
		       detail.str().c_str());
		check(d == 0, what + ": identical to the reference");
	}
	// Nothing readable in any file: a refusal, as for one file.
	{
		std::string log = folder + "/log-pair-none[main]";
		error.clear();
		if (import_file(dives + "/test1.xml", log, error) <= 0) {
			check(false, "the logbook to import into (" + error + ")");
			return 1;
		}
		int ret = import_dives_files({ dives + "/DL7.zxu", dives + "/DL7.zxu" }, "multiple files", result, error);
		check(ret != 0, "two files that are not logs: refused (" + error + ")");
	}

	return failures ? 1 : 0;
}
