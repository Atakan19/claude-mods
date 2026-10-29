export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Live = {
  ctxTokens: number
  ctxWindow: number
  ctxPercent: number
  costUsd: number
  limits: Limit[]
  model: string
  lastRequestAt: number
}

export type Turn = {
  answer: string
  seconds: number
  tools: number
  ctxDelta: number
  costDelta: number
  cacheHit: number
}

export type Running = { tools: number; agents: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      live: Live | null
      turns: Turn[]
      running: Running
      tick: number
    }
  }
}
