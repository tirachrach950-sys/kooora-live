// Refresh scores every 30 seconds without reloading, and show kick-off times in the visitor's own time zone.
const box = document.getElementById('live');
function localTimes() {
  document.querySelectorAll('time[data-utc]').forEach((t) => {
    t.textContent = new Date(t.dataset.utc).toLocaleString(document.documentElement.lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  });
}
async function tick() {
  if (!box || document.hidden) return;
  try { const r = await fetch(box.dataset.src, { cache: 'no-store' }); if (r.ok) { box.innerHTML = await r.text(); localTimes(); } } catch (e) {}
}
localTimes();
setInterval(tick, 30000);
document.addEventListener('visibilitychange', tick);
