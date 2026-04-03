/**
 * IP Info Worker — Cloudflare Worker that returns visitor IP information.
 *
 * Routes:
 *   GET /       → Beautiful web UI (browser) or plain IP (curl)
 *   GET /ip     → Plain text IP
 *   GET /json   → Full JSON info
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function getClientIP(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
}

function getIPInfo(request) {
  const ip = getClientIP(request);
  const cf = request.cf || {};

  // Pick the best RTT value (prefer TCP, fall back to QUIC)
  const rtt = cf.clientTcpRtt || cf.clientQuicRtt || null;

  return {
    ip,
    // Location
    city: cf.city || null,
    region: cf.region || null,
    regionCode: cf.regionCode || null,
    country: cf.country || null,
    continent: cf.continent || null,
    isEU: cf.isEUCountry || false,
    postal: cf.postalCode || null,
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    timezone: cf.timezone || null,
    // Network
    asn: cf.asn ? `AS${cf.asn}` : null,
    org: cf.asOrganization || null,
    colo: cf.colo || null,
    rtt: rtt ? `${rtt} ms` : null,
  };
}

function isBrowser(request) {
  const accept = request.headers.get('accept') || '';
  const ua = request.headers.get('user-agent') || '';
  return accept.includes('text/html') && !ua.toLowerCase().includes('curl');
}

function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  const offset = 0x1F1E6 - 65;
  return String.fromCodePoint(
    countryCode.charCodeAt(0) + offset,
    countryCode.charCodeAt(1) + offset,
  );
}

// ─── Responses ──────────────────────────────────────────────────────────────

function plainResponse(ip) {
  return new Response(ip + '\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

function jsonResponse(info) {
  return new Response(JSON.stringify(info, null, 2) + '\n', {
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

function htmlResponse(info) {
  const flag = getCountryFlag(info.country);
  const location = [info.city, info.region].filter(Boolean).join(', ');
  const coords = info.latitude && info.longitude ? `${info.latitude}, ${info.longitude}` : null;
  const regionFull = [info.region, info.regionCode ? `(${info.regionCode})` : null].filter(Boolean).join(' ');
  const countryDisplay = info.country ? `${flag} ${info.country}${info.isEU ? ' \u00b7 EU' : ''}` : '\u2014';

  const dataCards = [
    { label: 'Location', value: location || '\u2014', span: 2 },
    { label: 'Country', value: countryDisplay },
    { label: 'Region', value: regionFull || '\u2014' },
    { label: 'Coordinates', value: coords || '\u2014', mono: true },
    { label: 'Postal', value: info.postal || '\u2014' },
    { label: 'Timezone', value: info.timezone || '\u2014' },
    { label: 'Organization', value: info.org || '\u2014', span: 2 },
    { label: 'ASN', value: info.asn || '\u2014', mono: true },
    { label: 'Latency', value: info.rtt || '\u2014' },
    { label: 'Edge Node', value: info.colo || '\u2014' },
  ];

  const cardsHtml = dataCards
    .map(
      (c, i) => `
      <div class="data-card${c.span === 2 ? ' span-2' : ''}" style="animation-delay: ${0.4 + i * 0.05}s">
        <span class="data-label">${c.label}</span>
        <span class="data-value${c.mono ? ' mono' : ''}">${c.value}</span>
      </div>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IP Info \u2014 What's My IP?</title>
  <meta name="description" content="Instantly see your public IP address, geolocation, and network details.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --navy-deep: #0b1221;
      --navy-mid: #121d33;
      --navy-surface: #182744;
      --navy-border: rgba(255, 255, 255, 0.05);
      --amber: #d4915c;
      --amber-bright: #e8a76e;
      --amber-glow: rgba(212, 145, 92, 0.12);
      --sage: #7a9e8e;
      --sage-dim: rgba(122, 158, 142, 0.5);
      --text-bright: #e8e4df;
      --text-mid: rgba(232, 228, 223, 0.6);
      --text-dim: rgba(232, 228, 223, 0.3);
      --serif: 'Instrument Serif', Georgia, serif;
      --mono: 'IBM Plex Mono', 'Courier New', monospace;
    }

    html { font-family: var(--mono); font-size: 14px; }

    body {
      background: var(--navy-deep);
      color: var(--text-bright);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
      position: relative;
    }

    /* Topographic ambient light */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse at 30% 20%, rgba(212, 145, 92, 0.06) 0%, transparent 60%),
        radial-gradient(ellipse at 70% 80%, rgba(122, 158, 142, 0.05) 0%, transparent 60%);
      z-index: 0;
      pointer-events: none;
    }

    .topo-bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      opacity: 0.12;
      pointer-events: none;
    }

    .topo-bg svg { width: 100%; height: 100%; }

    /* Grain texture */
    body::after {
      content: '';
      position: fixed;
      inset: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
      z-index: 1;
      pointer-events: none;
      mix-blend-mode: overlay;
    }

    .page {
      position: relative;
      z-index: 2;
      width: 100%;
      max-width: 540px;
      padding: 32px 24px;
    }

    /* ── Header ── */
    .header {
      margin-bottom: 48px;
      animation: revealDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .brand {
      font-family: var(--serif);
      font-size: 20px;
      font-style: italic;
      color: var(--text-bright);
      letter-spacing: -0.3px;
    }

    .status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--sage);
    }

    .status-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--sage);
      animation: blink 2.5s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .divider {
      height: 1px;
      background: linear-gradient(90deg, var(--navy-border) 0%, rgba(212, 145, 92, 0.15) 50%, var(--navy-border) 100%);
    }

    /* ── IP Hero ── */
    .ip-block {
      text-align: center;
      padding: 44px 20px 40px;
      margin-bottom: 40px;
      position: relative;
      animation: revealUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
    }

    .ip-block::before {
      content: '';
      position: absolute;
      inset: 0;
      border: 1px solid var(--navy-border);
      border-radius: 2px;
      pointer-events: none;
    }

    .ip-block::after {
      content: '';
      position: absolute;
      top: -1px;
      left: 20%;
      right: 20%;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--amber), transparent);
    }

    .ip-overline {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 16px;
    }

    .ip-address {
      font-family: var(--serif);
      font-size: clamp(28px, 7vw, 42px);
      font-weight: 400;
      color: var(--amber-bright);
      letter-spacing: -1px;
      line-height: 1.1;
      word-break: break-all;
    }

    .ip-actions {
      margin-top: 20px;
      display: flex;
      justify-content: center;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 16px;
      border: 1px solid var(--navy-border);
      border-radius: 2px;
      background: var(--navy-mid);
      color: var(--text-mid);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.25s;
      text-decoration: none;
    }

    .btn:hover {
      border-color: var(--amber);
      color: var(--amber);
      background: var(--amber-glow);
    }

    .btn.copied {
      border-color: var(--sage);
      color: var(--sage);
    }

    .btn svg { flex-shrink: 0; }

    /* Corner marks */
    .corner { position: absolute; width: 8px; height: 8px; }
    .corner::before, .corner::after { content: ''; position: absolute; background: var(--amber); }
    .corner--tl { top: -1px; left: -1px; }
    .corner--tl::before { top: 0; left: 0; width: 8px; height: 1px; }
    .corner--tl::after { top: 0; left: 0; width: 1px; height: 8px; }
    .corner--tr { top: -1px; right: -1px; }
    .corner--tr::before { top: 0; right: 0; width: 8px; height: 1px; }
    .corner--tr::after { top: 0; right: 0; width: 1px; height: 8px; }
    .corner--bl { bottom: -1px; left: -1px; }
    .corner--bl::before { bottom: 0; left: 0; width: 8px; height: 1px; }
    .corner--bl::after { bottom: 0; left: 0; width: 1px; height: 8px; }
    .corner--br { bottom: -1px; right: -1px; }
    .corner--br::before { bottom: 0; right: 0; width: 8px; height: 1px; }
    .corner--br::after { bottom: 0; right: 0; width: 1px; height: 8px; }

    /* ── Data Grid ── */
    .data-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--navy-border);
      border: 1px solid var(--navy-border);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 40px;
    }

    .data-card {
      background: var(--navy-deep);
      padding: 16px 18px;
      transition: background 0.3s;
      animation: revealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .data-card:hover { background: var(--navy-mid); }
    .data-card.span-2 { grid-column: span 2; }

    .data-label {
      display: block;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 6px;
    }

    .data-value {
      display: block;
      font-size: 13px;
      font-weight: 400;
      color: var(--text-bright);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
    }

    .data-value.mono { color: var(--sage); }

    /* ── API Bar ── */
    .api-bar {
      display: flex;
      gap: 1px;
      background: var(--navy-border);
      border: 1px solid var(--navy-border);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 32px;
      animation: revealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both;
    }

    .api-link {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      background: var(--navy-deep);
      text-decoration: none;
      transition: all 0.25s;
    }

    .api-link:hover { background: var(--navy-mid); }
    .api-link:hover .api-route { color: var(--amber); }

    .api-badge {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 1px;
      padding: 2px 6px;
      border: 1px solid var(--sage-dim);
      border-radius: 2px;
      color: var(--sage);
    }

    .api-route {
      font-size: 12px;
      color: var(--text-mid);
      transition: color 0.25s;
    }

    .api-type {
      font-size: 10px;
      color: var(--text-dim);
      margin-left: auto;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      animation: revealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.9s both;
    }

    .footer-text {
      font-size: 10px;
      letter-spacing: 1px;
      color: var(--text-dim);
    }

    .footer-text a {
      color: var(--text-dim);
      text-decoration: none;
      border-bottom: 1px solid var(--navy-border);
      transition: all 0.25s;
    }

    .footer-text a:hover {
      color: var(--amber);
      border-color: var(--amber);
    }

    /* ── Toast ── */
    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(60px);
      background: var(--navy-surface);
      border: 1px solid var(--sage-dim);
      color: var(--sage);
      padding: 8px 20px;
      border-radius: 2px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.5px;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      z-index: 100;
      pointer-events: none;
    }

    .toast.show { transform: translateX(-50%) translateY(0); }

    /* Animations */
    @keyframes revealDown {
      from { opacity: 0; transform: translateY(-16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes revealUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 480px) {
      .page { padding: 24px 16px; }
      .ip-address { font-size: 26px; }
      .data-grid { grid-template-columns: 1fr; }
      .data-card.span-2 { grid-column: span 1; }
      .api-bar { flex-direction: column; }
    }
  </style>
</head>
<body>

  <div class="topo-bg">
    <svg viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M-50 300Q100 250 200 280T400 260T600 290T850 250" stroke="rgba(122,158,142,0.3)" stroke-width="0.5" fill="none"/>
      <path d="M-50 320Q120 280 220 300T420 280T620 310T850 270" stroke="rgba(122,158,142,0.25)" stroke-width="0.5" fill="none"/>
      <path d="M-50 340Q140 310 240 320T440 300T640 330T850 290" stroke="rgba(122,158,142,0.2)" stroke-width="0.5" fill="none"/>
      <path d="M-50 200Q80 160 180 190T380 170T580 200T850 160" stroke="rgba(212,145,92,0.2)" stroke-width="0.5" fill="none"/>
      <path d="M-50 220Q100 180 200 210T400 190T600 220T850 180" stroke="rgba(212,145,92,0.15)" stroke-width="0.5" fill="none"/>
      <path d="M-50 400Q130 370 230 390T430 370T630 400T850 360" stroke="rgba(122,158,142,0.15)" stroke-width="0.5" fill="none"/>
      <path d="M-50 420Q150 390 250 410T450 390T650 420T850 380" stroke="rgba(122,158,142,0.1)" stroke-width="0.5" fill="none"/>
      <path d="M-50 140Q60 100 160 130T360 110T560 140T850 100" stroke="rgba(212,145,92,0.1)" stroke-width="0.5" fill="none"/>
      <path d="M-50 480Q170 450 270 470T470 450T670 480T850 440" stroke="rgba(122,158,142,0.08)" stroke-width="0.5" fill="none"/>
      <circle cx="400" cy="300" r="80" stroke="rgba(212,145,92,0.08)" stroke-width="0.5" fill="none"/>
      <circle cx="400" cy="300" r="120" stroke="rgba(212,145,92,0.06)" stroke-width="0.5" fill="none"/>
      <circle cx="400" cy="300" r="160" stroke="rgba(212,145,92,0.04)" stroke-width="0.5" fill="none"/>
    </svg>
  </div>

  <div class="page">
    <header class="header">
      <div class="header-top">
        <div class="brand">ip info</div>
        <div class="status"><span class="status-dot"></span>Live</div>
      </div>
      <div class="divider"></div>
    </header>

    <div class="ip-block">
      <div class="corner corner--tl"></div>
      <div class="corner corner--tr"></div>
      <div class="corner corner--bl"></div>
      <div class="corner corner--br"></div>
      <div class="ip-overline">Your IP Address</div>
      <div class="ip-address" id="ip">${info.ip}</div>
      <div class="ip-actions">
        <button class="btn" onclick="copyIP()" id="copyBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </button>
      </div>
    </div>

    <div class="data-grid">
      ${cardsHtml}
    </div>

    <div class="api-bar">
      <a class="api-link" href="/ip">
        <span class="api-badge">GET</span>
        <span class="api-route">/ip</span>
        <span class="api-type">text</span>
      </a>
      <a class="api-link" href="/json">
        <span class="api-badge">GET</span>
        <span class="api-route">/json</span>
        <span class="api-type">json</span>
      </a>
    </div>

    <footer class="footer">
      <p class="footer-text">Powered by <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">Cloudflare Workers</a></p>
    </footer>
  </div>

  <div class="toast" id="toast">\u2713 Copied to clipboard</div>

  <script>
    function copyIP() {
      const ip = document.getElementById('ip').textContent;
      navigator.clipboard.writeText(ip).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.classList.add('copied');
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied';
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => {
          toast.classList.remove('show');
          btn.classList.remove('copied');
          btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy';
        }, 2000);
      });
    }
  </script>

</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const info = getIPInfo(request);

    switch (url.pathname) {
      case '/ip':
        return plainResponse(info.ip);

      case '/json':
        return jsonResponse(info);

      case '/':
        // Serve HTML for browsers, plain text for curl/wget
        if (isBrowser(request)) {
          return htmlResponse(info);
        }
        return plainResponse(info.ip);

      default:
        return new Response('Not Found\n', { status: 404 });
    }
  },
};
