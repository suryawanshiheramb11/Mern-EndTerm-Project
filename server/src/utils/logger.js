const isTest = process.env.NODE_ENV === 'test';

const log = (level, args) => {
  if (isTest) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line, ...args);
};

export const logger = {
  info: (...args) => log('info', args),
  warn: (...args) => log('warn', args),
  error: (...args) => log('error', args),
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') log('debug', args);
  },
};

export default logger;
