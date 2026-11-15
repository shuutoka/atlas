"""Rebuild the release seed in a new empty output directory, without touching user data."""

import argparse, contextlib, os, shutil
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("kml", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    os.environ["BIBLIO_ATLAS_HOME"] = str(args.output.resolve())
    from atlas import connect, import_kml, write, export
    import sqlite3

    # Create the empty DB first to bypass the installed seed.
    sqlite3.connect(args.output / "atlas.sqlite").close()
    with contextlib.closing(connect()) as c, c:
        report = import_kml(c, args.kml.read_bytes(), initial=True)
        write(args.output / "rapport-import.json", report)
        shutil.copytree(export(c), args.output / "data")


if __name__ == "__main__":
    main()
