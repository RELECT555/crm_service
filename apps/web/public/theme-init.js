// Applies the saved theme before first paint (external file: the API serves the UI with a strict CSP).
(function () {
  var theme = 'system'
  try { theme = localStorage.getItem('crm-theme') || 'system' } catch { /* storage blocked */ }
  var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()
