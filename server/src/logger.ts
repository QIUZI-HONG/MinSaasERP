// 结构化日志（零依赖轻量实现）：
// 统一输出格式，便于检索与后续接入日志平台（如 pino/winston/ELK）
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function format(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaStr = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function write(level: LogLevel, message: string, meta?: unknown) {
  const line = format(level, message, meta);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
