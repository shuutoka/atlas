"""Biblio-Atlas V1. SQLite is the authority; static JSON is a projection."""

import collections, contextlib, datetime, hashlib, html.parser, json, math, os
import re, shutil, sqlite3, tempfile, urllib.parse, uuid, xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("BIBLIO_ATLAS_HOME", Path.home() / "Biblio-Atlas"))
STATUS = ["Actif", "Dormant", "Éteint", "Incertain", "Inconnu"]
KINDS = ["Volcan", "Maar", "Montagne", "Croix", "Source chaude"]
ARRAYS = "aliases morphology style context tags".split()
PUBLIC = (
    "name continent country region subregion lat lon altitude status incomplete kind age period eruption description review".split()
    + ARRAYS
    + ["sources", "images"]
)
INDEX = (
    "name continent country region subregion lat lon status incomplete kind period".split()
    + ARRAYS
)
TEXT = "name continent country region subregion age period eruption description notes".split()
BULK = set(
    "country region status morphology style context published incomplete review".split()
)


def clock():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(
        timespec="microseconds"
    )


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump(obj), encoding="utf8")


def empty():
    d = {k: "" for k in TEXT}
    d.update({k: [] for k in ARRAYS + ["sources", "images"]})
    return dict(
        d,
        lat=None,
        lon=None,
        altitude=None,
        kind="Volcan",
        status="Inconnu",
        review=True,
        incomplete=True,
        published=False,
    )


def connect():
    ROOT.mkdir(parents=True, exist_ok=True)
    db = ROOT / "atlas.sqlite"
    if not db.exists():
        seed = HERE / "seed/atlas.sqlite"
        if seed.exists():
            with (
                seed.open("rb") as src,
                tempfile.NamedTemporaryFile(dir=ROOT, delete=False) as dst,
            ):
                shutil.copyfileobj(src, dst)
            try:
                os.link(dst.name, db)
            except FileExistsError:
                pass
            finally:
                os.unlink(dst.name)
    c = sqlite3.connect(db, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.executescript((HERE / "schema.sql").read_text(encoding="utf8"))
    return c


def ident(i):
    return f"VOL-{i:06d}"


def num(s):
    return int(s.removeprefix("VOL-"))


def validate(d):
    if d["status"] not in STATUS or d["kind"] not in KINDS:
        raise ValueError("Statut ou pictogramme invalide.")
    for k in TEXT:
        if not isinstance(d[k], str):
            raise ValueError("Texte attendu : " + k)
    for k in ARRAYS:
        if not isinstance(d[k], list) or any(not isinstance(x, str) for x in d[k]):
            raise ValueError("Liste attendue : " + k)
    for k, limit in [("lat", 90), ("lon", 180), ("altitude", None)]:
        v = d[k]
        if v is not None and (
            type(v) not in (int, float)
            or not math.isfinite(v)
            or limit
            and abs(v) > limit
        ):
            raise ValueError("Valeur invalide : " + k)
    if d["published"] and (d["lat"] is None or d["lon"] is None):
        raise ValueError("Coordonnées requises pour publier.")
    for k in ["review", "incomplete", "published"]:
        if type(d[k]) is not bool:
            raise ValueError("Valeur logique attendue : " + k)
    for k in ["sources", "images"]:
        if not isinstance(d[k], list):
            raise ValueError("Liste attendue : " + k)
        for x in d[k]:
            if not isinstance(x, dict) or not all(
                isinstance(v, str) for v in x.values()
            ):
                raise ValueError("Objet invalide : " + k)
            url = x.get("url", "")
            if url and not (
                urllib.parse.urlsplit(url).scheme in ("http", "https")
                or (
                    k == "images"
                    and re.fullmatch(r"media/[a-f0-9]{64}\.(png|jpe?g|webp|gif)", url)
                )
            ):
                raise ValueError("URL invalide : " + url)


def record(row):
    return dict(
        json.loads(row["payload"]),
        id=ident(row["id"]),
        parent_id=ident(row["parent"]) if row["parent"] else None,
        created=row["created"],
        updated=row["updated"],
    )


def get(c, key):
    r = c.execute("SELECT * FROM element WHERE id=?", (num(key),)).fetchone()
    if not r:
        raise ValueError("Fiche introuvable : " + key)
    return record(r)


def insert(c, d, parent=None, origin=None):
    validate(d)
    now = clock()
    if parent and get(c, parent)["parent_id"]:
        raise ValueError("Deux niveaux maximum.")
    return ident(
        c.execute(
            "INSERT INTO element(parent,origin,payload,created,updated) VALUES(?,?,?,?,?)",
            (num(parent) if parent else None, origin, dump(d), now, now),
        ).lastrowid
    )


def save(c, key, patch, version=None):
    original = get(c, key)
    if version and original["updated"] != version:
        raise ValueError("Fiche modifiée depuis son ouverture. Rechargez-la.")
    d = {k: original[k] for k in empty()}
    d.update({k: v for k, v in patch.items() if k in d})
    validate(d)
    c.execute(
        "UPDATE element SET payload=?,updated=? WHERE id=?",
        (dump(d), clock(), num(key)),
    )


def backup(c):
    target = ROOT / "sauvegardes"
    target.mkdir(exist_ok=True)
    day = datetime.datetime.now().strftime("%Y-%m-%d")
    path = target / (day + ".sqlite")
    if not path.exists():
        tmp = target / (str(uuid.uuid4()) + ".tmp")
        with contextlib.closing(sqlite3.connect(tmp)) as out:
            c.backup(out)
        os.replace(tmp, path)


class Content(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.links = []
        self.pics = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ["br", "p", "div", "li", "tr"]:
            self.parts.append("\n")
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        if tag == "img" and a.get("src"):
            self.pics.append(a["src"])

    def handle_data(self, data):
        self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in ["div", "p", "li", "tr"]:
            self.parts.append("\n")


def geo(path):
    country_at = None
    countries = {
        "France",
        "Pays-Bas",
        "Pays-bas",
        "Allemagne",
        "Roumanie",
        "Pologne",
        "Géorgie",
        "Arménie",
        "Azerbaïdjan",
        "Irelande",
        "Royaume-uni",
        "Norvège",
        "Italie",
        "Espagne",
        "Grèce",
        "Islande",
        "Portugal",
        "USA",
        "Maurice",
    }
    for i, s in enumerate(path):
        if s in countries:
            country_at = i
    if country_at is None:
        return {}
    i = country_at
    parts = [s.strip() for s in path[i + 1 :] if s not in ("Dom / Tom", "Autres")]
    p = path[i]
    p = {
        "USA": "États-Unis",
        "Irelande": "Irlande",
        "Royaume-uni": "Royaume-Uni",
        "Pays-bas": "Pays-Bas",
    }.get(p, p)
    cont = {
        "Europe": "Europe",
        "Amérique Du Nord": "Amérique du Nord",
        "Maurice": "Afrique",
        "carraïbes": "Amérique du Nord",
    }.get(path[0], "")
    if "Dom / Tom" in path or p == "Pays-Bas":
        cont = ""  # administrative folders can span continents
    return dict(
        country=p,
        continent=cont,
        region=parts[0] if parts else "",
        subregion=" / ".join(parts[1:]),
    )


def import_kml(c, raw, initial=False):
    digest = hashlib.sha256(raw).hexdigest()
    prev = c.execute("SELECT report FROM imports WHERE hash=?", (digest,)).fetchone()
    if prev:
        return dict(json.loads(prev[0]), alreadyImported=True)
    root = ET.fromstring(raw)
    original_legend = root.findtext("{*}Document/{*}description", "").casefold()
    volcanic_palette = (
        "bleu - étein" in original_legend and "rouge - actif" in original_legend
    )
    nodes = {
        v: e
        for e in root.iter()
        for k, v in e.attrib.items()
        if k.split("}")[-1] == "id"
    }
    report = {
        "sha256": digest,
        "document": root.findtext("{*}Document/{*}name", ""),
        "existingOrigins": [],
        "detected": 0,
        "inserted": 0,
        "existing": 0,
        "folders": 0,
        "missing": collections.Counter(),
        "styles": collections.Counter(),
        "icons": collections.Counter(),
        "colors": collections.Counter(),
        "errors": [],
        "review": [],
        "recovered": collections.Counter(),
    }
    fields = {
        "altitude": "altitude",
        "hauteur": "hauteur",
        "type": "type",
        "âge": "âge",
        "age": "âge",
        "activité": "activité",
        "dernière éruption": "dernière éruption",
    }

    def walk(e, path):
        tag = e.tag.split("}")[-1]
        if tag == "Folder":
            report["folders"] += 1
            path = path + [e.findtext("{*}name", "")]
        if tag != "Placemark":
            for child in e:
                if child.tag.split("}")[-1] in ("Document", "Folder", "Placemark"):
                    walk(child, path)
            return
        report["detected"] += 1
        origin = e.get("id") or digest + ":" + str(report["detected"])
        if c.execute("SELECT 1 FROM element WHERE origin=?", (origin,)).fetchone():
            report["existing"] += 1
            report["existingOrigins"].append(origin)
            return
        d = empty()
        d.update(geo(path))
        d["name"] = e.findtext("{*}name", "").strip()
        desc = e.findtext("{*}description", "")
        parser = Content()
        parser.feed(desc)
        body = "\n".join(
            l.strip()
            for l in "".join(parser.parts).replace("\xa0", " ").splitlines()
            if l.strip()
        )
        d["description"] = body
        candidates = {}
        for line in body.splitlines():
            a, sep, b = line.partition(":")
            if sep and a.lower().strip() in fields and b.strip():
                candidates.setdefault(fields[a.lower().strip()], []).append(b.strip())
        links = parser.links + re.findall(r'https?://[^\s<>"\]]+', body)
        d["sources"] = [
            {"url": s, "title": ""}
            for s in dict.fromkeys(links)
            if s.startswith(("https://", "http://"))
        ]
        pics = parser.pics + [v.text or "" for v in e.findall(".//{*}imageUrl")]
        d["images"] = [
            {"url": s, "caption": "", "credit": ""}
            for s in dict.fromkeys(pics)
            if s.startswith(("https://", "http://"))
        ]
        ref = e.findtext("{*}styleUrl", "")
        sty = nodes.get(ref.lstrip("#"))
        if sty is not None:
            for pair in sty.findall("{*}Pair"):
                if pair.findtext("{*}key") == "normal":
                    sty = nodes.get(pair.findtext("{*}styleUrl", "").lstrip("#"))
                    break
        icon = "" if sty is None else sty.findtext(".//{*}Icon/{*}href", "")
        icon = e.findtext("{*}Style/{*}IconStyle/{*}Icon/{*}href", icon)
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(icon).query)
        color = q.get("color", [""])[0]
        tint = e.findtext("{*}Style/{*}IconStyle/{*}color", "")
        if not tint and sty is not None:
            tint = sty.findtext(".//{*}IconStyle/{*}color", "")
        if not color and re.fullmatch("[0-9A-Fa-f]{8}", tint):
            color = (tint[6:8] + tint[4:6] + tint[2:4]).lower()
        pic = q.get("id", [""])[0]
        d["kind"] = {
            "2381": "Volcan",
            "2396": "Croix",
            "2000": "Maar",
            "2227": "Montagne",
            "2175": "Source chaude",
        }.get(pic, "Croix")
        if d["kind"] == "Maar":
            d["morphology"] = ["maar"]
        status = {
            "1976d2": "Éteint",
            "42a5f5": "Éteint",
            "d32f2f": "Actif",
            "ef5350": "Actif",
            "fbc02d": "Dormant",
            "ffee58": "Dormant",
        }.get(color)
        if not volcanic_palette:
            status = None
        d["status"] = status or "Inconnu"
        d["incomplete"] = not status
        try:
            xyz = [
                float(x)
                for x in e.findtext("{*}Point/{*}coordinates", "").strip().split(",")
            ]
            d["lon"], d["lat"] = xyz[:2]
            validate(d)
            z = xyz[2] if len(xyz) > 2 and math.isfinite(xyz[2]) else None
        except (ValueError, IndexError):
            d["lat"] = d["lon"] = z = None
            report["errors"].append(
                {"origin": origin, "error": "Coordonnées à corriger"}
            )
        d["published"] = initial and d["lat"] is not None
        key = insert(c, d, origin=origin)
        legacy = dict(
            legacyGoogleEarthPath=path,
            style=ref,
            icon=icon,
            color=color,
            altitudeKML=z,
            iconTintKML=tint,
            altitudeMode=e.findtext("{*}Point/{*}altitudeMode", "clampToGround"),
            descriptionHTML=desc,
            candidates=candidates,
            origin=origin,
        )
        c.execute("INSERT INTO legacy VALUES(?,?,?)", (num(key), digest, dump(legacy)))
        for field in ["name", "description", "sources", "images", "country"]:
            report["recovered" if d[field] else "missing"][field] += 1
        for field, value in [("icons", pic), ("colors", color), ("styles", ref)]:
            report[field][value] += 1
        if candidates:
            report["recovered"]["candidates"] += 1
        report["review"].append(key)
        report["inserted"] += 1

    # Store original bytes (including unknown extensions, styles and geometries).
    c.execute("INSERT INTO imports VALUES(?,?,?,?)", (digest, clock(), raw, "{}"))
    walk(root, [])
    # Conservatively recover associations explicitly encoded by the original author.
    folders = collections.defaultdict(list)
    for row in c.execute(
        "SELECT element_id,payload FROM legacy WHERE import_hash=?", (digest,)
    ):
        folders[tuple(json.loads(row[1])["legacyGoogleEarthPath"])].append(row[0])
    linked = 0
    for path, ids in folders.items():
        if (
            path
            and path[-1]
            in (
                "eddifices",
                "Cratères, Maars, cheminées",
                "éléments du complexe vulsini",
            )
            and len(folders.get(path[:-1], [])) == 1
        ):
            for i in ids:
                c.execute(
                    "UPDATE element SET parent=? WHERE id=?", (folders[path[:-1]][0], i)
                )
                linked += 1
    report["linkedChildren"] = linked
    report["carouselReferencesDocument"] = len(root.findall(".//{*}imageUrl"))
    report["carouselReferencesPlacemarks"] = sum(
        len(p.findall(".//{*}imageUrl")) for p in root.iterfind(".//{*}Placemark")
    )
    report["styleMapsDocument"] = len(root.findall(".//{*}StyleMap"))
    c.execute("UPDATE imports SET report=? WHERE hash=?", (dump(report), digest))
    return report


def export(c):
    dest = ROOT / "exports"
    dest.mkdir(exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".preparation-", dir=dest))
    data = stage / "data"
    atlas = data / "volcans"
    try:
        rows = [record(r) for r in c.execute("SELECT * FROM element ORDER BY id")]
        parents = {r["id"] for r in rows if r["published"] and not r["parent_id"]}
        rows = [
            r
            for r in rows
            if r["published"] and (r["id"] in parents or r["parent_id"] in parents)
        ]
        children = collections.defaultdict(list)
        for r in rows:
            if r["parent_id"]:
                children[r["parent_id"]].append(
                    {
                        k: r[k]
                        for k in (
                            "id",
                            "name",
                            "lon",
                            "lat",
                            "kind",
                            "status",
                            "incomplete",
                        )
                    }
                )
        for r in rows:
            obj = {k: r[k] for k in PUBLIC + ["id", "parent_id"]}
            for im in obj["images"]:
                url = im.get("url", "")
                if url.startswith("media/"):
                    (atlas / "media").mkdir(exist_ok=True, parents=True)
                    shutil.copyfile(ROOT / url, atlas / url)
            write(
                atlas / "fiches" / (r["id"] + ".json"),
                dict(obj, children=children[r["id"]]),
            )
        write(
            atlas / "index.json",
            [{k: r[k] for k in INDEX + ["id"]} for r in rows if not r["parent_id"]],
        )
        write(
            data / "projects.json",
            [
                dict(
                    slug="volcans",
                    schema="volcan-v1",
                    icon="volcan",
                    name="Volcans du monde",
                    description="Édifices, maars et complexes volcaniques de la collection.",
                    count=len(parents),
                    total=len(rows),
                )
            ],
        )
        final = dest / datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        stage.rename(final)
        return str(final / "data")
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def import_table(c, raw, filename):
    """Point GeoJSON or CSV. Preserve exact bytes, reject unsupported records explicitly."""
    import csv, io

    digest = hashlib.sha256(raw).hexdigest()
    prev = c.execute("SELECT report FROM imports WHERE hash=?", (digest,)).fetchone()
    if prev:
        return dict(json.loads(prev[0]), alreadyImported=True)
    txt = raw.decode("utf-8-sig")
    report = dict(
        file=Path(filename).name,
        detected=0,
        inserted=0,
        existing=0,
        errors=[],
        review=[],
        missing=collections.Counter(),
        recovered=collections.Counter(),
    )
    if filename.lower().endswith(".csv"):
        dialect = csv.Sniffer().sniff(txt[:8000], delimiters=",;\t")
        reader = csv.DictReader(io.StringIO(txt), dialect=dialect)
        entries = ((x, None) for x in reader)
    else:
        obj = json.loads(txt)
        features = (
            obj.get("features") if obj.get("type") == "FeatureCollection" else [obj]
        )
        entries = (
            (f.get("properties") or {}, f.get("geometry") or {}) for f in features
        )
    c.execute("INSERT INTO imports VALUES(?,?,?,?)", (digest, clock(), raw, "{}"))
    aliases = {
        "nom": "name",
        "longitude": "lon",
        "latitude": "lat",
        "pays": "country",
        "région": "region",
        "statut": "status",
        "activité": "status",
    }
    for line, (props, geometry) in enumerate(entries, 1):
        report["detected"] += 1
        try:
            if geometry is not None and geometry.get("type") != "Point":
                raise ValueError("Seuls les points sont pris en charge.")
            d = empty()
            for field, v in props.items():
                k = aliases.get(str(field).strip().lower(), str(field).strip())
                if k in TEXT:
                    d[k] = str(v or "")
                elif k in ARRAYS:
                    d[k] = (
                        v
                        if isinstance(v, list)
                        else [x.strip() for x in str(v or "").split("|") if x.strip()]
                    )
                elif k in ("lat", "lon", "altitude") and v not in ("", None):
                    d[k] = float(v)
                elif k in ("status", "kind") and v:
                    d[k] = v
                elif k in ("images", "sources") and isinstance(v, list):
                    d[k] = v
            if geometry is not None:
                coords = geometry["coordinates"]
                d["lon"], d["lat"] = map(float, coords[:2])
                if len(coords) > 2:
                    d["altitude"] = float(coords[2])
            key = insert(c, d, origin=digest + ":" + str(line))
            c.execute(
                "INSERT INTO legacy VALUES(?,?,?)",
                (
                    num(key),
                    digest,
                    dump(dict(file=filename, line=line, properties=props)),
                ),
            )
            for field in ("name", "lat", "lon", "country", "description"):
                report["missing" if d[field] in ("", None) else "recovered"][field] += 1
            report["inserted"] += 1
            report["review"].append(key)
        except (ValueError, IndexError, KeyError, TypeError) as err:
            report["errors"].append(dict(line=line, error=str(err)))
    c.execute("UPDATE imports SET report=? WHERE hash=?", (dump(report), digest))
    return report
