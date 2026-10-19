/**
 * agent-swarm: hive-mind orchestration over any agent-like worker. Debate,
 * tournament, router, and quorum consensus — because one LLM is a guess,
 * five LLMs arguing is a committee, and a committee is basically science.
 *
 *   const answer = await debate(question, [optimist, pessimist, cynic], judge);
 */
import { failure, type ToolResult } from "agent-tools";

/** Anything that can take a task and answer: an Agent, a Tool, or a function. */
export type Worker = {
  name: string;
  run(task: string, ctx?: Record<string, unknown>): Promise<unknown> | unknown;
};

export type Judge = (args: {
  task: string;
  answers: Array<{ worker: string; answer: unknown }>;
}) => Promise<unknown> | unknown;

export function workerFromFn(name: string, fn: (task: string) => Promise<unknown> | unknown): Worker {
  return { name, run: (task) => fn(task) };
}

export type DebateResult = {
  winner: string;
  verdict: unknown;
  answers: Array<{ worker: string; answer: unknown }>;
  rounds: number;
};

/**
 * Multi-round debate: everyone answers, the judge crowns a winner, losers get
 * one shot to rebut, judge decides again. Returns the final verdict.
 */
export async function debate(
  task: string,
  workers: Worker[],
  judge: Judge,
  options: { rounds?: number; ctx?: Record<string, unknown> } = {}
): Promise<DebateResult> {
  const rounds = Math.max(1, options.rounds ?? 1);
  let answers = await Promise.all(
    workers.map(async (w) => ({ worker: w.name, answer: await w.run(task, options.ctx) }))
  );
  let verdict = await judge({ task, answers });
  let winner = String((verdict as { winner?: unknown })?.winner ?? answers[0]?.worker ?? "");

  for (let round = 2; round <= rounds; round++) {
    const rebuttalTask = `${task}\n\nThe current leading answer is from "${winner}": ${safe(verdict)}. Improve on it.`;
    answers = await Promise.all(workers.map(async (w) => ({ worker: w.name, answer: await w.run(rebuttalTask, options.ctx) })));
    verdict = await judge({ task: rebuttalTask, answers });
    winner = String((verdict as { winner?: unknown })?.winner ?? winner);
  }

  return { winner, verdict, answers, rounds };
}

export type TournamentResult = {
  champion: string;
  brackets: Array<{ matchup: string; winner: string }>;
};

/**
 * Single-elimination tournament: workers face off pairwise, the judge picks
 * each matchup winner until one agent reigns supreme.
 */
export async function tournament(
  task: string,
  workers: Worker[],
  judge: Judge,
  options: { ctx?: Record<string, unknown> } = {}
): Promise<TournamentResult> {
  if (workers.length === 0) throw new Error("tournament() needs at least one worker.");
  const brackets: Array<{ matchup: string; winner: string }> = [];
  let pool = [...workers];

  while (pool.length > 1) {
    const next: Worker[] = [];
    for (let i = 0; i < pool.length; i += 2) {
      const a = pool[i];
      const b = pool[i + 1];
      if (!b) {
        next.push(a); // bye round
        continue;
      }
      const answers = await Promise.all([
        (async () => ({ worker: a.name, answer: await a.run(task, options.ctx) }))(),
        (async () => ({ worker: b.name, answer: await b.run(task, options.ctx) }))(),
      ]);
      const verdict = (await judge({ task, answers })) as { winner?: unknown };
      const winnerName = String(verdict?.winner ?? a.name);
      const winnerWorker = answers.find((x) => x.worker === winnerName) ? pool.find((w) => w.name === winnerName)! : a;
      brackets.push({ matchup: `${a.name} vs ${b.name}`, winner: winnerWorker.name });
      next.push(winnerWorker);
    }
    pool = next;
  }

  return { champion: pool[0].name, brackets };
}

/**
 * Router: a classifier picks exactly one worker for the task.
 */
export async function route(
  task: string,
  workers: Worker[],
  classify: (task: string) => Promise<string> | string,
  options: { ctx?: Record<string, unknown> } = {}
): Promise<ToolResult<unknown>> {
  const name = await classify(task);
  const chosen = workers.find((w) => w.name === name);
  if (!chosen) {
    return failure("ROUTE_MISS", `Router picked unknown worker "${name}".`, { retryable: false });
  }
  return (await chosen.run(task, options.ctx)) as ToolResult<unknown>;
}

export type QuorumResult = {
  consensus: unknown;
  tally: Array<{ answer: string; votes: number; voters: string[] }>;
  agreed: boolean;
};

/**
 * Quorum consensus: everyone answers, duplicates count as votes, majority
 * (or plurality above threshold) wins. Great for fact-checking swarms.
 */
export async function quorum(
  task: string,
  workers: Worker[],
  options: { threshold?: number; ctx?: Record<string, unknown> } = {}
): Promise<QuorumResult> {
  const threshold = options.threshold ?? 0.5;
  const answers = await Promise.all(
    workers.map(async (w) => ({ worker: w.name, answer: await w.run(task, options.ctx) }))
  );
  const groups = new Map<string, { votes: number; voters: string[]; answer: unknown }>();
  for (const { worker, answer } of answers) {
    const key = JSON.stringify(answer ?? null);
    const group = groups.get(key) ?? { votes: 0, voters: [], answer };
    group.votes += 1;
    group.voters.push(worker);
    groups.set(key, group);
  }
  const tally = [...groups.values()]
    .map((g) => ({ answer: JSON.stringify(g.answer ?? null), votes: g.votes, voters: g.voters }))
    .sort((a, b) => b.votes - a.votes);
  const top = [...groups.values()].sort((a, b) => b.votes - a.votes)[0];
  const share = workers.length ? top.votes / workers.length : 0;
  return {
    consensus: top.answer,
    tally,
    agreed: share > threshold,
  };
}

/** Best-effort stringify for building rebuttal prompts. */
function safe(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}