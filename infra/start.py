"""Start the three local services and terminate their process trees together."""

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]


def main():
    for port in (8000, 3000):
        with socket.socket() as sock:
            sock.settimeout(1)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                raise SystemExit(
                    f"Port {port} is already in use. Stop your previous server first."
                )
    os.environ["NEXT_TELEMETRY_DISABLED"] = "1"
    processes = []

    def stop(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        for cmd, cwd in [
            (
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    "8000",
                    "--no-access-log",
                ],
                root / "backend",
            ),
            ([sys.executable, "-m", "app.worker"], root / "backend"),
            (
                [
                    shutil.which("node"),
                    str(root / "frontend/node_modules/next/dist/bin/next"),
                    "dev",
                    "--hostname",
                    "0.0.0.0",
                    "--port",
                    "3000",
                ],
                root / "frontend",
            ),
        ]:
            processes.append(
                subprocess.Popen(
                    cmd, cwd=cwd, env=os.environ.copy(), start_new_session=True
                )
            )
        while all(proc.poll() is None for proc in processes):
            time.sleep(1)
        return next(
            (proc.returncode for proc in processes if proc.returncode is not None), 1
        )
    except KeyboardInterrupt:
        return 0
    finally:
        for proc in reversed(processes):
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)


if __name__ == "__main__":
    raise SystemExit(main())
