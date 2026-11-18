// SPDX-License-Identifier: GPL-2.0
// Git on the device over libgit2 (odgit.h). The TLS setup (Mbed TLS, the CA file) is the core's: set_ca_file() sets
// libgit2's certificate locations once for the whole process, and certificates are always checked here.
#include "core/libopendives/odgit.h"

#include <git2.h>

#include <atomic>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <memory>

namespace opendives {

namespace {

// git_commit_create() takes `const git_commit *[]` up to libgit2 1.1 and `git_commit *const[]` after.
#if LIBGIT2_VER_MAJOR > 1 || (LIBGIT2_VER_MAJOR == 1 && LIBGIT2_VER_MINOR >= 2)
using ParentPtr = git_commit *;
#else
using ParentPtr = const git_commit *;
#endif

std::atomic<bool> http_allowed{ false };
std::atomic<bool> cancel_flag{ false };

// libgit2 is initialised and shut down around each call: the calls do not depend on the core's init().
struct Library {
	Library()
	{
		git_libgit2_init();
		// The folders are the app's own; the owner check only gets in the way of a data folder copied by a restore.
#ifdef GIT_OPT_SET_OWNER_VALIDATION
		git_libgit2_opts(GIT_OPT_SET_OWNER_VALIDATION, 0);
#endif
	}
	~Library() { git_libgit2_shutdown(); }
};

template <typename T, void (*F)(T *)> struct Free {
	void operator()(T *p) const { if (p) F(p); }
};
using Repo = std::unique_ptr<git_repository, Free<git_repository, git_repository_free>>;
using Remote = std::unique_ptr<git_remote, Free<git_remote, git_remote_free>>;
using Commit = std::unique_ptr<git_commit, Free<git_commit, git_commit_free>>;
using Tree = std::unique_ptr<git_tree, Free<git_tree, git_tree_free>>;
using Index = std::unique_ptr<git_index, Free<git_index, git_index_free>>;
using Ref = std::unique_ptr<git_reference, Free<git_reference, git_reference_free>>;
using Sig = std::unique_ptr<git_signature, Free<git_signature, git_signature_free>>;
using Blob = std::unique_ptr<git_blob, Free<git_blob, git_blob_free>>;

void append_json_string(std::string &out, const std::string &s)
{
	static const char hex[] = "0123456789abcdef";
	out += '"';
	for (unsigned char c : s) {
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (c < 0x20) {
				out += "\\u00";
				out += hex[c >> 4];
				out += hex[c & 15];
			} else {
				out += static_cast<char>(c);
			}
		}
	}
	out += '"';
}

std::string oid_string(const git_oid &oid)
{
	char sha[41];
	git_oid_tostr(sha, sizeof(sha), &oid);
	return sha;
}

void append_oid(std::string &out, const git_oid *oid)
{
	if (oid)
		append_json_string(out, oid_string(*oid));
	else
		out += "null";
}

// What the callbacks share during one call.
struct Call {
	const OdgitAuth *auth = nullptr;
	OdgitProgress progress;
	int credential_asks = 0;
	bool push_refused = false;
	std::string push_refusal;
	// Throttling of the progress reports.
	std::string phase;
	std::chrono::steady_clock::time_point last{};

	void report(const char *name, uint64_t done, uint64_t total)
	{
		if (!progress)
			return;
		auto now = std::chrono::steady_clock::now();
		bool ends = total && done >= total;
		if (phase == name && !ends && now - last < std::chrono::milliseconds(100))
			return;
		phase = name;
		last = now;
		progress(name, done, total);
	}
};

int credentials_cb(git_credential **out, const char *, const char *, unsigned int allowed, void *payload)
{
	Call *call = static_cast<Call *>(payload);
	// One attempt: a refused token must not be retried.
	if (call->credential_asks++ > 0 || !call->auth || call->auth->token.empty() ||
	    !(allowed & GIT_CREDENTIAL_USERPASS_PLAINTEXT))
		return GIT_EUSER;
	return git_credential_userpass_plaintext_new(out, call->auth->user.c_str(), call->auth->token.c_str());
}

int transfer_cb(const git_indexer_progress *stats, void *payload)
{
	if (cancel_flag)
		return -1;
	Call *call = static_cast<Call *>(payload);
	if (stats->received_objects < stats->total_objects)
		call->report("receiving", stats->received_objects, stats->total_objects);
	else
		call->report("resolving", stats->indexed_deltas, stats->total_deltas);
	return 0;
}

int push_transfer_cb(unsigned int current, unsigned int total, size_t, void *payload)
{
	if (cancel_flag)
		return -1;
	static_cast<Call *>(payload)->report("sending", current, total);
	return 0;
}

int push_update_cb(const char *refname, const char *status, void *payload)
{
	Call *call = static_cast<Call *>(payload);
	if (status) {
		call->push_refused = true;
		call->push_refusal = std::string(refname ? refname : "") + ": " + status;
	}
	return 0;
}

void checkout_progress_cb(const char *, size_t completed, size_t total, void *payload)
{
	static_cast<Call *>(payload)->report("checkout", completed, total);
}

void set_callbacks(git_remote_callbacks &cb, Call &call)
{
	git_remote_init_callbacks(&cb, GIT_REMOTE_CALLBACKS_VERSION);
	cb.credentials = credentials_cb;
	cb.transfer_progress = transfer_cb;
	cb.push_transfer_progress = push_transfer_cb;
	cb.push_update_reference = push_update_cb;
	cb.payload = &call;
	// No certificate_check: libgit2 applies its normal validation.
}

// The error code for a failed libgit2 call.
std::string network_error(int rc, const Call &call)
{
	if (cancel_flag)
		return "CANCELLED";
	const git_error *e = git_error_last();
	std::string message = e && e->message ? e->message : "";
	if (rc == GIT_ENONFASTFORWARD)
		return "REJECTED";
	if (call.push_refused) {
		bool behind = call.push_refusal.find("fetch first") != std::string::npos ||
			      call.push_refusal.find("fast-forward") != std::string::npos ||
			      call.push_refusal.find("stale") != std::string::npos;
		return behind ? "REJECTED: " + call.push_refusal : "REFUSED: " + call.push_refusal;
	}
	if (rc == GIT_EAUTH || (call.credential_asks > 0 && rc == GIT_EUSER) || message.find(" 401") != std::string::npos ||
	    message.find(" 403") != std::string::npos || message.find(" 404") != std::string::npos)
		return "REFUSED";
	if (e && (e->klass == GIT_ERROR_NET || e->klass == GIT_ERROR_HTTP || e->klass == GIT_ERROR_SSL ||
		  e->klass == GIT_ERROR_SSH || e->klass == GIT_ERROR_OS))
		return "UNREACHABLE: " + message;
	if (message.find("HTTP") != std::string::npos || message.find("http") != std::string::npos ||
	    message.find("connect") != std::string::npos)
		return "UNREACHABLE: " + message;
	return "GIT_ERROR: " + message;
}

std::string local_error(int rc)
{
	if (cancel_flag)
		return "CANCELLED";
	const git_error *e = git_error_last();
	if (rc == GIT_ENOTFOUND && e && e->klass == GIT_ERROR_REPOSITORY)
		return "NO_WORKING_COPY";
	return std::string("GIT_ERROR: ") + (e && e->message ? e->message : "");
}

bool valid_address(const std::string &url)
{
	if (url.compare(0, 8, "https://") == 0)
		return url.size() > 8;
	if (http_allowed && url.compare(0, 7, "http://") == 0)
		return url.size() > 7;
	return false;
}

bool valid_auth(const OdgitAuth &auth)
{
	for (const std::string *s : { &auth.user, &auth.token })
		for (unsigned char c : *s)
			if (c <= 0x20 || c == 0x7f)
				return false;
	return true;
}

bool is_dot_git(const std::string &part)
{
	if (part.size() != 4)
		return false;
	return part[0] == '.' && (part[1] | 32) == 'g' && (part[2] | 32) == 'i' && (part[3] | 32) == 't';
}

bool valid_path(const std::string &path)
{
	if (path.empty() || path[0] == '/' || path.find('\\') != std::string::npos || path.find("//") != std::string::npos)
		return false;
	size_t at = 0;
	while (at <= path.size()) {
		size_t next = path.find('/', at);
		std::string part = path.substr(at, next == std::string::npos ? std::string::npos : next - at);
		if (part.empty() || part == "." || part == ".." || is_dot_git(part))
			return false;
		if (next == std::string::npos)
			break;
		at = next + 1;
	}
	return true;
}

std::string ref_of(const std::string &branch) { return "refs/heads/" + branch; }
std::string remote_ref_of(const std::string &branch) { return "refs/remotes/origin/" + branch; }
std::string refspec_of(const std::string &branch) { return "+" + ref_of(branch) + ":" + remote_ref_of(branch); }

bool valid_branch(const std::string &branch)
{
	return !branch.empty() && git_reference_is_valid_name(ref_of(branch).c_str()) == 1;
}

int open_repo(const std::string &dir, Repo &repo, std::string &error)
{
	git_repository *r = nullptr;
	int rc = git_repository_open_ext(&r, dir.c_str(), GIT_REPOSITORY_OPEN_NO_SEARCH, nullptr);
	if (rc) {
		error = rc == GIT_ENOTFOUND ? "NO_WORKING_COPY" : local_error(rc);
		return -1;
	}
	repo.reset(r);
	return 0;
}

// The commit a reference names, or none.
bool lookup_oid(git_repository *repo, const std::string &name, git_oid &oid)
{
	git_reference *raw = nullptr;
	if (git_reference_lookup(&raw, repo, name.c_str()))
		return false;
	Ref ref(raw);
	git_reference *resolved = nullptr;
	if (git_reference_resolve(&resolved, ref.get()))
		return false;
	Ref hold(resolved);
	const git_oid *target = git_reference_target(resolved);
	if (!target)
		return false;
	oid = *target;
	return true;
}

int point_branch(git_repository *repo, const std::string &branch, const git_oid &oid, const char *log)
{
	git_reference *raw = nullptr;
	int rc = git_reference_create(&raw, repo, ref_of(branch).c_str(), &oid, 1, log);
	if (raw)
		git_reference_free(raw);
	if (rc)
		return rc;
	return git_repository_set_head(repo, ref_of(branch).c_str());
}

// Brings the working copy and the index from the current HEAD to `tree`, leaving uncommitted changes alone.
int checkout_to(git_repository *repo, git_tree *tree, Call &call)
{
	git_checkout_options co = GIT_CHECKOUT_OPTIONS_INIT;
	co.checkout_strategy = GIT_CHECKOUT_SAFE;
	co.progress_cb = checkout_progress_cb;
	co.progress_payload = &call;
	return git_checkout_tree(repo, reinterpret_cast<git_object *>(tree), &co);
}

int make_signature(const OdgitAuthor &author, Sig &sig)
{
	git_signature *raw = nullptr;
	int rc = git_signature_now(&raw, author.name.c_str(), author.email.c_str());
	sig.reset(raw);
	return rc;
}

std::string head_json(git_repository *repo, const std::string &branch, const char *result)
{
	git_oid oid;
	std::string json = std::string("{\"result\":\"") + result + "\",\"head\":";
	append_oid(json, lookup_oid(repo, ref_of(branch), oid) ? &oid : nullptr);
	return json + "}";
}

// --- clone ------------------------------------------------------------------

struct CloneState {
	Call *call;
	std::string branch;
};

int clone_remote_cb(git_remote **out, git_repository *repo, const char *name, const char *url, void *payload)
{
	CloneState *state = static_cast<CloneState *>(payload);
	return git_remote_create_with_fetchspec(out, repo, name, url, refspec_of(state->branch).c_str());
}

// Whether the server has the branch (an anonymous connection is tried by libgit2 first; the token answers a 401).
int remote_has_branch(const std::string &url, const std::string &branch, Call &call, bool &has)
{
	git_remote *raw = nullptr;
	int rc = git_remote_create_detached(&raw, url.c_str());
	if (rc)
		return rc;
	Remote remote(raw);
	git_remote_callbacks cb;
	set_callbacks(cb, call);
	rc = git_remote_connect(remote.get(), GIT_DIRECTION_FETCH, &cb, nullptr, nullptr);
	if (rc)
		return rc;
	const git_remote_head **heads = nullptr;
	size_t count = 0;
	rc = git_remote_ls(&heads, &count, remote.get());
	has = false;
	for (size_t i = 0; rc == 0 && i < count; i++)
		if (ref_of(branch) == heads[i]->name)
			has = true;
	git_remote_disconnect(remote.get());
	call.credential_asks = 0;
	return rc;
}

bool has_working_copy(const std::string &dir)
{
	std::error_code ec;
	return std::filesystem::exists(std::filesystem::path(dir) / ".git", ec);
}

} // namespace

void odgit_allow_http(bool allowed) { http_allowed = allowed; }
void odgit_cancel() { cancel_flag = true; }

int odgit_clone(const std::string &url, const std::string &dir, const std::string &branch, const OdgitAuth &auth,
		const OdgitProgress &progress, std::string &json, std::string &error)
{
	cancel_flag = false;
	if (!valid_address(url) || url.find('@') != std::string::npos || url.find('[') != std::string::npos) {
		error = "BAD_ADDRESS";
		return -1;
	}
	if (!valid_auth(auth) || !valid_branch(branch) || dir.empty()) {
		error = "BAD_CREDENTIALS";
		return -1;
	}
	if (has_working_copy(dir)) {
		error = "EXISTS";
		return -1;
	}
	Library lib;
	Call call;
	call.auth = &auth;
	call.progress = progress;
	std::error_code ec;
	bool dir_was_there = std::filesystem::exists(dir, ec);

	bool has = false;
	int rc = remote_has_branch(url, branch, call, has);
	if (rc) {
		error = network_error(rc, call);
		return -1;
	}

	if (!has) {
		// An empty repository: a working copy with the remote and the branch to be, nothing to download.
		git_repository_init_options opts = GIT_REPOSITORY_INIT_OPTIONS_INIT;
		opts.flags = GIT_REPOSITORY_INIT_MKPATH;
		opts.initial_head = branch.c_str();
		git_repository *raw = nullptr;
		rc = git_repository_init_ext(&raw, dir.c_str(), &opts);
		if (rc) {
			error = local_error(rc);
			return -1;
		}
		Repo repo(raw);
		git_remote *remote = nullptr;
		rc = git_remote_create_with_fetchspec(&remote, repo.get(), "origin", url.c_str(), refspec_of(branch).c_str());
		if (remote)
			git_remote_free(remote);
		if (rc) {
			repo.reset();
			if (!dir_was_there)
				std::filesystem::remove_all(dir, ec);
			error = local_error(rc);
			return -1;
		}
		json = head_json(repo.get(), branch, "empty");
		return 0;
	}

	CloneState state{ &call, branch };
	git_clone_options opts = GIT_CLONE_OPTIONS_INIT;
	opts.checkout_branch = branch.c_str();
	opts.remote_cb = clone_remote_cb;
	opts.remote_cb_payload = &state;
	opts.checkout_opts.checkout_strategy = GIT_CHECKOUT_SAFE;
	opts.checkout_opts.progress_cb = checkout_progress_cb;
	opts.checkout_opts.progress_payload = &call;
	opts.fetch_opts.download_tags = GIT_REMOTE_DOWNLOAD_TAGS_NONE;
	set_callbacks(opts.fetch_opts.callbacks, call);
	git_repository *raw = nullptr;
	rc = git_clone(&raw, url.c_str(), dir.c_str(), &opts);
	if (rc) {
		error = network_error(rc, call);
		// A half-made working copy would pass for a complete one.
		std::filesystem::remove_all(std::filesystem::path(dir) / ".git", ec);
		if (!dir_was_there)
			std::filesystem::remove_all(dir, ec);
		return -1;
	}
	Repo repo(raw);
	json = head_json(repo.get(), branch, "cloned");
	return 0;
}

int odgit_pull(const std::string &dir, const std::string &branch, const OdgitAuth &auth, const OdgitAuthor &author,
	       const OdgitProgress &progress, std::string &json, std::string &error)
{
	cancel_flag = false;
	if (!valid_auth(auth) || !valid_branch(branch)) {
		error = "BAD_CREDENTIALS";
		return -1;
	}
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	Call call;
	call.auth = &auth;
	call.progress = progress;

	git_remote *raw_remote = nullptr;
	int rc = git_remote_lookup(&raw_remote, repo.get(), "origin");
	if (rc) {
		error = local_error(rc);
		return -1;
	}
	Remote remote(raw_remote);
	const char *url = git_remote_url(remote.get());
	if (!url || !valid_address(url)) {
		error = "BAD_ADDRESS";
		return -1;
	}

	git_fetch_options fo = GIT_FETCH_OPTIONS_INIT;
	fo.download_tags = GIT_REMOTE_DOWNLOAD_TAGS_NONE;
	set_callbacks(fo.callbacks, call);
	std::string spec = refspec_of(branch);
	const char *spec_ptr = spec.c_str();
	git_strarray specs = { const_cast<char **>(&spec_ptr), 1 };
	rc = git_remote_fetch(remote.get(), &specs, &fo, "fetch");
	if (rc) {
		error = network_error(rc, call);
		return -1;
	}

	git_oid theirs_oid, ours_oid;
	if (!lookup_oid(repo.get(), remote_ref_of(branch), theirs_oid)) {
		json = head_json(repo.get(), branch, "empty");
		return 0;
	}
	git_commit *raw_commit = nullptr;
	if ((rc = git_commit_lookup(&raw_commit, repo.get(), &theirs_oid))) {
		error = local_error(rc);
		return -1;
	}
	Commit theirs(raw_commit);
	git_tree *raw_tree = nullptr;
	if ((rc = git_commit_tree(&raw_tree, theirs.get()))) {
		error = local_error(rc);
		return -1;
	}
	Tree theirs_tree(raw_tree);

	if (!lookup_oid(repo.get(), ref_of(branch), ours_oid)) {
		// Nothing committed here yet: the branch starts at the server's.
		if ((rc = checkout_to(repo.get(), theirs_tree.get(), call)) ||
		    (rc = point_branch(repo.get(), branch, theirs_oid, "OpenDives: start from the server"))) {
			error = local_error(rc);
			return -1;
		}
		json = head_json(repo.get(), branch, "fastForward");
		return 0;
	}
	if (git_oid_equal(&ours_oid, &theirs_oid)) {
		json = head_json(repo.get(), branch, "upToDate");
		return 0;
	}
	git_oid base_oid;
	rc = git_merge_base(&base_oid, repo.get(), &ours_oid, &theirs_oid);
	bool has_base = rc == 0;
	if (rc && rc != GIT_ENOTFOUND) {
		error = local_error(rc);
		return -1;
	}
	if (has_base && git_oid_equal(&base_oid, &theirs_oid)) { // ours is ahead
		json = head_json(repo.get(), branch, "upToDate");
		return 0;
	}
	if (has_base && git_oid_equal(&base_oid, &ours_oid)) {
		if ((rc = checkout_to(repo.get(), theirs_tree.get(), call)) ||
		    (rc = point_branch(repo.get(), branch, theirs_oid, "OpenDives: fast-forward"))) {
			error = local_error(rc);
			return -1;
		}
		json = head_json(repo.get(), branch, "fastForward");
		return 0;
	}

	// A real merge, made in memory first.
	git_commit *raw_ours = nullptr;
	if ((rc = git_commit_lookup(&raw_ours, repo.get(), &ours_oid))) {
		error = local_error(rc);
		return -1;
	}
	Commit ours(raw_ours);
	git_merge_options mo = GIT_MERGE_OPTIONS_INIT;
	mo.flags = 0; // no rename detection
	git_index *raw_index = nullptr;
	if ((rc = git_merge_commits(&raw_index, repo.get(), ours.get(), theirs.get(), &mo))) {
		error = local_error(rc);
		return -1;
	}
	Index merged(raw_index);

	if (git_index_has_conflicts(merged.get())) {
		git_index_conflict_iterator *raw_it = nullptr;
		if ((rc = git_index_conflict_iterator_new(&raw_it, merged.get()))) {
			error = local_error(rc);
			return -1;
		}
		std::unique_ptr<git_index_conflict_iterator, Free<git_index_conflict_iterator, git_index_conflict_iterator_free>> it(raw_it);
		auto side = [&](std::string &out, const git_index_entry *entry) {
			if (!entry) {
				out += "null";
				return;
			}
			git_blob *raw_blob = nullptr;
			if (git_blob_lookup(&raw_blob, repo.get(), &entry->id)) {
				out += "null";
				return;
			}
			Blob blob(raw_blob);
			append_json_string(out, std::string(static_cast<const char *>(git_blob_rawcontent(blob.get())),
							   static_cast<size_t>(git_blob_rawsize(blob.get()))));
		};
		json = "{\"result\":\"conflict\",\"ours\":";
		append_oid(json, &ours_oid);
		json += ",\"theirs\":";
		append_oid(json, &theirs_oid);
		json += ",\"files\":[";
		const git_index_entry *a, *o, *t;
		bool first = true;
		while (git_index_conflict_next(&a, &o, &t, it.get()) == 0) {
			if (!first)
				json += ',';
			first = false;
			json += "{\"path\":";
			append_json_string(json, (o ? o : t ? t : a)->path);
			json += ",\"base\":";
			side(json, a);
			json += ",\"ours\":";
			side(json, o);
			json += ",\"theirs\":";
			side(json, t);
			json += '}';
		}
		json += "]}";
		return 0;
	}

	git_oid tree_oid;
	if ((rc = git_index_write_tree_to(&tree_oid, merged.get(), repo.get()))) {
		error = local_error(rc);
		return -1;
	}
	git_tree *raw_merged_tree = nullptr;
	if ((rc = git_tree_lookup(&raw_merged_tree, repo.get(), &tree_oid))) {
		error = local_error(rc);
		return -1;
	}
	Tree merged_tree(raw_merged_tree);
	Sig sig;
	if ((rc = make_signature(author, sig))) {
		error = local_error(rc);
		return -1;
	}
	ParentPtr parents[2] = { ours.get(), theirs.get() };
	git_oid commit_oid;
	std::string message = "Merge " + remote_ref_of(branch);
	if ((rc = git_commit_create(&commit_oid, repo.get(), nullptr, sig.get(), sig.get(), nullptr, message.c_str(),
				    merged_tree.get(), 2, parents)) ||
	    (rc = checkout_to(repo.get(), merged_tree.get(), call)) ||
	    (rc = point_branch(repo.get(), branch, commit_oid, "OpenDives: merge"))) {
		error = local_error(rc);
		return -1;
	}
	json = head_json(repo.get(), branch, "merged");
	return 0;
}

int odgit_commit(const std::string &dir, const std::vector<std::string> &paths, const std::string &message,
		 const OdgitAuthor &author, const std::string &merge_parent, std::string &json, std::string &error)
{
	cancel_flag = false;
	for (const std::string &p : paths)
		if (!valid_path(p)) {
			error = "BAD_PATH";
			return -1;
		}
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	int rc;
	Sig sig;
	if ((rc = make_signature(author, sig))) {
		error = local_error(rc);
		return -1;
	}

	// The commit HEAD points to, if any (a working copy of an empty repository has none yet).
	git_oid head_oid;
	bool has_head = false;
	std::string branch;
	{
		git_reference *raw = nullptr;
		if (git_reference_lookup(&raw, repo.get(), "HEAD") == 0) {
			Ref head(raw);
			if (git_reference_type(raw) == GIT_REFERENCE_SYMBOLIC && git_reference_symbolic_target(raw))
				branch = git_reference_symbolic_target(raw);
		}
		has_head = lookup_oid(repo.get(), "HEAD", head_oid);
	}
	Commit head_commit;
	if (has_head) {
		git_commit *raw = nullptr;
		if ((rc = git_commit_lookup(&raw, repo.get(), &head_oid))) {
			error = local_error(rc);
			return -1;
		}
		head_commit.reset(raw);
	}

	if (!merge_parent.empty()) {
		git_oid theirs_oid;
		if (git_oid_fromstr(&theirs_oid, merge_parent.c_str()) || !has_head) {
			error = "GIT_ERROR: bad merge parent";
			return -1;
		}
		git_commit *raw = nullptr;
		if ((rc = git_commit_lookup(&raw, repo.get(), &theirs_oid))) {
			error = local_error(rc);
			return -1;
		}
		Commit theirs(raw);
		git_merge_options mo = GIT_MERGE_OPTIONS_INIT;
		mo.flags = 0;
		git_index *raw_index = nullptr;
		if ((rc = git_merge_commits(&raw_index, repo.get(), head_commit.get(), theirs.get(), &mo))) {
			error = local_error(rc);
			return -1;
		}
		Index merged(raw_index);
		for (const std::string &p : paths) {
			git_index_conflict_remove(merged.get(), p.c_str());
			git_oid blob_oid;
			rc = git_blob_create_from_workdir(&blob_oid, repo.get(), p.c_str());
			if (rc == 0) {
				git_index_entry entry;
				memset(&entry, 0, sizeof(entry));
				entry.path = p.c_str();
				entry.mode = GIT_FILEMODE_BLOB;
				entry.id = blob_oid;
				if ((rc = git_index_add(merged.get(), &entry))) {
					error = local_error(rc);
					return -1;
				}
			} else {
				// The resolution deletes the file.
				git_index_remove_bypath(merged.get(), p.c_str());
			}
		}
		if (git_index_has_conflicts(merged.get())) {
			error = "GIT_ERROR: a conflict is left";
			return -1;
		}
		git_oid tree_oid;
		if ((rc = git_index_write_tree_to(&tree_oid, merged.get(), repo.get()))) {
			error = local_error(rc);
			return -1;
		}
		git_tree *raw_tree = nullptr;
		if ((rc = git_tree_lookup(&raw_tree, repo.get(), &tree_oid))) {
			error = local_error(rc);
			return -1;
		}
		Tree tree(raw_tree);
		ParentPtr parents[2] = { head_commit.get(), theirs.get() };
		git_oid commit_oid;
		Call call;
		if ((rc = git_commit_create(&commit_oid, repo.get(), nullptr, sig.get(), sig.get(), nullptr, message.c_str(),
					    tree.get(), 2, parents)) ||
		    (rc = checkout_to(repo.get(), tree.get(), call))) {
			error = local_error(rc);
			return -1;
		}
		// Move the branch HEAD is on.
		if (branch.compare(0, 11, "refs/heads/") != 0) {
			error = "GIT_ERROR: HEAD is not on a branch";
			return -1;
		}
		if ((rc = point_branch(repo.get(), branch.substr(11), commit_oid, "OpenDives: merge"))) {
			error = local_error(rc);
			return -1;
		}
		json = "{\"commit\":";
		append_oid(json, &commit_oid);
		json += "}";
		return 0;
	}

	git_index *raw_index = nullptr;
	if ((rc = git_repository_index(&raw_index, repo.get()))) {
		error = local_error(rc);
		return -1;
	}
	Index index(raw_index);
	for (const std::string &p : paths) {
		rc = git_index_add_bypath(index.get(), p.c_str());
		if (rc == GIT_ENOTFOUND) {
			// The file is gone: staged as deleted (nothing to do when it was never tracked).
			rc = git_index_remove_bypath(index.get(), p.c_str());
			if (rc == GIT_ENOTFOUND)
				rc = 0;
		}
		if (rc) {
			error = local_error(rc);
			return -1;
		}
	}
	git_oid tree_oid;
	if ((rc = git_index_write(index.get())) || (rc = git_index_write_tree(&tree_oid, index.get()))) {
		error = local_error(rc);
		return -1;
	}
	if (has_head && git_oid_equal(&tree_oid, git_commit_tree_id(head_commit.get()))) {
		json = "{\"commit\":null}";
		return 0;
	}
	git_tree *raw_tree = nullptr;
	if ((rc = git_tree_lookup(&raw_tree, repo.get(), &tree_oid))) {
		error = local_error(rc);
		return -1;
	}
	Tree tree(raw_tree);
	ParentPtr parents[1] = { head_commit.get() };
	git_oid commit_oid;
	rc = git_commit_create(&commit_oid, repo.get(), "HEAD", sig.get(), sig.get(), nullptr, message.c_str(), tree.get(),
			       has_head ? 1 : 0, parents);
	if (rc) {
		error = local_error(rc);
		return -1;
	}
	json = "{\"commit\":";
	append_oid(json, &commit_oid);
	json += "}";
	return 0;
}

int odgit_push(const std::string &dir, const std::string &branch, const OdgitAuth &auth, const OdgitProgress &progress,
	       std::string &json, std::string &error)
{
	cancel_flag = false;
	if (!valid_auth(auth) || !valid_branch(branch)) {
		error = "BAD_CREDENTIALS";
		return -1;
	}
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	git_oid head_oid, remote_oid;
	if (!lookup_oid(repo.get(), ref_of(branch), head_oid)) {
		json = "{\"result\":\"upToDate\",\"head\":null}";
		return 0;
	}
	if (lookup_oid(repo.get(), remote_ref_of(branch), remote_oid) && git_oid_equal(&head_oid, &remote_oid)) {
		json = "{\"result\":\"upToDate\",\"head\":\"" + oid_string(head_oid) + "\"}";
		return 0;
	}
	Call call;
	call.auth = &auth;
	call.progress = progress;
	git_remote *raw_remote = nullptr;
	int rc = git_remote_lookup(&raw_remote, repo.get(), "origin");
	if (rc) {
		error = local_error(rc);
		return -1;
	}
	Remote remote(raw_remote);
	const char *url = git_remote_url(remote.get());
	if (!url || !valid_address(url)) {
		error = "BAD_ADDRESS";
		return -1;
	}
	git_push_options po = GIT_PUSH_OPTIONS_INIT;
	set_callbacks(po.callbacks, call);
	std::string spec = ref_of(branch) + ":" + ref_of(branch);
	const char *spec_ptr = spec.c_str();
	git_strarray specs = { const_cast<char **>(&spec_ptr), 1 };
	rc = git_remote_push(remote.get(), &specs, &po);
	if (rc || call.push_refused) {
		error = network_error(rc, call);
		return -1;
	}
	json = "{\"result\":\"pushed\",\"head\":\"" + oid_string(head_oid) + "\"}";
	return 0;
}

int odgit_status(const std::string &dir, const std::vector<std::string> &paths, std::string &json, std::string &error)
{
	cancel_flag = false;
	for (const std::string &p : paths)
		if (!valid_path(p)) {
			error = "BAD_PATH";
			return -1;
		}
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	git_status_options so = GIT_STATUS_OPTIONS_INIT;
	so.show = GIT_STATUS_SHOW_INDEX_AND_WORKDIR;
	so.flags = GIT_STATUS_OPT_INCLUDE_UNTRACKED | GIT_STATUS_OPT_RECURSE_UNTRACKED_DIRS | GIT_STATUS_OPT_DISABLE_PATHSPEC_MATCH;
	std::vector<char *> specs;
	for (const std::string &p : paths)
		specs.push_back(const_cast<char *>(p.c_str()));
	so.pathspec.strings = specs.data();
	so.pathspec.count = specs.size();
	git_status_list *raw = nullptr;
	int rc = git_status_list_new(&raw, repo.get(), &so);
	if (rc) {
		error = local_error(rc);
		return -1;
	}
	std::unique_ptr<git_status_list, Free<git_status_list, git_status_list_free>> list(raw);
	json = "{\"changes\":[";
	bool first = true;
	size_t count = git_status_list_entrycount(list.get());
	for (size_t i = 0; i < count; i++) {
		const git_status_entry *e = git_status_byindex(list.get(), i);
		const char *path = e->head_to_index ? e->head_to_index->new_file.path
						    : e->index_to_workdir ? e->index_to_workdir->new_file.path : nullptr;
		if (!path)
			continue;
		unsigned s = e->status;
		const char *state;
		if (s & (GIT_STATUS_WT_DELETED | GIT_STATUS_INDEX_DELETED))
			state = "deleted";
		else if (s & (GIT_STATUS_WT_NEW | GIT_STATUS_INDEX_NEW))
			state = "new";
		else if (s & (GIT_STATUS_WT_MODIFIED | GIT_STATUS_INDEX_MODIFIED | GIT_STATUS_WT_TYPECHANGE |
			      GIT_STATUS_INDEX_TYPECHANGE | GIT_STATUS_WT_RENAMED | GIT_STATUS_INDEX_RENAMED))
			state = "modified";
		else
			continue;
		if (!first)
			json += ',';
		first = false;
		json += "{\"path\":";
		append_json_string(json, path);
		json += ",\"state\":\"";
		json += state;
		json += "\"}";
	}
	json += "]}";
	return 0;
}

int odgit_unpushed(const std::string &dir, const std::string &branch, std::string &json, std::string &error)
{
	cancel_flag = false;
	if (!valid_branch(branch)) {
		error = "GIT_ERROR: bad branch";
		return -1;
	}
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	git_oid head_oid, remote_oid;
	size_t ahead = 0, behind = 0;
	if (lookup_oid(repo.get(), ref_of(branch), head_oid)) {
		int rc;
		if (lookup_oid(repo.get(), remote_ref_of(branch), remote_oid)) {
			rc = git_graph_ahead_behind(&ahead, &behind, repo.get(), &head_oid, &remote_oid);
		} else {
			git_revwalk *raw = nullptr;
			rc = git_revwalk_new(&raw, repo.get());
			if (rc == 0) {
				std::unique_ptr<git_revwalk, Free<git_revwalk, git_revwalk_free>> walk(raw);
				git_revwalk_push(walk.get(), &head_oid);
				git_oid id;
				while (git_revwalk_next(&id, walk.get()) == 0)
					ahead++;
			}
		}
		if (rc) {
			error = local_error(rc);
			return -1;
		}
	}
	json = "{\"ahead\":" + std::to_string(ahead) + ",\"behind\":" + std::to_string(behind) + "}";
	return 0;
}

int odgit_head(const std::string &dir, const std::string &branch, std::string &json, std::string &error)
{
	cancel_flag = false;
	if (!valid_branch(branch)) {
		error = "GIT_ERROR: bad branch";
		return -1;
	}
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	git_oid oid;
	json = "{\"head\":";
	append_oid(json, lookup_oid(repo.get(), ref_of(branch), oid) ? &oid : nullptr);
	json += ",\"remote\":";
	append_oid(json, lookup_oid(repo.get(), remote_ref_of(branch), oid) ? &oid : nullptr);
	json += "}";
	return 0;
}

int odgit_list_files(const std::string &dir, const std::string &prefix, std::string &json, std::string &error)
{
	cancel_flag = false;
	Library lib;
	Repo repo;
	if (open_repo(dir, repo, error))
		return -1;
	git_index *raw = nullptr;
	int rc = git_repository_index(&raw, repo.get());
	if (rc) {
		error = local_error(rc);
		return -1;
	}
	Index index(raw);
	json = "{\"files\":[";
	bool first = true;
	size_t count = git_index_entrycount(index.get());
	for (size_t i = 0; i < count; i++) {
		const git_index_entry *e = git_index_get_byindex(index.get(), i);
		if (!e || strncmp(e->path, prefix.c_str(), prefix.size()) != 0)
			continue;
		if (!first)
			json += ',';
		first = false;
		append_json_string(json, e->path);
	}
	json += "]}";
	return 0;
}

int odgit_remove(const std::string &dir, std::string &error)
{
	if (dir.empty()) {
		error = "BAD_PATH";
		return -1;
	}
	std::error_code ec;
	std::filesystem::remove_all(dir, ec);
	if (ec) {
		error = "GIT_ERROR: " + ec.message();
		return -1;
	}
	return 0;
}

} // namespace opendives
