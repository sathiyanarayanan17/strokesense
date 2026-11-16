// Regenerates python/tests/parity.fixture.json from the TypeScript engine (cross-platform env var).
import { spawnSync } from "node:child_process";
const r = spawnSync("npx vitest run src/lib/scoring/parity.test.ts", { stdio: "inherit", shell: true, env: { ...process.env, UPDATE_PARITY: "1" } });
process.exit(r.status ?? 1);
