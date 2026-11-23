// SPDX-License-Identifier: GPL-2.0
// Command-line driver of the git calls (core/libbenthic/bgit.h), run by tests/run-bgit-test.sh against a local git
// http server. Prints the call's JSON, or "ERROR <code>" with exit status 1.
//
// usage: bgit-test [--http] clone <url> <dir> <branch> <user> <token>
//        bgit-test [--http] pull <dir> <branch> <user> <token>
//        bgit-test commit <dir> <message> <merge-parent|-> <path>...
//        bgit-test [--http] push <dir> <branch> <user> <token>
//        bgit-test status <dir> [path...]      bgit-test unpushed <dir> <branch>
//        bgit-test head <dir> <branch>         bgit-test list <dir> [prefix]
//        bgit-test hlog <dir> <branch> <skip> <limit> <changes 0|1>    bgit-test hstats <dir> <commit>...
//        bgit-test hdiff <dir> <from|-> <to>   bgit-test hread <dir> <commit> <path>
//        bgit-test hfiles <dir> <commit> [prefix]
//        bgit-test hrestore <dir> <branch> <commit> <message> [path...]   bgit-test hborrow <dir> <commit> <into>
//        bgit-test hadopt <dir> <source-dir> <source-branch>
//        bgit-test write <dir> <path=text|path>...   (a path without "=" is deleted)   bgit-test read <dir> <path>...
//        bgit-test diff <dir> <from|-> <to|->   bgit-test files <dir>
#include "core/libbenthic/bgit.h"

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
		bgit_allow_http(true);
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
		rc = bgit_clone(arg(0), arg(1), arg(2), { arg(3), arg(4) }, progress, json, error);
	else if (cmd == "pull")
		rc = bgit_pull(arg(0), arg(1), { arg(2), arg(3) }, BgitAuthor(), progress, json, error);
	else if (cmd == "commit") {
		std::vector<std::string> paths;
		for (int i = 3; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = bgit_commit(arg(0), paths, arg(1), BgitAuthor(), arg(2) == "-" ? "" : arg(2), json, error);
	} else if (cmd == "push")
		rc = bgit_push(arg(0), arg(1), { arg(2), arg(3) }, progress, json, error);
	else if (cmd == "status") {
		std::vector<std::string> paths;
		for (int i = 1; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = bgit_status(arg(0), paths, json, error);
	} else if (cmd == "unpushed")
		rc = bgit_unpushed(arg(0), arg(1), json, error);
	else if (cmd == "head")
		rc = bgit_head(arg(0), arg(1), json, error);
	else if (cmd == "list")
		rc = bgit_list_files(arg(0), arg(1), json, error);
	else if (cmd == "hlog")
		rc = bgit_history_log(arg(0), arg(1), atoi(arg(2).c_str()), atoi(arg(3).c_str()), arg(4) == "1", json, error);
	else if (cmd == "hstats") {
		std::vector<std::string> commits;
		for (int i = 1; a + i < argc; i++)
			commits.push_back(argv[a + i]);
		rc = bgit_history_stats(arg(0), commits, json, error);
	} else if (cmd == "hdiff")
		rc = bgit_history_diff(arg(0), arg(1) == "-" ? "" : arg(1), arg(2), json, error);
	else if (cmd == "hread")
		rc = bgit_history_read(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "hfiles")
		rc = bgit_history_files(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "hrestore") {
		std::vector<std::string> paths;
		for (int i = 4; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = bgit_history_restore(arg(0), arg(1), arg(2), paths, arg(3), BgitAuthor(), json, error);
	} else if (cmd == "hborrow")
		rc = bgit_history_borrow(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "hadopt")
		rc = bgit_history_adopt(arg(0), arg(1), arg(2), json, error);
	else if (cmd == "write") {
		std::vector<BgitFile> files;
		for (int i = 1; a + i < argc; i++) {
			std::string item = argv[a + i];
			size_t eq = item.find('=');
			BgitFile f;
			f.path = item.substr(0, eq);
			f.remove = eq == std::string::npos;
			if (!f.remove)
				f.text = item.substr(eq + 1);
			files.push_back(f);
		}
		rc = bgit_write(arg(0), files, json, error);
	} else if (cmd == "read") {
		std::vector<std::string> paths;
		for (int i = 1; a + i < argc; i++)
			paths.push_back(argv[a + i]);
		rc = bgit_read(arg(0), paths, json, error);
	} else if (cmd == "diff")
		rc = bgit_diff(arg(0), arg(1) == "-" ? "" : arg(1), arg(2) == "-" ? "" : arg(2), json, error);
	else if (cmd == "files")
		rc = bgit_files(arg(0), json, error);
	if (rc) {
		printf("ERROR %s\n", error.c_str());
		return 1;
	}
	printf("%s\n", json.c_str());
	return 0;
}
