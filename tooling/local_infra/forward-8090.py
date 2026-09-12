#!/usr/bin/env python3
"""TCP forwarder: this host's public IPv4:8090 -> the live operator proxy.

127.0.0.1:8090 stays with dynacat. This process binds only the public address
so the MacBook recipe CONATION_OPERATOR_ORIGIN=http://<THIS_SERVER_IP>:8090
reaches Conation. No secrets.
"""

from __future__ import annotations

import os
import select
import socket
import sys
import threading

LISTEN_IP = os.environ.get("CONATION_PUBLIC_IP", "173.212.222.197")
LISTEN_PORT = int(os.environ.get("CONATION_LAN_8090_PORT", "8090"))
TARGET_HOST = os.environ.get("CONATION_PROXY_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("CONATION_PROXY_PORT", "24009"))


def _pipe(left: socket.socket, right: socket.socket) -> None:
    try:
        while True:
            readable, _, _ = select.select([left, right], [], [], 120)
            if not readable:
                continue
            for src in readable:
                dst = right if src is left else left
                data = src.recv(65536)
                if not data:
                    return
                dst.sendall(data)
    except OSError:
        pass
    finally:
        for sock in (left, right):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass


def main() -> int:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind((LISTEN_IP, LISTEN_PORT))
    except OSError as err:
        print(f"forward-8090: bind {LISTEN_IP}:{LISTEN_PORT} failed: {err}", file=sys.stderr)
        return 1
    server.listen(128)
    print(
        f"forward-8090: {LISTEN_IP}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}",
        flush=True,
    )
    while True:
        client, _ = server.accept()
        try:
            upstream = socket.create_connection((TARGET_HOST, TARGET_PORT), timeout=10)
        except OSError as err:
            print(f"forward-8090: upstream failed: {err}", file=sys.stderr)
            client.close()
            continue
        threading.Thread(target=_pipe, args=(client, upstream), daemon=True).start()


if __name__ == "__main__":
    raise SystemExit(main())
