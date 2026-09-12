# One-time developer edits. This file is not included in the product commit.
from pathlib import Path
p = Path('package.json')
s = p.read_text()
command = 'node scripts/apply-player-pool-comms-link.cjs && '
assert s.count(command) == 2
p.write_text(s.replace(command, ''))
Path('scripts/apply-player-pool-comms-link.cjs').unlink()
p = Path('tests/player-pool-response-check.test.ts')
s = p.read_text().replace('assert.equal(existsSync("scripts/apply-player-pool-nudge-history.cjs"), false);', 'assert.equal(existsSync("scripts/apply-player-pool-nudge-history.cjs"), false);\n  assert.equal(existsSync("scripts/apply-player-pool-comms-link.cjs"), false);\n  assert.doesNotMatch(readFileSync("package.json", "utf8"), /apply-player-pool-comms-link/);')
p.write_text(s)
