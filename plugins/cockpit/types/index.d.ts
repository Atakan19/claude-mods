export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Live = {
  ctxTokens: number
  ctxWindow: number
  ctxPercent: number
  costUsd: number
  limits: Limit[]
  model: string
  lastRequestAt: number
  effort?: string
  // What fills the context, as /context lists it: used rows only, largest first.
  ctxParts?: { name: string; tokens: number }[]
}

// Where the session runs: the folder, the repository and its branch, how far it is from the main branch, files changed.
export type Env = {
  folder: string
  repo: string
  branch: string
  isGithub: boolean
  base: string
  ahead: number
  behind: number
  changed: number
  added: number
  removed: number
  // The last commits, newest first.
  commits: { hash: string; subject: string; age: string; files: number; added: number; removed: number }[]
  // Commits not yet on the upstream branch; null without one.
  unpushed: number | null
  // Files changed against HEAD, paths from the repository's root.
  files: GitFile[]
}
export type GitFile = { path: string; status: 'M' | 'A' | 'D' | 'R' | '?'; added: number; removed: number }

// A file this session read or changed, from the tools' arguments only.
export type Touch = { path: string; kind: 'read' | 'edit'; count: number; at: number }

// Something that happened between turns: a compaction or a change of model.
export type SessionEvent = { at: number; kind: 'compact' | 'model'; note: string }

// A goal set with /goal or proposed by Claude; the engine does not say when one is reached.
export type Goal = { condition: string; at: number; by: 'you' | 'claude'; endedAt: number | null }

// The whole session, past the 50 turns kept.
export type Tally = { turns: number; tools: number; since: number | null }

// A shell command Claude left running in the background.
export type Shell = { id: string; title: string; startedAt: number; endedAt: number | null }

// A session the desktop app started from this one.
export type Subchat = { title: string; at: number }

export type Turn = {
  at: number
  // The prompt's opening, for the history.
  prompt?: string
  answer: string
  seconds: number
  tools: number
  ctxDelta: number
  costDelta: number
  cacheHit: number
}

export type Running = { tools: number; agents: number }

// A subagent of this session, as its strip shows it; finished ones stay until the batch folds.
export type AgentRow = {
  id: string
  description: string
  type: string
  state: 'running' | 'waiting' | 'done' | 'error'
  tool: string
  startedAt: number
  endedAt: number | null
  model?: string
  effort?: string
  // Tool calls the agent made so far.
  tools?: number
  // The opening of the prompt it was given.
  task?: string
}

// Claude's own task list (TaskCreate/TaskUpdate or TodoWrite), mirrored as a plan.
export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type Step = { id: string; title: string; status: StepStatus; startedAt?: number; endedAt?: number }
export type Plan = { title: string; steps: Step[]; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      live: Live | null
      turns: Turn[]
      running: Running
      crew: Shaped<AgentRow[]>
      plan: Shaped<Plan | null>
      tick: number
      env: Shaped<Env | null>
      tally: Tally
      folded: string[]
      tab: string
      shells: Shell[]
      subchats: Subchat[]
      roster: AgentRow[]
      touches: Touch[]
      events: SessionEvent[]
      goals: Goal[]
      repoOpen: boolean
    }
  }
}
