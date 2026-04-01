# Tests

This repository keeps all automated tests under `tests/`.

- `tests/unit/`: fast deterministic unit tests for core logic.
- `tests/e2e/`: Selenium-based browser tests, launch helpers, and e2e runner.
  Default smoke runs cover stable user-facing flows. Diagnostic tests remain available explicitly for projection and preview calibration work.

Repository utilities that are not tests stay under `scripts/`.
