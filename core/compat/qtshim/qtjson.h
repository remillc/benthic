// SPDX-License-Identifier: GPL-2.0
// OpenDives compat layer: the small part of Qt's JSON classes (QJsonDocument, QJsonObject,
// QJsonArray, QJsonValue) and of QFile and QFileInfo that Subsurface's core/import-suunto-json.cpp
// uses, so that file is compiled as it is, without Qt. The values behave as Qt 6's: a missing
// key gives an undefined value, a value of another type gives the default passed to toDouble(),
// toInt(), toBool(), and toInt() only accepts a whole number.
#pragma once
#include "qtshim.h"

#include <cstdlib>
#include <map>

class QJsonValue;
class QJsonObject;
class QJsonArray;

class QJsonValue {
public:
	enum Type { Null, Bool, Double, String, Array, Object, Undefined };
	QJsonValue(Type t = Null) : type_(t) {}
	QJsonValue(bool b) : type_(Bool), bool_(b) {}
	QJsonValue(double d) : type_(Double), num_(d) {}
	QJsonValue(const QString &s) : type_(String), str_(s) {}
	QJsonValue(const QJsonArray &a);
	QJsonValue(const QJsonObject &o);
	Type type() const { return type_; }
	bool isNull() const { return type_ == Null; }
	bool isUndefined() const { return type_ == Undefined; }
	bool isObject() const { return type_ == Object; }
	bool isArray() const { return type_ == Array; }
	bool toBool(bool def = false) const { return type_ == Bool ? bool_ : def; }
	double toDouble(double def = 0) const { return type_ == Double ? num_ : def; }
	int toInt(int def = 0) const
	{
		if (type_ != Double || num_ != std::floor(num_) || num_ < -2147483648.0 || num_ > 2147483647.0)
			return def;
		return (int)num_;
	}
	QString toString(const QString &def = QString()) const { return type_ == String ? str_ : def; }
	QJsonArray toArray() const;
	QJsonObject toObject() const;
	// A value of an object, as QJsonValue::operator[](const QString &) does.
	QJsonValue operator[](const QString &key) const;
	QJsonValue operator[](const char *key) const { return (*this)[QString(key)]; }

private:
	Type type_;
	bool bool_ = false;
	double num_ = 0;
	QString str_;
	std::shared_ptr<std::vector<QJsonValue>> array_;
	std::shared_ptr<std::map<std::string, QJsonValue>> object_;
	friend class QJsonArray;
	friend class QJsonObject;
};

class QJsonArray {
public:
	QJsonArray() : items_(std::make_shared<std::vector<QJsonValue>>()) {}
	int size() const { return (int)items_->size(); }
	int count() const { return size(); }
	bool isEmpty() const { return items_->empty(); }
	QJsonValue at(long long i) const { return i >= 0 && i < size() ? (*items_)[(size_t)i] : QJsonValue(QJsonValue::Undefined); }
	QJsonValue operator[](long long i) const { return at(i); }
	void append(const QJsonValue &v) { items_->push_back(v); }
	std::vector<QJsonValue>::const_iterator begin() const { return items_->begin(); }
	std::vector<QJsonValue>::const_iterator end() const { return items_->end(); }

private:
	std::shared_ptr<std::vector<QJsonValue>> items_;
	friend class QJsonValue;
};

class QJsonObject {
public:
	QJsonObject() : items_(std::make_shared<std::map<std::string, QJsonValue>>()) {}
	int size() const { return (int)items_->size(); }
	bool isEmpty() const { return items_->empty(); }
	bool contains(const QString &key) const { return items_->count(key.toStdString()) > 0; }
	QJsonValue value(const QString &key) const
	{
		auto it = items_->find(key.toStdString());
		return it == items_->end() ? QJsonValue(QJsonValue::Undefined) : it->second;
	}
	QJsonValue operator[](const QString &key) const { return value(key); }
	void insert(const QString &key, const QJsonValue &v) { (*items_)[key.toStdString()] = v; }

private:
	std::shared_ptr<std::map<std::string, QJsonValue>> items_;
	friend class QJsonValue;
};

inline QJsonValue::QJsonValue(const QJsonArray &a) : type_(Array), array_(a.items_) {}
inline QJsonValue::QJsonValue(const QJsonObject &o) : type_(Object), object_(o.items_) {}
inline QJsonArray QJsonValue::toArray() const
{
	QJsonArray a;
	if (type_ == Array)
		a.items_ = array_;
	return a;
}
inline QJsonObject QJsonValue::toObject() const
{
	QJsonObject o;
	if (type_ == Object)
		o.items_ = object_;
	return o;
}
inline QJsonValue QJsonValue::operator[](const QString &key) const { return toObject().value(key); }

// A JSON text (RFC 8259) read by recursive descent: one value followed by white space.
class QJsonParser {
public:
	QJsonParser(const char *p, size_t n) : p_(p), end_(p + n) {}
	bool parse(QJsonValue &out)
	{
		if (end_ - p_ >= 3 && (unsigned char)p_[0] == 0xEF && (unsigned char)p_[1] == 0xBB && (unsigned char)p_[2] == 0xBF)
			p_ += 3;
		if (!value(out, 0))
			return false;
		space();
		return p_ == end_;
	}

private:
	const char *p_, *end_;
	void space() { while (p_ < end_ && (*p_ == ' ' || *p_ == '\t' || *p_ == '\n' || *p_ == '\r')) p_++; }
	bool literal(const char *w)
	{
		size_t n = strlen(w);
		if ((size_t)(end_ - p_) < n || strncmp(p_, w, n))
			return false;
		p_ += n;
		return true;
	}
	bool hex4(unsigned &v)
	{
		if (end_ - p_ < 4)
			return false;
		v = 0;
		for (int i = 0; i < 4; i++) {
			char c = *p_++;
			v <<= 4;
			if (c >= '0' && c <= '9') v |= c - '0';
			else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10;
			else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10;
			else return false;
		}
		return true;
	}
	bool string(std::string &s)
	{
		if (p_ == end_ || *p_ != '"')
			return false;
		p_++;
		while (p_ < end_ && *p_ != '"') {
			if ((unsigned char)*p_ < 0x20)
				return false;
			if (*p_ != '\\') {
				s.push_back(*p_++);
				continue;
			}
			if (++p_ == end_)
				return false;
			char c = *p_++;
			switch (c) {
			case '"': s.push_back('"'); break;
			case '\\': s.push_back('\\'); break;
			case '/': s.push_back('/'); break;
			case 'b': s.push_back('\b'); break;
			case 'f': s.push_back('\f'); break;
			case 'n': s.push_back('\n'); break;
			case 'r': s.push_back('\r'); break;
			case 't': s.push_back('\t'); break;
			case 'u': {
				unsigned u;
				if (!hex4(u))
					return false;
				if (u >= 0xD800 && u < 0xDC00 && end_ - p_ >= 6 && p_[0] == '\\' && p_[1] == 'u') {
					const char *save = p_;
					p_ += 2;
					unsigned lo;
					if (hex4(lo) && lo >= 0xDC00 && lo < 0xE000)
						u = 0x10000 + ((u - 0xD800) << 10) + (lo - 0xDC00);
					else
						p_ = save;
				}
				s += qtshim::to_utf8(std::u32string(1, (char32_t)u));
				break;
			}
			default: return false;
			}
		}
		if (p_ == end_)
			return false;
		p_++;
		return true;
	}
	bool value(QJsonValue &out, int depth)
	{
		if (depth > 512)
			return false;
		space();
		if (p_ == end_)
			return false;
		switch (*p_) {
		case '{': {
			p_++;
			QJsonObject o;
			space();
			if (p_ < end_ && *p_ == '}') {
				p_++;
				out = o;
				return true;
			}
			for (;;) {
				space();
				std::string key;
				QJsonValue v;
				if (!string(key))
					return false;
				space();
				if (p_ == end_ || *p_++ != ':' || !value(v, depth + 1))
					return false;
				o.insert(QString::fromStdString(key), v);
				space();
				if (p_ == end_)
					return false;
				if (*p_ == ',') { p_++; continue; }
				if (*p_++ == '}') break;
				return false;
			}
			out = o;
			return true;
		}
		case '[': {
			p_++;
			QJsonArray a;
			space();
			if (p_ < end_ && *p_ == ']') {
				p_++;
				out = a;
				return true;
			}
			for (;;) {
				QJsonValue v;
				if (!value(v, depth + 1))
					return false;
				a.append(v);
				space();
				if (p_ == end_)
					return false;
				if (*p_ == ',') { p_++; continue; }
				if (*p_++ == ']') break;
				return false;
			}
			out = a;
			return true;
		}
		case '"': {
			std::string s;
			if (!string(s))
				return false;
			out = QJsonValue(QString::fromStdString(s));
			return true;
		}
		case 't': out = QJsonValue(true); return literal("true");
		case 'f': out = QJsonValue(false); return literal("false");
		case 'n': out = QJsonValue(QJsonValue::Null); return literal("null");
		default: {
			// -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
			const char *b = p_;
			if (p_ < end_ && *p_ == '-') p_++;
			if (p_ == end_ || !(*p_ >= '0' && *p_ <= '9'))
				return false;
			if (*p_ == '0') p_++; else while (p_ < end_ && *p_ >= '0' && *p_ <= '9') p_++;
			if (p_ < end_ && *p_ == '.') {
				p_++;
				if (p_ == end_ || !(*p_ >= '0' && *p_ <= '9'))
					return false;
				while (p_ < end_ && *p_ >= '0' && *p_ <= '9') p_++;
			}
			if (p_ < end_ && (*p_ == 'e' || *p_ == 'E')) {
				p_++;
				if (p_ < end_ && (*p_ == '+' || *p_ == '-')) p_++;
				if (p_ == end_ || !(*p_ >= '0' && *p_ <= '9'))
					return false;
				while (p_ < end_ && *p_ >= '0' && *p_ <= '9') p_++;
			}
			out = QJsonValue(std::strtod(std::string(b, p_).c_str(), nullptr));
			return true;
		}
		}
	}
};

class QJsonDocument {
public:
	static QJsonDocument fromJson(const QByteArray &json)
	{
		QJsonDocument d;
		QJsonValue v;
		if (QJsonParser(json.constData(), (size_t)json.size()).parse(v) && (v.isObject() || v.isArray())) {
			d.value_ = v;
			d.null_ = false;
		}
		return d;
	}
	bool isNull() const { return null_; }
	bool isObject() const { return !null_ && value_.isObject(); }
	bool isArray() const { return !null_ && value_.isArray(); }
	QJsonObject object() const { return value_.toObject(); }
	QJsonArray array() const { return value_.toArray(); }

private:
	QJsonValue value_;
	bool null_ = true;
};

class QFile {
public:
	// The name as the file system wants it: UTF-8 on the platforms of the app.
	static QByteArray encodeName(const QString &name) { return name.toUtf8(); }
};

class QFileInfo {
public:
	explicit QFileInfo(const QString &path) : name_(path.toStdString())
	{
		size_t slash = name_.find_last_of("/\\");
		if (slash != std::string::npos)
			name_.erase(0, slash + 1);
	}
	// "a.b.json": completeBaseName() is "a.b", suffix() is "json".
	QString completeBaseName() const
	{
		size_t dot = name_.find_last_of('.');
		return QString::fromStdString(dot == std::string::npos ? name_ : name_.substr(0, dot));
	}
	QString suffix() const
	{
		size_t dot = name_.find_last_of('.');
		return QString::fromStdString(dot == std::string::npos ? std::string() : name_.substr(dot + 1));
	}

private:
	std::string name_;
};
