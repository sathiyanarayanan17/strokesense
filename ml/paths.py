"""Where the (large, non-redistributable) TORGO data lives.

Kept OUTSIDE the repository so the Next.js build never scans 18 GB of audio.
Override with the STROKESENSE_DATA environment variable.
"""
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("STROKESENSE_DATA", REPO.parent / "strokesense-data"))
TORGO = DATA / "torgo"
FEATURES_CSV = DATA / "features.csv"
