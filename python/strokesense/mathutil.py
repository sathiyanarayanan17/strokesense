"""Small numeric helpers used by the scoring engine (port of src/lib/math.ts)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol, Sequence


class HasXY(Protocol):
    x: float
    y: float


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float
    visibility: float = 1.0


def sub(a: HasXY, b: HasXY) -> Point:
    return Point(a.x - b.x, a.y - b.y)


def dot(a: HasXY, b: HasXY) -> float:
    return a.x * b.x + a.y * b.y


def norm(a: HasXY) -> float:
    return math.hypot(a.x, a.y)


def dist(a: HasXY, b: HasXY) -> float:
    return norm(sub(a, b))


def normalize(a: HasXY) -> Point:
    n = norm(a)
    return Point(0.0, 0.0) if n == 0 else Point(a.x / n, a.y / n)


def mid(a: HasXY, b: HasXY) -> Point:
    return Point((a.x + b.x) / 2, (a.y + b.y) / 2)


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return min(hi, max(lo, v))


def percentile(values: Sequence[float], p: float) -> float:
    """Linear-interpolation percentile (0..100). NaN for empty input."""
    if not values:
        return math.nan
    s = sorted(values)
    idx = clamp(p, 0, 100) / 100 * (len(s) - 1)
    lo, hi = math.floor(idx), math.ceil(idx)
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)


def median(values: Sequence[float]) -> float:
    return percentile(values, 50)


def slope(xs: Sequence[float], ys: Sequence[float]) -> float:
    """Ordinary least-squares slope of y over x; 0 if x has no variance."""
    n = min(len(xs), len(ys))
    if n < 2:
        return 0.0
    mx = sum(xs[:n]) / n
    my = sum(ys[:n]) / n
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n))
    return 0.0 if den == 0 else num / den


def rnd(v: float, digits: int = 3) -> float:
    """Round half away from zero, like JavaScript's Math.round on scaled values."""
    f = 10**digits
    return math.floor(v * f + 0.5) / f


def round_int(v: float) -> int:
    """Round half up to an int, like JavaScript's Math.round."""
    return int(math.floor(v + 0.5))
