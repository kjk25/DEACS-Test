"""Run the real UI with an emulated Web Serial device in headless Chrome.

--file opens the generated standalone HTML directly via file://.
No serial devices are opened by this test.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import subprocess
import tempfile
import threading
import sys

ROOT=Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'data'),**kwargs)
    def log_message(self,*args):pass
    def do_POST(self):
        self.server.result=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200);self.send_header('Access-Control-Allow-Origin','*');self.end_headers();self.server.done.set()
    def do_GET(self):
        if self.path=='/':
            data=self.server.html.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
        else:super().do_GET()

def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.done=threading.Event()
    threading.Thread(target=server.serve_forever,daemon=True).start()
    report=f'http://127.0.0.1:{server.server_port}/result'
    fake=(ROOT/'tools/tests/web_serial_fake.js').read_text(encoding='utf-8')
    checks=(ROOT/'tools/tests/web_serial_checks.js').read_text(encoding='utf-8')
    source=ROOT/'data/usb.html' if '--file' in sys.argv else ROOT/'data/index.html'
    server.html=source.read_text(encoding='utf-8').replace('<head>','<head><script>window.serialReportURL='+json.dumps(report)+';'+fake+'\n'+checks+'</script>',1)
    browsers=[Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')]
    browser=next(p for p in browsers if p.exists())
    with tempfile.TemporaryDirectory(prefix='deacs-serial-',ignore_cleanup_errors=True) as directory:
        if '--file' in sys.argv:
            page=Path(directory)/'DEACS_USB_test.html';page.write_text(server.html,encoding='utf-8');url=page.as_uri()
        else:url=f'http://127.0.0.1:{server.server_port}/'
        process=subprocess.Popen([str(browser),'--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+str(Path(directory)/'profile'),url],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            if not server.done.wait(40):raise SystemExit('Browser produced no result')
            print(json.dumps(server.result,ensure_ascii=False,indent=2))
            if not server.result['ok']:raise SystemExit(1)
        finally:process.terminate();process.wait(timeout=10);server.shutdown();server.server_close()

if __name__=='__main__':run()
