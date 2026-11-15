"""Exercise the release archive, round trips and transactional edits in a temporary directory."""

import contextlib
import json
import os
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET


def run():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["BIBLIO_ATLAS_HOME"] = tmp
        from atlas import HERE, connect, export, get, import_kml, import_table, record
        from server import dispatch

        source = (HERE.parent / "archives/original.kml").read_bytes()
        points = ET.fromstring(source).findall(".//{*}Placemark")
        with contextlib.closing(connect()) as db:

            def op(cmd, **args):
                with db:
                    return dispatch(db, dict(cmd=cmd, **args))

            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert not db.execute("PRAGMA foreign_key_check").fetchall()
            assert db.execute("SELECT original FROM imports").fetchone()[0] == source
            rows = list(map(record, db.execute("SELECT * FROM element ORDER BY id")))
            assert len(rows) == len(points) == 699
            for p, r in zip(points, rows):
                coords = p.findtext("{*}Point/{*}coordinates").split(",")
                assert (r["lon"], r["lat"]) == tuple(map(float, coords[:2]))
                assert r["name"] == p.findtext("{*}name", "").strip()
            assert import_kml(db, source)["alreadyImported"]
            snapshot = Path(export(db))
            for f in (HERE.parent / "site/data").rglob("*.json"):
                assert (
                    snapshot / f.relative_to(HERE.parent / "site/data")
                ).read_bytes() == f.read_bytes()
            with db:
                rr = import_table(
                    db, "nom;latitude;longitude\nEssai;47;5\n".encode(), "test.csv"
                )
                assert rr["inserted"] == 1
                bad = import_table(
                    db,
                    b'{"type":"Feature","geometry":{"type":"Polygon","coordinates":[]},"properties":{}}',
                    "test.geojson",
                )
                assert bad["errors"] and bad["inserted"] == 0
            parent = op(
                "create", data={"name": "Essai", "lat": 45, "lon": 2, "published": True}
            )
            child = op(
                "create",
                parent=parent,
                data={"name": "Crater", "lat": 45.01, "lon": 2, "published": True},
            )
            copy = op("duplicate", id=parent)
            assert not get(db, copy)["published"]
            op(
                "bulk",
                ids=[parent, child],
                patch={
                    "country": "France",
                    "morphology": ["cône", "bouclier"],
                    "style": ["effusif"],
                    "context": ["point chaud"],
                },
            )
            try:
                op("bulk", ids=[parent, "VOL-999999"], patch={"country": "X"})
            except ValueError:
                pass
            else:
                raise AssertionError("Lot invalide accepté")
            assert get(db, parent)["country"] == "France"
            img = op(
                "media",
                raw="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXxkAAAAASUVORK5CYII=",
            )
            old = get(db, parent)["updated"]
            op(
                "save",
                id=parent,
                updated=old,
                data={
                    "images": [{"url": img, "credit": "Essai"}],
                    "notes": "note privée",
                },
            )
            try:
                op("save", id=parent, updated=old, data={"name": "périmé"})
            except ValueError:
                pass
            else:
                raise AssertionError("Écriture concurrente acceptée")
            atl = Path(op("export")) / "volcans"
            out = json.loads((atl / "fiches" / (parent + ".json")).read_text(encoding="utf-8"))
            assert (
                out["children"][0]["id"] == child
                and "notes" not in out
                and (atl / img).exists()
            )
            assert not (atl / "fiches" / (copy + ".json")).exists()
            op("bulk", ids=[parent], patch={"published": False})
            assert not (
                Path(op("export")) / "volcans/fiches" / (child + ".json")
            ).exists()
            try:
                op("delete", id=parent)
            except ValueError:
                pass
            else:
                raise AssertionError("Parent supprimé avec des enfants")
            op("delete", id=child)
            op("delete", id=parent)
            assert list((Path(tmp) / "sauvegardes").glob("*.sqlite"))
            print(
                "OK · 699 coordonnées et noms · intégrité SQLite · export complet · médias · liens parent-enfant · conflits et annulation de lot"
            )


if __name__ == "__main__":
    run()
