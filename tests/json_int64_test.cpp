// SPDX-License-Identifier: GPL-2.0
// JSON integers are 64-bit on every platform (long is 32 bits on Windows):
// the façade's reader keeps 2^31..2^32-1 (dive site uuids) and negative values
// exactly, and edit_dive sets a site whose uuid is above 2^31.
//
// usage: json-int64 <dive-file> <new-folder>
// Prints "PASS: ..." lines; exit status 0 when all pass, 1 otherwise.
#include "core/libbenthic/benthic.h"
#include "core/libbenthic/json.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divesite.h"

#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

using namespace benthic;
using benthic::internal::JsonReader;
using benthic::internal::JsonValue;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	printf("%s: %s\n", ok ? "PASS" : "FAIL", what.c_str());
	if (!ok)
		failures++;
}

static bool read_number(const std::string &text, int64_t &out)
{
	std::string s = "{\"v\":" + text + "}";
	std::vector<std::pair<std::string, JsonValue>> o;
	JsonReader r(s);
	if (!r.object(o) || o.size() != 1 || o[0].second.kind != JsonValue::NUMBER)
		return false;
	out = o[0].second.number;
	return true;
}

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <dive-file> <new-folder>\n", argv[0]);
		return 1;
	}
	static_assert(sizeof(JsonValue::number) == 8, "JSON integers are 64-bit");
	const struct { const char *text; int64_t value; } cases[] = {
		{ "0", 0 }, { "2147483647", 2147483647LL }, { "2147483648", 2147483648LL },
		{ "3000000000", 3000000000LL }, { "4294967295", 4294967295LL }, { "4294967296", 4294967296LL },
		{ "-1", -1 }, { "-2147483648", -2147483648LL }, { "-2147483649", -2147483649LL },
		{ "1700000000000", 1700000000000LL },
	};
	for (auto &c: cases) {
		int64_t v = 0;
		check(read_number(c.text, v) && v == c.value, std::string("reads ") + c.text);
	}
	// Emitting: the uuid written as the façade writes it reads back unchanged.
	uint32_t big = 4026531841u;
	int64_t back = 0;
	check(read_number(std::to_string(big), back) && static_cast<uint32_t>(back) == big, "a uint32 uuid round-trips");

	init();
	std::string log = std::string(argv[2]) + "[main]", json, error;
	if (import_file(argv[1], log, error) <= 0 || list_dives(log, json, error) || divelog.dives.empty()) {
		printf("FAIL: cannot create the log: %s\n", error.c_str());
		return 1;
	}
	for (uint32_t uuid: { 2147483648u, 4026531841u, 4294967295u }) {
		dive_site *ds = divelog.sites.alloc_or_get(uuid);
		check(ds && ds->uuid == uuid, "a site with uuid " + std::to_string(uuid) + " exists");
		dive *d = divelog.dives[0].get();
		std::string result;
		int rc = edit_dive(d->id, "{\"site\":" + std::to_string(uuid) + "}", result, error);
		const dive *after = divelog.dives[0].get();
		check(rc == 0 && after->dive_site && after->dive_site->uuid == uuid, "edit_dive sets the site " + std::to_string(uuid) + (rc ? " (" + error + ")" : ""));
	}
	return failures ? 1 : 0;
}
