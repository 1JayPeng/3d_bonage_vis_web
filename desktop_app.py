#!/usr/bin/env python3
"""Desktop wrapper for the DICOM visualizer.

Run this file to start a local static server and open the app in a desktop window.
"""

from __future__ import annotations

import contextlib
import http.server
import os
import socket
import socketserver
import sys
import threading
from pathlib import Path


APP_HOST = "127.0.0.1"
APP_TITLE = "DICOM 3D Visualizer"


def _find_free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind((APP_HOST, 0))
        return int(sock.getsockname()[1])


class _StaticServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def _start_http_server(root_dir: Path, port: int) -> _StaticServer:
    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(
        *args,
        directory=str(root_dir),
        **kwargs,
    )
    server: _StaticServer = _StaticServer((APP_HOST, port), handler)
    thread = threading.Thread(target=server.serve_forever, name="dicom-web-server", daemon=True)
    thread.start()
    return server


def main() -> int:
    root_dir = Path(__file__).resolve().parent
    index_file = root_dir / "index.html"
    if not index_file.exists():
        print(f"[error] index.html not found: {index_file}", file=sys.stderr)
        return 1

    try:
        import webview
    except Exception as exc:  # pragma: no cover
        print("[error] pywebview is required. Install with: pip install pywebview", file=sys.stderr)
        print(f"[error] details: {exc}", file=sys.stderr)
        return 2

    port = _find_free_port()
    server = _start_http_server(root_dir, port)

    url = f"http://{APP_HOST}:{port}/index.html"
    try:
        webview.create_window(APP_TITLE, url=url, width=1440, height=900)
        webview.start()
    finally:
        server.shutdown()
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
