/** A minimal console logger with a stable bound context. */
import type { Logger } from './types.js'

export function createLogger(base: Record<string, unknown> = {}): Logger {
  const emit =
    (level: 'debug' | 'info' | 'warn' | 'error') =>
    (meta: Record<string, unknown>, msg?: string) => {
      const line = { level, ...base, ...meta, ...(msg ? { msg } : {}) }
      const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
      sink(JSON.stringify(line))
    }

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  }
}
