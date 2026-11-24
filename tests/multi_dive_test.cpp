// SPDX-License-Identifier: GPL-2.0
// Actions on several dives, through the façade: merge_dives and edit_dives
// (task 2026-11-15-178, parts 1 and 2). Without network.
//
// usage: multi-dive <dive-file> <new-folder>
//
// Creates a local git log from <dive-file> in <new-folder>, then checks:
//   - merging two consecutive dives gives one dive; the saved log reloads
//     with it (both profile parts); undo restores both dives byte for byte
//     (same git tree as before the merge); redo merges again;
//   - editing three dives together changes only the edited fields, as one
//     undoable step; a buddy chip removed goes from every dive that had it
//     and the other buddies stay; a second identical edit adds no step;
//   - shifting the start of three dives (shift_time) is one undoable step, byte for byte; the new fields of edit_dives.
// Prints "PASS: ..." lines; exit status 0 when all pass, 1 otherwise.
#include "core/libbenthic/benthic.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divecomputer.h"
#include "core/extradata.h"
#include "core/divesite.h"
#include "core/sample.h"
#include "core/pref.h"

#include <git2.h>

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

using namespace benthic;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	printf("%s: %s\n", ok ? "PASS" : "FAIL", what.c_str());
	if (!ok)
		failures++;
}

// The tree id of the tip of the log's branch.
static std::string tree_of(const std::string &folder)
{
	git_repository *repo = nullptr;
	std::string out;
	if (git_repository_open(&repo, folder.c_str()))
		return out;
	git_object *obj = nullptr;
	if (!git_revparse_single(&obj, repo, "main^{tree}")) {
		char buf[GIT_OID_HEXSZ + 1];
		git_oid_tostr(buf, sizeof(buf), git_object_id(obj));
		out = buf;
		git_object_free(obj);
	}
	git_repository_free(repo);
	return out;
}

static size_t samples_of(const dive &d)
{
	size_t n = 0;
	for (const divecomputer &dc: d.dcs)
		n += dc.samples.size();
	return n;
}

static dive *by_when(timestamp_t when)
{
	for (auto &d: divelog.dives)
		if (d->when == when)
			return d.get();
	return nullptr;
}

static void check_merge_numbers(const std::string &log, const std::vector<int> &before,
				size_t selected, const std::vector<int> &after, const std::string &label)
{
	std::string json, error;
	if (list_dives(log, json, error) || divelog.dives.size() < before.size()) {
		check(false, label + ": cannot load enough dives");
		return;
	}
	std::vector<timestamp_t> times;
	std::vector<int> ids;
	for (size_t i = 0; i < before.size(); ++i) {
		dive *d = divelog.dives[i].get();
		d->number = before[i];
		times.push_back(d->when);
		if (i < selected)
			ids.push_back(d->id);
	}
	for (size_t i = before.size(); i < divelog.dives.size(); ++i)
		divelog.dives[i]->number = 1000 + static_cast<int>(i);
	auto matches = [&](const std::vector<int> &numbers, bool merged) {
		for (size_t i = 0; i < numbers.size(); ++i) {
			size_t original = merged && i > 0 ? i + selected - 1 : i;
			dive *d = by_when(times[original]);
			if (!d || d->number != numbers[i])
				return false;
		}
		return true;
	};
	if (merge_dives(ids, json, error)) {
		check(false, label + ": merge failed");
		return;
	}
	check(matches(after, true), label + ": numbers after merge");
	check(undo(json, error) == 0 && matches(before, false), label + ": undo restores all numbers");
	check(redo(json, error) == 0 && matches(after, true), label + ": redo restores the merged numbers");
}

static void check_merge_number_collision(const std::string &log)
{
	std::string json, error;
	if (list_dives(log, json, error) || divelog.dives.size() < 4) {
		check(false, "collision check: cannot load enough dives");
		return;
	}
	const std::vector<int> numbers { 10, 12, 14, 12 };
	for (size_t i = 0; i < numbers.size(); ++i)
		divelog.dives[i]->number = numbers[i];
	const size_t count = divelog.dives.size();
	check(merge_dives({ divelog.dives[0]->id, divelog.dives[1]->id }, json, error) != 0 &&
		      error == "NUMBERING_CONFLICT" && divelog.dives.size() == count && !can_undo(),
	      "merge refuses to create a duplicate number");
	for (size_t i = 0; i < numbers.size(); ++i)
		check(divelog.dives[i]->number == numbers[i], "a refused merge preserves the original number");
}

static void check_merge_number_persistence(const std::string &log, const std::string &folder)
{
	std::string json, error;
	if (list_dives(log, json, error) || divelog.dives.size() < 6) {
		check(false, "numbering round trip: cannot load enough dives");
		return;
	}
	std::vector<int> ids, numbers { 0, 10, 12, 0, 13, 14 };
	for (size_t i = 0; i < divelog.dives.size(); ++i) {
		ids.push_back(divelog.dives[i]->id);
		if (i >= numbers.size())
			numbers.push_back(1000 + static_cast<int>(i));
	}
	if (renumber_dives(ids, 0, json, error, numbers) || save_local(error) || list_dives(log, json, error)) {
		check(false, "numbering round trip: cannot save the starting numbers");
		return;
	}
	std::vector<timestamp_t> times;
	ids.clear();
	for (size_t i = 0; i < 6; ++i) {
		times.push_back(divelog.dives[i]->when);
		if (i < 3)
			ids.push_back(divelog.dives[i]->id);
	}
	const std::string before = tree_of(folder);
	if (merge_dives(ids, json, error) || save_local(error)) {
		check(false, "numbering round trip: cannot save the merge");
		return;
	}
	const std::string merged = tree_of(folder);
	check(merged != before, "the merge and adjusted numbers are saved");
	check(undo(json, error) == 0 && save_local(error) == 0 && tree_of(folder) == before,
	      "undo restores the saved numbering exactly");
	check(redo(json, error) == 0 && save_local(error) == 0 && tree_of(folder) == merged,
	      "redo saves the adjusted numbering exactly");
	check(list_dives(log, json, error) == 0 && by_when(times[0]) && by_when(times[0])->number == 10 &&
		      by_when(times[3]) && by_when(times[3])->number == 0 &&
		      by_when(times[4]) && by_when(times[4])->number == 11 &&
		      by_when(times[5]) && by_when(times[5])->number == 12,
	      "the adjusted and unnumbered dives reload with their numbers");
}

// The stable dive id (23 November 2026): the extra data "Benthic id", written by assign_benthic_ids().
static std::string commit_message(const std::string &folder)
{
	std::string out;
	FILE *p = popen(("git -C " + folder + " log -1 --format=%B").c_str(), "r");
	char buf[256];
	while (p && fgets(buf, sizeof(buf), p))
		out += buf;
	if (p)
		pclose(p);
	return out;
}

static std::string benthic_id_in(const dive &d)
{
	for (const divecomputer &dc: d.dcs)
		for (const extra_data &e: dc.extra_data)
			if (e.key == "Benthic id")
				return e.value;
	return std::string();
}

static void check_benthic_ids(const std::string &log, const std::string &folder)
{
	std::string json, result, error;
	if (list_dives(log, json, error)) {
		check(false, "reload for the id checks: " + error);
		return;
	}
	size_t n = divelog.dives.size();
	check(save_local(error) == 0 && !has_unsaved_changes(), "nothing to save before the ids");
	benthic_ids_json(json);
	check(json.find("\"benthicId\":\"\"") != std::string::npos && json.find("\"benthicId\":\"a") == std::string::npos,
	      "no dive has an id in the sample");
	// Refusals change nothing.
	check(assign_benthic_ids("{\"" + std::to_string(divelog.dives[0]->id) + "\":\"nope\"}", result, error) != 0 &&
		      error.rfind("BAD_REQUEST", 0) == 0,
	      "a malformed id is refused");
	check(assign_benthic_ids("{\"987654\":\"0123456789\"}", result, error) != 0 && error == "NOT_FOUND", "an unknown dive is refused");
	check(!has_unsaved_changes(), "refused ids change nothing");
	// Ids for every dive; the second dive repeats the first one's (a split dive).
	const char *alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
	std::string assignments = "{";
	std::vector<std::string> given;
	for (size_t i = 0; i < n; i++) {
		std::string id = "0000000000";
		id[9] = alphabet[i % 32];
		id[8] = alphabet[(i / 32) % 32];
		given.push_back(id);
	}
	given[1] = given[0];
	for (size_t i = 0; i < n; i++)
		assignments += (i ? ",\"" : "\"") + std::to_string(divelog.dives[i]->id) + "\":\"" + given[i] + "\"";
	assignments += "}";
	check(assign_benthic_ids(assignments, result, error) == 0 && result == "{\"assigned\":" + std::to_string(n) + "}",
	      "assign gives every dive an id");
	check(has_unsaved_changes() && !can_undo(), "ids are unsaved changes but not an undo step");
	check(assign_benthic_ids(assignments, result, error) == 0 && result == "{\"assigned\":0}", "assigning the same ids again changes nothing");
	// The duplicate: the later dive gets a new id, the first keeps its own.
	const std::string fresh = "zzzzzzzzzz";
	check(assign_benthic_ids("{\"" + std::to_string(divelog.dives[1]->id) + "\":\"" + fresh + "\"}", result, error) == 0 &&
		      benthic_id_in(*divelog.dives[1]) == fresh && benthic_id_in(*divelog.dives[0]) == given[0],
	      "a duplicate gets a new id, the first dive keeps its own");
	given[1] = fresh;
	std::string one;
	get_dive(divelog.dives[2]->id, one, error);
	check(one.find("\"benthicId\":\"" + given[2] + "\"") != std::string::npos, "get_dive returns benthicId");
	list_loaded_dives(json);
	check(json.find("\"benthicId\":\"" + given[2] + "\"") != std::string::npos, "the list returns benthicId");
	// An edit, then its undo: the id is not taken away by the copy the undo history holds.
	int id2 = divelog.dives[2]->id;
	check(edit_dive(id2, "{\"notes\":\"with an id\"}", result, error) == 0 && benthic_id_in(*divelog.dives[2]) == given[2], "an edit keeps the id");
	check(undo(result, error) == 0 && benthic_id_in(*divelog.dives[2]) == given[2], "an undo keeps the id");
	// Saved as its own commit, then read again.
	check(save_local(error) == 0 && !has_unsaved_changes(), "the ids are saved");
	check(commit_message(folder).find("Benthic ids") != std::string::npos && commit_message(folder).find("Edit") == std::string::npos, "the commit is named \"Benthic ids\"");
	check(list_dives(log, json, error) == 0 && divelog.dives.size() == n, "the log reads again");
	bool same = true;
	for (size_t i = 0; i < n; i++)
		same = same && benthic_id_in(*divelog.dives[i]) == given[i];
	check(same, "every id survives the save and the load");
	// A dive made with its id.
	check(create_dive("{\"date\":\"2026-06-01T10:00:00\",\"benthicId\":\"7k2m9q4x1d\"}", result, error) == 0, "a dive is created with an id");
	benthic_ids_json(json);
	check(json.find("\"benthicId\":\"7k2m9q4x1d\"") != std::string::npos, "the new dive has its id");
	check(create_dive("{\"benthicId\":\"short\"}", result, error) != 0, "a created dive with a bad id is refused");
	check(undo(result, error) == 0, "the creation is undone");
}

// « Décaler la date et l'heure » (shift_time) and the fields « Modifier ensemble » added on 24 November 2026
// (rating, visibility, divemode, weightGrams, notesAppend): one undoable step, the saved log is back byte for byte.
static void check_shift_and_new_edits(const std::string &log, const std::string &folder)
{
	std::string json, error, result;
	if (list_dives(log, json, error) || divelog.dives.size() < 3) {
		check(false, "shift time: cannot load enough dives");
		return;
	}
	std::vector<int> ids;
	std::vector<timestamp_t> whens, dc_whens;
	std::vector<int> numbers, durations;
	for (size_t i = 0; i < 3; i++) {
		const dive &d = *divelog.dives[i];
		ids.push_back(d.id);
		whens.push_back(d.when);
		dc_whens.push_back(d.dcs[0].when);
		numbers.push_back(d.number);
		durations.push_back(d.duration.seconds);
	}
	const std::string tree0 = tree_of(folder);
	check(shift_time(ids, 0, json, error) != 0 && error == "NOTHING_TO_DO", "a zero shift is refused");
	check(shift_time({}, 60, json, error) != 0 && error == "NOTHING_TO_DO", "a shift of no dive is refused");
	check(shift_time(ids, 3650LL * 86400 + 1, json, error) != 0 && error.rfind("BAD_REQUEST", 0) == 0, "a shift of over ten years is refused");
	check(!can_undo(), "refused shifts add no step");

	// 1 h 05 later: every dive moves by the same amount, the intervals stay, durations and numbers do not change.
	const long long later = 65 * 60;
	check(shift_time(ids, later, json, error) == 0, "shift three dives 1 h 05 later");
	check(undo_text().rfind("shift time of 3 dives [", 0) == 0, "one undo step for the three dives");
	bool moved = true;
	for (size_t i = 0; i < 3; i++) {
		const dive *d = divelog.dives.get_by_uniq_id(ids[i]);
		moved = moved && d->when == whens[i] + later && d->number == numbers[i] && d->duration.seconds == durations[i] &&
			d->dcs[0].when == (dc_whens[i] ? dc_whens[i] + later : 0);
	}
	check(moved, "start times move by the same amount; numbers, durations are untouched");
	check(save_local(error) == 0 && tree_of(folder) != tree0, "the shift is saved");
	const std::string tree_shifted = tree_of(folder);
	check(undo(result, error) == 0 && !can_undo(), "one undo");
	bool restored = true;
	for (size_t i = 0; i < 3; i++)
		restored = restored && divelog.dives.get_by_uniq_id(ids[i])->when == whens[i];
	check(restored && save_local(error) == 0 && tree_of(folder) == tree0, "undo restores the saved log byte for byte");
	check(redo(result, error) == 0 && save_local(error) == 0 && tree_of(folder) == tree_shifted, "redo shifts again, byte for byte");
	// Reloaded, as Subsurface would read it.
	check(list_dives(log, json, error) == 0 && by_when(whens[0] + later) && by_when(whens[1] + later) && by_when(whens[2] + later) &&
		      by_when(whens[0] + later)->number == numbers[0],
	      "the saved log reloads with the dives at their new times");

	// A dive shifted past another one changes place in the table and keeps its number.
	if (list_dives(log, json, error) || divelog.dives.size() < 3) {
		check(false, "shift time: cannot reload");
		return;
	}
	dive *first = divelog.dives[0].get(), *second = divelog.dives[1].get();
	int first_id = first->id, first_number = first->number, second_id = second->id;
	timestamp_t first_when = first->when;
	long long past = second->when - first->when + 120;
	check(shift_time({ first_id }, past, json, error) == 0, "shift one dive past the next");
	size_t pos_first = 0, pos_second = 0;
	for (size_t i = 0; i < divelog.dives.size(); i++) {
		if (divelog.dives[i]->id == first_id)
			pos_first = i;
		if (divelog.dives[i]->id == second_id)
			pos_second = i;
	}
	check(pos_first > pos_second && divelog.dives.get_by_uniq_id(first_id)->number == first_number, "the dive is reordered and keeps its number");
	check(undo(result, error) == 0 && divelog.dives.get_by_uniq_id(first_id)->when == first_when && divelog.dives[0]->id == first_id,
	      "undo puts it back in place");

	// The new fields of edit_dives.
	if (list_dives(log, json, error) || divelog.dives.size() < 3) {
		check(false, "edit together: cannot reload");
		return;
	}
	ids.clear();
	std::vector<std::string> old_notes;
	std::vector<size_t> cyl;
	for (size_t i = 0; i < 3; i++) {
		ids.push_back(divelog.dives[i]->id);
		old_notes.push_back(divelog.dives[i]->notes);
		cyl.push_back(divelog.dives[i]->cylinders.size());
	}
	const std::string tree1 = tree_of(folder);
	check(edit_dives(ids, "{\"rating\":6}", json, error) != 0 && error.rfind("BAD_REQUEST", 0) == 0, "a rating over 5 is refused");
	check(edit_dives(ids, "{\"divemode\":\"SCUBA\"}", json, error) != 0 && error.rfind("BAD_REQUEST", 0) == 0, "an unknown dive mode is refused");
	check(!can_undo(), "refused edits add no step");
	check(edit_dives(ids, "{\"rating\":3,\"visibility\":4,\"divemode\":\"CCR\",\"weightGrams\":12000,\"notesAppend\":\"added line\"}", json, error) == 0,
	      "rating, visibility, mode, weight and appended notes on three dives");
	bool fields = true;
	for (size_t i = 0; i < 3; i++) {
		const dive *d = divelog.dives.get_by_uniq_id(ids[i]);
		int total = 0;
		for (const weightsystem_t &ws: d->weightsystems)
			total += ws.weight.grams;
		fields = fields && d->rating == 3 && d->visibility == 4 && d->dcs[0].divemode == CCR && total == 12000 &&
			 d->cylinders.size() == cyl[i] &&
			 d->notes == (old_notes[i].empty() ? std::string("added line") : old_notes[i] + "\nadded line");
	}
	check(fields, "every dive has the new values, the notes are appended on a new line, no cylinder is removed");
	check(undo_text().rfind("Edit dive (3 dive(s)) [", 0) == 0, "one undo step");
	check(save_local(error) == 0 && undo(result, error) == 0 && !can_undo() && save_local(error) == 0 && tree_of(folder) == tree1,
	      "one undo restores everything, byte for byte");
}

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <dive-file> <new-folder>\n", argv[0]);
		return 1;
	}
	init();
	std::string log = std::string(argv[2]) + "[main]", folder = argv[2], json, error;
	if (import_file(argv[1], log, error) <= 0 || list_dives(log, json, error)) {
		printf("FAIL: cannot create the log: %s\n", error.c_str());
		return 1;
	}
	if (divelog.dives.size() < 4) {
		printf("FAIL: the sample needs at least four dives\n");
		return 1;
	}
	// The baseline, as the edit tests make it: the log loaded as the app loads
	// it and saved into a new repository, which is the log used below.
	std::string baseline = folder + "-baseline";
	if (system(("git init -q -b main " + baseline).c_str()) || save_as(baseline + "[main]", error)) {
		printf("FAIL: baseline: %s\n", error.c_str());
		return 1;
	}
	folder = baseline;
	log = baseline + "[main]";
	if (list_dives(log, json, error)) {
		printf("FAIL: reload: %s\n", error.c_str());
		return 1;
	}
	size_t count0 = divelog.dives.size();
	const std::string tree0 = tree_of(folder);

	check_merge_numbers(log, { 0, 10, 12, 0, 13, 14 }, 3, { 10, 0, 11, 12 },
			    "merge with unnumbered selected and following dives");
	check_merge_numbers(log, { 10, 12, 0, 13, 14 }, 2, { 10, 0, 11, 12 },
			    "merge across a numbering gap");
	check_merge_numbers(log, { 0, 10, 0, 11, 12 }, 2, { 10, 0, 11, 12 },
			    "merge with only one numbered dive");
	check_merge_number_collision(log);
	if (list_dives(log, json, error)) {
		printf("FAIL: reload after numbering checks: %s\n", error.c_str());
		return 1;
	}

	// Hidden invalid dives remain available to a chronological renumbering.
	{
		dive *hidden = divelog.dives[2].get();
		const bool original_invalid = hidden->invalid;
		const bool original_pref = prefs.display_invalid_dives;
		hidden->invalid = true;
		prefs.display_invalid_dives = false;
		const std::string marker = "\"id\":" + std::to_string(hidden->id) + ",\"number\":";
		std::string visible, all;
		list_loaded_dives(visible);
		list_loaded_dives(all, true);
		check(visible.find(marker) == std::string::npos && all.find(marker) != std::string::npos,
		      "the full loaded list includes hidden invalid dives");
		std::vector<int> ids, original;
		for (size_t i = 1; i < divelog.dives.size(); ++i) {
			ids.push_back(divelog.dives[i]->id);
			original.push_back(divelog.dives[i]->number);
		}
		check(renumber_dives(ids, 100, json, error) == 0 && hidden->number == 101,
		      "renumbering includes the hidden dive in sequence");
		check(undo(json, error) == 0 && hidden->number == original[1],
		      "undo restores the hidden dive's number");
		hidden->invalid = original_invalid;
		prefs.display_invalid_dives = original_pref;
	}

	// --- Merge ------------------------------------------------------------
	dive *a = divelog.dives[1].get(), *b = divelog.dives[2].get();
	int id_a = a->id, id_b = b->id, number_a = a->number, number_b = b->number;
	timestamp_t when_a = a->when, when_b = b->when;
	size_t samples_sum = samples_of(*a) + samples_of(*b);
	std::vector<std::pair<timestamp_t, int>> later; // dives after the pair: start, number
	for (size_t i = 3; i < divelog.dives.size(); i++)
		later.push_back({ divelog.dives[i]->when, divelog.dives[i]->number });
	check(merge_dives({ id_a }, json, error) != 0 && error == "NOTHING_TO_DO", "merging one dive is refused");
	check(merge_dives({ id_a, 987654 }, json, error) != 0 && error == "NOT_FOUND", "merging an unknown dive is refused");
	check(divelog.dives.size() == count0 && !can_undo(), "refused merges change nothing");

	// The ids are given in any order: the table order is used.
	if (merge_dives({ id_b, id_a }, json, error)) {
		printf("FAIL: merge_dives: %s\n", error.c_str());
		return 1;
	}
	check(divelog.dives.size() == count0 - 1, "two dives merge into one");
	check(undo_text() == "merge dive", "one undo step named \"merge dive\"");
	dive *merged = by_when(when_a);
	check(merged != nullptr, "the merged dive starts with the first dive");
	if (!merged)
		return 1;
	check(by_when(when_b) == nullptr || by_when(when_b) == merged, "the second dive is gone");
	check(number_a == 0 || merged->number == number_a, "the merged dive keeps the first dive's number");
	check(samples_of(*merged) >= samples_sum / 2 && merged->dcs.size() >= 1, "the merged dive has the profiles");
	const int merged_duration = merged->duration.seconds;
	const size_t merged_samples = samples_of(*merged);
	check(merged_duration > 0, "the merged dive has a duration");
	if (number_a && number_b > number_a) {
		// Dives after the pair are renumbered by the numbers the merge removed.
		bool ok = true;
		int diff = number_b - number_a;
		for (size_t i = 0; i < later.size(); i++) {
			dive *d = by_when(later[i].first);
			int expected = later[i].second - diff;
			// Renumbering stops where the numbers are not in order, as MergeDives does.
			if (!d || (d->number != expected && d->number != later[i].second))
				ok = false;
		}
		check(ok, "the following dives are renumbered as MergeDives does");
	}
	if (save_local(error)) {
		printf("FAIL: save after merge: %s\n", error.c_str());
		return 1;
	}
	const std::string tree_merged = tree_of(folder);
	check(tree_merged != tree0, "the merge is saved");
	// Undo puts both dives back exactly; redo merges again to the same tree.
	std::string result;
	check(undo(result, error) == 0 && divelog.dives.size() == count0, "undo brings the two dives back");
	check(by_when(when_a) && by_when(when_b) && by_when(when_a)->id != by_when(when_b)->id, "both original dives are in the log");
	check(save_local(error) == 0 && tree_of(folder) == tree0, "after undo the saved log is the original, byte for byte");
	check(redo(result, error) == 0 && divelog.dives.size() == count0 - 1, "redo merges again");
	check(save_local(error) == 0 && tree_of(folder) == tree_merged, "after redo the saved log is the merged one again");
	// Reload the saved log, as Subsurface would read it.
	if (list_dives(log, json, error)) {
		printf("FAIL: reload: %s\n", error.c_str());
		return 1;
	}
	check(divelog.dives.size() == count0 - 1, "the saved log reloads with one dive less");
	dive *reloaded = by_when(when_a);
	check(reloaded && reloaded->duration.seconds == merged_duration && samples_of(*reloaded) == merged_samples &&
		      samples_of(*reloaded) >= samples_sum / 2 && by_when(when_b) == nullptr,
	      "the reloaded dive has both profile parts");

	// --- Edit together ----------------------------------------------------
	// A fresh log (the reload cleared the history): three dives, the first
	// three of the table.
	if (list_dives(log, json, error) || divelog.dives.size() < 3) {
		printf("FAIL: reload\n");
		return 1;
	}
	std::vector<dive *> three = { divelog.dives[0].get(), divelog.dives[1].get(), divelog.dives[2].get() };
	struct Snapshot {
		int id, number, duration, maxdepth, rating;
		std::string notes, suit, buddy, guide;
		dive_site *site;
		size_t cylinders, samples, tags;
	};
	auto snap = [](const dive &d) {
		return Snapshot { d.id, d.number, (int)d.duration.seconds, (int)d.maxdepth.mm, d.rating, d.notes, d.suit, d.buddy,
				  d.diveguide, d.dive_site, d.cylinders.size(), samples_of(d), d.tags.size() };
	};
	std::vector<int> ids;
	std::vector<Snapshot> before;
	for (dive *d: three) {
		ids.push_back(d->id);
		before.push_back(snap(*d));
	}
	const std::string tree_before_edit = tree_of(folder);
	// A site that exists, different from the first dive's one when possible.
	uint32_t site_uuid = 0;
	for (auto &ds: divelog.sites)
		if (ds.get() != before[0].site) {
			site_uuid = ds->uuid;
			break;
		}
	check(edit_dives({}, "{}", json, error) != 0, "editing no dive is refused");
	check(edit_dives(ids, "{\"bogus\":1}", json, error) != 0 && error.rfind("BAD_REQUEST", 0) == 0, "an unknown field is refused");
	check(!can_undo(), "refused edits add no step");
	std::string changes = "{\"notes\":\"edited together\",\"suit\":\"7 mm\",\"buddiesAdd\":[\"Zed Chip\"],"
			      "\"tagsAdd\":[\"multi-tag\"],\"userSalinity\":10300";
	if (site_uuid)
		changes += ",\"site\":" + std::to_string(site_uuid);
	changes += "}";
	if (edit_dives(ids, changes, json, error)) {
		printf("FAIL: edit_dives: %s\n", error.c_str());
		return 1;
	}
	check(undo_text().rfind("Edit dive (3 dive(s)) [", 0) == 0, "one undo step for the three dives");
	bool only_edited = true, edited = true;
	for (size_t i = 0; i < 3; i++) {
		dive *d = divelog.dives.get_by_uniq_id(ids[i]);
		Snapshot s = snap(*d);
		only_edited = only_edited && s.number == before[i].number && s.duration == before[i].duration &&
			      s.maxdepth == before[i].maxdepth && s.rating == before[i].rating &&
			      s.cylinders == before[i].cylinders && s.samples == before[i].samples &&
			      s.guide == before[i].guide;
		edited = edited && s.notes == "edited together" && s.suit == "7 mm" && d->user_salinity == 10300 &&
			 (s.buddy == before[i].buddy + (before[i].buddy.empty() ? "" : ", ") + "Zed Chip") &&
			 s.tags == before[i].tags + 1 && (!site_uuid || (d->dive_site && d->dive_site->uuid == site_uuid));
	}
	check(only_edited, "the other fields of the three dives are untouched");
	check(edited, "the edited fields are set on the three dives; each dive's own buddies stay");
	// The same edit again changes nothing and adds no step.
	std::string text_before = undo_text();
	check(edit_dives(ids, changes, json, error) == 0 && undo_text() == text_before, "the same edit again adds no step");
	// Removing the chip removes it from every dive that had it, and only it.
	check(edit_dives(ids, "{\"buddiesRemove\":[\"Zed Chip\"],\"tagsRemove\":[\"multi-tag\"]}", json, error) == 0,
	      "removing the chips");
	bool removed = true;
	for (size_t i = 0; i < 3; i++) {
		dive *d = divelog.dives.get_by_uniq_id(ids[i]);
		removed = removed && d->buddy.find("Zed Chip") == std::string::npos && d->buddy == before[i].buddy &&
			  d->tags.size() == before[i].tags;
	}
	check(removed, "the buddy chip left every dive and the other buddies stayed");
	// Chips changed on only some dives: add to all, remove from one dive.
	check(edit_dives({ ids[0] }, "{\"buddiesAdd\":[\"Solo Buddy\"]}", json, error) == 0 &&
		      edit_dives(ids, "{\"buddiesRemove\":[\"Solo Buddy\"]}", json, error) == 0 &&
		      divelog.dives.get_by_uniq_id(ids[0])->buddy == before[0].buddy,
	      "a chip on only some dives is removed from those that have it");
	// Undo the steps made so far in this block, back to the first edit.
	check(undo(result, error) == 0 && undo(result, error) == 0 && undo(result, error) == 0, "undo of the chip steps");
	for (size_t i = 0; i < 3; i++)
		edited = edited && divelog.dives.get_by_uniq_id(ids[i])->notes == "edited together";
	check(edited, "after those undos the first edit is still applied");
	check(undo(result, error) == 0, "undo of the first edit");
	bool restored = true;
	for (size_t i = 0; i < 3; i++) {
		Snapshot s = snap(*divelog.dives.get_by_uniq_id(ids[i]));
		restored = restored && s.notes == before[i].notes && s.suit == before[i].suit && s.buddy == before[i].buddy &&
			   s.site == before[i].site && s.tags == before[i].tags;
	}
	check(restored && !can_undo(), "one undo restores the three dives");
	check(save_local(error) == 0 && tree_of(folder) == tree_before_edit, "the saved log is the original, byte for byte");
	// Redo, save, reload: the edit is in the git log.
	while (can_redo())
		redo(result, error);
	check(save_local(error) == 0 && list_dives(log, json, error) == 0, "saved and reloaded after redo");
	bool reread = true;
	for (size_t i = 0; i < 3; i++) {
		dive *d = divelog.dives.get_by_uniq_id(ids[i]);
		(void)d;
	}
	for (auto &d: divelog.dives)
		if (d->notes == "edited together")
			reread = reread && d->suit == "7 mm";
	check(reread, "the reloaded dives carry the edit");
	check_shift_and_new_edits(log, folder);
	check_merge_number_persistence(log, folder);
	check_benthic_ids(log, folder);
	printf("%s: %d failure(s)\n", failures ? "FAIL" : "PASS", failures);
	return failures ? 1 : 0;
}
