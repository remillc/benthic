// SPDX-License-Identifier: GPL-2.0
// Command-line driver of the git calls (core/libopendives/odgit.h), run by tests/run-odgit-test.sh against a local git
// http server. Prints the call's JSON, or "ERROR <code>" with exit status 1.
//
// usage: odgit-test [--http] clone <url> <dir> <branch> <user> <token>
//        odgit-test [--http] pull <dir> <branch> <user> <token>
//        odgit-test commit <dir> <message> <merge-parent|-> <path>...
//        odgit-test [--http] push <dir> <branch> <user> <token>
//        odgit-test status <dir> [path...]      odgit-test unpushed <dir> <branch>
//        odgit-test head <dir> <branch>         odgit-test list <dir> [prefix]
#include "core/libopendives/odgit.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace opendives;

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
	if (rc) {
		printf("ERROR %s\n", error.c_str());
		return 1;
	}
	printf("%s\n", json.c_str());
	return 0;
}
