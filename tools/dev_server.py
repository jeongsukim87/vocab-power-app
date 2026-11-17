"""내 컴퓨터에서 앱을 미리 보는 아주 작은 웹서버 (캐시를 끄고 서비스한다).
사용:  python tools/dev_server.py [포트]     →  http://127.0.0.1:8765/docs/index.html
"""
import http.server
import socketserver
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as srv:
    print(f"http://127.0.0.1:{PORT}/docs/index.html  (끄려면 Ctrl+C)")
    srv.serve_forever()
