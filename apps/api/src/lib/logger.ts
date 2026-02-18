import { randomUUID } from 'crypto';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  correlationId?: string;
  [key: string]: unknown;
}

function log(entry: LogEntry) {
  const timestamp = new Date().toISOString();
  const output = JSON.stringify({ timestamp, ...entry });
  if (entry.level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log({ level: 'info', message, ...meta }),
  warn: (message: string, meta?: Record<string, unknown>) => log({ level: 'warn', message, ...meta }),
  error: (message: string, meta?: Record<string, unknown>) => log({ level: 'error', message, ...meta }),
  debug: (message: string, meta?: Record<string, unknown>) => log({ level: 'debug', message, ...meta }),
};

export function generateCorrelationId(): string {
  return randomUUID();
}
