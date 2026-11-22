// SPDX-License-Identifier: GPL-2.0
//
// Benthic — portable replacements for the Qt-based helpers that the
// Subsurface core calls (qthelper.cpp, string-format.cpp, gettextfromc.cpp,
// metadata.cpp, bluetoothaddress.cpp, checkcloudconnection.cpp, ...).
//
// The Subsurface sources are compiled unmodified; only these helpers are
// reimplemented in standard C++. Anything that affects data written to the
// log (GPS coordinate strings, stylesheets) is ported faithfully; UI-only
// helpers are kept minimal.

#include "core/dive.h"
#include "core/divelog.h"
#include "core/errorhelper.h"
#include "core/git-access.h"
#include "core/metadata.h"
#include "core/pref.h"
#include "core/qthelper.h"
#include "core/string-format.h"
#include "core/units.h"
#include "core/xmlparams.h"
#include <fstream>
#include "core/file.h"
#include "commands/command.h"
#include "commands/command.h"

#include <libxslt/xsltutils.h>
#include <libxslt/transform.h>
#include <libxslt/documents.h>
#include "ssrf-version.h"
#include <libxml/parser.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <string>
#include <sys/stat.h>
#include <filesystem>

#ifndef SUBSURFACE_SOURCE
#error "SUBSURFACE_SOURCE must point to the Subsurface source tree (for xslt/)"
#endif

std::string existing_filename;

// --- gettextfromc.cpp: no translation in the POC -------------------------
const char *trGettext(const char *text)
{
	return text;
}

// --- string-format.cpp ---------------------------------------------------
QString get_depth_unit()
{
	return QString(prefs.units.length == units::METERS ? "m" : "ft");
}

QString get_weight_unit()
{
	return QString(prefs.units.weight == units::KG ? "kg" : "lbs");
}

QString get_temp_unit()
{
	return QString(prefs.units.temperature == units::CELSIUS ? "°C" : "°F");
}

QString get_volume_unit()
{
	return QString(prefs.units.volume == units::LITER ? "L" : "cuft");
}

QString formatDayOfWeek(int day)
{
	static const char *const names[] = {
		"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
	};
	return QString(day >= 0 && day < 7 ? names[day] : "");
}

// Faithful port of printGPSCoords() (string-format.cpp).
std::string printGPSCoordsC(const location_t *location)
{
	int lat = location->lat.udeg;
	int lon = location->lon.udeg;
	char buf[128];

	if (!has_location(location))
		return std::string();

	if (prefs.coordinates_traditional) {
		const char *lath = lat >= 0 ? "N" : "S";
		const char *lonh = lon >= 0 ? "E" : "W";
		lat = abs(lat);
		lon = abs(lon);
		unsigned int latdeg = lat / 1000000U;
		unsigned int londeg = lon / 1000000U;
		unsigned int latmin = (lat % 1000000U) * 60U;
		unsigned int lonmin = (lon % 1000000U) * 60U;
		double latsec = (latmin % 1000000) * 60;
		double lonsec = (lonmin % 1000000) * 60;
		snprintf(buf, sizeof(buf), "%u°%02d\'%06.3f\"%s %u°%02d\'%06.3f\"%s",
			 latdeg, latmin / 1000000, latsec / 1000000, lath,
			 londeg, lonmin / 1000000, lonsec / 1000000, lonh);
	} else {
		snprintf(buf, sizeof(buf), "%f %f", (double)lat / 1000000.0, (double)lon / 1000000.0);
	}
	return std::string(buf);
}

std::string get_dive_date_c_string(timestamp_t when)
{
	// Only used in libdivecomputer log messages.
	time_t t = (time_t)when;
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M", &tm);
	return std::string(buf);
}

// --- qthelper.cpp --------------------------------------------------------
std::string get_current_date()
{
	time_t now = time(nullptr);
	struct tm tm;
	localtime_r(&now, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%d", &tm);
	return std::string(buf);
}

std::string subsurface_user_agent()
{
	return "Benthic/0.3.0 (Subsurface core " CANONICAL_VERSION_STRING ")";
}

timestamp_t dateTimeToTimestamp(const QDateTime &t)
{
	return t.toSecsSinceEpoch();
}

// Accepts "YYYY-MM-DDTHH:MM:SS" with optional "Z" (Qt::ISODate subset).
time_t get_dive_datetime_from_isostring(const char *when)
{
	struct tm tm = {};
	int y, mo, d, h = 0, mi = 0, s = 0;
	if (!when || sscanf(when, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &s) < 3)
		return 0;
	tm.tm_year = y - 1900;
	tm.tm_mon = mo - 1;
	tm.tm_mday = d;
	tm.tm_hour = h;
	tm.tm_min = mi;
	tm.tm_sec = s;
	return timegm(&tm);
}

std::string move_away(const std::string &old_path)
{
	namespace fs = std::filesystem;
	std::string newPath;
	int i = 0;
	do {
		newPath = old_path + "." + std::to_string(++i);
	} while (fs::exists(newPath));
	std::error_code ec;
	fs::rename(old_path, newPath, ec);
	if (ec) {
		report_info("rename of %s to %s failed", old_path.c_str(), newPath.c_str());
		return std::string();
	}
	return newPath;
}

void subsurface_mkdir(const char *dir)
{
	std::error_code ec;
	std::filesystem::create_directories(dir, ec);
	if (ec)
		report_info("failed to create path %s", dir);
}

void emit_reset_signal()
{
}

void uiNotification(const QString &msg)
{
	report_info("%s", msg.toStdString().c_str());
}

// Stylesheets are read from a directory instead of Qt resources: the
// Subsurface tree of the build, or where the app copied them on the device
// (benthic::set_xslt_dir).
namespace benthic_compat {
std::string xslt_dir = SUBSURFACE_SOURCE "/xslt/";
}

static xmlDocPtr get_stylesheet_doc(const xmlChar *uri, xmlDictPtr, int, void *, xsltLoadType)
{
	// A stylesheet's xsl:include comes resolved against its own path: absolute.
	std::string name = (const char *)uri;
	std::string filename = name.rfind('/', 0) == 0 ? name : benthic_compat::xslt_dir + name;
	return xmlParseFile(filename.c_str());
}

xsltStylesheetPtr get_stylesheet(const char *name)
{
	xsltSetLoaderFunc(get_stylesheet_doc);
	xmlDocPtr doc = get_stylesheet_doc((const xmlChar *)name, NULL, 0, NULL, XSLT_LOAD_START);
	if (!doc)
		return NULL;
	xsltStylesheetPtr xslt = xsltParseStylesheetDoc(doc);
	if (!xslt) {
		xmlFreeDoc(doc);
		return NULL;
	}
	return xslt;
}

// --- checkcloudconnection.cpp: see cloud_compat.cpp ----------------------

// --- metadata.cpp (photo EXIF/video metadata): handled by the app layer ---
enum mediatype_t get_metadata(const char *, struct metadata *data)
{
	data->timestamp = 0;
	data->duration.seconds = 0;
	data->location = location_t();
	return MEDIATYPE_UNKNOWN;
}

// --- bluetoothaddress.cpp: ported in bluetooth_compat.cpp ----------------

// --- import-suunto-json.cpp: compiled as it is (Qt JSON in qtshim/qtjson.h) ---

// --- commands/command.cpp: undo stack lives in the app layer -------------
namespace benthic_compat {
std::string (*changes_made_hook)() = nullptr;
}

namespace Command {
std::string changesMade()
{
	return benthic_compat::changes_made_hook ? benthic_compat::changes_made_hook() : std::string();
}
}

// --- qthelper.cpp: Seabear CSV header parsing (task 2026-11-16-224) -------
// parse_seabear_header() of third_party/subsurface/core/qthelper.cpp, line for line without Qt: QFile's
// readLine() and seek() become std::ifstream, QString::trimmed() trim(), contains() and replace() their
// std::string counterparts. The quirks stay: every scan starts again at the top of the file and stops at
// the first empty line (or the end of the file), the first scan skips the first line, and a column
// number only advances for the columns the function knows (its "index++").
namespace {

std::string seabear_trim(const std::string &s)
{
	const char *space = " \t\n\r\v\f";
	size_t b = s.find_first_not_of(space);
	if (b == std::string::npos)
		return std::string();
	return s.substr(b, s.find_last_not_of(space) - b + 1);
}

bool seabear_contains(const std::string &s, const char *needle)
{
	return s.find(needle) != std::string::npos;
}

// QString::replace(needle, with), every occurrence.
std::string seabear_replace(std::string s, const std::string &needle, const std::string &with)
{
	for (size_t at = s.find(needle); at != std::string::npos; at = s.find(needle, at + with.size()))
		s.replace(at, needle.size(), with);
	return s;
}

class SeabearFile {
public:
	explicit SeabearFile(const char *filename) : in(filename, std::ios::binary) {}
	bool open() const { return in.is_open(); }
	// QFile::readLine().trimmed()
	std::string line()
	{
		std::string text;
		std::getline(in, text);
		return seabear_trim(text);
	}
	// QFile::atEnd()
	bool at_end() { return in.peek() == std::ifstream::traits_type::eof(); }
	void seek_start()
	{
		in.clear();
		in.seekg(0);
	}
	// `while ((line = f.readLine().trimmed()).length() > 0 && !f.atEnd())`
	bool next(std::string &out)
	{
		out = line();
		return !out.empty() && !at_end();
	}

private:
	std::ifstream in;
};

} // namespace

void parse_seabear_header(const char *filename, struct xml_params *params)
{
	SeabearFile f(filename);
	if (!f.open())
		return;

	std::string parse_line = f.line(); // the first line is skipped

	// The dive number
	while (f.next(parse_line)) {
		if (seabear_contains(parse_line, "//DIVE NR: ")) {
			xml_params_add(params, "diveNro", seabear_replace(parse_line, "//DIVE NR: ", ""));
			break;
		}
	}
	f.seek_start();

	// The hardware version
	while (f.next(parse_line)) {
		if (seabear_contains(parse_line, "//Hardware Version: ")) {
			xml_params_add(params, "hw", seabear_trim(seabear_replace(parse_line, "//Hardware Version: ", "\"Seabear ")) + "\"");
			break;
		}
	}
	f.seek_start();

	// The sample interval
	while (f.next(parse_line)) {
		if (seabear_contains(parse_line, "//Log interval: ")) {
			xml_params_add(params, "delta", seabear_replace(seabear_trim(seabear_replace(parse_line, "//Log interval: ", "")), " s", ""));
			break;
		}
	}
	f.seek_start();

	// The dive mode: OC, APNEA, BOTTOM TIMER, CCR, CCR SENSORBOARD. This scan goes on to the end of the
	// header on purpose.
	while (f.next(parse_line)) {
		const std::string needle = "//Mode: ";
		if (seabear_contains(parse_line, needle.c_str())) {
			std::string mode = seabear_replace(parse_line, needle, "");
			if (mode == "CCR" || mode == "CCR SENSORBOARD")
				// A CCR dive gets a default setpoint, which makes the diluent cylinder
				xml_params_add_int(params, "setpointField", 1300);
			xml_params_add(params, "diveMode", "\"" + mode + "\"");
		}
	}
	f.seek_start();

	// Some fields for the extra data
	while (f.next(parse_line)) {
		const std::string needle = "//Firmware Version: ";
		if (seabear_contains(parse_line, needle.c_str()))
			xml_params_add(params, "Firmware", "\"" + seabear_replace(parse_line, needle, "") + "\"");
	}
	f.seek_start();

	while (f.next(parse_line)) {
		const std::string needle = "//Serial number: ";
		if (seabear_contains(parse_line, needle.c_str()))
			xml_params_add(params, "Serial", "\"" + seabear_replace(parse_line, needle, "") + "\"");
	}
	f.seek_start();

	while (f.next(parse_line)) {
		const std::string needle = "//GF: ";
		if (seabear_contains(parse_line, needle.c_str()))
			xml_params_add(params, "GF", "\"" + seabear_replace(parse_line, needle, "") + "\"");
	}
	f.seek_start();

	// The header up to its empty line, then the line of the column names
	while (f.next(parse_line)) {
	}
	parse_line = f.line();

	unsigned short index = 0;
	size_t start = 0;
	for (;;) {
		size_t end = parse_line.find(';', start);
		const std::string column = parse_line.substr(start, end == std::string::npos ? std::string::npos : end - start);
		if (column == "Time") {
			xml_params_add_int(params, "timeField", index++);
		} else if (column == "Depth") {
			xml_params_add_int(params, "depthField", index++);
		} else if (column == "Temperature") {
			xml_params_add_int(params, "tempField", index++);
		} else if (column == "NDT") {
			xml_params_add_int(params, "ndlField", index++);
		} else if (column == "TTS") {
			xml_params_add_int(params, "ttsField", index++);
		} else if (column == "pO2_1") {
			xml_params_add_int(params, "o2sensor1Field", index++);
		} else if (column == "pO2_2") {
			xml_params_add_int(params, "o2sensor2Field", index++);
		} else if (column == "pO2_3") {
			xml_params_add_int(params, "o2sensor3Field", index++);
		} else if (column == "Ceiling") {
			// The dive computer's ceiling is not read (a TODO in Subsurface too)
			xml_params_add_int(params, "ceilingField", index++);
		} else if (column == "Tank pressure") {
			xml_params_add_int(params, "pressureField", index++);
		} else {
			report_info("Seabear import found an un-handled field: %s", column.c_str());
		}
		if (end == std::string::npos)
			break;
		start = end + 1;
	}

	// The separator is ';' (index 2 in the desktop dialog) and the units are metric
	xml_params_add_int(params, "separatorIndex", 2);
	xml_params_add_int(params, "units", 0);
}
