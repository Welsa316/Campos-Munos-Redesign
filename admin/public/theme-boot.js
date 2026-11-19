// Paints the last theme's background and colour scheme before the stylesheet
// and the app load, so a dark theme does not flash white on every load.
// Written by applyTheme() (src/data/themes.js). A custom theme also leaves
// all of its colour tokens, which go on <html> here, so the first paint is
// already the person's own colours rather than Classic's. A separate file
// because the portal's Content-Security-Policy allows scripts from this
// origin only. Tested in test/customTheme.test.js.
try {
  var p = JSON.parse(localStorage.getItem('cm-theme-paint') || 'null')
  var root = document.documentElement
  if (p && /^#[0-9a-f]{3,8}$/i.test(p.bg)) {
    root.style.backgroundColor = p.bg
    root.style.colorScheme = p.scheme === 'dark' ? 'dark' : 'light'
  }
  if (p && p.tokens && typeof p.tokens === 'object') {
    for (var name in p.tokens) {
      var value = p.tokens[name]
      // Token names and colour values only (#hex, rgb(), color-mix()).
      if (/^[a-z0-9-]{1,40}$/.test(name) && typeof value === 'string' && /^[#a-z0-9 (),.%/-]{1,120}$/i.test(value)) {
        root.style.setProperty('--' + name, value)
      }
    }
    root.setAttribute('data-theme', 'custom')
    root.setAttribute('data-scheme', p.scheme === 'dark' ? 'dark' : 'light')
  }
} catch (e) { /* storage blocked: the default light paint */ }
