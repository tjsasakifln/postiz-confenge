#!/usr/bin/env python3
"""Update the private Studio environment from standard input."""
import os
import re
import sys
import tempfile
from pathlib import Path


def main():
    key = sys.stdin.read(512).strip()
    if not re.fullmatch(r"sk-[A-Za-z0-9_-]{12,500}", key):
        sys.exit("Formato inválido para OPENAI_API_KEY.")

    env_file = Path(__file__).resolve().parent / "private" / "studio.env"
    lines = env_file.read_text().splitlines()
    with tempfile.NamedTemporaryFile(
        mode="w", dir=env_file.parent, prefix=".studio.", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
        try:
            for line in lines:
                if not line.startswith("OPENAI_API_KEY="):
                    temporary.write(line + "\n")
            temporary.write("OPENAI_API_KEY=" + key + "\n")
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path.replace(env_file)
        finally:
            temporary_path.unlink(missing_ok=True)
    print("OPENAI_API_KEY gravada no ambiente privado.")


if __name__ == "__main__":
    main()
