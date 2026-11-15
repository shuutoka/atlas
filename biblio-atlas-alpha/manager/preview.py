import http.server, webbrowser

with http.server.ThreadingHTTPServer(
    ("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler
) as s:
    url = f"http://127.0.0.1:{s.server_port}/"
    print(url, flush=True)
    webbrowser.open(url)
    s.serve_forever()
