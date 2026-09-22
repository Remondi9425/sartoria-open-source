#!/usr/bin/env python3
"""Export an allowlisted source snapshot without history or private files.

Usage: python scripts/export_public.py /absolute/path/to/new-snapshot
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT_FILES = {
    ".env.example", ".gitignore", ".nvmrc", ".python-version",
    "README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md", "PRIVACY.md",
    "THIRD_PARTY_NOTICES.md", "pyproject.toml", "uv.lock", "modal_app.py",
    "requirements-runtime.txt",
}
SOURCE_DIRS = {"spike", "tests", "scripts", "docs", "mockups", "web", ".github"}
BLOCKED_DIRS = {"node_modules", ".next", ".git", ".venv", "__pycache__",
                ".pytest_cache", "private", "tmp", "out", ".vercel"}
BLOCKED_SUFFIXES = {".mov", ".mp4", ".m4v", ".webm", ".avi", ".pptx",
                    ".pem", ".key", ".pyc", ".tsbuildinfo"}


def public_path(path: Path) -> bool:
    if any(part in BLOCKED_DIRS for part in path.parts):
        return False
    if path.suffix.lower() in BLOCKED_SUFFIXES:
        return False
    if path.name.startswith(".env") and path.name != ".env.example":
        return False
    if path.as_posix() == "data/ground_truth.example.csv":
        return True
    return (len(path.parts) == 1 and path.name in ROOT_FILES
            or path.parts[0] in SOURCE_DIRS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    destination = args.destination.resolve()
    manifest = destination.with_name(destination.name + ".manifest.json")
    if destination == root or root in destination.parents:
        parser.error("destination must be outside the source repository")
    if destination.exists() or manifest.exists():
        parser.error("destination and manifest must not already exist")
    names = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=root,
    ).decode().split("\0")
    paths = []
    for name in sorted(set(names) - {""}):
        relative = Path(name)
        if not public_path(relative):
            continue
        source = root / relative
        if source.is_symlink() or any(p.is_symlink() for p in source.parents if p != root):
            parser.error(f"symlinks are not allowed in the export: {name}")
        if source.is_file():
            paths.append(relative)
    if Path("LICENSE") not in paths or Path("README.md") not in paths:
        parser.error("LICENSE and README.md must be present")
    destination.mkdir(parents=True)
    digests = {}
    for relative in paths:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / relative, target)
        digests[relative.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest.write_text(json.dumps({"sha256": digests}, indent=2) + "\n")
    print(f"Exported {len(paths)} files to {destination}")
    print(f"SHA-256 manifest: {manifest}")


if __name__ == "__main__":
    main()
