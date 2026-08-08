/**
 * A four-function test reporter.
 *
 * Deliberately dependency-free: `npm test` must run on a clean checkout with no
 * install step and no watch-mode daemon, so a nurse-facing bug fix can be
 * verified in two seconds on any machine. If this suite ever needs fixtures,
 * parallelism or coverage, swap in a real runner — until then this earns its keep.
 */

let passed = 0;
let failed = 0;
const failures = [];

/** Section heading in the output. */
function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** Assert `condition`; `detail` is only printed when it fails. */
function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    const printable = typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.log(`  FAIL  ${label}   <<< ${String(printable).slice(0, 300)}`);
  }
}

/** Print the summary and exit non-zero if anything failed (so CI/hooks catch it). */
function report() {
  const total = passed + failed;
  if (failed === 0) {
    console.log(`\nALL ${total} CHECKS PASSED`);
    process.exit(0);
  }
  console.log(`\n${failed} of ${total} CHECKS FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}

module.exports = { section, check, report };
