// SPDX-License-Identifier: GPL-2.0
// Git on the device (docs/architecture.md, "Git on the device"): a few generic calls over libgit2 that move the files
// of a logbook's working copy to and from the OpenDives server. The core never reads the format: JavaScript writes and
// reads the JSON files in the working copy's folder, and these calls clone, fetch and merge, commit a list of files,
// push, and tell what changed. They use libgit2 directly, not Subsurface's logbook functions (those are tied to the
// open divelog), and need neither init() nor the core's thread: any thread, one call at a time per working copy.
//
// The working copy is a plain folder of files with its `.git`; it is only ever touched by these calls (and by the
// files JavaScript writes), never by another git implementation.
//
// Results are JSON objects; errors are -1 with `error` set to a code, optionally followed by ": " and details:
//   BAD_ADDRESS     not an https address (http only after odgit_allow_http(true), for the development server)
//   BAD_CREDENTIALS a token with a space or a control character
//   EXISTS          clone: the folder already holds a working copy
//   NO_WORKING_COPY the folder holds no repository
//   BAD_PATH        a path that leaves the working copy, or points into .git
//   UNREACHABLE     no answer from the server, a 5xx, a TLS failure
//   REFUSED         the server refused the token (401, 403, 404) or a push
//   REJECTED        push: the server has commits the device does not (pull first)
//   CANCELLED       odgit_cancel() was called
//   GIT_ERROR       anything else libgit2 reports, with its message
// The token is only passed through: it is never kept, logged or put in an error text.
#ifndef OPENDIVES_ODGIT_H
#define OPENDIVES_ODGIT_H

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace opendives {

// Progress of a long call. `phase`: "receiving" (objects coming in; done/total are objects), "resolving" (indexing),
// "checkout" (files written; done/total are files), "sending" (objects going out). Called at most about ten times a
// second, always on the calling thread, and once more when a phase ends.
using OdgitProgress = std::function<void(const char *phase, uint64_t done, uint64_t total)>;

// Who the server sees. `user` and `token` are the session's git credentials (Basic authentication).
struct OdgitAuth {
	std::string user, token;
};

// Who the commits are made by.
struct OdgitAuthor {
	std::string name = "OpenDives", email = "noreply@opendives.app";
};

// http:// addresses are refused unless this is on. Only the development builds turn it on (the dev stack is plain
// http on 127.0.0.1 / 10.0.2.2); tests turn it on too.
void odgit_allow_http(bool allowed);

// Makes the running call stop as soon as libgit2 gives control back (then it fails with CANCELLED). Any thread.
// The flag is cleared when the next call starts.
void odgit_cancel();

// Makes the working copy `dir` from branch `branch` of `url` ("https://host/owner/repo.git", no credentials in it).
// Only that branch is fetched, no tags. A repository that has no such branch yet gives an empty working copy that
// will push it.  {"result":"cloned"|"empty", "head": sha|null}.
int odgit_clone(const std::string &url, const std::string &dir, const std::string &branch, const OdgitAuth &auth,
		const OdgitProgress &progress, std::string &json, std::string &error);

// Fetches the branch and merges it into the local one.
//   {"result":"upToDate"|"fastForward"|"merged"|"empty", "head": sha|null}
// "empty": the server has no such branch. On a conflict nothing changes on disk and the result is
//   {"result":"conflict", "ours": sha, "theirs": sha,
//    "files":[{"path", "base": text|null, "ours": text|null, "theirs": text|null}]}
// (null: the file does not exist on that side). The files that did not conflict are not listed: the merge is made
// again by odgit_commit() with `merge_parent` = "theirs". Renames are not detected. Contents must be UTF-8 text.
int odgit_pull(const std::string &dir, const std::string &branch, const OdgitAuth &auth, const OdgitAuthor &author,
	       const OdgitProgress &progress, std::string &json, std::string &error);

// Stages `paths` (relative to the working copy, '/' separators; a path whose file is gone is staged as deleted) and
// commits them on the branch. {"commit": sha|null} (null: nothing changed). Other changes of the working copy are
// left alone.
// With `merge_parent` (the "theirs" of a conflict): the commit is the merge of the branch and that commit, in which
// the files of `paths` are taken from the working copy as the caller resolved them, every other file as the merge
// makes it; it has the two parents and the working copy is brought to it. Fails with GIT_ERROR if a conflict is left.
int odgit_commit(const std::string &dir, const std::vector<std::string> &paths, const std::string &message,
		 const OdgitAuthor &author, const std::string &merge_parent, std::string &json, std::string &error);

// Sends the branch. {"result":"pushed"|"upToDate", "head": sha}. REJECTED when the server moved on.
int odgit_push(const std::string &dir, const std::string &branch, const OdgitAuth &auth, const OdgitProgress &progress,
	       std::string &json, std::string &error);

// What differs between the working copy and the last commit, for `paths` only when given (a status of the whole tree
// looks at every file). {"changes":[{"path", "state":"new"|"modified"|"deleted"}]}; unchanged files are not listed.
int odgit_status(const std::string &dir, const std::vector<std::string> &paths, std::string &json, std::string &error);

// Commits of the branch the server does not have, as of the last fetch or push. {"ahead": n, "behind": m}
// (all the commits when the server has no such branch).
int odgit_unpushed(const std::string &dir, const std::string &branch, std::string &json, std::string &error);

// {"head": sha|null, "remote": sha|null} (the server's branch as of the last fetch or push).
int odgit_head(const std::string &dir, const std::string &branch, std::string &json, std::string &error);

// The files of the last commit's index that start with `prefix` (all when empty). {"files":[…]}. No network.
int odgit_list_files(const std::string &dir, const std::string &prefix, std::string &json, std::string &error);

// Removes the working copy's folder and everything in it. No error when it is already gone.
int odgit_remove(const std::string &dir, std::string &error);

} // namespace opendives

#endif
