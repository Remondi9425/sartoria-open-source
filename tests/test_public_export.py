"""The release boundary must reject local data even if someone tracks it."""
from pathlib import Path

import pytest

from scripts.export_public import public_path


@pytest.mark.parametrize("name", [
    "private/video.MOV", "web/.env.production", "web/public/clip.MP4",
    "web/node_modules/package/index.js", "web/.next/server/app.js",
    "data/ground_truth.csv", "slides.pptx", "repository.bundle", ".git/config",
    "web/key.pem", "web/subdir/private/data.json",
])
def test_private_paths_are_excluded(name):
    assert not public_path(Path(name))


@pytest.mark.parametrize("name", [
    "README.md", "LICENSE", ".env.example", "web/.env.example",
    "spike/auth.py", "data/ground_truth.example.csv", "docs/release.md",
])
def test_public_sources_are_included(name):
    assert public_path(Path(name))
