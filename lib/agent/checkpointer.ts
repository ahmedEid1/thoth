import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "@/lib/env";

let _saver: PostgresSaver | null = null;
let _setupDone = false;

/**
 * Returns a process-wide singleton {@link PostgresSaver} used as the LangGraph
 * checkpointer. The saver is created from `env.DATABASE_URL` and `.setup()` is
 * awaited on first call so the checkpoint tables exist before the graph runs.
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (_saver && _setupDone) return _saver;
  _saver = PostgresSaver.fromConnString(env.DATABASE_URL);
  await _saver.setup();
  _setupDone = true;
  return _saver;
}

/** Test-only hook: drops the cached saver so a fresh one is built on the next call. */
export function _resetCheckpointerForTest(): void {
  _saver = null;
  _setupDone = false;
}
