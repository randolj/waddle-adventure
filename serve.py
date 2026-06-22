#!/usr/bin/env python3
"""Dev static server that DISABLES caching, so edited ES modules always reload.

Run from the repo root:
    python3 serve.py            # serves http://localhost:5577
    python3 serve.py 8080       # custom port

Why: plain `python3 -m http.server` sends no Cache-Control headers, so browsers
heuristically cache JS modules and keep serving STALE code after you edit files —
which shows up as a blank/blue screen (a module fails to load, the game never
boots). This server sends `Cache-Control: no-store` on every response, so a normal
reload always fetches the latest code. No hard-refresh needed.
"""
import http.server
import os
import socketserver
import sys

# Port: PORT env var (used by preview tooling) → CLI arg → default 5577.
PORT = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else "5577"))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Waddle's Quest dev server (no-cache) → http://localhost:{PORT}")
        print("Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
