// SPDX-License-Identifier: GPL-2.0
#import "BenthicNative.h"

#include "BluetoothTransport.h"
#include "core/compat/bt_transport.h"
#include "core/libbenthic/bgit.h"
#include "core/libbenthic/benthic.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static NSString *const BenthicErrorDomain = @"app.benthicdivelog.core";

static std::string str(NSString *s)
{
	return std::string(s.UTF8String ?: "");
}

static NSString *ns(const std::string &s)
{
	return [NSString stringWithUTF8String:s.c_str()] ?: @"";
}

static void fail(NSError **out, const std::string &message)
{
	if (out)
		*out = [NSError errorWithDomain:BenthicErrorDomain
					   code:1
				       userInfo:@{ NSLocalizedDescriptionKey: ns(message) }];
}

// The facade's usual end: 0 gives the JSON, anything else the error.
static NSString *json_or_fail(int ret, const std::string &json, const std::string &message, NSError **out)
{
	if (ret) {
		fail(out, message);
		return nil;
	}
	return ns(json);
}

static BOOL ok_or_fail(int ret, const std::string &message, NSError **out)
{
	if (ret) {
		fail(out, message);
		return NO;
	}
	return YES;
}

static std::vector<int> ints(NSArray<NSNumber *> *array)
{
	std::vector<int> out;
	for (NSNumber *n in array)
		out.push_back(n.intValue);
	return out;
}

static std::vector<benthic::filter_rule> filter_rules(NSArray<NSString *> *flat)
{
	std::vector<benthic::filter_rule> rules;
	for (NSUInteger i = 0; i + 4 < flat.count; i += 5)
		rules.push_back({ str(flat[i]), str(flat[i + 1]), str(flat[i + 2]), str(flat[i + 4]), str(flat[i + 3]) == "1" });
	return rules;
}

// {"dive"|"trip"|"site"|"cylinderTypes"|"list"|"presets": <result>, "undo": ..., "redo": ...}
// as benthic_jni.cpp's edit_result() writes it.
static std::string quoted(const std::string &text)
{
	std::string out;
	for (unsigned char c : text) {
		if (c == '"' || c == '\\') {
			out += '\\';
			out += (char)c;
		} else if (c < 0x20) {
			char buffer[8];
			snprintf(buffer, sizeof buffer, "\\u%04x", c);
			out += buffer;
		} else {
			out += (char)c;
		}
	}
	return out;
}

static NSString *edit_result(const std::string &result_json)
{
	const char *key = result_json.rfind("{\"tripId\"", 0) == 0 ? "trip"
			: result_json.rfind("{\"uuid\"", 0) == 0 ? "site"
			: result_json.rfind("{\"types\"", 0) == 0 ? "cylinderTypes"
			: result_json.rfind("{\"listChange\"", 0) == 0 ? "list"
			: result_json.rfind("{\"presetList\"", 0) == 0 ? "presets" : "dive";
	std::string json = std::string("{\"") + key + "\":" + result_json + ",\"undo\":\"" + quoted(benthic::undo_text());
	json += "\",\"redo\":\"" + quoted(benthic::redo_text()) + "\"}";
	return ns(json);
}

static NSString *edit_or_fail(int ret, const std::string &json, const std::string &message, NSError **out)
{
	if (ret) {
		fail(out, message);
		return nil;
	}
	return edit_result(json);
}

// One transport for the app's life: CoreBluetooth objects stay.
static benthic_compat::IosBluetoothTransport &transport()
{
	static benthic_compat::IosBluetoothTransport instance;
	return instance;
}

static void send_progress(const std::string &json, void *userdata)
{
	auto handler = (__bridge void (^)(NSString *))userdata;
	handler(ns(json));
}

static void (^sync_handler)(NSString *) = nil;

static void send_sync_progress(const char *message)
{
	void (^handler)(NSString *) = sync_handler;
	if (handler && message)
		handler(ns(message));
}

@implementation BenthicNative

+ (BOOL)initializeWithHome:(NSString *)home error:(NSError **)error
{
	// libgit2 and the core look for their configuration under $HOME.
	setenv("HOME", home.fileSystemRepresentation, 1);
	if (benthic::init()) {
		fail(error, "Cannot initialize libgit2");
		return NO;
	}
	return YES;
}

+ (BOOL)setCaFile:(NSString *)path
{
	return benthic::set_ca_file(str(path)) == 0;
}

+ (void)setXsltDir:(NSString *)dir
{
	benthic::set_xslt_dir(str(dir));
}

+ (void)setSyncProgress:(void (^)(NSString *))handler
{
	benthic::set_sync_progress(nullptr);
	sync_handler = [handler copy];
	if (handler)
		benthic::set_sync_progress(send_sync_progress);
}

+ (void)setCloudTestEmail:(NSString *)email
{
	benthic::set_cloud_test_email(str(email));
}

+ (BOOL)logExists:(NSString *)repo
{
	return benthic::log_exists(str(repo));
}

+ (NSNumber *)countDives:(NSString *)log error:(NSError **)error
{
	std::string message;
	int count = benthic::count_dives(str(log), message);
	if (count < 0) {
		fail(error, message);
		return nil;
	}
	return @(count);
}

+ (NSInteger)importFile:(NSString *)source repo:(NSString *)repo error:(NSError **)error
{
	std::string message;
	int count = benthic::import_file(str(source), str(repo), message);
	if (count < 0)
		fail(error, message);
	return count;
}

+ (NSString *)listDives:(NSString *)repo error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::list_dives(str(repo), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)getDive:(NSInteger)identifier error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::get_dive((int)identifier, json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)getPrefs
{
	std::string json;
	benthic::get_prefs(json);
	return ns(json);
}

+ (BOOL)setPrefs:(NSString *)changes error:(NSError **)error
{
	std::string message;
	return ok_or_fail(benthic::set_prefs(str(changes), message), message, error);
}

// Each returns {"cylinderTypes":..., "undo":..., "redo":...}.
+ (NSString *)cylinderTypes:(NSString *)actionIn
			name:(NSString *)nameIn
		       value:(NSString *)valueIn
			  ml:(NSInteger)ml
			mbar:(NSInteger)mbar
		       error:(NSError **)error
{
	std::string action = str(actionIn), name = str(nameIn), value = str(valueIn);
	std::string json, message;
	int ret;
	if (action == "list") {
		ret = benthic::cylinder_types(json);
	} else if (action == "library") {
		ret = benthic::set_cylinder_library(value, message) ? -1 : benthic::cylinder_types(json);
	} else if (action == "added") {
		ret = benthic::set_added_cylinder_types(value, message) ? -1 : benthic::cylinder_types(json);
	} else if (action == "defaults") {
		ret = benthic::default_cylinder_types(json);
	} else if (action == "standard") {
		benthic::reset_cylinder_library();
		ret = benthic::cylinder_types(json);
	} else if (action == "rename") {
		ret = benthic::cylinder_type_rename(name, value, json, message);
	} else if (action == "delete" || action == "deletePreview") {
		ret = benthic::cylinder_type_delete(name, action == "deletePreview", json, message);
	} else {
		ret = benthic::cylinder_type_action(action, name, (int)ml, (int)mbar, json, message);
	}
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)plannerSetup
{
	std::string json;
	benthic::planner_setup(json);
	return ns(json);
}

+ (NSString *)planDive:(NSString *)request error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::plan_dive(str(request), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)listPlans
{
	std::string json;
	benthic::list_plans(json);
	return ns(json);
}

+ (NSString *)savePlan:(NSString *)request replaceId:(NSInteger)replaceId title:(NSString *)title error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::save_plan(str(request), (int)replaceId, json, message, str(title));
	return edit_or_fail(ret, json, message, error);
}

// --- Cloud account, own git repository, divelogs.de -------------------------

+ (BOOL)cloudConfigure:(NSString *)email password:(NSString *)password error:(NSError **)error
{
	std::string url;
	if (benthic::cloud_configure(str(email), str(password), url)) {
		fail(error, "Incomplete cloud credentials");
		return NO;
	}
	return YES;
}

+ (NSString *)cloudListDives:(NSString *)email password:(NSString *)password error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_list_dives(str(email), str(password), json, message);
	return json_or_fail(ret, json, message, error);
}

// Empty string: no local cache yet (the facade returns 1).
+ (NSString *)cloudListCachedDivesWithError:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_list_cached_dives(json, message);
	if (ret < 0) {
		fail(error, message);
		return nil;
	}
	return ns(json);
}

+ (NSString *)alphaCacheList
{
	std::string json;
	benthic::alpha_cache_list(json);
	return ns(json);
}

+ (NSString *)alphaCacheOpen:(NSString *)identifier error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::alpha_cache_open(str(identifier), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)history:(NSString *)action args:(NSArray<NSString *> *)args error:(NSError **)error
{
	std::vector<std::string> list;
	for (NSString *item in args)
		list.push_back(str(item));
	std::string json, message;
	int ret = benthic::history_call(str(action), list, json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)pendingChanges
{
	std::string json;
	benthic::pending_changes(json);
	return ns(json);
}

+ (BOOL)cloudSignOut:(BOOL)deleteCopy error:(NSError **)error
{
	std::string message;
	return ok_or_fail(benthic::cloud_sign_out(deleteCopy, message), message, error);
}

+ (NSString *)cloudDeleteAccount:(NSString *)password keepDivesIn:(NSString *)keepDivesIn error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_delete_account(str(password), str(keepDivesIn), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudCreateAccount:(NSString *)email password:(NSString *)password error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_create_account(str(email), str(password), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudVerifyPin:(NSString *)email password:(NSString *)password pin:(NSString *)pin error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_verify_pin(str(email), str(password), str(pin), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudCreateLog:(NSString *)importPath error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_create_log(str(importPath), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)importCount:(NSString *)path error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::import_count(str(path), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)divelogsCheck:(NSString *)user password:(NSString *)password error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::divelogs_check(str(user), str(password), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)divelogsDownload:(NSString *)user
		      password:(NSString *)password
		       outPath:(NSString *)outPath
			 error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::divelogs_download(str(user), str(password), str(outPath), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)bgit:(NSString *)operation
		args:(NSDictionary<NSString *, id> *)args
	    progress:(void (^)(NSString *))progress
	       error:(NSError **)error
{
	auto text = [&](NSString *key) {
		id v = args[key];
		return [v isKindOfClass:[NSString class]] ? str((NSString *)v) : std::string();
	};
	std::vector<std::string> paths;
	id list = args[@"paths"];
	if ([list isKindOfClass:[NSArray class]])
		for (id item in (NSArray *)list)
			paths.push_back([item isKindOfClass:[NSString class]] ? str((NSString *)item) : std::string());
	std::vector<benthic::BgitFile> files;
	{
		id filePaths = args[@"filePaths"], fileTexts = args[@"fileTexts"], fileRemoved = args[@"fileRemoved"];
		if ([filePaths isKindOfClass:[NSArray class]])
			for (NSUInteger i = 0; i < [(NSArray *)filePaths count]; i++) {
				benthic::BgitFile file;
				id p = [(NSArray *)filePaths objectAtIndex:i];
				file.path = [p isKindOfClass:[NSString class]] ? str((NSString *)p) : std::string();
				id r = [fileRemoved isKindOfClass:[NSArray class]] && i < [(NSArray *)fileRemoved count]
					? [(NSArray *)fileRemoved objectAtIndex:i] : nil;
				file.remove = [r boolValue];
				id t = [fileTexts isKindOfClass:[NSArray class]] && i < [(NSArray *)fileTexts count]
					? [(NSArray *)fileTexts objectAtIndex:i] : nil;
				if (!file.remove && [t isKindOfClass:[NSString class]])
					file.text = str((NSString *)t);
				files.push_back(std::move(file));
			}
	}
	benthic::BgitAuthor author;
	if (!text(@"authorName").empty() && !text(@"authorEmail").empty()) {
		author.name = text(@"authorName");
		author.email = text(@"authorEmail");
	}
	benthic::BgitAuth auth{ text(@"username"), text(@"token") };
	benthic::BgitProgress report;
	if (progress)
		report = [progress](const char *phase, uint64_t done, uint64_t total) {
			progress([NSString stringWithFormat:@"{\"phase\":\"%s\",\"done\":%llu,\"total\":%llu}", phase,
				  (unsigned long long)done, (unsigned long long)total]);
		};
	benthic::bgit_allow_http([args[@"allowHttp"] boolValue]);
	std::string op = str(operation), json, message;
	int ret = -1;
	if (op == "cancel") {
		benthic::bgit_cancel();
		return @"{}";
	} else if (op == "clone")
		ret = benthic::bgit_clone(text(@"url"), text(@"dir"), text(@"branch"), auth, report, json, message);
	else if (op == "pull")
		ret = benthic::bgit_pull(text(@"dir"), text(@"branch"), auth, author, report, json, message);
	else if (op == "commit")
		ret = benthic::bgit_commit(text(@"dir"), paths, text(@"message"), author, text(@"mergeParent"), json, message);
	else if (op == "push")
		ret = benthic::bgit_push(text(@"dir"), text(@"branch"), auth, report, json, message);
	else if (op == "status")
		ret = benthic::bgit_status(text(@"dir"), paths, json, message);
	else if (op == "unpushed")
		ret = benthic::bgit_unpushed(text(@"dir"), text(@"branch"), json, message);
	else if (op == "head")
		ret = benthic::bgit_head(text(@"dir"), text(@"branch"), json, message);
	else if (op == "listFiles")
		ret = benthic::bgit_list_files(text(@"dir"), text(@"prefix"), json, message);
	else if (op == "write")
		ret = benthic::bgit_write(text(@"dir"), files, json, message);
	else if (op == "read")
		ret = benthic::bgit_read(text(@"dir"), paths, json, message);
	else if (op == "diff")
		ret = benthic::bgit_diff(text(@"dir"), text(@"fromCommit"), text(@"toCommit"), json, message);
	else if (op == "files")
		ret = benthic::bgit_files(text(@"dir"), json, message);
	else if (op == "remove") {
		ret = benthic::bgit_remove(text(@"dir"), message);
		json = "{}";
	} else
		message = "BAD_REQUEST";
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)gitCheck:(NSString *)url username:(NSString *)username token:(NSString *)token error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::git_check(str(url), str(username), str(token), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (BOOL)gitConfigure:(NSString *)url
	    username:(NSString *)username
	       token:(NSString *)token
	      branch:(NSString *)branch
	       error:(NSError **)error
{
	std::string address, message;
	return ok_or_fail(benthic::git_configure(str(url), str(username), str(token), str(branch), address, message),
			  message, error);
}

+ (NSString *)gitCreateLogWithError:(NSError **)error
{
	std::string json, message;
	int ret = benthic::git_create_log(json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudProbeWithError:(NSError **)error
{
	std::string json, message;
	int ret = benthic::cloud_probe(json, message);
	return json_or_fail(ret, json, message, error);
}

// --- Editing ------------------------------------------------------------------

+ (NSString *)editDive:(NSInteger)identifier changes:(NSString *)changes error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::edit_dive((int)identifier, str(changes), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)getTrip:(NSInteger)tripId
{
	std::string json, message;
	benthic::trip_json((int)tripId, json, message);
	return ns(json);
}

// action: location, notes, remove, split, merge, add, ungroup, create, autogroup.
+ (NSString *)tripAction:(NSString *)actionIn
		  tripId:(NSInteger)tripId
		  diveId:(NSInteger)diveId
		 otherId:(NSInteger)otherId
		 diveIds:(NSArray<NSNumber *> *)diveIds
		   value:(NSString *)valueIn
		   error:(NSError **)error
{
	std::string action = str(actionIn), value = str(valueIn), json, message;
	std::vector<int> ids = ints(diveIds);
	int ret;
	if (action == "location" || action == "notes")
		ret = benthic::edit_trip((int)tripId, action, value, json, message);
	else if (action == "remove")
		ret = ids.empty() ? benthic::trip_remove_dive((int)diveId, json, message)
				  : benthic::trip_remove_dives(ids, json, message);
	else if (action == "split")
		ret = benthic::trip_split_at((int)diveId, json, message);
	else if (action == "merge")
		ret = benthic::trips_merge((int)tripId, (int)otherId, json, message);
	else if (action == "add")
		ret = benthic::trip_add_dives((int)tripId, ids, json, message);
	else if (action == "ungroup")
		ret = benthic::trip_ungroup((int)tripId, json, message);
	else if (action == "create")
		ret = benthic::trip_create(ids, json, message);
	else if (action == "autogroup")
		ret = benthic::trips_autogroup(value == "on", json, message);
	else {
		ret = -1;
		message = "BAD_REQUEST: unknown action " + action;
	}
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)undo:(BOOL)redo error:(NSError **)error
{
	std::string json, message;
	int ret = redo ? benthic::redo(json, message) : benthic::undo(json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)syncWithError:(NSError **)error
{
	std::string json, message;
	int ret = benthic::sync(json, message);
	return json_or_fail(ret, json, message, error);
}

+ (BOOL)saveLocalWithError:(NSError **)error
{
	std::string message;
	return ok_or_fail(benthic::save_local(message), message, error);
}

+ (NSString *)listLoadedDives:(BOOL)includeInvalid
{
	std::string json;
	benthic::list_loaded_dives(json, includeInvalid);
	return ns(json);
}

// kind: list, site, nearby, duplicates, without, place; anything else gives "null".
+ (NSString *)siteQuery:(NSString *)kindIn
		   uuid:(int64_t)uuid
		    lat:(NSInteger)lat
		    lon:(NSInteger)lon
		      a:(NSInteger)a
		      b:(NSInteger)b
		   text:(NSString *)text
{
	std::string kind = str(kindIn), json, message;
	if (kind == "list")
		benthic::sites_json(json);
	else if (kind == "site")
		benthic::site_json(static_cast<uint32_t>(uuid), json, message);
	else if (kind == "nearby")
		benthic::site_nearby((int)lat, (int)lon, (int)a, json);
	else if (kind == "duplicates")
		benthic::sites_duplicates((int)a, (int)b, json);
	else if (kind == "without")
		benthic::dives_without_site(json);
	else
		json = "null";
	return ns(json);
}

+ (NSString *)filterQuery:(NSString *)kindIn
		 fulltext:(NSString *)fulltext
		     mode:(NSString *)mode
		    rules:(NSArray<NSString *> *)rules
		    error:(NSError **)error
{
	std::string kind = str(kindIn), json, message;
	if (kind == "options") {
		benthic::filter_options(json);
		return ns(json);
	}
	if (kind == "search") {
		benthic::search_dives(str(fulltext), json, message);
		return ns(json);
	}
	int ret = benthic::filter_dives(str(fulltext), str(mode), filter_rules(rules), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)createDive:(NSString *)fields error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::create_dive(str(fields), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)deleteDives:(NSArray<NSNumber *> *)ids error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::delete_dives(ints(ids), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)mergeDives:(NSArray<NSNumber *> *)ids error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::merge_dives(ints(ids), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)editDives:(NSArray<NSNumber *> *)ids changes:(NSString *)changes error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::edit_dives(ints(ids), str(changes), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)renumberDives:(NSArray<NSNumber *> *)ids
		      start:(NSInteger)start
		    numbers:(NSArray<NSNumber *> *)numbers
		      error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::renumber_dives(ints(ids), (int)start, json, message, ints(numbers));
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)importDives:(NSString *)file source:(NSString *)source error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::import_dives(str(file), str(source), json, message);
	return edit_or_fail(ret, json, message, error);
}

// A CSV file with its column mapping: a dry run answers with the preview, a real import is an undoable step.
+ (NSString *)importCsv:(NSString *)file
	      companion:(NSString *)companion
		 params:(NSString *)params
		 source:(NSString *)source
		 dryRun:(BOOL)dryRun
		  error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::import_csv(str(file), str(companion), str(params), str(source), dryRun, json, message);
	return dryRun ? json_or_fail(ret, json, message, error) : edit_or_fail(ret, json, message, error);
}

+ (NSString *)importDivesFiles:(NSArray<NSString *> *)files source:(NSString *)source error:(NSError **)error
{
	std::vector<std::string> paths;
	for (NSString *f in files)
		paths.push_back(str(f));
	std::string json, message;
	int ret = benthic::import_dives_files(paths, str(source), json, message);
	return edit_or_fail(ret, json, message, error);
}

// action: list (read-only, the plain object), save or delete (undoable steps).
+ (NSString *)filterPresets:(NSString *)actionIn
		       name:(NSString *)name
		   fulltext:(NSString *)fulltext
		       mode:(NSString *)mode
		      rules:(NSArray<NSString *> *)rules
		      index:(NSInteger)index
		      error:(NSError **)error
{
	std::string action = str(actionIn), json, message;
	if (action == "list") {
		benthic::filter_presets_json(json);
		return ns(json);
	}
	int ret;
	if (action == "delete")
		ret = benthic::filter_preset_delete((int)index, json, message);
	else
		ret = benthic::filter_preset_save(str(name), str(fulltext), str(mode), filter_rules(rules), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)syncConflictsWithError:(NSError **)error
{
	std::string json, message;
	int ret = benthic::sync_conflicts(json, message);
	return json_or_fail(ret, json, message, error);
}

+ (BOOL)resolveConflicts:(NSString *)choices error:(NSError **)error
{
	std::string message;
	return ok_or_fail(benthic::resolve_conflicts(str(choices), message), message, error);
}

+ (BOOL)cancelConflictResolutionWithError:(NSError **)error
{
	std::string message;
	return ok_or_fail(benthic::cancel_conflict_resolution(message), message, error);
}

// kind "values": `text` is a field name; otherwise the criteria as JSON.
+ (NSString *)statsQuery:(NSString *)kind text:(NSString *)text error:(NSError **)error
{
	std::string json, message;
	int ret = [kind isEqualToString:@"values"] ? benthic::stats_values(str(text), json, message)
						   : benthic::stats(str(text), json, message);
	return json_or_fail(ret, json, message, error);
}

// action: create, edit, geocode, merge, delete, deleteSite.
+ (NSString *)siteAction:(NSString *)actionIn
		    uuid:(int64_t)uuid
		   other:(int64_t)other
		   uuids:(NSArray<NSNumber *> *)uuidsIn
		   field:(NSString *)fieldIn
		   value:(NSString *)valueIn
		     lat:(NSInteger)lat
		     lon:(NSInteger)lon
		 country:(NSString *)country
		  region:(NSString *)region
		  county:(NSString *)county
		    city:(NSString *)city
		   error:(NSError **)error
{
	std::string action = str(actionIn), field = str(fieldIn), value = str(valueIn);
	std::vector<uint32_t> uuids;
	for (NSNumber *n in uuidsIn)
		uuids.push_back(static_cast<uint32_t>(n.longLongValue));
	std::string json, message;
	int ret;
	if (action == "create")
		ret = benthic::site_create(value, (int)lat, (int)lon, json, message);
	else if (action == "edit")
		ret = benthic::site_edit(static_cast<uint32_t>(uuid), field, value, (int)lat, (int)lon, json, message);
	else if (action == "geocode")
		ret = benthic::site_geocode(static_cast<uint32_t>(uuid), str(country), str(region), str(county), str(city), json, message);
	else if (action == "merge")
		ret = benthic::sites_merge(static_cast<uint32_t>(uuid), static_cast<uint32_t>(other), json, message);
	else if (action == "delete")
		ret = benthic::sites_delete_unused(uuids, json, message);
	else if (action == "deleteSite")
		ret = benthic::site_delete(static_cast<uint32_t>(uuid), json, message);
	else {
		ret = -1;
		message = "BAD_REQUEST: unknown action " + action;
	}
	return edit_or_fail(ret, json, message, error);
}

// kind: cylinders, weights, desaturation; anything else gives "null".
+ (NSString *)toolQuery:(NSString *)kindIn error:(NSError **)error
{
	std::string kind = str(kindIn), json;
	if (kind == "cylinders") {
		benthic::gas_cylinder_types(json);
	} else if (kind == "weights") {
		benthic::weight_types(json);
	} else if (kind == "desaturation") {
		benthic::desaturation(0, json);
	} else {
		json = "null";
	}
	return ns(json);
}

+ (NSString *)diveComputers
{
	std::string json;
	benthic::dive_computers(json);
	return ns(json);
}

+ (NSString *)diveComputerAction:(NSString *)action
			   model:(NSString *)model
			  serial:(NSString *)serial
			   value:(NSString *)value
		       intoModel:(NSString *)intoModel
		      intoSerial:(NSString *)intoSerial
			   error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::dive_computer_action(str(action), str(model), str(serial), str(value), str(intoModel),
						  str(intoSerial), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (BOOL)exportDives:(NSArray<NSNumber *> *)ids
	     format:(NSString *)format
	  anonymize:(BOOL)anonymize
	       path:(NSString *)path
	      error:(NSError **)error
{
	std::string message;
	return ok_or_fail(benthic::export_dives(ints(ids), str(format), anonymize, str(path), message), message, error);
}

// --- Download from a dive computer ---------------------------------------------

+ (NSString *)dcFromBluetoothName:(NSString *)name
{
	return ns(benthic::dc_from_bluetooth_name(str(name)));
}

+ (NSString *)dcBluetoothModels
{
	return ns(benthic::dc_bluetooth_models());
}

+ (void)resetBluetoothTransport
{
	transport().reset();
}

+ (NSString *)downloadDives:(NSString *)request progress:(void (^)(NSString *))progress error:(NSError **)error
{
	void (^handler)(NSString *) = [progress copy];
	benthic_compat::set_bt_transport(&transport());
	std::string json, message;
	int ret = benthic::download_dives(str(request), send_progress, (__bridge void *)handler, json, message);
	benthic_compat::set_bt_transport(nullptr);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)downloadPartial:(NSString *)action error:(NSError **)error
{
	std::string json, message;
	int ret = benthic::download_partial(str(action), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (void)downloadCancel
{
	benthic::download_cancel();
	transport().cancel();
}

@end
