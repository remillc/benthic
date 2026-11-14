// SPDX-License-Identifier: GPL-2.0
// Importing a Garmin FIT file through the façade, as « + › Importer un fichier »
// does (import_dives(), task 2026-11-14-124): the file goes to Subsurface's
// core, which picks the FIT reader from the extension (core/file.cpp,
// fit_file_import()). The sample files are Subsurface's own
// (third_party/subsurface/dives/*.fit, no personal data). Also checks that a
// Garmin Connect « Export Original » .zip is not readable by the core as is:
// the app takes the .fit out of it first (app/src/lib/zip-fit.js).
//
// usage: fit-import <subsurface-dives-folder> <new-folder>
// Prints what the core read from each file; exit status 0 when every check
// passes, 1 otherwise.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/event.h"
#include "core/sample.h"

#include <zip.h>

#include <algorithm>
#include <cstdio>
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

struct Expected {
	const char *file;
	const char *model;  // the dive computer as the core names it
	int duration;       // seconds
	int maxdepth;       // mm
};

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <subsurface-dives-folder> <new-folder>\n", argv[0]);
		return 1;
	}
	std::string dives = argv[1], folder = argv[2], error, json, result;
	init();
	// A logbook to import into: one dive of Subsurface's samples.
	std::string log = folder + "/log[main]";
	if (import_file(dives + "/test1.xml", log, error) <= 0 || list_dives(log, json, error)) {
		printf("error=%s\n", error.c_str());
		return 1;
	}

	// The values the core reads from Subsurface's samples (14 November 2026, Subsurface's pinned
	// commit). The model of the 21 October file is the one Subsurface's own test expects
	// (tests/testparse.cpp, importGarminFit).
	const Expected expected[] = {
		{ "garmin_2023-08-17-08-51-59.fit", "Garmin Descent™ Mk1 (Imported from file)", 5577, 51765 },
		{ "garmin_2023-10-21-12-13-38.fit", "Garmin Descent™ Mk1 (Imported from file)", 6045, 62020 },
	};
	for (const Expected &e: expected) {
		size_t before = divelog.dives.size();
		std::vector<const dive *> known;
		for (const auto &x: divelog.dives)
			known.push_back(x.get());
		int ret = import_dives(dives + "/" + e.file, "Import", result, error);
		check(ret == 0, std::string(e.file) + " imported" + (ret ? " (" + error + ")" : ""));
		check(divelog.dives.size() == before + 1, std::string(e.file) + ": one dive added");
		const dive *d = nullptr;
		for (const auto &x: divelog.dives)
			if (std::find(known.begin(), known.end(), x.get()) == known.end())
				d = x.get();
		if (!d)
			continue;
		const divecomputer &dc = d->dcs[0];
		int events = 0;
		for (const auto &ev: dc.events)
			(void)ev, events++;
		bool pressure = false;
		for (const auto &s: dc.samples)
			for (const auto &p: s.pressure)
				pressure |= p.mbar > 0;
		printf("  %s: model=\"%s\" serial=\"%s\" duration=%d maxdepth=%d samples=%zu temperature=%d "
		       "cylinders=%zu events=%d tank-pressure=%d\n",
		       e.file, dc.model.c_str(), dc.serial.c_str(), d->duration.seconds, d->maxdepth.mm,
		       dc.samples.size(), d->watertemp.mkelvin, d->cylinders.size(), events, pressure);
		check(dc.model == e.model, std::string(e.file) + ": dive computer " + dc.model);
		check(!dc.samples.empty(), std::string(e.file) + ": profile kept");
		if (e.duration)
			check(d->duration.seconds == e.duration, std::string(e.file) + ": duration " + std::to_string(d->duration.seconds));
		if (e.maxdepth)
			check(d->maxdepth.mm == e.maxdepth, std::string(e.file) + ": max depth " + std::to_string(d->maxdepth.mm));
	}

	// Garmin Connect's « Export Original »: a .zip holding the .fit. The core reads the
	// entries of a .zip as XML (core/file.cpp, try_to_open_zip()), so it finds no dive.
	std::string zipped = folder + "/garmin-export.zip";
	int zerr = 0;
	zip_t *z = zip_open(zipped.c_str(), ZIP_CREATE | ZIP_TRUNCATE, &zerr);
	zip_source_t *src = z ? zip_source_file(z, (dives + "/" + expected[0].file).c_str(), 0, -1) : nullptr;
	bool made = src && zip_file_add(z, "123456789_ACTIVITY.fit", src, 0) >= 0 && zip_close(z) == 0;
	check(made, "Garmin export zip written");
	size_t before = divelog.dives.size();
	int ret = import_dives(zipped, "Import", result, error);
	check(ret != 0 && divelog.dives.size() == before, "a Garmin .zip as is: no dive (" + error + ")");

	return failures ? 1 : 0;
}
