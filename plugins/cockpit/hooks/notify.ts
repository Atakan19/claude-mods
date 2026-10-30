import type { EngineInterface } from 'claude-code'

// A Windows notification, seen while the window is in the back; text and title go in
// through the environment, so a quote in them cannot end the command's string.
const WINDOWS_TOAST = [
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
  "$t = $x.GetElementsByTagName('text')",
  '$t.Item(0).AppendChild($x.CreateTextNode($env:COCKPIT_TITLE)) | Out-Null',
  '$t.Item(1).AppendChild($x.CreateTextNode($env:COCKPIT_TEXT)) | Out-Null',
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($x))",
].join('; ')

// The system's own notification: Windows through PowerShell, elsewhere the person's notification channel.
export function notify($: EngineInterface, title: string, text: string) {
  if (/^[A-Za-z]:/.test($.plugin.root)) {
    void $.process
      .run(['powershell', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_TOAST], {
        env: { COCKPIT_TITLE: title, COCKPIT_TEXT: text },
        timeoutMs: 8000,
      })
      .catch(() => undefined)
    return
  }
  void $.ui.notify(text, { title }).catch(() => undefined)
}
