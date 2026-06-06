/** The telemetry viewer — a single self-contained HTML page (no build step). */

export function dashboardHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { margin: 0 0 20px; opacity: 0.7; }
    form { display: flex; gap: 8px; margin-bottom: 20px; }
    input[type=url] { flex: 1; padding: 8px 10px; border: 1px solid #8884; border-radius: 6px; }
    button { padding: 8px 14px; border: 0; border-radius: 6px; background: #6d28d9; color: #fff; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #8883; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.6; }
    tr.review { cursor: pointer; }
    tr.review:hover { background: #8881; }
    .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
    .pill.running { background: #f59e0b33; }
    .pill.done { background: #10b98133; }
    .pill.error { background: #ef444433; }
    .pill.approve { background: #10b98133; }
    .pill\\.request-changes { background: #ef444433; }
    .detail { background: #8881; }
    .detail pre { white-space: pre-wrap; margin: 6px 0; }
    .muted { opacity: 0.6; }
    code { font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="sub">Submit a GitHub PR URL to run the code-review agent. Telemetry below.</p>

  <form id="run">
    <input id="pr" type="url" placeholder="https://github.com/owner/repo/pull/123" required />
    <button type="submit" id="go">Review</button>
  </form>

  <table>
    <thead>
      <tr><th>When</th><th>PR</th><th>Status</th><th>Verdict</th><th>Tokens</th></tr>
    </thead>
    <tbody id="rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
  </table>

  <script type="module">
    const rows = document.getElementById('rows')
    const form = document.getElementById('run')
    const pr = document.getElementById('pr')
    const go = document.getElementById('go')
    let openId = null

    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const ago = (iso) => { const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return Math.floor(d) + 's ago'; if (d < 3600) return Math.floor(d / 60) + 'm ago'; return Math.floor(d / 3600) + 'h ago' }

    async function load() {
      const list = await fetch('api/reviews').then((r) => r.json())
      rows.innerHTML = list.length ? '' : '<tr><td colspan="5" class="muted">No reviews yet.</td></tr>'
      for (const rv of list) {
        const tr = document.createElement('tr')
        tr.className = 'review'
        tr.innerHTML =
          '<td>' + ago(rv.created_at) + '</td>' +
          '<td><code>' + esc(shortPr(rv.pr_url)) + '</code></td>' +
          '<td><span class="pill ' + esc(rv.status) + '">' + esc(rv.status) + '</span></td>' +
          '<td>' + (rv.verdict ? '<span class="pill ' + esc(rv.verdict) + '">' + esc(rv.verdict) + '</span>' : '<span class="muted">—</span>') + '</td>' +
          '<td class="muted">' + (rv.input_tokens + rv.output_tokens) + '</td>'
        tr.onclick = () => toggle(rv.id, tr)
        rows.append(tr)
        if (rv.id === openId) await toggle(rv.id, tr, true)
      }
    }

    function shortPr(u) { try { const p = new URL(u).pathname.split('/'); return p[1] + '/' + p[2] + '#' + p[4] } catch { return u } }

    async function toggle(id, tr, force) {
      const existing = tr.nextElementSibling
      if (existing && existing.classList.contains('detail') && !force) { existing.remove(); openId = null; return }
      if (existing && existing.classList.contains('detail')) existing.remove()
      openId = id
      const data = await fetch('api/reviews/' + id).then((r) => r.json())
      const detail = document.createElement('tr')
      detail.className = 'detail'
      const findings = data.findings.map((f) => '<div><strong>' + esc(f.agent) + '</strong><pre>' + esc(f.note) + '</pre></div>').join('') || '<span class="muted">No findings recorded.</span>'
      const spans = data.spans.map((s) => '<div class="muted"><code>' + esc(s.kind) + ':' + esc(s.name) + '</code> — ' + esc(s.status) + (s.error ? ' (' + esc(s.error) + ')' : '') + '</div>').join('')
      detail.innerHTML = '<td colspan="5"><strong>Reason:</strong> ' + esc(data.review.reason || '—') + '<h4>Reviewer findings</h4>' + findings + '<h4>Agent spans</h4>' + spans + '</td>'
      tr.after(detail)
    }

    form.onsubmit = async (e) => {
      e.preventDefault()
      go.disabled = true
      try {
        await fetch('api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prUrl: pr.value }) })
        pr.value = ''
      } finally {
        go.disabled = false
        load()
      }
    }

    load()
    setInterval(load, 2000)
  </script>
</body>
</html>`
}
