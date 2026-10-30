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

// One thing a tool did to a file, for the history: when, which, what, how many lines, and by whom
// (an agent's id; none for the main conversation). Lines are counted from the tool's arguments.
export type Activity = { at: number; path: string; kind: 'read' | 'edit' | 'write'; added: number; removed: number; by?: string }

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
// model: the one it was started on (this session's when none was named).
// id: its session id, read off the start call's answer.
// active: whether it is at work, as the app's notes about it last said; unknown without an id.
export type Subchat = { title: string; at: number; model?: string; id?: string; active?: boolean }

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
// stage: the progress tool's stage a sub-step belongs to; a plain stage is its own.
export type Step = { id: string; title: string; status: StepStatus; startedAt?: number; endedAt?: number; stage?: string }
// idle: the main conversation's tool calls since Claude last touched the list, to see a step left hanging;
// nudged: Claude was reminded of it since.
export type Plan = { title: string; steps: Step[]; startedAt: number; idle?: number; nudged?: boolean }
// A plan Claude reports with cockpit's own progress tool (option planTool): one bar per id, a stage per step.
export type ToolPlan = Plan & { id: string }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      live: Live | null
      turns: Turn[]
      running: Running
      crew: Shaped<AgentRow[]>
      plan: Shaped<Plan | null>
      bars: ToolPlan[]
      hidden: Record<string, number>
      tick: number
      env: Shaped<Env | null>
      tally: Tally
      folded: string[]
      tab: string
      shells: Shell[]
      subchats: Subchat[]
      roster: AgentRow[]
      touches: Touch[]
      activity: Activity[]
      events: SessionEvent[]
      goals: Goal[]
      repoOpen: boolean
    }
  }
}
