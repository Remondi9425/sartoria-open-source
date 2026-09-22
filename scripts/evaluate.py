#!/usr/bin/env python3
"""Compare every twin in out/ against the tape measurements in ground_truth.csv.

    python scripts/evaluate.py
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from spike import evaluate as E


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--truth", type=Path, default=Path("data/ground_truth.csv"))
    ap.add_argument("--twins", type=Path, default=Path("out"))
    ap.add_argument("--csv", type=Path, default=Path("out/results.csv"))
    a = ap.parse_args()

    truth = E.load_truth(a.truth)
    twins = E.load_twins(a.twins)
    if not truth:
        print(f"no ground truth rows in {a.truth} — fill it in after measuring "
              f"with a tape", file=sys.stderr)
        return 1
    results, summary = E.compare(truth, twins)
    if not results:
        print("no session appears in both the truth file and the twins folder",
              file=sys.stderr)
        return 1
    print(E.report(results, summary))
    E.write_csv(results, a.csv)
    print(f"\nwrote {a.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
