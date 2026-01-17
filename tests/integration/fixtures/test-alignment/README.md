# Test Alignment Fixtures

These fixtures are used to test the review agent's ability to detect test-implementation alignment issues.

## Fixtures

### async-mismatch/
Production code is async, but test expects sync behavior (missing `await`).
This simulates a common misalignment scenario where the implementation changed from sync to async but the test wasn't updated.

### correct-alignment/
Production code is async and test correctly uses `await`.
This is the control case - should pass review without test_alignment issues.

### no-tests/
Production code exists but no test files are present.
This tests the "no tests found" edge case - should be blocked by the review agent.

## Usage

These fixtures are imported by `tests/integration/review-test-alignment.test.ts` to test the full review flow with different test alignment scenarios.
