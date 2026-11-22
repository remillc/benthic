#!/usr/bin/env python3
# A local git http server for tests/run-bgit-test.sh: git's http-backend over the bare repositories under ROOT, with
# Basic authentication (any user, the password is TOKEN). Prints "PORT <n>" when it listens.
import base64, os, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT, TOKEN = sys.argv[1], sys.argv[2]
BACKEND = '/usr/lib/git-core/git-http-backend'

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def body(self):
        if self.headers.get('Transfer-Encoding', '').lower() == 'chunked':
            data = b''
            while True:
                size = int(self.rfile.readline().strip().split(b';')[0], 16)
                if size == 0:
                    self.rfile.readline()
                    return data
                data += self.rfile.read(size)
                self.rfile.readline()
        return self.rfile.read(int(self.headers.get('Content-Length') or 0))

    def handle_one(self):
        data = self.body()
        auth = self.headers.get('Authorization', '')
        ok = False
        if auth.startswith('Basic '):
            ok = base64.b64decode(auth[6:]).decode().split(':', 1)[-1] == TOKEN
        if not ok:
            self.send_response(401)
            self.send_header('WWW-Authenticate', 'Basic realm="git"')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        path, _, query = self.path.partition('?')
        env = dict(os.environ, GIT_PROJECT_ROOT=ROOT, GIT_HTTP_EXPORT_ALL='1', REQUEST_METHOD=self.command,
                   PATH_INFO=path, QUERY_STRING=query, CONTENT_TYPE=self.headers.get('Content-Type', ''),
                   CONTENT_LENGTH=str(len(data)), REMOTE_USER='test', REMOTE_ADDR='127.0.0.1',
                   HTTP_CONTENT_ENCODING=self.headers.get('Content-Encoding', ''),
                   GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.receivepack', GIT_CONFIG_VALUE_0='true')
        out = subprocess.run([BACKEND], input=data, env=env, capture_output=True).stdout
        sep = out.find(b'\r\n\r\n')
        step = 4
        if sep < 0:
            sep, step = out.find(b'\n\n'), 2
        status, headers = 200, []
        for line in out[:sep].decode().splitlines():
            k, _, v = line.partition(':')
            if k.lower() == 'status':
                status = int(v.split()[0])
            elif k:
                headers.append((k.strip(), v.strip()))
        payload = out[sep + step:]
        self.send_response(status)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET = do_POST = handle_one

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
print('PORT', server.server_address[1], flush=True)
server.serve_forever()
