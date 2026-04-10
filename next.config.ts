import type { NextConfig } from 'next'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const isDev = process.env.NODE_ENV === 'development'

const config: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  // Dev-only: proxy backend routes to the Express server on :3000.
  // In production the static export is served by Express directly, so these
  // rewrites are a no-op (and Next.js warns about them under `output: 'export'`),
  // so we omit them entirely outside of `next dev`.
  ...(isDev && {
    async rewrites() {
      return [
        { source: '/api/:path*',           destination: `${API_BASE}/api/:path*` },
        { source: '/auth/:path*',          destination: `${API_BASE}/auth/:path*` },
        { source: '/my/:path*',            destination: `${API_BASE}/my/:path*` },
        { source: '/admin/:path*',         destination: `${API_BASE}/admin/:path*` },
        { source: '/alerts',               destination: `${API_BASE}/alerts` },
        { source: '/health',               destination: `${API_BASE}/health` },
        { source: '/trending',             destination: `${API_BASE}/trending` },
        { source: '/spikes',               destination: `${API_BASE}/spikes` },
        { source: '/channel-stats/:n',     destination: `${API_BASE}/channel-stats/:n` },
        { source: '/moments/:path*',       destination: `${API_BASE}/moments/:path*` },
        { source: '/clip/:path*',          destination: `${API_BASE}/clip/:path*` },
        { source: '/track/:path*',         destination: `${API_BASE}/track/:path*` },
      ]
    },
  }),
}

export default config
