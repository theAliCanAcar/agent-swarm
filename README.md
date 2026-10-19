# Agent Swarm

Hive-mind orchestration: multi-agent debates, tournaments, routers, and quorum consensus over any agent-like workers.

TypeScript package `agent-swarm`.

## Install

```sh
npm install github:theAliCanAcar/agent-swarm#main
```

## How to use

```ts
import * as swarm from 'agent-swarm';
console.log(Object.keys(swarm));
```

## Use cases

### 1. Debate multiple worker agents

- **Scenario:** One agent’s answer is unreliable alone.
- **Outcome:** Run a debate/tournament and take quorum consensus.

### 2. Route tasks to specialists

- **Scenario:** Different skills should handle different jobs.
- **Outcome:** Use a router over agent-like workers.

## Dependencies

- `agent-tools`: `github:theAliCanAcar/agent-tools#main`

## Scripts

```sh
npm install
npm run build
```

## Notes

- Keep API keys in environment variables or a gitignored `.env`. Never commit secrets.
- Side-effecting tools should go through approval when used with `agent-approval`.
- Related packages live in separate repositories under [theAliCanAcar](https://github.com/theAliCanAcar).

## License

MIT
