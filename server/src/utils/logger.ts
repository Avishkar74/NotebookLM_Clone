type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const writeLog = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const output = JSON.stringify(payload);
  if (level === 'error') {
    console.error(output);
    return;
  }

  console.log(output);
};

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => writeLog('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => writeLog('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => writeLog('error', message, data),
  debug: (message: string, data?: Record<string, unknown>) => writeLog('debug', message, data),
};
