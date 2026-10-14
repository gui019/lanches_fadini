"""Binary-safe local backup and optional isolated restore verification (also works in PowerShell)."""

import argparse
import os
import secrets
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def docker(*args, **kwargs):
    return subprocess.run(
        ["docker", "compose", "exec", "-T", "db", *args], cwd=ROOT, check=True, **kwargs
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    directory = ROOT / "backups"
    directory.mkdir(mode=0o700, exist_ok=True)
    target = directory / (
        "carbons-"
        + datetime.now().strftime("%Y%m%d-%H%M%S")
        + "-"
        + secrets.token_hex(3)
        + ".dump"
    )
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as file:
        docker("pg_dump", "-U", "carbons", "-Fc", "carbons", stdout=file)
    print(
        f"Backup local salvo em {target.relative_to(ROOT)}. Não envie esse arquivo ao GitHub."
    )
    if args.verify:
        name = "carbons_restore_" + secrets.token_hex(6)
        docker("createdb", "-U", "carbons", name)
        try:
            with target.open("rb") as file:
                docker(
                    "pg_restore",
                    "-U",
                    "carbons",
                    "--no-owner",
                    "--exit-on-error",
                    "-d",
                    name,
                    stdin=file,
                )
            counts = []
            for db in ["carbons", name]:
                result = docker(
                    "psql",
                    "-U",
                    "carbons",
                    "-d",
                    db,
                    "-Atc",
                    "SELECT (SELECT count(*) FROM products), (SELECT count(*) FROM orders)",
                    capture_output=True,
                    text=True,
                )
                counts.append(result.stdout.strip())
            if counts[0] != counts[1]:
                raise RuntimeError(
                    "As contagens do backup não conferem; investigue antes de usar."
                )
            print(
                "Restauração em banco isolado verificada; contagens de produtos e pedidos conferem."
            )
        finally:
            docker("dropdb", "-U", "carbons", name)


if __name__ == "__main__":
    main()
