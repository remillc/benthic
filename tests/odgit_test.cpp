// SPDX-License-Identifier: GPL-2.0
// Command-line driver of the git calls (core/libbenthic/odgit.h), run by tests/run-odgit-test.sh against a local git
// http server. Prints the call's JSON, or "ERROR <code>" with exit status 1.
//
// usage: odgit-test [--http] clone <url> <dir> <branch> <user> <token>
//        odgit-test [--http] pull <dir> <branch> <user> <token>
//        odgit-test commit <dir> <message> <merge-parent|-> <path>...
//        odgit-test [--http] push <dir> <branch> <user> <token>
//        odgit-test status <dir> [path...]      odgit-test unpushed <dir> <branch>
//        odgit-test head <dir> <branch>         odgit-test list <dir> [prefix]
//        odgit-test hlog <dir> <branch> <skip> <limit> <changes 0|1>    odgit-test hstats <dir> <commit>...
//        odgit-test hdiff <dir> <from|-> <to>   odgit-test hread <dir> <commit> <path>
//        odgit-test hfiles <dir> <commit> [prefix]
//        odgit-test hrestore <dir> <branch> <commit> <message> [path...]   odgit-test hborrow <dir> <commit> <into>
//        odgit-test hadopt <dir> <source-dir> <source-branch>
#include "core/libbenthic/odgit.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

using namespace benthic;

int main(int argc, char **argv)
{
	int a = 1;
	if (a < argc && !strcmp(argv[a], "--http")) {
		odgit_allow_http(true);
		a++;
	}
	if (a >= argc)
		return 2;
	std::string cmd = argv[a++];
	auto arg = [&](int i) { return std::string(a + i < argc ? argv[a + i] : ""); };
	std::string json, error;
	int rc = -1;
	auto progress = [](const char *phase, uint64_t done, uint64_t total) {
		fprintf(stderr, "progress %s %llu/%llu\n", phase, (unsigned long long)done, (unsigned long long)total);
	};
	if (cmd == "clone")
		rc = odgit_clone(arg(0), arg(1), arg(2), { arg(3), arg(4) }, progress, json, error);
	else if (cmd == "pull")
		rc = odgit_pull(arg(0), arg(1), { arg(2), arg(3) }, OdgitAuthor(), progress, json, error);
	else if (cmd == "commit") {
		std::vector<std::string> paths;
		for (int i = 3; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = odgit_commit(arg(0), paths, arg(1), OdgitAuthor(), arg(2) == "-" ? "" : arg(2), json, error);
	} else if (cmd == "push")
		rc = odgit_push(arg(0), arg(1), { arg(2), arg(3) }, progress, json, error);
	else if (cmd == "status") {
		std::vector<std::string> paths;
		for (int i = 1; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = odgit_status(arg(0), paths, json, error);
	} else if (cmd == "unpushed")
		rc = odgit_unpushed(arg(0), arg(1), json, error);
	else if (cmd == "head")
		rc = odgit_head(arg(0), arg(1), json, error);
	else if (cmd == "list")
		rc = odgit_list_files(arg(0), arg(1), json, error);
	else if (cmd == "hlog")
		rc = odgit_history_log(arg(0), arg(1), atoi(arg(2).c_str()), atoi(arg(3).c_str()), arg(4) == "1", json, error);
	else if (cmd == "hstats") {
		std::vector<std::string> commits;
		for (int i = 1; a + i < argc; i++)
			commits.push_back(argv[a + i]);
		rc = odgit_history_stats(arg(0), commits, json, error);
	} else if (cmd == "hdiff")
		rc = odgit_history_diff(arg(0), arg(1) == "-" ? "" : arg(1), arg(2), json, error);
	else if (cmd == "hread")
		rc = odgit_history_read(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "hfiles")
		rc = odgit_history_files(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "hrestore") {
		std::vector<std::string> paths;
		for (int i = 4; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = odgit_history_restore(arg(0), arg(1), arg(2), paths, arg(3), OdgitAuthor(), json, error);
	} else if (cmd == "hborrow")
		rc = odgit_history_borrow(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "hadopt")
		rc = odgit_history_adopt(arg(0), arg(1), arg(2), json, error);
	if (rc) {
		printf("ERROR %s\n", error.c_str());
		return 1;
	}
	printf("%s\n", json.c_str());
	return 0;
}
