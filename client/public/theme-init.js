// Applies a saved light/dark choice before first paint so the page never flashes the wrong theme.
try {
  var t = localStorage.getItem('stayos-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked: follow the system setting */ }
