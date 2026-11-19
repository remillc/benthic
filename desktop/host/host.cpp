// SPDX-License-Identifier: GPL-2.0
// opendives-host: the desktop app's helper process around the C++ facade.
// It is the desktop twin of plugins/opendives-core/android/src/main/cpp/
// opendives_jni.cpp: one handler per NativeCore function, with the same names,
// the same arguments, the same results and the same errors. Electron's main
// process spawns it and talks to it over stdio (see desktop/bridge.cjs).
//
// Protocol: one JSON object per line, UTF-8.
//
//   stdin   {"id":7,"method":"editDive","args":{"id":12,"changes":"{...}"}}
//           args is a flat object: strings, integers, booleans, arrays of
//           strings or of integers, or null (read as absent).
//   stdout  {"id":7,"result":<value>}   the function's return as a JSON value:
//             a string stays a JSON string, even when it holds JSON; integers
//             and booleans are JSON numbers and booleans; a function that
//             returns nothing gives null
//           {"id":7,"error":"message"}  where the JNI function would throw
//           {"event":"syncProgress","data":{"message":"..."}}
//           Nothing else is ever written to stdout; logs go to stderr.
//
// Threads. Requests run in order on one core thread (the core is not
// reentrant). The calls the facade allows off the core thread run at once on
// the reader thread (downloadCancel, the dive computer name lookups, setCaFile,
// setXsltDir) or on a second, network thread (cloudProbe, gitCheck: they run
// while the core thread loads the log). The odgit* calls (git on the device, odgit.h) run in order on a third,
// git thread: a long clone blocks neither the core nor gitCheck; odgitCancel runs at once. stdout writes are serialised. When
// stdin closes, the requests already received finish, then the process exits.
#include "core/libopendives/odgit.h"
#include "core/libopendives/opendives.h"
#include "desktop/host/json_value.h"

#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#else
#include <csignal>
#endif

using odhost::Json;
using odhost::json_string;

namespace {

// --- Output ------------------------------------------------------------------

std::mutex out_mutex;
bool out_broken = false;

void emit(const std::string &line)
{
	std::lock_guard<std::mutex> lock(out_mutex);
	if (out_broken)
		return;
	std::string text = line;
	text += '\n';
	if (fwrite(text.data(), 1, text.size(), stdout) != text.size() || fflush(stdout) != 0)
		out_broken = true; // the parent is gone: keep working, say nothing
}

void send_sync_progress(const char *message)
{
	emit(std::string("{\"event\":\"syncProgress\",\"data\":{\"message\":") + json_string(message ? message : "") + "}}");
}

// --- Arguments and results -----------------------------------------------------

struct HostError : std::runtime_error {
	using std::runtime_error::runtime_error;
};

[[noreturn]] void fail(const std::string &message)
{
	throw HostError(message);
}

// A result is the JSON text of the value to send back.
using Result = std::string;

Result S(const std::string &text)
{
	return json_string(text);
}
Result N(long long n)
{
	return std::to_string(n);
}
Result B(bool b)
{
	return b ? "true" : "false";
}
const Result NOTHING = "null";

// The flat arguments of a request. Absent or null reads as the JNI's empty
// value (an empty string, 0, false, an empty array), as the Kotlin plugin's
// orEmpty() and defaults do.
struct Args {
	const Json *obj = nullptr;

	const Json *get(const char *name) const
	{
		const Json *v = obj ? obj->find(name) : nullptr;
		return v && v->type != Json::Null ? v : nullptr;
	}
	std::string str(const char *name) const
	{
		const Json *v = get(name);
		return v && v->type == Json::String ? v->text : std::string();
	}
	long long num(const char *name, long long fallback = 0) const
	{
		const Json *v = get(name);
		return v && v->type == Json::Number ? v->integer : fallback;
	}
	int i32(const char *name, int fallback = 0) const { return static_cast<int>(num(name, fallback)); }
	bool flag(const char *name, bool fallback = false) const
	{
		const Json *v = get(name);
		return v && v->type == Json::Bool ? v->boolean : fallback;
	}
	std::vector<std::string> strs(const char *name) const
	{
		std::vector<std::string> out;
		const Json *v = get(name);
		if (v && v->type == Json::Array)
			for (const Json &item : v->items)
				out.push_back(item.type == Json::String ? item.text : std::string());
		return out;
	}
	std::vector<int> ints(const char *name) const
	{
		std::vector<int> out;
		const Json *v = get(name);
		if (v && v->type == Json::Array)
			for (const Json &item : v->items)
				out.push_back(static_cast<int>(item.type == Json::Number ? item.integer : 0));
		return out;
	}
	// Site identifiers are unsigned 32-bit numbers: they do not fit an int.
	std::vector<long long> longs(const char *name) const
	{
		std::vector<long long> out;
		const Json *v = get(name);
		if (v && v->type == Json::Array)
			for (const Json &item : v->items)
				out.push_back(item.type == Json::Number ? item.integer : 0);
		return out;
	}
};

// --- Ports of the JNI's helpers --------------------------------------------------

// A result {"<key>":…, "undo":…, "redo":…} (edit_result in opendives_jni.cpp).
Result edit_result(const std::string &dive_json)
{
	// A trip step gives the trip ({"tripId":...}), a dive step the dive.
	const char *key = dive_json.rfind("{\"tripId\"", 0) == 0 ? "trip"
			: dive_json.rfind("{\"uuid\"", 0) == 0 ? "site"
			: dive_json.rfind("{\"types\"", 0) == 0 ? "cylinderTypes"
			: dive_json.rfind("{\"listChange\"", 0) == 0 ? "list"
			: dive_json.rfind("{\"presetList\"", 0) == 0 ? "presets" : "dive";
	std::string json = std::string("{\"") + key + "\":" + dive_json + ",\"undo\":" + json_string(opendives::undo_text());
	json += ",\"redo\":" + json_string(opendives::redo_text()) + "}";
	return S(json);
}

Result json_or_fail(int ret, const std::string &json, const std::string &error)
{
	if (ret)
		fail(error);
	return S(json);
}

// Five strings per rule: type, string mode, range mode, negate ("1" or "0"), data.
std::vector<opendives::filter_rule> rules_of(const std::vector<std::string> &flat)
{
	std::vector<opendives::filter_rule> rules;
	for (size_t i = 0; i + 4 < flat.size(); i += 5)
		rules.push_back({ flat[i], flat[i + 1], flat[i + 2], flat[i + 4], flat[i + 3] == "1" });
	return rules;
}

// --- The methods -------------------------------------------------------------------

enum class Lane { Core, Network, Git, Immediate };

struct Method {
	Lane lane;
	std::function<Result(const Args &)> run;
};

std::map<std::string, Method> &methods()
{
	static std::map<std::string, Method> table;
	return table;
}

void add(const char *name, Lane lane, std::function<Result(const Args &)> run)
{
	methods()[name] = { lane, std::move(run) };
}

void register_methods()
{
	using opendives::filter_rule;
	const Lane core = Lane::Core;

	// Host only: answers at once on the reader thread; checks that the process is alive.
	add("ping", Lane::Immediate, [](const Args &) { return S("pong"); });

	// Sets $HOME (libgit2 and the core look for their configuration under it), starts libgit2, and
	// turns the cloud log's progress messages on (the "syncProgress" events).
	add("init", core, [](const Args &a) {
		std::string home = a.str("home");
#ifdef _WIN32
		_putenv_s("HOME", home.c_str());
#else
		setenv("HOME", home.c_str(), 1);
#endif
		if (opendives::init())
			fail("Cannot initialize libgit2");
		opendives::set_sync_progress(send_sync_progress);
		return NOTHING;
	});
	// `enabled` false stops the "syncProgress" events.
	add("setSyncListener", core, [](const Args &a) {
		opendives::set_sync_progress(a.flag("enabled", true) ? send_sync_progress : nullptr);
		return NOTHING;
	});

	add("logExists", core, [](const Args &a) { return B(opendives::log_exists(a.str("repo"))); });
	add("countDives", core, [](const Args &a) {
		std::string error;
		int count = opendives::count_dives(a.str("log"), error);
		if (count < 0)
			fail(error);
		return N(count);
	});
	add("importFile", core, [](const Args &a) {
		std::string error;
		int count = opendives::import_file(a.str("source"), a.str("repo"), error);
		if (count < 0)
			fail(error);
		return N(count);
	});
	// Allowed off the core thread (it sets a libgit2 option), like Android's setup thread.
	add("setCaFile", Lane::Immediate, [](const Args &a) {
		if (opendives::set_ca_file(a.str("path")))
			fail("Certificate authorities rejected by libgit2");
		return NOTHING;
	});
	add("setXsltDir", Lane::Immediate, [](const Args &a) {
		opendives::set_xslt_dir(a.str("dir"));
		return NOTHING;
	});

	// --- Cloud account ---
	add("cloudListDives", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::cloud_list_dives(a.str("email"), a.str("password"), json, error), json, error);
	});
	add("cloudConfigure", core, [](const Args &a) {
		std::string url;
		if (opendives::cloud_configure(a.str("email"), a.str("password"), url))
			fail("Incomplete cloud credentials");
		return NOTHING;
	});
	// Empty string: no local cache yet.
	add("cloudListCachedDives", core, [](const Args &) {
		std::string json, error;
		if (opendives::cloud_list_cached_dives(json, error) < 0)
			fail(error);
		return S(json);
	});
	// The previous version's cloud cache (read-only): the folders, or one opened (id).
	add("alphaCacheList", core, [](const Args &) {
		std::string json;
		opendives::alpha_cache_list(json);
		return S(json);
	});
	add("alphaCacheOpen", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::alpha_cache_open(a.str("id"), json, error), json, error);
	});
	add("cloudSignOut", core, [](const Args &a) {
		std::string error;
		if (opendives::cloud_sign_out(a.flag("deleteCopy"), error))
			fail(error);
		return NOTHING;
	});
	add("cloudDeleteAccount", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::cloud_delete_account(a.str("password"), a.str("keepDivesIn"), json, error), json, error);
	});
	add("cloudCreateAccount", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::cloud_create_account(a.str("email"), a.str("password"), json, error), json, error);
	});
	add("cloudVerifyPin", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::cloud_verify_pin(a.str("email"), a.str("password"), a.str("pin"), json, error), json, error);
	});
	add("cloudCreateLog", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::cloud_create_log(a.str("importPath"), json, error), json, error);
	});
	add("importCount", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::import_count(a.str("path"), json, error), json, error);
	});
	add("divelogsCheck", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::divelogs_check(a.str("user"), a.str("password"), json, error), json, error);
	});
	add("divelogsDownload", core, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::divelogs_download(a.str("user"), a.str("password"), a.str("outPath"), json, error), json,
				    error);
	});
	add("setCloudTestEmail", core, [](const Args &a) {
		opendives::set_cloud_test_email(a.str("email"));
		return NOTHING;
	});
	add("pendingChanges", core, [](const Args &) {
		std::string json;
		opendives::pending_changes(json);
		return S(json);
	});
	// The one call allowed beside a load: network only.
	add("cloudProbe", Lane::Network, [](const Args &) {
		std::string json, error;
		if (opendives::cloud_probe(json, error))
			fail(error);
		return S(json);
	});

	// --- Git on the device (odgit.h): the working copies of the OpenDives server's logbooks ---
	// `dir` is the absolute folder (the bridge maps the page's name onto it); `allowHttp` is set by the bridge in
	// development only. The token is only passed through. Progress goes out as "gitProgress" events.
	auto git_progress = [](const Args &) -> opendives::OdgitProgress {
		return [](const char *phase, uint64_t done, uint64_t total) {
			emit(std::string("{\"event\":\"gitProgress\",\"data\":{\"phase\":") + json_string(phase) + ",\"done\":" +
			     std::to_string(done) + ",\"total\":" + std::to_string(total) + "}}");
		};
	};
	auto git_author = [](const Args &a) {
		opendives::OdgitAuthor author;
		if (!a.str("authorName").empty() && !a.str("authorEmail").empty()) {
			author.name = a.str("authorName");
			author.email = a.str("authorEmail");
		}
		return author;
	};
	add("odgitClone", Lane::Git, [git_progress](const Args &a) {
		std::string json, error;
		opendives::odgit_allow_http(a.flag("allowHttp"));
		return json_or_fail(opendives::odgit_clone(a.str("url"), a.str("dir"), a.str("branch"),
							   { a.str("username"), a.str("token") }, git_progress(a), json, error),
				    json, error);
	});
	add("odgitPull", Lane::Git, [git_progress, git_author](const Args &a) {
		std::string json, error;
		opendives::odgit_allow_http(a.flag("allowHttp"));
		return json_or_fail(opendives::odgit_pull(a.str("dir"), a.str("branch"), { a.str("username"), a.str("token") },
							  git_author(a), git_progress(a), json, error),
				    json, error);
	});
	add("odgitCommit", Lane::Git, [git_author](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::odgit_commit(a.str("dir"), a.strs("paths"), a.str("message"), git_author(a),
							    a.str("mergeParent"), json, error),
				    json, error);
	});
	add("odgitPush", Lane::Git, [git_progress](const Args &a) {
		std::string json, error;
		opendives::odgit_allow_http(a.flag("allowHttp"));
		return json_or_fail(opendives::odgit_push(a.str("dir"), a.str("branch"), { a.str("username"), a.str("token") },
							  git_progress(a), json, error),
				    json, error);
	});
	add("odgitStatus", Lane::Git, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::odgit_status(a.str("dir"), a.strs("paths"), json, error), json, error);
	});
	add("odgitUnpushed", Lane::Git, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::odgit_unpushed(a.str("dir"), a.str("branch"), json, error), json, error);
	});
	add("odgitHead", Lane::Git, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::odgit_head(a.str("dir"), a.str("branch"), json, error), json, error);
	});
	add("odgitListFiles", Lane::Git, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::odgit_list_files(a.str("dir"), a.str("prefix"), json, error), json, error);
	});
	add("odgitRemove", Lane::Git, [](const Args &a) {
		std::string error;
		if (opendives::odgit_remove(a.str("dir"), error))
			fail(error);
		return NOTHING;
	});
	add("odgitCancel", Lane::Immediate, [](const Args &) {
		opendives::odgit_cancel();
		return NOTHING;
	});

	// --- Own git repository: the token is only passed through, never kept or logged ---
	add("gitCheck", Lane::Network, [](const Args &a) {
		std::string json, error;
		return json_or_fail(opendives::git_check(a.str("url"), a.str("username"), a.str("token"), json, error), json, error);
	});
	add("gitConfigure", core, [](const Args &a) {
		std::string address, error;
		if (opendives::git_configure(a.str("url"), a.str("username"), a.str("token"), a.str("branch"), address, error))
			fail(error);
		return NOTHING;
	});
	add("gitCreateLog", core, [](const Args &) {
		std::string json, error;
		return json_or_fail(opendives::git_create_log(json, error), json, error);
	});

	// --- Editing ---
	add("editDive", core, [](const Args &a) {
		std::string json, error;
		if (opendives::edit_dive(a.i32("id"), a.str("changes"), json, error))
			fail(error);
		return edit_result(json);
	});
	// No error: an unknown trip gives what the facade writes.
	add("getTrip", core, [](const Args &a) {
		std::string json, error;
		opendives::trip_json(a.i32("id"), json, error);
		return S(json);
	});
	// One trip change: action is location, notes, remove, split, merge, add, ungroup, create or autogroup.
	add("tripAction", core, [](const Args &a) {
		std::string action = a.str("action"), value = a.str("value"), json, error;
		int tripId = a.i32("tripId"), diveId = a.i32("diveId"), otherId = a.i32("otherId");
		std::vector<int> ids = a.ints("diveIds");
		int ret;
		if (action == "location" || action == "notes")
			ret = opendives::edit_trip(tripId, action, value, json, error);
		else if (action == "remove")
			ret = ids.empty() ? opendives::trip_remove_dive(diveId, json, error) : opendives::trip_remove_dives(ids, json, error);
		else if (action == "split")
			ret = opendives::trip_split_at(diveId, json, error);
		else if (action == "merge")
			ret = opendives::trips_merge(tripId, otherId, json, error);
		else if (action == "add")
			ret = opendives::trip_add_dives(tripId, ids, json, error);
		else if (action == "ungroup")
			ret = opendives::trip_ungroup(tripId, json, error);
		else if (action == "create")
			ret = opendives::trip_create(ids, json, error);
		else if (action == "autogroup")
			ret = opendives::trips_autogroup(value == "on", json, error);
		else {
			ret = -1;
			error = "BAD_REQUEST: unknown action " + action;
		}
		if (ret)
			fail(error);
		return edit_result(json);
	});
	add("diveComputers", core, [](const Args &) {
		std::string json;
		opendives::dive_computers(json);
		return S(json);
	});
	add("diveComputerAction", core, [](const Args &a) {
		std::string json, error;
		if (opendives::dive_computer_action(a.str("action"), a.str("model"), a.str("serial"), a.str("value"), a.str("intoModel"),
						    a.str("intoSerial"), json, error))
			fail(error);
		return edit_result(json);
	});
	// Read-only site queries: list, site, nearby, duplicates, without (dives without a site).
	add("siteQuery", core, [](const Args &a) {
		std::string kind = a.str("kind"), json, error;
		if (kind == "list")
			opendives::sites_json(json);
		else if (kind == "site")
			opendives::site_json(static_cast<uint32_t>(a.num("uuid")), json, error);
		else if (kind == "nearby")
			opendives::site_nearby(a.i32("lat"), a.i32("lon"), a.i32("a"), json);
		else if (kind == "duplicates")
			opendives::sites_duplicates(a.i32("a"), a.i32("b"), json);
		else if (kind == "without")
			opendives::dives_without_site(json);
		else
			json = "null";
		return S(json);
	});
	// Read-only free filter: "options", "search", or "dives" (identifiers of the matching dives).
	add("filterQuery", core, [](const Args &a) {
		std::string kind = a.str("kind"), json, error;
		if (kind == "options") {
			opendives::filter_options(json);
			return S(json);
		}
		if (kind == "search") {
			opendives::search_dives(a.str("fulltext"), json, error);
			return S(json);
		}
		std::vector<filter_rule> rules = rules_of(a.strs("rules"));
		if (opendives::filter_dives(a.str("fulltext"), a.str("mode"), rules, json, error))
			fail(error);
		return S(json);
	});
	add("createDive", core, [](const Args &a) {
		std::string json, error;
		if (opendives::create_dive(a.str("fields"), json, error))
			fail(error);
		return edit_result(json);
	});
	add("deleteDive", core, [](const Args &a) {
		std::string json, error;
		if (opendives::delete_dives(a.ints("ids"), json, error))
			fail(error);
		return edit_result(json);
	});
	add("mergeDives", core, [](const Args &a) {
		std::string json, error;
		if (opendives::merge_dives(a.ints("ids"), json, error))
			fail(error);
		return edit_result(json);
	});
	add("editDives", core, [](const Args &a) {
		std::string json, error;
		if (opendives::edit_dives(a.ints("ids"), a.str("changes"), json, error))
			fail(error);
		return edit_result(json);
	});
	add("renumberDives", core, [](const Args &a) {
		std::string json, error;
		if (opendives::renumber_dives(a.ints("ids"), a.i32("start"), json, error, a.ints("numbers")))
			fail(error);
		return edit_result(json);
	});
	add("importDives", core, [](const Args &a) {
		std::string json, error;
		if (opendives::import_dives(a.str("file"), a.str("source"), json, error))
			fail(error);
		return edit_result(json);
	});
	// Filter presets: action "list", "save" (rules as filterQuery) or "delete" (index).
	add("filterPresets", core, [](const Args &a) {
		std::string action = a.str("action"), json, error;
		if (action == "list") {
			opendives::filter_presets_json(json);
			return S(json);
		}
		int ret;
		if (action == "delete")
			ret = opendives::filter_preset_delete(a.i32("index", -1), json, error);
		else
			ret = opendives::filter_preset_save(a.str("name"), a.str("fulltext"), a.str("mode"), rules_of(a.strs("rules")), json,
							    error);
		if (ret)
			fail(error);
		return edit_result(json);
	});
	// Sync conflict: the read, the choice of a side, and taking the choice back.
	add("syncConflicts", core, [](const Args &) {
		std::string json, error;
		if (opendives::sync_conflicts(json, error))
			fail(error);
		return S(json);
	});
	add("resolveConflicts", core, [](const Args &a) {
		std::string error;
		if (opendives::resolve_conflicts(a.str("choices"), error))
			fail(error);
		return NOTHING;
	});
	// On the core thread like Android's: it works on the conflict the core thread holds.
	add("cancelConflictResolution", core, [](const Args &) {
		std::string error;
		if (opendives::cancel_conflict_resolution(error))
			fail(error);
		return NOTHING;
	});
	// One undoable site change: create, edit, geocode, merge, delete, deleteSite.
	add("siteAction", core, [](const Args &a) {
		std::string action = a.str("action"), field = a.str("field"), value = a.str("value"), json, error;
		uint32_t uuid = static_cast<uint32_t>(a.num("uuid")), other = static_cast<uint32_t>(a.num("other"));
		std::vector<uint32_t> uuids;
		for (long long v: a.longs("uuids"))
			uuids.push_back(static_cast<uint32_t>(v));
		int lat = a.i32("lat"), lon = a.i32("lon");
		int ret;
		if (action == "create")
			ret = opendives::site_create(value, lat, lon, json, error);
		else if (action == "edit")
			ret = opendives::site_edit(uuid, field, value, lat, lon, json, error);
		else if (action == "geocode")
			ret = opendives::site_geocode(uuid, a.str("country"), a.str("region"), a.str("county"), a.str("city"), json, error);
		else if (action == "merge")
			ret = opendives::sites_merge(uuid, other, json, error);
		else if (action == "delete")
			ret = opendives::sites_delete_unused(uuids, json, error);
		else if (action == "deleteSite")
			ret = opendives::site_delete(uuid, json, error);
		else {
			ret = -1;
			error = "BAD_REQUEST: unknown action " + action;
		}
		if (ret)
			fail(error);
		return edit_result(json);
	});
	// Read-only tools: cylinders (types), weights (types), desaturation.
	add("toolQuery", core, [](const Args &a) {
		std::string kind = a.str("kind"), json;
		if (kind == "cylinders")
			opendives::gas_cylinder_types(json);
		else if (kind == "weights")
			opendives::weight_types(json);
		else if (kind == "desaturation")
			opendives::desaturation(0, json);
		else
			json = "null";
		return S(json);
	});
	// The dives written to `path` (export_dives); read only for the logbook.
	add("exportDives", core, [](const Args &a) {
		std::string error;
		if (opendives::export_dives(a.ints("ids"), a.str("format"), a.flag("anonymize"), a.str("path"), error))
			fail(error);
		return NOTHING;
	});
	// The whole loaded log as a plain .ssrf file (Subsurface's Save As).
	add("saveLogbookFile", core, [](const Args &a) {
		std::string error;
		if (opendives::save_logbook_file(a.str("path"), error))
			fail(error);
		return NOTHING;
	});
	add("undo", core, [](const Args &a) {
		std::string json, error;
		if (a.flag("redo") ? opendives::redo(json, error) : opendives::undo(json, error))
			fail(error);
		return edit_result(json);
	});
	add("sync", core, [](const Args &) {
		std::string json, error;
		if (opendives::sync(json, error))
			fail(error);
		return S(json);
	});
	add("listLoadedDives", core, [](const Args &) {
		std::string json;
		opendives::list_loaded_dives(json);
		return S(json);
	});
	// Desktop only: the logbook table's extra columns (task 2026-11-15-169).
	add("diveColumns", core, [](const Args &) {
		std::string json;
		opendives::dive_columns(json);
		return S(json);
	});
	add("saveLocal", core, [](const Args &) {
		std::string error;
		if (opendives::save_local(error))
			fail(error);
		return NOTHING;
	});
	add("getDive", core, [](const Args &a) {
		std::string json, error;
		if (opendives::get_dive(a.i32("id"), json, error))
			fail(error);
		return S(json);
	});
	add("getPrefs", core, [](const Args &) {
		std::string json;
		opendives::get_prefs(json);
		return S(json);
	});
	add("setPrefs", core, [](const Args &a) {
		std::string error;
		if (opendives::set_prefs(a.str("changes"), error))
			fail(error);
		return NOTHING;
	});
	// Cylinder types: list, library, standard, add, size, remove, rename.
	add("cylinderTypes", core, [](const Args &a) {
		std::string action = a.str("action"), name = a.str("name"), value = a.str("value"), json, error;
		int ret;
		if (action == "list")
			ret = opendives::cylinder_types(json);
		else if (action == "library")
			ret = opendives::set_cylinder_library(value, error) ? -1 : opendives::cylinder_types(json);
		else if (action == "standard") {
			opendives::reset_cylinder_library();
			ret = opendives::cylinder_types(json);
		} else if (action == "rename")
			ret = opendives::cylinder_type_rename(name, value, json, error);
		else if (action == "delete" || action == "deletePreview")
			ret = opendives::cylinder_type_delete(name, action == "deletePreview", json, error);
		else
			ret = opendives::cylinder_type_action(action, name, a.i32("ml"), a.i32("mbar"), json, error);
		if (ret)
			fail(error);
		return edit_result(json);
	});

	// --- Planner ---
	add("plannerSetup", core, [](const Args &) {
		std::string json;
		opendives::planner_setup(json);
		return S(json);
	});
	add("planDive", core, [](const Args &a) {
		std::string json, error;
		if (opendives::plan_dive(a.str("request"), json, error))
			fail(error);
		return S(json);
	});
	add("listPlans", core, [](const Args &) {
		std::string json;
		opendives::list_plans(json);
		return S(json);
	});
	add("savePlan", core, [](const Args &a) {
		std::string json, error;
		if (opendives::save_plan(a.str("request"), a.i32("replaceId"), json, error, a.str("title")))
			fail(error);
		return edit_result(json);
	});
	add("listDives", core, [](const Args &a) {
		std::string json, error;
		if (opendives::list_dives(a.str("repo"), json, error))
			fail(error);
		return S(json);
	});
	// Read-only statistics: kind "stats" with the criteria as JSON in `text`, or "values" with a field name.
	add("statsQuery", core, [](const Args &a) {
		std::string kind = a.str("kind"), text = a.str("text"), json, error;
		int rc = kind == "values" ? opendives::stats_values(text, json, error) : opendives::stats(text, json, error);
		if (rc)
			fail(error);
		return S(json);
	});

	// --- Download from a dive computer ---
	// Bluetooth is not done here: on desktop it will come from the web layer (Web Bluetooth), so
	// downloadDives is left out. What does not touch the transport is ported.
	add("dcFromBluetoothName", Lane::Immediate, [](const Args &a) { return S(opendives::dc_from_bluetooth_name(a.str("name"))); });
	add("dcBluetoothModels", Lane::Immediate, [](const Args &) { return S(opendives::dc_bluetooth_models()); });
	add("downloadPartial", core, [](const Args &a) {
		std::string json, error;
		if (opendives::download_partial(a.str("action"), json, error))
			fail(error);
		return S(json);
	});
	add("downloadCancel", Lane::Immediate, [](const Args &) {
		opendives::download_cancel();
		return NOTHING;
	});
}

// --- Dispatch ------------------------------------------------------------------------

struct Request {
	Json id; // echoed as it came
	std::string method;
	Json request; // keeps `args` alive
};

std::string id_text(const Json &id)
{
	if (id.type == Json::Number && id.is_integer)
		return std::to_string(id.integer);
	if (id.type == Json::String)
		return json_string(id.text);
	return "null";
}

void reply(const Json &id, const char *key, const std::string &value)
{
	emit("{\"id\":" + id_text(id) + ",\"" + key + "\":" + value + "}");
}

void execute(const Request &r, const Method &m)
{
	Args args;
	args.obj = r.request.find("args");
	try {
		reply(r.id, "result", m.run(args));
	} catch (const std::exception &e) {
		reply(r.id, "error", json_string(e.what()));
	} catch (...) {
		reply(r.id, "error", json_string("Unknown error"));
	}
}

// A thread that runs its requests one after the other, in the order received.
class Worker {
public:
	Worker() : thread([this] { loop(); }) {}
	~Worker() { finish(); }

	void push(Request r, const Method *m)
	{
		{
			std::lock_guard<std::mutex> lock(mutex);
			queue.push_back({ std::move(r), m });
		}
		wake.notify_one();
	}
	// The requests already queued are done first.
	void finish()
	{
		{
			std::lock_guard<std::mutex> lock(mutex);
			closed = true;
		}
		wake.notify_one();
		if (thread.joinable())
			thread.join();
	}

private:
	void loop()
	{
		for (;;) {
			std::pair<Request, const Method *> job;
			{
				std::unique_lock<std::mutex> lock(mutex);
				wake.wait(lock, [this] { return closed || !queue.empty(); });
				if (queue.empty())
					return;
				job = std::move(queue.front());
				queue.pop_front();
			}
			execute(job.first, *job.second);
		}
	}

	std::mutex mutex;
	std::condition_variable wake;
	std::deque<std::pair<Request, const Method *>> queue;
	bool closed = false;
	std::thread thread; // last: started when the rest exists
};

void handle_line(const std::string &line, Worker &core, Worker &network, Worker &git)
{
	Request r;
	odhost::JsonParser parser(line);
	if (!parser.parse(r.request) || r.request.type != Json::Object) {
		reply(Json(), "error", json_string("Bad request: not a JSON object"));
		return;
	}
	if (const Json *id = r.request.find("id"))
		r.id = *id;
	const Json *name = r.request.find("method");
	if (!name || name->type != Json::String) {
		reply(r.id, "error", json_string("Bad request: no method"));
		return;
	}
	r.method = name->text;
	auto found = methods().find(r.method);
	if (found == methods().end()) {
		reply(r.id, "error", json_string("Unknown method " + r.method));
		return;
	}
	const Method &m = found->second;
	switch (m.lane) {
	case Lane::Core:
		core.push(std::move(r), &m);
		break;
	case Lane::Network:
		network.push(std::move(r), &m);
		break;
	case Lane::Git:
		git.push(std::move(r), &m);
		break;
	case Lane::Immediate:
		execute(r, m);
		break;
	}
}

} // namespace

int main()
{
#ifdef _WIN32
	_setmode(_fileno(stdin), _O_BINARY);
	_setmode(_fileno(stdout), _O_BINARY);
#else
	signal(SIGPIPE, SIG_IGN);
#endif
	std::ios::sync_with_stdio(false);
	register_methods();
	{
		Worker core, network, git;
		std::string line;
		while (std::getline(std::cin, line)) {
			if (!line.empty() && line.back() == '\r')
				line.pop_back();
			if (line.empty())
				continue;
			handle_line(line, core, network, git);
		}
		// stdin is closed: the queued requests finish, then the workers stop.
		core.finish();
		network.finish();
		git.finish();
	}
	return 0;
}
