import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";

const REGRESSION_THRESHOLD = 0.1; // 10% drop fails CI

type ResultsFile = {
  commitSha: string;
  rows: Array<{ goldenId: string; metric: string; score: number }>;
};

async function main(): Promise<void> {
  const raw = await readFile("eval-results.json", "utf8");
  const current: ResultsFile = JSON.parse(raw);
  console.log(`→ Checking ${current.rows.length} new metrics for regressions vs the last baseline...`);

  let failures = 0;
  for (const row of current.rows) {
    // Last main-branch result for this (goldenId, metric) before the current commit
    const baseline = await db.evalRun.findFirst({
      where: { goldenId: row.goldenId, metric: row.metric, NOT: { commitSha: current.commitSha } },
      orderBy: { createdAt: "desc" },
    });
    if (!baseline) {
      console.log(`  ${row.goldenId}/${row.metric}: new — no baseline yet (current=${row.score.toFixed(2)})`);
      continue;
    }
    const drop = baseline.score - row.score;
    const pctDrop = baseline.score === 0 ? 0 : drop / baseline.score;
    if (pctDrop > REGRESSION_THRESHOLD) {
      console.log(`  ✗ ${row.goldenId}/${row.metric}: ${baseline.score.toFixed(2)} → ${row.score.toFixed(2)} (drop ${(pctDrop * 100).toFixed(0)}%)`);
      failures++;
    } else {
      console.log(`  ✓ ${row.goldenId}/${row.metric}: ${baseline.score.toFixed(2)} → ${row.score.toFixed(2)}`);
    }
  }

  await db.$disconnect();
  if (failures > 0) {
    console.error(`\n✗ ${failures} metric(s) regressed by more than ${REGRESSION_THRESHOLD * 100}%`);
    process.exit(1);
  }
  console.log("\n✓ No regressions");
}

main().catch((err) => {
  console.error("✗ Regression check crashed:", err);
  process.exit(1);
});
