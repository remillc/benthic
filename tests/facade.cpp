// SPDX-License-Identifier: GPL-2.0
// Exercises the façade on the development machine, without a phone.
// usage: facade import <file> <path[branch]>
//        facade filter <log> <fulltext> [type:string_mode:range_mode:negate:data]...
//        facade list <path[branch]>
//        facade dive <log> <number>
#include "core/libbenthic/benthic.h"
#include "core/libbenthic/internal.h"
#include "core/dive.h"
#include "core/divelog.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

int main(int argc, char **argv)
{
	std::string error, json;
	if (benthic::init())
		return 2;
	if (argc == 4 && !strcmp(argv[1], "import")) {
		int n = benthic::import_file(argv[2], argv[3], error);
		if (n < 0) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%d\n", n);
		return 0;
	}
	if (argc == 2 && !strcmp(argv[1], "alpha-list")) {
		// alpha-list: the previous version's cache folders under $HOME/.subsurface/cloudstorage.
		benthic::alpha_cache_list(json);
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc == 3 && !strcmp(argv[1], "alpha-open")) {
		// alpha-open <folder>: reads that folder read-only; prints its dive count and the loaded log's address.
		if (benthic::alpha_cache_open(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("dives=%d address=[%s]\n", static_cast<int>(divelog.dives.size()), benthic::internal::current_log().c_str());
		return 0;
	}
	if (argc == 3 && !strcmp(argv[1], "list")) {
		printf("exists=%d\n", benthic::log_exists(argv[2]));
		if (benthic::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc == 3 && !strcmp(argv[1], "columns")) {
		// columns <log>: the desktop table's extra columns (dive_columns).
		if (benthic::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		benthic::dive_columns(json);
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc == 4 && !strcmp(argv[1], "dive")) {
		// dive <log> <number>: detail of the dive with this number.
		if (benthic::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		std::string key = "\"number\":" + std::string(argv[3]) + ",";
		size_t pos = json.find(key);
		size_t id_pos = pos == std::string::npos ? pos : json.rfind("{\"id\":", pos);
		if (id_pos == std::string::npos) {
			fprintf(stderr, "dive number not found\n");
			return 1;
		}
		int id = atoi(json.c_str() + id_pos + 6);
		std::string prefs;
		benthic::get_prefs(prefs);
		printf("%s\n", prefs.c_str());
		if (benthic::get_dive(id, json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc == 3 && !strcmp(argv[1], "settings")) {
		// settings <log>: the Settings functions on a log in memory, nothing saved.
		if (benthic::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		auto check = [&](int ret, const char *what) {
			printf("%s: %s\n", what, ret ? error.c_str() : json.c_str());
			error.clear();
		};
		benthic::get_prefs(json);
		check(0, "prefs");
		check(benthic::set_prefs("{\"length\":\"ft\",\"gfLow\":40,\"decoModel\":\"vpmb\",\"po2MaxMbar\":1400,"
					   "\"tankbar\":true,\"forgetDiveComputer\":0}", error), "set");
		benthic::get_prefs(json);
		check(0, "after set");
		check(benthic::set_prefs("{\"gfLow\":5}", error), "out of range");
		check(benthic::set_prefs("{\"unknown\":1}", error), "unknown key");
		// The planner's own settings: 10 m/min is stored as 166 mm/s, read as 9960 mm/min.
		check(benthic::set_prefs("{\"ascent75MmMin\":10000,\"descentMmMin\":20000,\"lastStop6m\":true,"
					   "\"safetyStop\":false,\"sacFactor\":500,\"reserveMbar\":50000,\"decoSacMlMin\":15000,"
					   "\"minSwitchSeconds\":120,\"o2Breaks\":true}", error), "set planner");
		benthic::planner_setup(json);
		check(0, "planner setup");
		check(benthic::set_prefs("{\"ascent50MmMin\":500}", error), "planner rate out of range");
		check(benthic::set_prefs("{\"bottomPo2Mbar\":2500}", error), "planner ppO2 out of range");
		check(benthic::trips_autogroup(false, json, error), "autogroup off");
		check(benthic::undo(json, error), "undo");
		check(benthic::trips_autogroup(true, json, error), "autogroup on");
		check(benthic::cylinder_type_action("add", "Test 7L", 7000, 300000, json, error), "add type");
		check(benthic::cylinder_type_action("add", "Test 7L", 7000, 300000, json, error), "add again");
		check(benthic::cylinder_type_rename("Test 7L", "Test 8L", json, error), "rename");
		check(benthic::undo(json, error), "undo rename");
		check(benthic::cylinder_type_action("remove", "Test 7L", 0, 0, json, error), "remove");
		return 0;
	}
	if (argc == 6 && !strcmp(argv[1], "export")) {
		// export <log> <format> <anonymize 0|1> <file>: the first three dives.
		if (benthic::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		std::vector<int> ids;
		for (size_t i = 0; i < divelog.dives.size() && i < 3; i++)
			ids.push_back(divelog.dives[i]->id);
		if (benthic::export_dives(ids, argv[3], argv[4][0] == '1', argv[5], error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("exported %zu dives\n", ids.size());
		return 0;
	}
	if (argc >= 4 && !strcmp(argv[1], "search")) {
		// search <log> <text>: the identifiers of the dives the search box finds.
		if (benthic::list_dives(argv[2], json, error) || benthic::search_dives(argv[3], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc >= 4 && !strcmp(argv[1], "filter")) {
		// filter <log> <fulltext> [type:string_mode:range_mode:negate:data]...
		// Prints the filter options, then the identifiers of the matching dives.
		if (benthic::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		std::vector<benthic::filter_rule> rules;
		for (int i = 4; i < argc; i++) {
			std::string s = argv[i], parts[5];
			for (int k = 0; k < 4; k++) {
				size_t colon = s.find(':');
				parts[k] = s.substr(0, colon);
				s = colon == std::string::npos ? std::string() : s.substr(colon + 1);
			}
			parts[4] = s;
			rules.push_back({ parts[0], parts[1], parts[2], parts[4], parts[3] == "1" });
		}
		benthic::filter_options(json);
		printf("%s\n", json.c_str());
		if (benthic::filter_dives(argv[3], "", rules, json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	fprintf(stderr, "usage: %s import <file> <repo[branch]> | list <repo[branch]> | dive <log> <number>"
		" | settings <log> | filter <log> <fulltext> [type:string_mode:range_mode:negate:data]...\n", argv[0]);
	return 2;
}
