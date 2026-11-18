// SPDX-License-Identifier: GPL-2.0
// save_logbook_file (desktop: a file logbook is saved with Subsurface's File > Save As).
// Without network.
//
// usage: save-logbook <dive-file> <new-folder>
//
// Loads <dive-file> into a local git log in <new-folder>, adds an unused dive site, a
// dive computer nickname and the log's autogroup setting, makes a trip lose its last dive,
// writes the log with save_logbook_file and reads the file again: dives, trips, sites
// (unused one included) and settings are the ones in memory. The same log written
// with export_dives (every dive selected) loses the unused site and the nickname.
// A trip left without dive is dropped by Subsurface's core itself (a trip lives through its dives).
// Prints "PASS: ..." lines; exit status 0 when all pass, 1 otherwise.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/device.h"
#include "core/trip.h"

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using namespace opendives;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	printf("%s: %s\n", ok ? "PASS" : "FAIL", what.c_str());
	if (!ok)
		failures++;
}

static std::string read_file(const std::string &path)
{
	std::ifstream f(path, std::ios::binary);
	std::stringstream ss;
	ss << f.rdbuf();
	return ss.str();
}

static bool has_site(const std::string &name)
{
	for (auto &ds: divelog.sites)
		if (ds->name == name)
			return true;
	return false;
}

static bool has_nickname(const std::string &nick)
{
	for (auto &d: divelog.devices)
		if (d.nickName == nick)
			return true;
	return false;
}

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <dive-file> <new-folder>\n", argv[0]);
		return 1;
	}
	init();
	std::string folder = argv[2], json, error;
	if (import_file(argv[1], folder + "[main]", error) <= 0 || list_dives(folder + "[main]", json, error)) {
		printf("FAIL: cannot create the log: %s\n", error.c_str());
		return 1;
	}
	check(save_logbook_file("", error) != 0 && error == "BAD_REQUEST", "an empty path is refused");

	// A site no dive uses, a nickname, the autogroup setting.
	const std::string site_name = "Unused test site";
	check(site_create(site_name, 12345678, 23456789, json, error) == 0 && has_site(site_name), "an unused site is added");
	check(create_device_node(divelog.devices, "Test model", "SER-4242", "My test computer") >= 0 && has_nickname("My test computer"),
	      "a dive computer nickname is added");
	trips_autogroup(true, json, error);
	check(divelog.autogroup, "autogroup is on");

	// A trip that loses its last dive, and the trips that stay.
	dive *first = divelog.dives[0].get();
	std::string trip_json;
	check(trip_create({ first->id }, trip_json, error) == 0 && first->divetrip, "a trip is made for a dive");
	if (first->divetrip && trip_remove_dive(first->id, json, error) != 0)
		printf("note: trip_remove_dive: %s\n", error.c_str());
	size_t trips_in_memory = divelog.trips.size(), dives_in_memory = divelog.dives.size(), sites_in_memory = divelog.sites.size();
	size_t with_trip = 0;
	for (auto &d: divelog.dives)
		if (d->divetrip)
			with_trip++;
	check(trips_in_memory > 0, "the log has trips");
	printf("note: %zu trips, %zu dives (%zu in a trip), %zu sites in memory\n", trips_in_memory, dives_in_memory, with_trip, sites_in_memory);

	std::string file = folder + "-saved.ssrf";
	remove(file.c_str());
	check(save_logbook_file(file, error) == 0, "the log is written");
	std::string text = read_file(file);
	check(text.find("<divelog program='subsurface'") == 0, "the file is a Subsurface log");
	check(text.find(site_name) != std::string::npos, "the unused site is in the file");
	check(text.find("My test computer") != std::string::npos, "the nickname is in the file");
	check(text.find("<autogroup") != std::string::npos, "the autogroup setting is in the file");

	// The same log through the export of selected dives.
	std::vector<int> ids;
	for (auto &d: divelog.dives)
		ids.push_back(d->id);
	std::string exported = folder + "-exported.ssrf";
	check(export_dives(ids, "ssrf", false, exported, error) == 0, "export of every dive works");
	std::string etext = read_file(exported);
	check(etext.find(site_name) == std::string::npos && etext.find("My test computer") == std::string::npos,
	      "the export of selected dives loses the unused site and the nickname");

	// Read the file again.
	if (import_file(file, folder + "-reloaded[main]", error) <= 0) {
		printf("FAIL: cannot read the saved file: %s\n", error.c_str());
		return 1;
	}
	check(divelog.dives.size() == dives_in_memory, "the reloaded log has the same dives");
	check(has_site(site_name), "the reloaded log has the unused site");
	check(has_nickname("My test computer"), "the reloaded log has the nickname");
	check(divelog.autogroup, "the reloaded log has autogroup on");
	size_t reloaded_with_trip = 0;
	for (auto &d: divelog.dives)
		if (d->divetrip)
			reloaded_with_trip++;
	check(reloaded_with_trip == with_trip && divelog.trips.size() == trips_in_memory, "the reloaded log has the same trips");
	printf("%s\n", failures ? "FAILED" : "ALL PASSED");
	return failures ? 1 : 0;
}
