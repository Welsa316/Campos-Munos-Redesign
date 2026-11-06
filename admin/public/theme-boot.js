// Paints the last theme's background and colour scheme before the stylesheet
// and the app load, so a dark theme does not flash white on every load.
// Written by applyTheme() (src/data/themes.js). A separate file because the
// portal's Content-Security-Policy allows scripts from this origin only.
try {
  var p = JSON.parse(localStorage.getItem('cm-theme-paint') || 'null')
  if (p && /^#[0-9a-f]{3,8}$/i.test(p.bg)) {
    document.documentElement.style.backgroundColor = p.bg
    document.documentElement.style.colorScheme = p.scheme === 'dark' ? 'dark' : 'light'
  }
} catch (e) { /* storage blocked: the default light paint */ }
