"""What is allowed to reach a GPU.

An unknown extension was renamed .mp4 and sent anyway, so the admission policy
was really "anything under 80 MB".
"""
import pytest

from spike.serve import sniff_container

MP4 = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 64
MOV = b"\x00\x00\x00\x14ftypqt  " + b"\x00" * 64
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
AVI = b"RIFF\x00\x00\x00\x00AVI LIST" + b"\x00" * 64


@pytest.mark.parametrize("data,expected", [
    (MP4, ".mp4"), (MOV, ".mp4"), (WEBM, ".webm"), (AVI, ".avi"),
])
def test_real_containers_are_recognised(data, expected):
    assert sniff_container(data) == expected


@pytest.mark.parametrize("data", [
    b"", b"not a video at all", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
    b"%PDF-1.7" + b"\x00" * 64, b"PK\x03\x04" + b"\x00" * 64,
    b"\x7fELF" + b"\x00" * 64, b"\x00" * 128,
])
def test_anything_else_is_refused(data):
    assert sniff_container(data) is None


def test_a_video_name_on_other_bytes_does_not_help():
    """The name is never consulted — this is the case that used to pass."""
    assert sniff_container(b"#!/bin/sh\nrm -rf /\n" + b"\x00" * 64) is None


# ── the decode gate ─────────────────────────────────────────────────────────
def test_forged_headers_do_not_reach_the_gpu(tmp_path):
    """Twelve bytes of header are cheap to fake and prove nothing. What costs
    money is a GPU container spinning up on data that was never a video."""
    from spike.serve import decodes_to_a_frame
    forged = MP4 + b"\x00" * 4096
    assert sniff_container(forged) == ".mp4", "the header passes the sniff"
    assert decodes_to_a_frame(forged, ".mp4") is False, "but nothing decodes"


def test_a_synthetic_clip_decodes(tmp_path):
    import cv2
    import numpy as np
    from spike.serve import decodes_to_a_frame

    path = tmp_path / "synthetic.avi"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10, (64, 64))
    assert writer.isOpened()
    try:
        for _ in range(10):
            writer.write(np.zeros((64, 64, 3), dtype=np.uint8))
    finally:
        writer.release()
    assert decodes_to_a_frame(path.read_bytes(), ".avi") is True
