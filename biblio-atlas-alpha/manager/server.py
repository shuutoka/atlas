import argparse, base64, contextlib, hashlib, http.server, json, secrets, sys, threading, webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas import (
    HERE,
    ROOT,
    BULK,
    INDEX,
    backup,
    connect,
    dump,
    empty,
    export,
    get,
    import_kml,
    import_table,
    insert,
    num,
    record,
    save,
)


def dispatch(c, a):
    cmd = a["cmd"]
    if cmd == "list":
        return [
            {k: r[k] for k in INDEX + ["id", "parent_id", "published", "review"]}
            for r in map(record, c.execute("SELECT * FROM element ORDER BY id"))
        ]
    if cmd == "detail":
        r = get(c, a["id"])
        legacy = c.execute(
            "SELECT payload FROM legacy WHERE element_id=?", (num(a["id"]),)
        ).fetchone()
        return dict(r, legacy=json.loads(legacy[0]) if legacy else None)
    if cmd == "reports":
        return [
            json.loads(r[0])
            for r in c.execute("SELECT report FROM imports ORDER BY created DESC")
        ]
    if cmd == "export":
        return export(c)
    backup(c)
    c.execute("BEGIN IMMEDIATE")
    if cmd == "import":
        raw = base64.b64decode(a["raw"], validate=True)
        name = a.get("name", "import.kml")
        if name.lower().endswith((".geojson", ".json", ".csv")):
            return import_table(c, raw, name)
        return import_kml(c, raw)
    if cmd == "media":
        blob = base64.b64decode(a["raw"], validate=True)
        if blob.startswith(b"\x89PNG\r\n\x1a\n"):
            ext = "png"
        elif blob.startswith(b"\xff\xd8\xff"):
            ext = "jpg"
        elif blob[:6] in (b"GIF87a", b"GIF89a"):
            ext = "gif"
        elif blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
            ext = "webp"
        else:
            raise ValueError("Formats acceptés : PNG, JPEG, GIF, WebP.")
        directory = ROOT / "media"
        directory.mkdir(exist_ok=True)
        path = directory / (hashlib.sha256(blob).hexdigest() + "." + ext)
        path.write_bytes(blob)
        return "media/" + path.name
    if cmd == "create":
        return insert(
            c,
            dict(empty(), **{k: v for k, v in a["data"].items() if k in empty()}),
            a.get("parent"),
        )
    if cmd == "duplicate":
        r = get(c, a["id"])
        d = {k: r[k] for k in empty()}
        d.update(name=(r["name"] or r["id"]) + " (copie)", published=False)
        return insert(c, d, r["parent_id"])
    if cmd == "save":
        key = a["id"]
        parent = a.get("parent")
        if parent and (
            parent == key
            or get(c, parent)["parent_id"]
            or c.execute("SELECT 1 FROM element WHERE parent=?", (num(key),)).fetchone()
        ):
            raise ValueError("Parent incompatible avec la hiérarchie.")
        save(c, key, a["data"], a["updated"])
        c.execute(
            "UPDATE element SET parent=? WHERE id=?",
            (num(parent) if parent else None, num(key)),
        )
        return key
    if cmd == "delete":
        get(c, a["id"])
        if c.execute(
            "SELECT 1 FROM element WHERE parent=?", (num(a["id"]),)
        ).fetchone():
            raise ValueError("Détachez les sous-édifices avant la suppression.")
        c.execute("DELETE FROM element WHERE id=?", (num(a["id"]),))
        return True
    if cmd == "bulk":
        if not set(a["patch"]) <= BULK:
            raise ValueError("Champ non modifiable en lot.")
        for key in a["ids"]:
            save(c, key, a["patch"])
        return len(a["ids"])
    raise ValueError("Commande inconnue.")


class Local(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE / "ui"), **kwargs)

    def log_message(self, *args):
        pass

    def do_POST(self):
        if (
            self.path != "/api"
            or self.headers.get("Host") != self.server.host
            or not secrets.compare_digest(
                self.headers.get("X-Atlas-Key", ""), self.server.key
            )
        ):
            self.send_error(403)
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if not 0 < n <= 64 * 1024 * 1024:
                raise ValueError("Limite de transfert : 48 Mo.")
            a = json.loads(self.rfile.read(n))
            with self.server.lock, contextlib.closing(connect()) as c, c:
                result = dispatch(c, a)
            raw = dump({"value": result}).encode()
            self.send_response(200)
        except Exception as exc:
            raw = dump({"error": str(exc)}).encode()
            self.send_response(400)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def list_directory(self, path):
        self.send_error(404)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--shell", action="store_true")
    args = p.parse_args()
    with contextlib.closing(connect()) as c:
        backup(c)
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Local) as s:
        s.key = secrets.token_urlsafe(32)
        s.host = "127.0.0.1:" + str(s.server_port)
        s.lock = threading.Lock()
        url = "http://" + s.host + "/#" + s.key
        print(url, flush=True)
        if not args.shell:
            webbrowser.open(url)
        s.serve_forever()


if __name__ == "__main__":
    main()
