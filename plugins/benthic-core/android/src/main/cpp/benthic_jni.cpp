// SPDX-License-Identifier: GPL-2.0
// JNI bridge between the Kotlin plugin and the C++ façade.
#include "core/libbenthic/benthic.h"
#include "core/libbenthic/bgit.h"
#include "core/compat/bt_transport.h"

#include <android/log.h>
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

static std::string to_string(JNIEnv *env, jstring s)
{
	const char *chars = env->GetStringUTFChars(s, nullptr);
	std::string result(chars);
	env->ReleaseStringUTFChars(s, chars);
	return result;
}

static void throw_core_error(JNIEnv *env, const std::string &message)
{
	jclass cls = env->FindClass("java/lang/IllegalStateException");
	if (cls)
		env->ThrowNew(cls, message.c_str());
}

// --- Bluetooth transport for the download (core/compat/bt_transport.h) ------
//
// Each primitive calls the Kotlin BluetoothTransport, which blocks until the
// Android Bluetooth stack answers or the timeout expires. Every call happens
// during NativeCore.downloadDives(), on its thread: the JNIEnv of that call
// is used throughout. Local references are freed at once: a download makes
// thousands of calls.
namespace {

class JniBtTransport : public benthic_compat::BtTransport {
public:
	JniBtTransport(JNIEnv *env, jobject transport) : env(env), obj(transport)
	{
		jclass cls = env->GetObjectClass(transport);
		m_ble_connect = env->GetMethodID(cls, "bleConnect", "(Ljava/lang/String;ZI)Z");
		m_ble_discover = env->GetMethodID(cls, "bleDiscover", "(I)Ljava/lang/String;");
		m_ble_write_descriptor = env->GetMethodID(
			cls, "bleWriteDescriptor", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;[BI)Z");
		m_ble_write = env->GetMethodID(cls, "bleWrite", "(Ljava/lang/String;Ljava/lang/String;[BZI)Z");
		m_ble_read = env->GetMethodID(cls, "bleRead", "(Ljava/lang/String;Ljava/lang/String;I)[B");
		m_ble_receive = env->GetMethodID(cls, "bleReceive", "(I)[B");
		m_ble_close = env->GetMethodID(cls, "bleClose", "()V");
		m_rfcomm_connect = env->GetMethodID(cls, "rfcommConnect", "(Ljava/lang/String;I)Z");
		m_rfcomm_read = env->GetMethodID(cls, "rfcommRead", "(II)[B");
		m_rfcomm_write = env->GetMethodID(cls, "rfcommWrite", "([B)I");
		m_rfcomm_available = env->GetMethodID(cls, "rfcommAvailable", "()I");
		m_rfcomm_close = env->GetMethodID(cls, "rfcommClose", "()V");
		m_last_error = env->GetMethodID(cls, "lastError", "()Ljava/lang/String;");
		env->DeleteLocalRef(cls);
	}

	bool ble_connect(const std::string &address, bool random_address, int timeout_ms) override
	{
		jstring a = env->NewStringUTF(address.c_str());
		jboolean r = env->CallBooleanMethod(obj, m_ble_connect, a, random_address ? JNI_TRUE : JNI_FALSE, timeout_ms);
		env->DeleteLocalRef(a);
		return !failed() && r;
	}

	// The Kotlin side writes one line per item: "S <uuid>", "C <uuid> <properties>", "D <uuid>".
	bool ble_discover(std::vector<benthic_compat::BleService> &services, int timeout_ms) override
	{
		auto s = static_cast<jstring>(env->CallObjectMethod(obj, m_ble_discover, timeout_ms));
		if (failed() || !s)
			return false;
		std::istringstream lines(to_string(env, s));
		env->DeleteLocalRef(s);
		std::string kind, uuid;
		while (lines >> kind >> uuid) {
			if (kind == "S") {
				services.push_back({ uuid, {} });
			} else if (kind == "C" && !services.empty()) {
				unsigned props = 0;
				lines >> props;
				services.back().characteristics.push_back({ uuid, props, {} });
			} else if (kind == "D" && !services.empty() && !services.back().characteristics.empty()) {
				services.back().characteristics.back().descriptors.push_back(uuid);
			}
		}
		return true;
	}

	bool ble_write_descriptor(const std::string &service, const std::string &characteristic,
				  const std::string &descriptor, const benthic_compat::Bytes &value, int timeout_ms) override
	{
		jstring s = env->NewStringUTF(service.c_str()), c = env->NewStringUTF(characteristic.c_str()),
			d = env->NewStringUTF(descriptor.c_str());
		jbyteArray v = bytes(value.data(), value.size());
		jboolean r = env->CallBooleanMethod(obj, m_ble_write_descriptor, s, c, d, v, timeout_ms);
		env->DeleteLocalRef(s);
		env->DeleteLocalRef(c);
		env->DeleteLocalRef(d);
		env->DeleteLocalRef(v);
		return !failed() && r;
	}

	bool ble_write(const std::string &service, const std::string &characteristic, const benthic_compat::Bytes &data,
		       bool with_response, int timeout_ms) override
	{
		jstring s = env->NewStringUTF(service.c_str()), c = env->NewStringUTF(characteristic.c_str());
		jbyteArray v = bytes(data.data(), data.size());
		jboolean r = env->CallBooleanMethod(obj, m_ble_write, s, c, v, with_response ? JNI_TRUE : JNI_FALSE, timeout_ms);
		env->DeleteLocalRef(s);
		env->DeleteLocalRef(c);
		env->DeleteLocalRef(v);
		return !failed() && r;
	}

	bool ble_read(const std::string &service, const std::string &characteristic, benthic_compat::Bytes &value,
		      int timeout_ms) override
	{
		jstring s = env->NewStringUTF(service.c_str()), c = env->NewStringUTF(characteristic.c_str());
		auto v = static_cast<jbyteArray>(env->CallObjectMethod(obj, m_ble_read, s, c, timeout_ms));
		env->DeleteLocalRef(s);
		env->DeleteLocalRef(c);
		if (failed() || !v)
			return false;
		value = to_bytes(v);
		env->DeleteLocalRef(v);
		return true;
	}

	// Kotlin's bleReceive: null when disconnected or cancelled, empty after
	// the timeout, else the characteristic's UUID (36 bytes) then the data.
	int ble_receive(std::string &characteristic, benthic_compat::Bytes &data, int timeout_ms) override
	{
		auto v = static_cast<jbyteArray>(env->CallObjectMethod(obj, m_ble_receive, timeout_ms));
		if (failed() || !v)
			return -1;
		benthic_compat::Bytes all = to_bytes(v);
		env->DeleteLocalRef(v);
		if (all.empty())
			return 0;
		if (all.size() < 36)
			return -1;
		characteristic.assign(all.begin(), all.begin() + 36);
		data.assign(all.begin() + 36, all.end());
		return 1;
	}

	void ble_close() override
	{
		env->CallVoidMethod(obj, m_ble_close);
		failed();
	}

	bool rfcomm_connect(const std::string &address, int timeout_ms) override
	{
		jstring a = env->NewStringUTF(address.c_str());
		jboolean r = env->CallBooleanMethod(obj, m_rfcomm_connect, a, timeout_ms);
		env->DeleteLocalRef(a);
		return !failed() && r;
	}

	int rfcomm_read(unsigned char *data, size_t size, int timeout_ms) override
	{
		auto v = static_cast<jbyteArray>(env->CallObjectMethod(obj, m_rfcomm_read, static_cast<jint>(size), timeout_ms));
		if (failed() || !v)
			return -1;
		jsize n = env->GetArrayLength(v);
		if (static_cast<size_t>(n) > size)
			n = static_cast<jsize>(size);
		env->GetByteArrayRegion(v, 0, n, reinterpret_cast<jbyte *>(data));
		env->DeleteLocalRef(v);
		return n;
	}

	int rfcomm_write(const unsigned char *data, size_t size) override
	{
		jbyteArray v = bytes(data, size);
		jint r = env->CallIntMethod(obj, m_rfcomm_write, v);
		env->DeleteLocalRef(v);
		return failed() ? -1 : r;
	}

	size_t rfcomm_available() override
	{
		jint r = env->CallIntMethod(obj, m_rfcomm_available);
		return failed() || r < 0 ? 0 : static_cast<size_t>(r);
	}

	void rfcomm_close() override
	{
		env->CallVoidMethod(obj, m_rfcomm_close);
		failed();
	}

	std::string last_error() override
	{
		auto s = static_cast<jstring>(env->CallObjectMethod(obj, m_last_error));
		if (failed() || !s)
			return std::string();
		std::string r = to_string(env, s);
		env->DeleteLocalRef(s);
		return r;
	}

private:
	// A Kotlin exception: logged and cleared, and the call fails.
	bool failed()
	{
		if (!env->ExceptionCheck())
			return false;
		env->ExceptionDescribe();
		env->ExceptionClear();
		__android_log_print(ANDROID_LOG_ERROR, "Benthic", "Bluetooth transport: exception in Kotlin");
		return true;
	}
	jbyteArray bytes(const unsigned char *data, size_t size)
	{
		jbyteArray v = env->NewByteArray(static_cast<jsize>(size));
		if (size)
			env->SetByteArrayRegion(v, 0, static_cast<jsize>(size), reinterpret_cast<const jbyte *>(data));
		return v;
	}
	benthic_compat::Bytes to_bytes(jbyteArray v)
	{
		jsize n = env->GetArrayLength(v);
		benthic_compat::Bytes out(n);
		if (n)
			env->GetByteArrayRegion(v, 0, n, reinterpret_cast<jbyte *>(out.data()));
		return out;
	}

	JNIEnv *env;
	jobject obj;
	jmethodID m_ble_connect, m_ble_discover, m_ble_write_descriptor, m_ble_write, m_ble_read, m_ble_receive, m_ble_close;
	jmethodID m_rfcomm_connect, m_rfcomm_read, m_rfcomm_write, m_rfcomm_available, m_rfcomm_close, m_last_error;
};

struct ProgressTarget {
	JNIEnv *env;
	jobject listener;
	jmethodID on_progress;
};

void send_progress(const std::string &json, void *userdata)
{
	auto *target = static_cast<ProgressTarget *>(userdata);
	jstring s = target->env->NewStringUTF(json.c_str());
	target->env->CallVoidMethod(target->listener, target->on_progress, s);
	target->env->DeleteLocalRef(s);
	if (target->env->ExceptionCheck()) {
		target->env->ExceptionDescribe();
		target->env->ExceptionClear();
	}
}

// The listener of the cloud log's progress (NativeCore.setSyncListener):
// called on the core's thread, a Java thread, whose JNIEnv the VM gives.
JavaVM *sync_vm = nullptr;
jobject sync_listener = nullptr;
jmethodID sync_on_progress = nullptr;

void send_sync_progress(const char *message)
{
	JNIEnv *env = nullptr;
	if (!sync_vm || !sync_listener || sync_vm->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6) != JNI_OK)
		return;
	jstring s = env->NewStringUTF(message);
	env->CallVoidMethod(sync_listener, sync_on_progress, s);
	env->DeleteLocalRef(s);
	if (env->ExceptionCheck()) {
		env->ExceptionDescribe();
		env->ExceptionClear();
	}
}

} // namespace

extern "C" {

// `listener` (onProgress(String)) receives the messages of the cloud log's
// git work; null stops them.
JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_setSyncListener(JNIEnv *env, jobject, jobject listener)
{
	benthic::set_sync_progress(nullptr);
	if (sync_listener) {
		env->DeleteGlobalRef(sync_listener);
		sync_listener = nullptr;
	}
	if (!listener)
		return;
	env->GetJavaVM(&sync_vm);
	sync_listener = env->NewGlobalRef(listener);
	jclass cls = env->GetObjectClass(listener);
	sync_on_progress = env->GetMethodID(cls, "onProgress", "(Ljava/lang/String;)V");
	env->DeleteLocalRef(cls);
	benthic::set_sync_progress(send_sync_progress);
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_init(JNIEnv *env, jobject, jstring home)
{
	// libgit2 and the core look for their configuration under $HOME.
	setenv("HOME", to_string(env, home).c_str(), 1);
	if (benthic::init())
		throw_core_error(env, "Cannot initialize libgit2");
}

JNIEXPORT jboolean JNICALL
Java_app_benthicdivelog_core_NativeCore_logExists(JNIEnv *env, jobject, jstring repo)
{
	return benthic::log_exists(to_string(env, repo)) ? JNI_TRUE : JNI_FALSE;
}

// Dives of a log read apart (count_dives): the device's log while the account's is loaded.
JNIEXPORT jint JNICALL
Java_app_benthicdivelog_core_NativeCore_countDives(JNIEnv *env, jobject, jstring log)
{
	std::string error;
	int count = benthic::count_dives(to_string(env, log), error);
	if (count < 0) {
		throw_core_error(env, error);
		return 0;
	}
	return count;
}

JNIEXPORT jint JNICALL
Java_app_benthicdivelog_core_NativeCore_importFile(JNIEnv *env, jobject, jstring source, jstring repo)
{
	std::string error;
	int count = benthic::import_file(to_string(env, source), to_string(env, repo), error);
	if (count < 0)
		throw_core_error(env, error);
	return count;
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_setCaFile(JNIEnv *env, jobject, jstring path)
{
	if (benthic::set_ca_file(to_string(env, path)))
		throw_core_error(env, "Certificate authorities rejected by libgit2");
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudListDives(JNIEnv *env, jobject, jstring email, jstring password)
{
	std::string json, error;
	if (benthic::cloud_list_dives(to_string(env, email), to_string(env, password), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudConfigure(JNIEnv *env, jobject, jstring email, jstring password)
{
	std::string url;
	if (benthic::cloud_configure(to_string(env, email), to_string(env, password), url))
		throw_core_error(env, "Incomplete cloud credentials");
}

// Empty string: no local cache yet.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudListCachedDives(JNIEnv *env, jobject)
{
	std::string json, error;
	if (benthic::cloud_list_cached_dives(json, error) < 0) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// The previous version's cloud cache, read-only (alpha_cache_list / alpha_cache_open).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_alphaCacheList(JNIEnv *env, jobject)
{
	std::string json;
	benthic::alpha_cache_list(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_alphaCacheOpen(JNIEnv *env, jobject, jstring id)
{
	std::string json, error;
	if (benthic::alpha_cache_open(to_string(env, id), json, error) < 0) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudSignOut(JNIEnv *env, jobject, jboolean deleteCopy)
{
	std::string error;
	if (benthic::cloud_sign_out(deleteCopy, error))
		throw_core_error(env, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudDeleteAccount(JNIEnv *env, jobject, jstring password, jstring keepDivesIn)
{
	std::string json, error;
	if (benthic::cloud_delete_account(to_string(env, password), to_string(env, keepDivesIn), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// New account and divelogs.de (account.cpp). Credentials are only passed
// through: never kept or logged here.
static jstring json_or_throw(JNIEnv *env, int ret, const std::string &json, const std::string &error)
{
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudCreateAccount(JNIEnv *env, jobject, jstring email, jstring password)
{
	std::string json, error;
	int ret = benthic::cloud_create_account(to_string(env, email), to_string(env, password), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudVerifyPin(JNIEnv *env, jobject, jstring email, jstring password, jstring pin)
{
	std::string json, error;
	int ret = benthic::cloud_verify_pin(to_string(env, email), to_string(env, password), to_string(env, pin), json,
					      error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudCreateLog(JNIEnv *env, jobject, jstring importPath)
{
	std::string json, error;
	int ret = benthic::cloud_create_log(to_string(env, importPath), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_importCount(JNIEnv *env, jobject, jstring path)
{
	std::string json, error;
	int ret = benthic::import_count(to_string(env, path), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_divelogsCheck(JNIEnv *env, jobject, jstring user, jstring password)
{
	std::string json, error;
	int ret = benthic::divelogs_check(to_string(env, user), to_string(env, password), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_divelogsDownload(JNIEnv *env, jobject, jstring user, jstring password, jstring outPath)
{
	std::string json, error;
	int ret = benthic::divelogs_download(to_string(env, user), to_string(env, password), to_string(env, outPath), json,
					       error);
	return json_or_throw(env, ret, json, error);
}

// Editing (edit.cpp). Each returns {"dive":…, "undo":…, "redo":…} or throws the error code.
static jstring edit_result(JNIEnv *env, const std::string &dive_json)
{
	auto quoted = [](const std::string &text) {
		std::string out;
		for (char c: text) {
			if (c == '"' || c == '\\')
				out += '\\';
			out += c;
		}
		return out;
	};
	// A trip step gives the trip ({"tripId":...}), a dive step the dive.
	const char *key = dive_json.rfind("{\"tripId\"", 0) == 0 ? "trip"
			: dive_json.rfind("{\"uuid\"", 0) == 0 ? "site"
			: dive_json.rfind("{\"types\"", 0) == 0 ? "cylinderTypes"
			: dive_json.rfind("{\"listChange\"", 0) == 0 ? "list"
			: dive_json.rfind("{\"presetList\"", 0) == 0 ? "presets" : "dive";
	std::string json = std::string("{\"") + key + "\":" + dive_json + ",\"undo\":\"" + quoted(benthic::undo_text());
	json += "\",\"redo\":\"" + quoted(benthic::redo_text()) + "\"}";
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_editDive(JNIEnv *env, jobject, jint id, jstring changes)
{
	std::string json, error;
	if (benthic::edit_dive(id, to_string(env, changes), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_getTrip(JNIEnv *env, jobject, jint id)
{
	std::string json, error;
	benthic::trip_json(id, json, error);
	return env->NewStringUTF(json.c_str());
}

// One trip change: action is location, notes, remove, split, merge, add, ungroup or create.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_tripAction(JNIEnv *env, jobject, jstring actionIn, jint tripId, jint diveId,
					      jint otherId, jintArray diveIds, jstring valueIn)
{
	std::string action = to_string(env, actionIn), value = to_string(env, valueIn), json, error;
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	int ret;
	if (action == "location" || action == "notes")
		ret = benthic::edit_trip(tripId, action, value, json, error);
	else if (action == "remove")
		ret = ids.empty() ? benthic::trip_remove_dive(diveId, json, error) : benthic::trip_remove_dives(ids, json, error);
	else if (action == "split")
		ret = benthic::trip_split_at(diveId, json, error);
	else if (action == "merge")
		ret = benthic::trips_merge(tripId, otherId, json, error);
	else if (action == "add")
		ret = benthic::trip_add_dives(tripId, ids, json, error);
	else if (action == "ungroup")
		ret = benthic::trip_ungroup(tripId, json, error);
	else if (action == "create")
		ret = benthic::trip_create(ids, json, error);
	else if (action == "autogroup")
		ret = benthic::trips_autogroup(value == "on", json, error);
	else {
		ret = -1;
		error = "BAD_REQUEST: unknown action " + action;
	}
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_diveComputers(JNIEnv *env, jobject)
{
	std::string json;
	benthic::dive_computers(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_diveComputerAction(JNIEnv *env, jobject, jstring action, jstring model, jstring serial,
						      jstring value, jstring intoModel, jstring intoSerial)
{
	std::string json, error;
	if (benthic::dive_computer_action(to_string(env, action), to_string(env, model), to_string(env, serial), to_string(env, value),
					    to_string(env, intoModel), to_string(env, intoSerial), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Read-only site queries: list, site, nearby, duplicates, without (dives without
// a site).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_siteQuery(JNIEnv *env, jobject, jstring kindIn, jlong uuid, jint lat, jint lon,
					     jint a, jint b, jstring textIn)
{
	std::string kind = to_string(env, kindIn), json, error;
	if (kind == "list")
		benthic::sites_json(json);
	else if (kind == "site")
		benthic::site_json(static_cast<uint32_t>(uuid), json, error);
	else if (kind == "nearby")
		benthic::site_nearby(lat, lon, a, json);
	else if (kind == "duplicates")
		benthic::sites_duplicates(a, b, json);
	else if (kind == "without")
		benthic::dives_without_site(json);
	else
		json = "null";
	return env->NewStringUTF(json.c_str());
}

// Read-only free filter: "options" (values present in the log) or "dives"
// (identifiers of the matching dives). `rules` holds five strings per rule:
// type, string mode, range mode, negate ("1" or "0"), data (benthic.h).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_filterQuery(JNIEnv *env, jobject, jstring kindIn, jstring fulltextIn,
					       jstring modeIn, jobjectArray rulesIn)
{
	std::string kind = to_string(env, kindIn), json, error;
	if (kind == "options") {
		benthic::filter_options(json);
		return env->NewStringUTF(json.c_str());
	}
	if (kind == "search") {
		benthic::search_dives(to_string(env, fulltextIn), json, error);
		return env->NewStringUTF(json.c_str());
	}
	std::vector<std::string> flat;
	jsize n = rulesIn ? env->GetArrayLength(rulesIn) : 0;
	for (jsize i = 0; i < n; i++) {
		auto s = static_cast<jstring>(env->GetObjectArrayElement(rulesIn, i));
		flat.push_back(s ? to_string(env, s) : std::string());
		if (s)
			env->DeleteLocalRef(s);
	}
	std::vector<benthic::filter_rule> rules;
	for (size_t i = 0; i + 4 < flat.size(); i += 5)
		rules.push_back({ flat[i], flat[i + 1], flat[i + 2], flat[i + 4], flat[i + 3] == "1" });
	if (benthic::filter_dives(to_string(env, fulltextIn), to_string(env, modeIn), rules, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Logs a dive by hand: one undoable step (create_dive).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_createDive(JNIEnv *env, jobject, jstring fields)
{
	std::string json, error;
	if (benthic::create_dive(to_string(env, fields), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Deletes a dive: one undoable step (delete_dive).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_deleteDive(JNIEnv *env, jobject, jintArray diveIds)
{
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	std::string json, error;
	if (benthic::delete_dives(ids, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Merges dives into one: one undoable step (merge_dives).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_mergeDives(JNIEnv *env, jobject, jintArray diveIds)
{
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	std::string json, error;
	if (benthic::merge_dives(ids, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// The same changes on several dives: one undoable step (edit_dives).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_editDives(JNIEnv *env, jobject, jintArray diveIds, jstring changes)
{
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	std::string json, error;
	if (benthic::edit_dives(ids, to_string(env, changes), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Renumbers dives (all of them if ids is empty): one undoable step (renumber_dives).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_renumberDives(JNIEnv *env, jobject, jintArray diveIds, jint start, jintArray diveNumbers)
{
	auto read = [env](jintArray array) {
		std::vector<int> out;
		if (array) {
			jsize n = env->GetArrayLength(array);
			out.resize(n);
			if (n)
				env->GetIntArrayRegion(array, 0, n, out.data());
		}
		return out;
	};
	std::vector<int> ids = read(diveIds), numbers = read(diveNumbers);
	std::string json, error;
	if (benthic::renumber_dives(ids, start, json, error, numbers)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Imports a file into the log: one undoable step (import_dives).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_importDives(JNIEnv *env, jobject, jstring file, jstring source)
{
	std::string json, error;
	if (benthic::import_dives(to_string(env, file), to_string(env, source), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// A CSV file with its column mapping (import_csv): a dry run returns the preview as it is, a real
// import is one undoable step (edit_result).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_importCsv(JNIEnv *env, jobject, jstring file, jstring companion, jstring params,
					     jstring source, jboolean dryRun)
{
	std::string json, error;
	if (benthic::import_csv(to_string(env, file), to_string(env, companion), to_string(env, params),
				  to_string(env, source), dryRun == JNI_TRUE, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return dryRun == JNI_TRUE ? env->NewStringUTF(json.c_str()) : edit_result(env, json);
}

// Imports several files at once (import_dives_files): a Suunto .json and its .fit are read as one dive.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_importDivesFiles(JNIEnv *env, jobject, jobjectArray filesIn, jstring source)
{
	std::vector<std::string> files;
	jsize n = filesIn ? env->GetArrayLength(filesIn) : 0;
	for (jsize i = 0; i < n; i++) {
		auto s = static_cast<jstring>(env->GetObjectArrayElement(filesIn, i));
		files.push_back(s ? to_string(env, s) : std::string());
		if (s)
			env->DeleteLocalRef(s);
	}
	std::string json, error;
	if (benthic::import_dives_files(files, to_string(env, source), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Filter presets: action "list" (read-only), "save" (rules: five strings per
// rule, as filterQuery) or "delete" (index); save and delete are undoable steps.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_filterPresets(JNIEnv *env, jobject, jstring actionIn, jstring name,
						 jstring fulltext, jstring mode, jobjectArray rulesIn, jint index)
{
	std::string action = to_string(env, actionIn), json, error;
	if (action == "list") {
		benthic::filter_presets_json(json);
		return env->NewStringUTF(json.c_str());
	}
	int ret;
	if (action == "delete") {
		ret = benthic::filter_preset_delete(index, json, error);
	} else {
		std::vector<std::string> flat;
		jsize n = rulesIn ? env->GetArrayLength(rulesIn) : 0;
		for (jsize i = 0; i < n; i++) {
			auto s = static_cast<jstring>(env->GetObjectArrayElement(rulesIn, i));
			flat.push_back(s ? to_string(env, s) : std::string());
			if (s)
				env->DeleteLocalRef(s);
		}
		std::vector<benthic::filter_rule> rules;
		for (size_t i = 0; i + 4 < flat.size(); i += 5)
			rules.push_back({ flat[i], flat[i + 1], flat[i + 2], flat[i + 4], flat[i + 3] == "1" });
		ret = benthic::filter_preset_save(to_string(env, name), to_string(env, fulltext), to_string(env, mode), rules,
						    json, error);
	}
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Sync conflict: the read (sync_conflicts), or the choice of a side (resolve_conflicts).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_syncConflicts(JNIEnv *env, jobject)
{
	std::string json, error;
	if (benthic::sync_conflicts(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_resolveConflicts(JNIEnv *env, jobject, jstring choices)
{
	std::string error;
	if (benthic::resolve_conflicts(to_string(env, choices), error))
		throw_core_error(env, error);
}

// One undoable site change: create, edit, geocode, merge, delete.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_siteAction(JNIEnv *env, jobject, jstring actionIn, jlong uuid, jlong other,
					      jlongArray uuidsIn, jstring fieldIn, jstring valueIn, jint lat, jint lon, jstring countryIn,
					      jstring regionIn, jstring countyIn, jstring cityIn)
{
	std::string action = to_string(env, actionIn), field = to_string(env, fieldIn), value = to_string(env, valueIn);
	std::vector<uint32_t> uuids;
	if (uuidsIn) {
		jsize n = env->GetArrayLength(uuidsIn);
		std::vector<jlong> raw(n);
		if (n)
			env->GetLongArrayRegion(uuidsIn, 0, n, raw.data());
		for (jlong v: raw)
			uuids.push_back(static_cast<uint32_t>(v));
	}
	std::string json, error;
	int ret;
	if (action == "create")
		ret = benthic::site_create(value, lat, lon, json, error);
	else if (action == "edit")
		ret = benthic::site_edit(static_cast<uint32_t>(uuid), field, value, lat, lon, json, error);
	else if (action == "geocode")
		ret = benthic::site_geocode(static_cast<uint32_t>(uuid), to_string(env, countryIn), to_string(env, regionIn),
					      to_string(env, countyIn), to_string(env, cityIn), json, error);
	else if (action == "merge")
		ret = benthic::sites_merge(static_cast<uint32_t>(uuid), static_cast<uint32_t>(other), json, error);
	else if (action == "delete")
		ret = benthic::sites_delete_unused(uuids, json, error);
	else if (action == "deleteSite")
		ret = benthic::site_delete(static_cast<uint32_t>(uuid), json, error);
	else {
		ret = -1;
		error = "BAD_REQUEST: unknown action " + action;
	}
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Read-only tools (tools.cpp): cylinders (cylinder types), weights (weight
// types), desaturation (tissues now, after the logbook dives). The gas calculator
// and the gas blender are in JavaScript (app/src/lib/gas-calculator.js, gas-blend.js).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_toolQuery(JNIEnv *env, jobject, jstring kindIn)
{
	std::string kind = to_string(env, kindIn), json;
	if (kind == "cylinders") {
		benthic::gas_cylinder_types(json);
	} else if (kind == "weights") {
		benthic::weight_types(json);
	} else if (kind == "desaturation") {
		benthic::desaturation(0, json);
	} else {
		json = "null";
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_setXsltDir(JNIEnv *env, jobject, jstring dir)
{
	benthic::set_xslt_dir(to_string(env, dir));
}

// "Exporter au format…": the dives written to `path` (export_dives); read only for the logbook.
JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_exportDives(JNIEnv *env, jobject, jintArray diveIds, jstring format, jboolean anonymize,
					      jstring path)
{
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	std::string error;
	if (benthic::export_dives(ids, to_string(env, format), anonymize, to_string(env, path), error))
		throw_core_error(env, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_undo(JNIEnv *env, jobject, jboolean redo)
{
	std::string json, error;
	if (redo ? benthic::redo(json, error) : benthic::undo(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_sync(JNIEnv *env, jobject)
{
	std::string json, error;
	if (benthic::sync(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_listLoadedDives(JNIEnv *env, jobject, jboolean includeInvalid)
{
	std::string json;
	benthic::list_loaded_dives(json, includeInvalid);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_saveLocal(JNIEnv *env, jobject)
{
	std::string error;
	if (benthic::save_local(error))
		throw_core_error(env, error);
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_cancelConflictResolution(JNIEnv *env, jobject)
{
	std::string error;
	if (benthic::cancel_conflict_resolution(error))
		throw_core_error(env, error);
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_setCloudTestEmail(JNIEnv *env, jobject, jstring email)
{
	benthic::set_cloud_test_email(to_string(env, email));
}

// Local commits of the cloud log not yet on the server, as a JSON array.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_pendingChanges(JNIEnv *env, jobject)
{
	std::string json;
	benthic::pending_changes(json);
	return env->NewStringUTF(json.c_str());
}

// Own git repository (benthic.h, git_check and following). The token is
// only passed through: never kept, logged or put in an error text here.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_gitCheck(JNIEnv *env, jobject, jstring url, jstring username, jstring token)
{
	std::string json, error;
	int ret = benthic::git_check(to_string(env, url), to_string(env, username), to_string(env, token), json, error);
	return json_or_throw(env, ret, json, error);
}

// Git on the device (bgit.h): any thread, one call at a time per working copy. The token is only passed through.
static std::vector<std::string> string_array(JNIEnv *env, jobjectArray in)
{
	std::vector<std::string> out;
	jsize n = in ? env->GetArrayLength(in) : 0;
	for (jsize i = 0; i < n; i++) {
		auto s = static_cast<jstring>(env->GetObjectArrayElement(in, i));
		out.push_back(s ? to_string(env, s) : std::string());
		if (s)
			env->DeleteLocalRef(s);
	}
	return out;
}

static benthic::BgitAuthor bgit_author(JNIEnv *env, jstring name, jstring email)
{
	benthic::BgitAuthor author;
	if (name && email) {
		author.name = to_string(env, name);
		author.email = to_string(env, email);
	}
	return author;
}

// The progress of a call goes to `listener` (onProgress(json)) on the calling thread.
static benthic::BgitProgress bgit_progress(JNIEnv *env, jobject listener, ProgressTarget &target)
{
	if (!listener)
		return nullptr;
	jclass cls = env->GetObjectClass(listener);
	target.env = env;
	target.listener = listener;
	target.on_progress = env->GetMethodID(cls, "onProgress", "(Ljava/lang/String;)V");
	env->DeleteLocalRef(cls);
	return [&target](const char *phase, uint64_t done, uint64_t total) {
		send_progress(std::string("{\"phase\":\"") + phase + "\",\"done\":" + std::to_string(done) +
				      ",\"total\":" + std::to_string(total) + "}",
			      &target);
	};
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitAllowHttp(JNIEnv *, jobject, jboolean allowed)
{
	benthic::bgit_allow_http(allowed);
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitCancel(JNIEnv *, jobject)
{
	benthic::bgit_cancel();
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitClone(JNIEnv *env, jobject, jstring url, jstring dir, jstring branch, jstring user,
					      jstring token, jobject listener)
{
	std::string json, error;
	ProgressTarget target{};
	auto progress = bgit_progress(env, listener, target);
	int ret = benthic::bgit_clone(to_string(env, url), to_string(env, dir), to_string(env, branch),
					 { to_string(env, user), to_string(env, token) }, progress, json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitPull(JNIEnv *env, jobject, jstring dir, jstring branch, jstring user, jstring token,
					     jstring authorName, jstring authorEmail, jobject listener)
{
	std::string json, error;
	ProgressTarget target{};
	auto progress = bgit_progress(env, listener, target);
	int ret = benthic::bgit_pull(to_string(env, dir), to_string(env, branch), { to_string(env, user), to_string(env, token) },
					bgit_author(env, authorName, authorEmail), progress, json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitCommit(JNIEnv *env, jobject, jstring dir, jobjectArray paths, jstring message,
					       jstring authorName, jstring authorEmail, jstring mergeParent)
{
	std::string json, error;
	int ret = benthic::bgit_commit(to_string(env, dir), string_array(env, paths), to_string(env, message),
					  bgit_author(env, authorName, authorEmail),
					  mergeParent ? to_string(env, mergeParent) : std::string(), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitPush(JNIEnv *env, jobject, jstring dir, jstring branch, jstring user, jstring token,
					     jobject listener)
{
	std::string json, error;
	ProgressTarget target{};
	auto progress = bgit_progress(env, listener, target);
	int ret = benthic::bgit_push(to_string(env, dir), to_string(env, branch), { to_string(env, user), to_string(env, token) },
					progress, json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitStatus(JNIEnv *env, jobject, jstring dir, jobjectArray paths)
{
	std::string json, error;
	int ret = benthic::bgit_status(to_string(env, dir), string_array(env, paths), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitUnpushed(JNIEnv *env, jobject, jstring dir, jstring branch)
{
	std::string json, error;
	int ret = benthic::bgit_unpushed(to_string(env, dir), to_string(env, branch), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitHead(JNIEnv *env, jobject, jstring dir, jstring branch)
{
	std::string json, error;
	int ret = benthic::bgit_head(to_string(env, dir), to_string(env, branch), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitListFiles(JNIEnv *env, jobject, jstring dir, jstring prefix)
{
	std::string json, error;
	int ret = benthic::bgit_list_files(to_string(env, dir), to_string(env, prefix), json, error);
	return json_or_throw(env, ret, json, error);
}

// The account data branch: files written into and read from a working copy. A null text means "delete the file".
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitWrite(JNIEnv *env, jobject, jstring dir, jobjectArray paths, jobjectArray texts)
{
	std::vector<benthic::BgitFile> files;
	jsize n = paths ? env->GetArrayLength(paths) : 0;
	for (jsize i = 0; i < n; i++) {
		benthic::BgitFile file;
		auto path = static_cast<jstring>(env->GetObjectArrayElement(paths, i));
		auto text = texts && i < env->GetArrayLength(texts) ? static_cast<jstring>(env->GetObjectArrayElement(texts, i)) : nullptr;
		file.path = path ? to_string(env, path) : std::string();
		file.remove = text == nullptr;
		if (text)
			file.text = to_string(env, text);
		if (path)
			env->DeleteLocalRef(path);
		if (text)
			env->DeleteLocalRef(text);
		files.push_back(std::move(file));
	}
	std::string json, error;
	int ret = benthic::bgit_write(to_string(env, dir), files, json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitRead(JNIEnv *env, jobject, jstring dir, jobjectArray paths)
{
	std::string json, error;
	int ret = benthic::bgit_read(to_string(env, dir), string_array(env, paths), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitDiff(JNIEnv *env, jobject, jstring dir, jstring from, jstring to)
{
	std::string json, error;
	int ret = benthic::bgit_diff(to_string(env, dir), to_string(env, from), to_string(env, to), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitFiles(JNIEnv *env, jobject, jstring dir)
{
	std::string json, error;
	int ret = benthic::bgit_files(to_string(env, dir), json, error);
	return json_or_throw(env, ret, json, error);
}

// History of the configured logbook (benthic.h, history_call).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_history(JNIEnv *env, jobject, jstring action, jobjectArray args)
{
	std::string json, error;
	if (benthic::history_call(to_string(env, action), string_array(env, args), json, error) < 0) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_bgitRemove(JNIEnv *env, jobject, jstring dir)
{
	std::string error;
	if (benthic::bgit_remove(to_string(env, dir), error))
		throw_core_error(env, error);
}

JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_gitConfigure(JNIEnv *env, jobject, jstring url, jstring username, jstring token,
						jstring branch)
{
	std::string address, error;
	if (benthic::git_configure(to_string(env, url), to_string(env, username), to_string(env, token),
				     to_string(env, branch), address, error))
		throw_core_error(env, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_gitCreateLog(JNIEnv *env, jobject)
{
	std::string json, error;
	int ret = benthic::git_create_log(json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cloudProbe(JNIEnv *env, jobject)
{
	std::string json, error;
	if (benthic::cloud_probe(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_getDive(JNIEnv *env, jobject, jint id)
{
	std::string json, error;
	if (benthic::get_dive(id, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_getPrefs(JNIEnv *env, jobject)
{
	std::string json;
	benthic::get_prefs(json);
	return env->NewStringUTF(json.c_str());
}

// Settings: sets core preferences from a flat JSON object (settings.cpp).
JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_setPrefs(JNIEnv *env, jobject, jstring changes)
{
	std::string error;
	if (benthic::set_prefs(to_string(env, changes), error))
		throw_core_error(env, error);
}

// Cylinder types: list, library (set the device's library from `value`), added (the diver's own types from `value`), defaults (the common sizes), add,
// size, remove, rename (to `value`, one undoable step). Each returns
// {"cylinderTypes":…, "undo":…, "redo":…}.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_cylinderTypes(JNIEnv *env, jobject, jstring actionIn, jstring nameIn,
						 jstring valueIn, jint ml, jint mbar)
{
	std::string action = to_string(env, actionIn), name = to_string(env, nameIn), value = to_string(env, valueIn);
	std::string json, error;
	int ret;
	if (action == "list")
		ret = benthic::cylinder_types(json);
	else if (action == "library")
		ret = benthic::set_cylinder_library(value, error) ? -1 : benthic::cylinder_types(json);
	else if (action == "added")
		ret = benthic::set_added_cylinder_types(value, error) ? -1 : benthic::cylinder_types(json);
	else if (action == "defaults")
		ret = benthic::default_cylinder_types(json);
	else if (action == "standard") {
		benthic::reset_cylinder_library();
		ret = benthic::cylinder_types(json);
	}
	else if (action == "rename")
		ret = benthic::cylinder_type_rename(name, value, json, error);
	else if (action == "delete" || action == "deletePreview")
		ret = benthic::cylinder_type_delete(name, action == "deletePreview", json, error);
	else
		ret = benthic::cylinder_type_action(action, name, ml, mbar, json, error);
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Dive planner (plan.cpp): read only, nothing is added to the logbook.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_plannerSetup(JNIEnv *env, jobject)
{
	std::string json;
	benthic::planner_setup(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_planDive(JNIEnv *env, jobject, jstring request)
{
	std::string json, error;
	if (benthic::plan_dive(to_string(env, request), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Planned dives (save_plan: one undoable step).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_listPlans(JNIEnv *env, jobject)
{
	std::string json;
	benthic::list_plans(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_savePlan(JNIEnv *env, jobject, jstring request, jint replaceId, jstring title)
{
	std::string json, error;
	if (benthic::save_plan(to_string(env, request), replaceId, json, error, to_string(env, title))) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_listDives(JNIEnv *env, jobject, jstring repo)
{
	std::string json, error;
	if (benthic::list_dives(to_string(env, repo), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Read-only statistics: "stats" with the criteria as JSON in `text`, or
// "values" with a field name in `text` (benthic.h).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_statsQuery(JNIEnv *env, jobject, jstring kindIn, jstring textIn)
{
	std::string kind = to_string(env, kindIn), text = to_string(env, textIn), json, error;
	int rc = kind == "values" ? benthic::stats_values(text, json, error) : benthic::stats(text, json, error);
	if (rc) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Download from a dive computer (download.cpp). The name lookups are
// reentrant: the Bluetooth scan calls them from its own thread.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_dcFromBluetoothName(JNIEnv *env, jobject, jstring name)
{
	return env->NewStringUTF(benthic::dc_from_bluetooth_name(to_string(env, name)).c_str());
}

JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_dcBluetoothModels(JNIEnv *env, jobject)
{
	return env->NewStringUTF(benthic::dc_bluetooth_models().c_str());
}

// Blocks for the whole download, on the core's thread; `transport` is the
// Kotlin BluetoothTransport, `listener` gets the progress (onProgress).
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_downloadDives(JNIEnv *env, jobject, jstring request, jobject transport,
						 jobject listener)
{
	JniBtTransport bt(env, transport);
	jclass cls = env->GetObjectClass(listener);
	ProgressTarget target { env, listener, env->GetMethodID(cls, "onProgress", "(Ljava/lang/String;)V") };
	env->DeleteLocalRef(cls);
	benthic_compat::set_bt_transport(&bt);
	std::string json, error;
	int ret = benthic::download_dives(to_string(env, request), send_progress, &target, json, error);
	benthic_compat::set_bt_transport(nullptr);
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// The dives received before a failed or cancelled download: count, keep, discard.
JNIEXPORT jstring JNICALL
Java_app_benthicdivelog_core_NativeCore_downloadPartial(JNIEnv *env, jobject, jstring action)
{
	std::string json, error;
	if (benthic::download_partial(to_string(env, action), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Off the core's thread, while downloadDives() runs.
JNIEXPORT void JNICALL
Java_app_benthicdivelog_core_NativeCore_downloadCancel(JNIEnv *, jobject)
{
	benthic::download_cancel();
}

} // extern "C"
