#!/usr/bin/env python3
"""Verify or fetch official NASA/JPL NAIF SPICE kernels listed in KERNEL_MANIFEST.json."""

import hashlib
import json
import os
import sys
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KERNELS_DIR = os.environ.get("SPICE_KERNELS_DIR", os.path.join(ROOT_DIR, "kernels"))
MANIFEST_PATH = os.path.join(KERNELS_DIR, "KERNEL_MANIFEST.json")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    os.makedirs(KERNELS_DIR, exist_ok=True)
    if not os.path.exists(MANIFEST_PATH):
        print(f"Missing manifest: {MANIFEST_PATH}", file=sys.stderr)
        return 1

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    for entry in manifest:
        filename = entry["filename"]
        dest = os.path.join(KERNELS_DIR, filename)
        expected_hash = entry["sha256"]
        url = entry["url"]

        if os.path.exists(dest) and sha256_file(dest) == expected_hash:
            print(f"[ok] {filename} verified ({os.path.getsize(dest)} bytes)")
            continue

        print(f"[fetch] {filename} <- {url}")
        tmp = dest + ".tmp"
        urllib.request.urlretrieve(url, tmp)
        actual_hash = sha256_file(tmp)
        if actual_hash != expected_hash:
            os.remove(tmp)
            print(
                f"[error] SHA256 mismatch for {filename}: expected {expected_hash}, got {actual_hash}",
                file=sys.stderr,
            )
            return 1
        os.replace(tmp, dest)
        print(f"[ok] {filename} downloaded and verified ({os.path.getsize(dest)} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
