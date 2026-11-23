# SPDX-License-Identifier: GPL-2.0
# The reference for app/src/lib/divelogs-format.js (task 2026-11-23-337): the JSON Subsurface sends to divelogs.de for each
# dive of an .ssrf file, made with libxslt exactly as core/uploadDiveLogsDE.cpp does it (prepareDives): the dive written
# alone, with its dive site when it has one (<divelog><divesites><site/></divesites><dive/></divelog>), then
# divelogs-export.xslt, then xml2json.xslt. Needs python with lxml. Writes one JSON array per source file.
#
#   python tests/divelogs_oracle.py <xslt dir> <out dir> <source.ssrf|xml> [...]
import copy
import json
import os
import sys

from lxml import etree

xslt_dir, out_dir, *sources = sys.argv[1:]
export = etree.XSLT(etree.parse(os.path.join(xslt_dir, "divelogs-export.xslt")))
to_json = etree.XSLT(etree.parse(os.path.join(xslt_dir, "xml2json.xslt")))
os.makedirs(out_dir, exist_ok=True)

for source in sources:
    log = etree.parse(source).getroot()
    sites = {s.get("uuid"): s for s in log.iter("site") if s.getparent() is not None and s.getparent().tag == "divesites"}
    dives = []
    for dive in log.iter("dive"):
        site = sites.get(dive.get("divesiteid"))
        if site is not None:
            doc = etree.Element("divelog")
            group = etree.SubElement(doc, "divesites")
            kept = etree.SubElement(group, "site")
            for key in ("uuid", "name", "gps"):
                if site.get(key) is not None:
                    kept.set(key, site.get(key))
            doc.append(copy.deepcopy(dive))
        else:
            doc = copy.deepcopy(dive)
        doc = etree.fromstring(etree.tostring(doc))
        transformed = export(etree.ElementTree(doc))
        text = str(to_json(etree.ElementTree(etree.fromstring(etree.tostring(transformed)))))
        dives.append(json.loads(text))
    name = os.path.basename(source) + ".json"
    with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
        json.dump(dives, f, ensure_ascii=False, separators=(",", ":"))
    print(name, len(dives))
