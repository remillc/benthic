// SPDX-License-Identifier: GPL-2.0
// Deleting one of the diver's cylinder types (cylinder_type_delete): the cylinders of the type leave
// the dives that use them, except where taking one out would damage the dive (the cylinder the dive
// starts on / its only cylinder, a gas change or a tank sensor refers to it): there it stays, with its
// type cleared. The other cylinders' gas changes and sensors must keep pointing at the same
// cylinders. Checked in memory, after undo and redo, and after a save to git and reload.
//
// usage: cylinder-delete <tests/data/cylinder-delete.ssrf> <new-folder>
#include "core/libbenthic/benthic.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divecomputer.h"
#include "core/equipment.h"
#include "core/event.h"
#include "core/sample.h"
#include "core/tanksensormapping.h"

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

using namespace benthic;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	if (!ok) {
		printf("FAIL: %s\n", what.c_str());
		failures++;
	}
}

static dive *dive_numbered(int number)
{
	for (auto &d: divelog.dives)
		if (d->number == number)
			return d.get();
	return nullptr;
}

// "AL80:200:100:o21|Mon 3L:190:150:o32": description, start and end bar, oxygen % of each cylinder.
static std::string cylinders(const dive &d)
{
	std::string out;
	for (const auto &c: d.cylinders)
		out += (out.empty() ? "" : "|") + c.type.description + ":" + std::to_string(c.start.mbar / 1000) + ":" +
		       std::to_string(c.end.mbar / 1000) + ":o" + std::to_string(c.gasmix.o2.permille ? c.gasmix.o2.permille / 10 : 21);
	return out;
}

// The gas changes as "cylinder@seconds".
static std::string switches(const dive &d)
{
	std::string out;
	for (const auto &dc: d.dcs)
		for (const auto &ev: dc.events)
			if (ev.is_gaschange())
				out += (out.empty() ? "" : ",") + std::to_string(ev.gas.index) + "@" + std::to_string(ev.time.seconds);
	return out;
}

static std::string mappings(const dive &d)
{
	std::string out;
	for (const auto &dc: d.dcs)
		for (const auto &m: dc.tank_sensor_mappings)
			out += (out.empty() ? "" : ",") + std::to_string(m.sensor_id) + ">" + std::to_string(m.cylinder_index);
	return out;
}

struct Expect {
	int number;
	const char *cylinders, *switches, *mappings;
};

// After the deletion.
static const Expect AFTER[] = {
	{ 1, "AL80:200:100:o21", "", "" },
	{ 2, "unknown:200:80:o21", "", "" },
	{ 3, "AL80:200:100:o21|unknown:200:120:o50", "1@600", "" },
	{ 4, "AL80:200:100:o21|S80:200:150:o100", "1@720", "" },
	{ 5, "AL80:200:100:o21|unknown:200:120:o21", "", "0>0,1>1" },
	{ 6, "AL80:200:100:o21|S80:200:120:o21", "", "0>0,2>1" },
	{ 7, "AL80:200:100:o21", "", "" },
};
// Before: as read from the file.
static const Expect BEFORE[] = {
	{ 1, "AL80:200:100:o21|Mon 3L:190:150:o32", "", "" },
	{ 2, "Mon 3L:200:80:o21", "", "" },
	{ 3, "AL80:200:100:o21|Mon 3L:200:120:o50", "1@600", "" },
	{ 4, "AL80:200:100:o21|Mon 3L:0:0:o32|S80:200:150:o100", "2@720", "" },
	{ 5, "AL80:200:100:o21|Mon 3L:200:120:o21", "", "0>0,1>1" },
	{ 6, "AL80:200:100:o21|Mon 3L:0:0:o21|S80:200:120:o21", "", "0>0,2>2" },
	{ 7, "AL80:200:100:o21", "", "" },
};

static void verify(const Expect *list, const std::string &what)
{
	for (int i = 0; i < 7; i++) {
		const Expect &e = list[i];
		dive *d = dive_numbered(e.number);
		if (!d) {
			check(false, what + ": dive " + std::to_string(e.number) + " missing");
			continue;
		}
		std::string label = what + ": dive " + std::to_string(e.number);
		check(cylinders(*d) == e.cylinders, label + " cylinders: " + cylinders(*d) + " expected " + e.cylinders);
		check(switches(*d) == e.switches, label + " gas changes: " + switches(*d) + " expected " + e.switches);
		check(mappings(*d) == e.mappings, label + " sensors: " + mappings(*d) + " expected " + e.mappings);
		check(d->dcs[0].samples.size() == 3 || d->dcs[0].samples.size() == 4, label + " profile");
	}
}

// Task 2026-11-23-373: the default table is only offered as suggestions; the diver's added types are given to the core in memory
// (set_added_cylinder_types) and stay in the table whatever display_default_tank_infos says, after a log is read, and are never
// written to the log.
static void cylinder_types_library_checks(const std::string &folder)
{
	std::string json, error;
	// The default table, as suggestions: imperial entries (cubic feet, psi) and metric ones.
	check(default_cylinder_types(json) == 0, "defaults");
	check(json.rfind("{\"types\":[],", 0) == 0, "defaults: the answer starts like the other cylinder answers (the plugin reads it by this prefix): " + json);
	check(json.find("\"name\":\"AL80\"") != std::string::npos && json.find("\"imperial\":true") != std::string::npos, "defaults: imperial entries");
	check(json.find("\"name\":\"12L 232 bar\",\"ml\":12000,\"mbar\":232000,\"imperial\":false") != std::string::npos, "defaults: metric entries in litres and bar: " + json);
	check(json.find("\"name\":\"HP100\"") != std::string::npos && json.find("\"name\":\"LP95\"") != std::string::npos, "defaults: HP100 and LP95");

	// "Proposer les tailles standard" is off: the list is the dives' types only.
	check(set_prefs("{\"displayDefaultTankInfos\":false}", error) == 0, "display_default_tank_infos off: " + error);
	check(cylinder_types(json) == 0, "list");
	check(json.find("\"name\":\"HP100\"") == std::string::npos, "the default table is not in the list");

	// The diver's added types: in the table, with the size given, whatever the preference, and not part of any dive.
	check(set_added_cylinder_types("{\"added\":[\"Acier 10L\t10000\t232000\",\"AL80\t11000\t200000\"]}", error) == 0, "added: " + error);
	check(json.size() > 0 && cylinder_types(json) == 0, "list after added");
	check(json.find("\"name\":\"Acier 10L\",\"ml\":10000,\"mbar\":232000,\"dives\":0") != std::string::npos, "an added type no dive uses is in the list: " + json);
	check(json.find("\"name\":\"HP100\"") == std::string::npos, "still no default table in the list");
	// A name the dives also have: one entry, the diver's size.
	size_t first = json.find("\"name\":\"AL80\""), second = first == std::string::npos ? first : json.find("\"name\":\"AL80\"", first + 1);
	check(first != std::string::npos && second == std::string::npos, "a type of the diver and of the dives is one row: " + json);
	check(json.find("\"name\":\"AL80\",\"ml\":11000,\"mbar\":200000") != std::string::npos, "the diver's size wins in the table: " + json);
	check(json.find("\"library\":true") != std::string::npos, "added types are flagged");

	// Reading another log (the table is rebuilt from the dives) keeps them.
	std::string reread;
	check(list_dives(folder + "/a[main]", reread, error) == 0, "reload: " + error);
	check(cylinder_types(json) == 0 && json.find("\"name\":\"Acier 10L\"") != std::string::npos, "added types survive the table being rebuilt: " + json);

	// They can be renamed (no dive: nothing renamed in the log), and deleted although the name is a standard one's.
	check(cylinder_type_rename("Acier 10L", "Acier 10 L", json, error) == 0, "rename: " + error);
	check(json.find("\"name\":\"Acier 10 L\"") != std::string::npos, "renamed in the list");
	check(cylinder_type_delete("Acier 10 L", false, json, error) == 0, "delete an added type: " + error);
	check(json.find("\"name\":\"Acier 10 L\"") == std::string::npos, "deleted from the list");
	// An empty list empties the library: the default table does not come back.
	check(set_added_cylinder_types("{\"added\":[]}", error) == 0, "empty");
	check(cylinder_types(json) == 0 && json.find("\"name\":\"HP100\"") == std::string::npos && json.find("\"library\":true") == std::string::npos,
	      "no added type, no default table: " + json);
	check(set_added_cylinder_types("{\"added\":[\"no tabs\"]}", error) != 0, "a bad entry is refused");
}

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <dive-file> <new-folder>\n", argv[0]);
		return 1;
	}
	std::string folder = argv[2], error, json, result;
	init();
	std::string a = folder + "/a[main]";
	if (import_file(argv[1], a, error) <= 0 || list_dives(a, json, error)) {
		printf("error=%s\n", error.c_str());
		return 1;
	}
	// The type comes from the dives (the table has it once the log is read); it is also put in the
	// device's library, as one the diver added: both ways must delete.
	if (cylinder_type_action("add", "Mon 3L", 3000, 200000, json, error))
		error.clear(); // already a type: only the dives carry it
	else
		printf("added to the library\n");
	verify(BEFORE, "before");

	// Counts only: nothing changes. Dives 1, 4, 6 lose the cylinder; 2, 3, 5 keep it.
	check(cylinder_type_delete("Mon 3L", true, json, error) == 0, "preview: " + error);
	check(json.find("\"deletion\":{\"removed\":3,\"kept\":3}") != std::string::npos, "preview counts: " + json);
	verify(BEFORE, "after the preview");
	// Task 2026-11-23-373: no type is refused for being in the default table (« AL80 » is a type of these dives, which can be
	// deleted like any other); only a name that is nowhere is not found.
	check(cylinder_type_delete("AL80", true, json, error) == 0, "AL80 of the dives is a type like another: " + error);
	error.clear();
	check(cylinder_type_delete("No such type", true, json, error) != 0 && error == "NOT_FOUND", "a type that is nowhere is not found");
	error.clear();

	check(cylinder_type_delete("Mon 3L", false, json, error) == 0, "delete: " + error);
	check(json.find("\"deletion\":{\"removed\":3,\"kept\":3}") != std::string::npos, "delete counts: " + json);
	check(json.find("\"name\":\"Mon 3L\"") == std::string::npos, "the type is gone from the list");
	verify(AFTER, "deleted");

	// One undoable step for the dives.
	check(undo(result, error) == 0, "undo: " + error);
	verify(BEFORE, "undone");
	check(redo(result, error) == 0, "redo: " + error);
	verify(AFTER, "redone");

	// Saved to git and read again.
	if (save_local(error) || list_dives(a, json, error)) {
		printf("error=save: %s\n", error.c_str());
		return 1;
	}
	verify(AFTER, "git reload");

	error.clear();
	check(cylinder_type_delete("Mon 3L", false, json, error) != 0 && error == "NOT_FOUND", "deleted twice");
	error.clear();
	cylinder_types_library_checks(folder);
	printf(failures ? "%d failures\n" : "all checks passed\n", failures);
	return failures ? 1 : 0;
}
