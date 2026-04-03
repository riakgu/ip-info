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
  const location = [info.city, info.region, info.country].filter(Boolean).join(', ');
  const coords = info.latitude && info.longitude ? `${info.latitude}, ${info.longitude}` : null;
  const regionFull = [info.region, info.regionCode ? `(${info.regionCode})` : null].filter(Boolean).join(' ');

  const sections = [
    {
      title: 'Location',
      rows: [
        { icon: '📍', label: 'Location', value: location || '—', id: 'location' },
        { icon: flag || '🏳️', label: 'Country', value: info.country ? `${info.country}${info.isEU ? ' · EU' : ''}` : '—', id: 'country' },
        { icon: '🏘️', label: 'Region', value: regionFull || '—', id: 'region' },
        { icon: '🗺️', label: 'Coordinates', value: coords || '—', id: 'coords' },
        { icon: '📮', label: 'Postal Code', value: info.postal || '—', id: 'postal' },
        { icon: '🕐', label: 'Timezone', value: info.timezone || '—', id: 'timezone' },
      ],
    },
    {
      title: 'Network',
      rows: [
        { icon: '🏢', label: 'Organization', value: info.org || '—', id: 'org' },
        { icon: '🔗', label: 'ASN', value: info.asn || '—', id: 'asn', mono: true },
        { icon: '⚡', label: 'Cloudflare Colo', value: info.colo || '—', id: 'colo' },
        { icon: '📶', label: 'Latency (RTT)', value: info.rtt || '—', id: 'rtt' },
      ],
    },
  ];

  let rowIndex = 0;
  const sectionsHtml = sections
    .map(
      (section) => {
        const sectionRows = section.rows
          .map((r) => {
            const i = rowIndex++;
            return `
            <div class="info-row" style="animation-delay: ${i * 0.04}s">
              <div class="info-icon">${r.icon}</div>
              <div class="info-content">
                <div class="info-label">${r.label}</div>
                <div class="info-value${r.mono ? ' mono' : ''}" id="${r.id}">${r.value}</div>
              </div>
            </div>`;
          })
          .join('');

        return `
        <div class="info-section">
          <div class="section-title">${section.title}</div>
          <div class="info-card">${sectionRows}</div>
        </div>`;
      },
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IP Info — What's My IP?</title>
  <meta name="description" content="Instantly see your public IP address, location, ISP, and more.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-primary: #0a0a0f;
      --bg-card: rgba(255, 255, 255, 0.03);
      --bg-card-hover: rgba(255, 255, 255, 0.06);
      --border: rgba(255, 255, 255, 0.06);
      --border-hover: rgba(255, 255, 255, 0.12);
      --text-primary: #f0f0f5;
      --text-secondary: rgba(255, 255, 255, 0.5);
      --text-tertiary: rgba(255, 255, 255, 0.3);
      --accent: #6c63ff;
      --accent-glow: rgba(108, 99, 255, 0.15);
      --accent-2: #00d4aa;
      --accent-2-glow: rgba(0, 212, 170, 0.1);
      --gradient-1: linear-gradient(135deg, #6c63ff 0%, #00d4aa 100%);
    }

    html { font-family: 'Inter', -apple-system, sans-serif; }

    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
      position: relative;
    }

    /* Animated background */
    body::before {
      content: '';
      position: fixed;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background:
        radial-gradient(ellipse at 20% 50%, rgba(108, 99, 255, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(0, 212, 170, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(108, 99, 255, 0.04) 0%, transparent 50%);
      animation: bgShift 20s ease-in-out infinite alternate;
      z-index: 0;
      pointer-events: none;
    }

    @keyframes bgShift {
      0%   { transform: translate(0, 0) rotate(0deg); }
      100% { transform: translate(-3%, 2%) rotate(3deg); }
    }

    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 480px;
      padding: 24px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 100px;
      background: var(--accent-glow);
      border: 1px solid rgba(108, 99, 255, 0.2);
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 16px;
      animation: fadeInDown 0.5s ease;
    }

    .header-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-2);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    h1 {
      font-size: 28px;
      font-weight: 800;
      background: var(--gradient-1);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      margin-bottom: 6px;
      animation: fadeInDown 0.5s ease 0.1s both;
    }

    .subtitle {
      font-size: 14px;
      color: var(--text-secondary);
      font-weight: 400;
      animation: fadeInDown 0.5s ease 0.2s both;
    }

    /* IP Hero */
    .ip-hero {
      text-align: center;
      padding: 28px 20px;
      margin-bottom: 24px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      position: relative;
      overflow: hidden;
      animation: fadeInUp 0.5s ease 0.3s both;
    }

    .ip-hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--gradient-1);
      opacity: 0.03;
      pointer-events: none;
    }

    .ip-hero-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      margin-bottom: 10px;
    }

    .ip-hero-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 32px;
      font-weight: 500;
      background: var(--gradient-1);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      letter-spacing: -0.5px;
    }

    /* Info sections */
    .info-section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      margin-bottom: 8px;
      padding-left: 4px;
    }

    .info-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    .info-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      transition: background 0.2s;
      animation: fadeInUp 0.4s ease both;
    }

    .info-row:last-child { border-bottom: none; }
    .info-row:hover { background: var(--bg-card-hover); }

    .info-icon {
      font-size: 18px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      flex-shrink: 0;
    }

    .info-content {
      flex: 1;
      min-width: 0;
    }

    .info-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .info-value.mono {
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent);
    }

    .copy-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .copy-btn:hover {
      background: var(--accent-glow);
      border-color: rgba(108, 99, 255, 0.3);
      color: var(--accent);
      transform: scale(1.05);
    }

    .copy-btn.copied {
      background: var(--accent-2-glow);
      border-color: rgba(0, 212, 170, 0.3);
      color: var(--accent-2);
    }

    .ip-copy {
      margin-top: 16px;
      gap: 6px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 500;
      font-family: 'Inter', sans-serif;
    }

    /* API section */
    .api-section {
      margin-top: 24px;
      animation: fadeInUp 0.5s ease 0.5s both;
    }

    .api-title {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      margin-bottom: 10px;
      padding-left: 4px;
    }

    .api-endpoints {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .api-endpoint {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      transition: all 0.2s;
      cursor: pointer;
      text-decoration: none;
    }

    .api-endpoint:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-hover);
      transform: translateX(4px);
    }

    .api-method {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--accent-glow);
      color: var(--accent);
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .api-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--text-primary);
      flex: 1;
    }

    .api-desc {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 32px;
      font-size: 12px;
      color: var(--text-tertiary);
      animation: fadeInUp 0.5s ease 0.6s both;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
      transition: opacity 0.2s;
    }

    .footer a:hover { opacity: 0.7; }

    /* Animations */
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: rgba(0, 212, 170, 0.15);
      border: 1px solid rgba(0, 212, 170, 0.3);
      color: var(--accent-2);
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      backdrop-filter: blur(12px);
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      z-index: 100;
      pointer-events: none;
    }

    .toast.show { transform: translateX(-50%) translateY(0); }

    /* Responsive */
    @media (max-width: 520px) {
      .container { padding: 16px; }
      .ip-hero-value { font-size: 24px; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>

  <div class="container">
    <header class="header">
      <div class="header-badge"><span class="dot"></span> Live</div>
      <h1>IP Info</h1>
      <p class="subtitle">Your public IP address &amp; network details</p>
    </header>

    <div class="ip-hero">
      <div class="ip-hero-label">Your IP Address</div>
      <div class="ip-hero-value" id="ip">${info.ip}</div>
      <button class="copy-btn ip-copy" onclick="copyIP()" title="Copy IP">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>

    ${sectionsHtml}

    <div class="api-section">
      <div class="api-title">Developer API</div>
      <div class="api-endpoints">
        <a class="api-endpoint" href="/ip">
          <span class="api-method">GET</span>
          <span class="api-path">/ip</span>
          <span class="api-desc">Plain text</span>
        </a>
        <a class="api-endpoint" href="/json">
          <span class="api-method">GET</span>
          <span class="api-path">/json</span>
          <span class="api-desc">Full JSON</span>
        </a>
      </div>
    </div>

    <div class="footer">
      Powered by <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">Cloudflare Workers</a>
    </div>
  </div>

  <div class="toast" id="toast">✓ IP copied to clipboard</div>

  <script>
    function copyIP() {
      const ip = document.getElementById('ip').textContent;
      navigator.clipboard.writeText(ip).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.classList.add('copied');
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => {
          toast.classList.remove('show');
          btn.classList.remove('copied');
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
