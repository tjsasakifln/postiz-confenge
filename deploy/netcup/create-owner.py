#!/usr/bin/env python3
"""Use the Postiz registration endpoint during private, initial bootstrap."""
import argparse
import json
import os
import secrets
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:18407/api/auth/"


def request(route, payload=None):
    req = urllib.request.Request(
        BASE + route,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "Content-Type": "application/json",
            "Host": "postiz.confenge.com.br",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Falha no endpoint {route}, HTTP {error.code}.") from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--organization", required=True)
    args = parser.parse_args()
    password_file = Path(__file__).resolve().parent / "private" / ".owner-bootstrap"
    os.umask(0o077)
    can_register = request("can-register")["register"]
    if not can_register and not password_file.exists():
        raise SystemExit("Uma organização já existe. Preserve seu titular.")
    if not password_file.exists():
        with password_file.open("x") as file:
            file.write(secrets.token_urlsafe(36) + "\n")
    credentials = {
        "provider": "LOCAL",
        "email": args.email.strip().lower(),
        "password": password_file.read_text().strip(),
    }
    if can_register:
        registered = request("register", {**credentials, "company": args.organization})
        if not registered.get("register"):
            raise SystemExit("O cadastro retornou um estado inesperado.")
    if not request("login", credentials).get("login"):
        raise SystemExit("O login do titular falhou.")
    if request("can-register")["register"]:
        raise SystemExit("O cadastro continua aberto.")
    print("Titular autenticado no loopback. Cadastro da aplicação fechado.")


if __name__ == "__main__":
    main()
