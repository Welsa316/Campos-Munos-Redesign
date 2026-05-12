import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

// Production: structured JSON to stdout (Railway aggregates / searches it).
// Dev: pretty-printed colorised output via pino-pretty for readability.
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  base: { service: 'campos-munos-api' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      '*.password',
      '*.password_hash',
      '*.currentPassword',
      '*.newPassword',
      '*.confirmPassword',
      '*.chatToken',
      '*.chat_token',
    ],
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service',
          },
        },
      }),
})

export default logger
