/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()',
}

function validateProductionEnvironment(mode, env) {
  if (mode !== 'production') return

  const apiUrl = env.VITE_API_URL?.trim()
  if (!apiUrl) {
    throw new Error('VITE_API_URL must be configured for a production frontend build')
  }

  let parsed
  try {
    parsed = new URL(apiUrl)
  } catch {
    throw new Error('VITE_API_URL must be an absolute HTTP(S) URL')
  }

  const isLocalhostOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if ((parsed.protocol !== 'https:' && !isLocalhostOrigin) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL must be an HTTPS origin in production, except for localhost development')
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  validateProductionEnvironment(mode, env)

  return {
    plugins: [react()],
    server: { headers: securityHeaders },
    preview: { headers: securityHeaders },
  }
})
