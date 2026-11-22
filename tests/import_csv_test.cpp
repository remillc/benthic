// SPDX-License-Identifier: GPL-2.0
// CSV import with a column mapping (task 2026-11-16-224, part 8): the facade's import_csv() with the
// real samples of Subsurface's third_party/subsurface/dives/, the mapping the app's dialog sends
// (app/src/lib/csv-import.js) as the desktop's DiveLogImportDialog does.
//
// Compared with Subsurface's reference where one exists, as tests/testparse.cpp does (FILE_COMPARE):
//   test41.csv, test41.tsv (a dive per line)     test-csv.xml, test-tsv.xml
//   TestDiveSeabearHUDC.csv (older Seabear)      TestDiveSeabearHUDC.xml (its date is the time of the
//                                                 import, so the test sets it, as testparse.cpp does)
//   TestDiveSeabearH3_0002..0005, T1_0001..0005  TestDiveSeabearNewFormat.xml (the nine files together)
// Without a reference (Sensus, Poseidon MkVI, a bare profile) the test checks the dive: one dive, its
// profile, its depth and duration. What the import itself changes is left out of the comparison, as in
// tests/import_formats_test.cpp: the number of a dive and the depth of a cylinder.
//
// usage: import-csv <subsurface-dives-folder> <new-folder> [<xslt-folder>]
#include "core/libbenthic/benthic.h"

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

using namespace benthic;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	printf("%s: %s\n", ok ? "ok" : "FAIL", what.c_str());
	if (!ok)
		failures++;
}

static std::vector<std::string> trimmed_lines(const std::string &path)
{
	std::ifstream in(path);
	std::vector<std::string> out;
	std::string line;
	static const std::regex number(" number='[0-9]+'"), depth(" depth='[^']*'");
	while (std::getline(in, line)) {
		size_t b = line.find_first_not_of(" \t\r\n"), e = line.find_last_not_of(" \t\r\n");
		line = b == std::string::npos ? "" : line.substr(b, e - b + 1);
		if (line.compare(0, 15, "<divecomputerid") == 0)
			continue;
		if (line.compare(0, 6, "<dive ") == 0)
			line = std::regex_replace(line, number, "");
		if (line.compare(0, 9, "<cylinder") == 0)
			line = std::regex_replace(line, depth, "");
		out.push_back(line);
	}
	return out;
}

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

// The lines of the n-th dive of a file (from its <dive ...> line to </dive>).
static std::vector<std::string> dive_block(const std::vector<std::string> &lines, size_t n)
{
	std::vector<std::string> out;
	size_t seen = 0;
	bool inside = false;
	for (const std::string &line: lines) {
		if (line.compare(0, 6, "<dive ") == 0) {
			inside = seen++ == n;
		}
		if (inside)
			out.push_back(line);
		if (inside && line == "</dive>")
			break;
	}
	return out;
}

static int counter = 0;
static std::string folder;

// A logbook of one dive (Subsurface's test1.xml) to import into, as the formats test does.
static bool fresh_log(const std::string &dives, std::vector<const dive *> &known)
{
	std::string error, log = folder + "/log" + std::to_string(counter++) + "[main]";
	if (import_file(dives + "/test1.xml", log, error) <= 0)
		return false;
	known.clear();
	for (const auto &x: divelog.dives) {
		known.push_back(x.get());
		x->selected = false;
	}
	return true;
}

static std::vector<dive *> added_dives(const std::vector<const dive *> &known)
{
	std::vector<dive *> added;
	for (const auto &x: divelog.dives)
		if (std::find(known.begin(), known.end(), x.get()) == known.end())
			added.push_back(x.get());
	return added;
}

// The dives the imports added, selected, written as XML and compared with the reference.
static void compare_added(const std::string &what, const std::vector<const dive *> &known, const std::string &ref,
			  size_t expected_dives)
{
	std::vector<dive *> added = added_dives(known);
	check(added.size() == expected_dives, what + ": " + std::to_string(expected_dives) + " dives");
	int with_profile = 0;
	for (dive *d: added) {
		d->selected = true;
		if (!d->dcs.empty() && d->dcs[0].samples.size() > 1)
			with_profile++;
	}
	check(with_profile == (int)added.size(), what + ": every dive has a profile");
	if (ref.empty())
		return;
	std::string out = folder + "/" + std::to_string(counter) + ".out.ssrf";
	if (save_dives_logic(out.c_str(), true, false)) {
		check(false, what + ": the dives could not be written");
		return;
	}
	std::ostringstream detail;
	int diffs = differing_lines(trimmed_lines(out), trimmed_lines(ref), detail);
	printf("result: %s: %s\n%s", what.c_str(), diffs ? (std::to_string(diffs) + " lines differ").c_str() : "identical to the reference",
	       detail.str().c_str());
	check(diffs == 0, what + ": identical to Subsurface's reference " + ref.substr(ref.find_last_of('/') + 1));
}

// The mapping of the Seabear files, as the dialog fills it for "Seabear CSV" (CSVApps in
// desktop-widgets/divelogimportdialog.cpp: time 0, depth 1, temperature 5, ndl 2, separator ;), the way
// testparse.cpp's testParseHUDC() gives it.
static std::string seabear_mapping(const std::string &date_time)
{
	return "{\"format\":\"seabear\"," + date_time +
	       "\"timeField\":0,\"depthField\":1,\"tempField\":5,\"po2Field\":-1,\"o2sensor1Field\":-1,\"o2sensor2Field\":-1,"
	       "\"o2sensor3Field\":-1,\"cnsField\":-1,\"ndlField\":2,\"ttsField\":-1,\"stopdepthField\":-1,\"pressureField\":-1,"
	       "\"setpointField\":-1,\"separatorIndex\":2,\"units\":0,\"hw\":\"DC text\"}";
}

// The mapping of test41.csv and test41.tsv (testParseCsv(), testParseTsv()).
static std::string dives_mapping(int separator)
{
	return "{\"format\":\"dives\",\"numberField\":0,\"dateField\":1,\"timeField\":2,\"durationField\":3,\"locationField\":-1,"
	       "\"gpsField\":-1,\"maxDepthField\":4,\"meanDepthField\":5,\"divemasterField\":-1,\"buddyField\":6,\"suitField\":7,"
	       "\"notesField\":8,\"weightField\":-1,\"tagsField\":-1,\"separatorIndex\":" + std::to_string(separator) +
	       ",\"units\":0,\"datefmt\":1,\"durationfmt\":2,\"cylindersizeField\":-1,\"startpressureField\":-1,"
	       "\"endpressureField\":-1,\"o2Field\":-1,\"heField\":-1,\"airtempField\":-1,\"watertempField\":-1}";
}

int main(int argc, char **argv)
{
	if (argc != 3 && argc != 4) {
		fprintf(stderr, "usage: %s <subsurface-dives-folder> <new-folder> [<xslt-folder>]\n", argv[0]);
		return 1;
	}
	std::string dives = argv[1], result, error;
	folder = argv[2];
	init();
	if (argc == 4)
		set_xslt_dir(argv[3]);
	std::vector<const dive *> known;

	// A dive per line, mapped by hand: test41.csv (comma, mm/dd/yy, mm:ss, metric).
	{
		const std::string what = "test41.csv, a dive per line, mapped by hand";
		check(fresh_log(dives, known), what + ": a logbook to import into");
		size_t before = divelog.dives.size();
		// The preview first: nothing is added.
		check(import_csv(dives + "/test41.csv", "", dives_mapping(1), "test41.csv", true, result, error) == 0, what + ": the preview");
		check(divelog.dives.size() == before, what + ": the preview adds nothing");
		check(result.find("\"maxDepthMm\":18000") != std::string::npos, what + ": the preview reads 18 m (" + result.substr(0, 150) + ")");
		int ret = import_csv(dives + "/test41.csv", "", dives_mapping(1), "test41.csv", false, result, error);
		check(ret == 0, what + ": imported (" + error + ")");
		compare_added(what, known, dives + "/test-csv.xml", 4);
	}

	// The tab-separated twin: test41.tsv.
	{
		const std::string what = "test41.tsv, a dive per line, tabs";
		check(fresh_log(dives, known), what + ": a logbook to import into");
		int ret = import_csv(dives + "/test41.tsv", "", dives_mapping(0), "test41.tsv", false, result, error);
		check(ret == 0, what + ": imported (" + error + ")");
		compare_added(what, known, dives + "/test-tsv.xml", 4);
	}

	// Seabear, the older HUDC file: the mapping of "Seabear CSV", and the date the dialog asks for.
	{
		const std::string what = "TestDiveSeabearHUDC.csv, Seabear (HUDC)";
		check(fresh_log(dives, known), what + ": a logbook to import into");
		// 1255152761 is 2009-10-10 05:12:41: the date and the time the reference was made with.
		int ret = import_csv(dives + "/TestDiveSeabearHUDC.csv", "", seabear_mapping("\"date\":\"20091010\",\"time\":\"10512\","),
				     "HUDC", false, result, error);
		check(ret == 0, what + ": imported (" + error + ")");
		for (dive *x: added_dives(known)) {
			x->when = 1255152761;
			x->dcs[0].when = 1255152761;
		}
		compare_added(what, known, dives + "/TestDiveSeabearHUDC.xml", 1);
	}

	// Seabear, the newer files (H3 and T1): their own parser, nine files one after the other
	// (testParseNewFormat()).
	{
		// Subsurface's test reads the nine files into one log; the import merges dives that are the same
		// dive (two of these files are), so each file goes into a log of its own here and its dive is
		// compared with the matching dive of the reference.
		const char *files[] = { "TestDiveSeabearH3_0002SBDT.CSV", "TestDiveSeabearH3_0003SBDT.CSV", "TestDiveSeabearH3_0004SBDT.CSV",
					"TestDiveSeabearH3_0005SBDT.CSV", "TestDiveSeabearT1_0001SBDT.CSV", "TestDiveSeabearT1_0002SBDT.CSV",
					"TestDiveSeabearT1_0003SBDT.CSV", "TestDiveSeabearT1_0004SBDT.CSV", "TestDiveSeabearT1_0005SBDT.CSV" };
		std::vector<std::string> reference = trimmed_lines(dives + "/TestDiveSeabearNewFormat.xml");
		for (size_t i = 0; i < 9; i++) {
			const std::string what = std::string(files[i]) + ", Seabear (new format)";
			check(fresh_log(dives, known), what + ": a logbook to import into");
			int ret = import_csv(dives + "/" + files[i], "", "{\"format\":\"seabear\"}", files[i], false, result, error);
			check(ret == 0, what + ": imported (" + error + ")");
			std::vector<dive *> added = added_dives(known);
			check(added.size() == 1 && added[0]->dcs[0].samples.size() > 1, what + ": one dive with a profile");
			if (added.size() != 1)
				continue;
			added[0]->selected = true;
			std::string out = folder + "/seabear" + std::to_string(i) + ".out.ssrf";
			check(!save_dives_logic(out.c_str(), true, false), what + ": written");
			// The reference is sorted by date, and its dives carry the oxygen toxicity of the dives before them
			// (otu, cns), which one file alone cannot have: those two are left out.
			static const size_t where[] = { 1, 3, 5, 7, 0, 2, 4, 6, 8 };
			auto loose = [](std::vector<std::string> lines) {
				static const std::regex toxicity(" (otu|cns)='[^']*'");
				for (std::string &l: lines)
					if (l.compare(0, 6, "<dive ") == 0)
						l = std::regex_replace(l, toxicity, "");
				return lines;
			};
			std::vector<std::string> mine = loose(dive_block(trimmed_lines(out), 0)), theirs = loose(dive_block(reference, where[i]));
			std::ostringstream detail;
			int diffs = differing_lines(mine, theirs, detail);
			printf("result: %s: %s\n%s", what.c_str(), diffs ? (std::to_string(diffs) + " lines differ").c_str() : "identical to the reference",
			       detail.str().c_str());
			check(diffs == 0 && !theirs.empty(), what + ": identical to dive " + std::to_string(i + 1) + " of TestDiveSeabearNewFormat.xml");
		}
	}

	// Sensus: the template of the desktop's "SensusCSV" (time column 9, depth column 10, comma).
	{
		const std::string what = "TestSensusSingle.csv, Sensus";
		check(fresh_log(dives, known), what + ": a logbook to import into");
		const std::string params =
			"{\"format\":\"samples\",\"template\":\"SensusCSV\",\"timeField\":9,\"depthField\":10,\"tempField\":-1,\"po2Field\":-1,"
			"\"o2sensor1Field\":-1,\"o2sensor2Field\":-1,\"o2sensor3Field\":-1,\"cnsField\":-1,\"ndlField\":-1,\"ttsField\":-1,"
			"\"stopdepthField\":-1,\"pressureField\":-1,\"setpointField\":-1,\"separatorIndex\":1,\"units\":0,\"hw\":\"SensusCSV\"}";
		int ret = import_csv(dives + "/TestSensusSingle.csv", "", params, "Sensus", false, result, error);
		check(ret == 0, what + ": imported (" + error + ")");
		compare_added(what, known, "", 1);
		for (dive *x: added_dives(known)) {
			printf("result: %s: %d s, maximum depth %d mm, %zu samples\n", what.c_str(), (int)x->duration.seconds,
			       (int)x->maxdepth.mm, x->dcs[0].samples.size());
			check(x->maxdepth.mm > 0 && x->duration.seconds > 60, what + ": a real dive (depth and duration read)");
		}
	}

	// A generic profile, a dive per file, mapped by hand: Subsurface's test-csv-detail-bare-samples.csv.
	{
		const std::string what = "test-csv-detail-bare-samples.csv, a profile mapped by hand";
		check(fresh_log(dives, known), what + ": a logbook to import into");
		int ret = import_csv(dives + "/test-csv-detail-bare-samples.csv", "",
				     "{\"format\":\"samples\",\"date\":\"20240312\",\"time\":\"10940\",\"timeField\":0,\"depthField\":1,"
				     "\"tempField\":-1,\"pressureField\":-1,\"separatorIndex\":1,\"units\":0}",
				     "bare.csv", false, result, error);
		printf("result: %s: ret %d %s\n", what.c_str(), ret, error.c_str());
		check(ret == 0, what + ": imported (" + error + ")");
		if (ret == 0)
			compare_added(what, known, "", 1);
	}

	// Poseidon MkVI: the .csv profile and its .txt.
	{
		const std::string what = "Poseidon_MkVILog.csv and .txt, Poseidon MkVI";
		check(fresh_log(dives, known), what + ": a logbook to import into");
		int ret = import_csv(dives + "/Poseidon_MkVILog.csv", dives + "/Poseidon_MkVILog.txt", "{\"format\":\"poseidon\"}", "Poseidon",
				     false, result, error);
		check(ret == 0, what + ": imported (" + error + ")");
		compare_added(what, known, "", 1);
		check(import_csv(dives + "/Poseidon_MkVILog.csv", "", "{\"format\":\"poseidon\"}", "Poseidon", true, result, error) != 0,
		      what + ": refused without the .txt");
	}

	// Wrong requests are refused, nothing is added.
	{
		check(fresh_log(dives, known), "refusals: a logbook to import into");
		size_t before = divelog.dives.size();
		check(import_csv(dives + "/test41.csv", "", "not json", "x", false, result, error) != 0 && error.rfind("BAD_REQUEST", 0) == 0,
		      "refusals: parameters that are not JSON");
		check(import_csv(dives + "/test41.csv", "", "{\"format\":\"nothing\"}", "x", false, result, error) != 0,
		      "refusals: an unknown format");
		check(import_csv(dives + "/test41.csv", "", "{\"format\":\"samples\",\"template\":\"../x\"}", "x", false, result, error) != 0,
		      "refusals: a stylesheet path");
		check(import_csv(dives + "/nothing-here.csv", "", "{\"format\":\"samples\",\"timeField\":0,\"depthField\":1}", "x", false, result, error) != 0,
		      "refusals: a missing file");
		check(divelog.dives.size() == before, "refusals: nothing was added");
	}

	printf("%s\n", failures ? "FAILED" : "all CSV imports checked");
	return failures ? 1 : 0;
}
