# StrokeSense scoring engine in Python

A line-for-line port of the TypeScript scoring engine in `src/lib/scoring/`. Use it for offline analysis,
threshold calibration on recorded landmark data, and as a cross-check of the browser implementation.

Modules: `face`, `arm`, `balance`, `gaze`, `speech`, `reported` and `risk`. Thresholds, units and wording
match the TypeScript code. Landmark inputs are objects with `x`, `y` and optional `visibility`
(`strokesense.mathutil.Point` works).

```bash
cd python
python -m venv .venv && .venv\Scripts\activate    # Windows; use source .venv/bin/activate elsewhere
pip install -e ".[dev]"
python -m pytest
```

The tests mirror the vitest suites. `tests/test_parity.py` also replays 22 recorded inputs and checks the output matches the TypeScript engine (summary text, findings, metrics to 9 decimals). After an intentional change to the TypeScript scoring, run `npm run parity:update` in the repo root, then port the change.
