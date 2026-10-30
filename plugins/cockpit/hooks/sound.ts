import type { EngineInterface } from 'claude-code'

// The sounds and the way they play come from zycck's plan-progress (MIT, see NOTICE):
// the engine's player first, PowerShell on Windows, where the engine's player can stay silent.
export function play($: EngineInterface, name: 'decision' | 'error' | 'done') {
  const file = `${$.plugin.root}/sounds/${name}.wav`.replace(/\//g, '\\')
  // The path goes in through the environment: a quote in it would end the command's string.
  const viaPowerShell = () =>
    $.process
      .run(['powershell', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '(New-Object Media.SoundPlayer $env:COCKPIT_WAV).PlaySync()'], {
        env: { COCKPIT_WAV: file },
        timeoutMs: 5000,
      })
      .catch(() => undefined)
  if (/^[A-Za-z]:/.test($.plugin.root)) {
    void viaPowerShell()
    return
  }
  void $.audio.play({ asset: `sounds/${name}.wav` }).catch(viaPowerShell)
}
