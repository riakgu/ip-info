# IP Info

## Overview
A fast, lightweight IP information service built on Cloudflare Workers.
Returns your public IP address along with geolocation and network details — powered entirely by Cloudflare's edge network with zero external API dependencies.

### Built With
[![Cloudflare Workers][Cloudflare]][Cloudflare-url] [![JavaScript][JavaScript]][JavaScript-url]


## Features

- **Plain text IP** — `curl`-friendly, returns just your IP
- **Full JSON API** — IP, geolocation, ASN, ISP, latency, and more
- **Beautiful Web UI** — modern dark interface with copy-to-clipboard
- **Zero dependencies** — all data comes from Cloudflare's `request.cf` object
- **Global edge** — runs on 300+ Cloudflare data centers worldwide
- **Free tier** — 100,000 requests/day on Cloudflare's free plan


## API Endpoints

| Endpoint | Response | Content-Type |
|----------|----------|--------------|
| `GET /` | Web UI (browser) or plain IP (curl) | `text/html` / `text/plain` |
| `GET /ip` | Plain text IP address | `text/plain` |
| `GET /json` | Full IP information as JSON | `application/json` |

### Example: Plain Text
```sh
curl https://your-worker.workers.dev/ip
```
```
203.0.113.42
```

### Example: JSON
```sh
curl https://your-worker.workers.dev/json
```
```json
{
  "ip": "203.0.113.42",
  "city": "San Francisco",
  "region": "California",
  "regionCode": "CA",
  "country": "US",
  "continent": "NA",
  "isEU": false,
  "postal": "94107",
  "latitude": "37.7749",
  "longitude": "-122.4194",
  "timezone": "America/Los_Angeles",
  "asn": "AS13335",
  "org": "Cloudflare Inc.",
  "colo": "SFO",
  "rtt": "12 ms"
}
```


## Getting Started

### Prerequisites
* Node.js >= v18.0
* A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)

### Installation

1. Clone the repository
   ```sh
   git clone https://github.com/riakgu/ip-info.git
   cd ip-info
   ```

2. Install dependencies
   ```sh
   npm install
   ```

3. Start the development server
   ```sh
   npm run dev
   ```

   The worker will be available at `http://localhost:8787`


## Deployment

### Option 1: CLI (Wrangler)

1. Authenticate with Cloudflare
   ```sh
   npx wrangler login
   ```

2. Deploy to Cloudflare Workers
   ```sh
   npm run deploy
   ```

### Option 2: Dashboard (Manual)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Name your worker (e.g. `ip-info`) → click **Deploy**
3. Click **Edit code** → paste the contents of [`src/index.js`](src/index.js)
4. Click **Deploy**

> No CLI or build step needed — it's a single file with zero dependencies.

### Custom Domain *(Optional)*

Edit `wrangler.toml` to add your domain:
```toml
[routes]
route = "ip.yourdomain.com/*"
zone_name = "yourdomain.com"
```

Then add a CNAME record in your Cloudflare DNS pointing to your worker.


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


[Cloudflare]: https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white
[Cloudflare-url]: https://workers.cloudflare.com/
[JavaScript]: https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[JavaScript-url]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
