// SPDX-License-Identifier: GPL-2.0
// JSON for the desktop host's protocol: a small recursive reader (null,
// booleans, numbers, strings, arrays, objects) and the writer's helpers. It is
// separate from core/libopendives/json.h, which reads only flat objects for the
// facade and stays as it is.
#ifndef OPENDIVES_HOST_JSON_VALUE_H
#define OPENDIVES_HOST_JSON_VALUE_H

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

namespace odhost {

struct Json {
	enum Type { Null, Bool, Number, String, Array, Object } type = Null;
	bool boolean = false;
	long long integer = 0;
	double real = 0;
	bool is_integer = false;
	std::string text;
	std::vector<Json> items;
	std::vector<std::pair<std::string, Json>> members;

	const Json *find(const std::string &key) const
	{
		if (type != Object)
			return nullptr;
		// The last duplicate wins, as in JavaScript's JSON.parse.
		for (size_t i = members.size(); i-- > 0;)
			if (members[i].first == key)
				return &members[i].second;
		return nullptr;
	}
};

class JsonParser {
public:
	explicit JsonParser(const std::string &s) : s(s) {}

	// The whole text must be one value.
	bool parse(Json &out)
	{
		space();
		if (!value(out, 0))
			return false;
		space();
		return i == s.size();
	}

private:
	const std::string &s;
	size_t i = 0;

	void space()
	{
		while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r'))
			i++;
	}
	bool eat(char c)
	{
		if (i < s.size() && s[i] == c) {
			i++;
			return true;
		}
		return false;
	}
	bool word(const char *w)
	{
		size_t n = 0;
		while (w[n])
			n++;
		if (s.compare(i, n, w) != 0)
			return false;
		i += n;
		return true;
	}
	static void utf8(std::string &out, unsigned cp)
	{
		if (cp < 0x80) {
			out += static_cast<char>(cp);
		} else if (cp < 0x800) {
			out += static_cast<char>(0xC0 | (cp >> 6));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		} else if (cp < 0x10000) {
			out += static_cast<char>(0xE0 | (cp >> 12));
			out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		} else {
			out += static_cast<char>(0xF0 | (cp >> 18));
			out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
			out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		}
	}
	bool hex4(unsigned &cp)
	{
		if (i + 4 > s.size())
			return false;
		cp = 0;
		for (int k = 0; k < 4; k++) {
			char c = s[i++];
			cp <<= 4;
			if (c >= '0' && c <= '9')
				cp |= c - '0';
			else if (c >= 'a' && c <= 'f')
				cp |= c - 'a' + 10;
			else if (c >= 'A' && c <= 'F')
				cp |= c - 'A' + 10;
			else
				return false;
		}
		return true;
	}
	bool string(std::string &out)
	{
		if (!eat('"'))
			return false;
		while (i < s.size()) {
			char c = s[i++];
			if (c == '"')
				return true;
			if (c != '\\') {
				out += c;
				continue;
			}
			if (i >= s.size())
				return false;
			char e = s[i++];
			switch (e) {
			case '"': out += '"'; break;
			case '\\': out += '\\'; break;
			case '/': out += '/'; break;
			case 'b': out += '\b'; break;
			case 'f': out += '\f'; break;
			case 'n': out += '\n'; break;
			case 'r': out += '\r'; break;
			case 't': out += '\t'; break;
			case 'u': {
				unsigned cp;
				if (!hex4(cp))
					return false;
				if (cp >= 0xD800 && cp < 0xDC00) {
					// A high surrogate needs its low one; a lone one becomes U+FFFD.
					if (i + 6 <= s.size() && s[i] == '\\' && s[i + 1] == 'u') {
						size_t save = i;
						i += 2;
						unsigned low;
						if (hex4(low) && low >= 0xDC00 && low <= 0xDFFF) {
							cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
						} else {
							i = save;
							cp = 0xFFFD;
						}
					} else {
						cp = 0xFFFD;
					}
				} else if (cp >= 0xDC00 && cp <= 0xDFFF) {
					cp = 0xFFFD;
				}
				utf8(out, cp);
				break;
			}
			default:
				return false;
			}
		}
		return false;
	}
	bool value(Json &v, int depth)
	{
		if (depth > 64 || i >= s.size())
			return false;
		char c = s[i];
		if (c == '"') {
			v.type = Json::String;
			return string(v.text);
		}
		if (c == '{') {
			i++;
			v.type = Json::Object;
			space();
			if (eat('}'))
				return true;
			for (;;) {
				std::string key;
				space();
				if (!string(key))
					return false;
				space();
				if (!eat(':'))
					return false;
				space();
				Json member;
				if (!value(member, depth + 1))
					return false;
				v.members.emplace_back(std::move(key), std::move(member));
				space();
				if (eat(','))
					continue;
				return eat('}');
			}
		}
		if (c == '[') {
			i++;
			v.type = Json::Array;
			space();
			if (eat(']'))
				return true;
			for (;;) {
				space();
				Json item;
				if (!value(item, depth + 1))
					return false;
				v.items.push_back(std::move(item));
				space();
				if (eat(','))
					continue;
				return eat(']');
			}
		}
		if (word("true")) {
			v.type = Json::Bool;
			v.boolean = true;
			return true;
		}
		if (word("false")) {
			v.type = Json::Bool;
			return true;
		}
		if (word("null")) {
			v.type = Json::Null;
			return true;
		}
		size_t start = i;
		bool integral = true;
		if (i < s.size() && s[i] == '-')
			i++;
		size_t digits = i;
		while (i < s.size() && s[i] >= '0' && s[i] <= '9')
			i++;
		if (i == digits)
			return false;
		if (i < s.size() && s[i] == '.') {
			integral = false;
			i++;
			while (i < s.size() && s[i] >= '0' && s[i] <= '9')
				i++;
		}
		if (i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
			integral = false;
			i++;
			if (i < s.size() && (s[i] == '+' || s[i] == '-'))
				i++;
			while (i < s.size() && s[i] >= '0' && s[i] <= '9')
				i++;
		}
		std::string number = s.substr(start, i - start);
		v.type = Json::Number;
		v.real = strtod(number.c_str(), nullptr);
		v.integer = integral ? strtoll(number.c_str(), nullptr, 10) : static_cast<long long>(v.real);
		v.is_integer = integral;
		return true;
	}
};

// --- Writing -----------------------------------------------------------------

// `s` as a JSON string. Valid UTF-8 passes through unchanged; a byte that is
// not part of a valid sequence becomes U+FFFD, so the line is always valid
// UTF-8 for the reader. Control characters, '"' and '\' are escaped.
inline void append_json_string(std::string &out, const std::string &s)
{
	out += '"';
	size_t n = s.size();
	for (size_t i = 0; i < n;) {
		unsigned char c = static_cast<unsigned char>(s[i]);
		if (c < 0x80) {
			switch (c) {
			case '"': out += "\\\""; break;
			case '\\': out += "\\\\"; break;
			case '\n': out += "\\n"; break;
			case '\r': out += "\\r"; break;
			case '\t': out += "\\t"; break;
			case '\b': out += "\\b"; break;
			case '\f': out += "\\f"; break;
			default:
				if (c < 0x20) {
					char buf[8];
					snprintf(buf, sizeof buf, "\\u%04x", c);
					out += buf;
				} else {
					out += static_cast<char>(c);
				}
			}
			i++;
			continue;
		}
		size_t len = (c >= 0xC2 && c <= 0xDF) ? 2 : (c >= 0xE0 && c <= 0xEF) ? 3 : (c >= 0xF0 && c <= 0xF4) ? 4 : 0;
		bool valid = len && i + len <= n;
		for (size_t k = 1; valid && k < len; k++)
			valid = (static_cast<unsigned char>(s[i + k]) & 0xC0) == 0x80;
		if (valid && len == 3) {
			unsigned char c1 = static_cast<unsigned char>(s[i + 1]);
			if ((c == 0xE0 && c1 < 0xA0) || (c == 0xED && c1 > 0x9F))
				valid = false; // overlong, or a surrogate
		}
		if (valid && len == 4) {
			unsigned char c1 = static_cast<unsigned char>(s[i + 1]);
			if ((c == 0xF0 && c1 < 0x90) || (c == 0xF4 && c1 > 0x8F))
				valid = false; // overlong, or beyond U+10FFFF
		}
		if (!valid) {
			out += "\xEF\xBF\xBD";
			i++;
			continue;
		}
		out.append(s, i, len);
		i += len;
	}
	out += '"';
}

inline std::string json_string(const std::string &s)
{
	std::string out;
	out.reserve(s.size() + 2);
	append_json_string(out, s);
	return out;
}

} // namespace odhost

#endif
