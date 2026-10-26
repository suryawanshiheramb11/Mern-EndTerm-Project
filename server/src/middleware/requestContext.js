import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the caller's ip and user agent to audit rows without threading `req` through services.
const storage = new AsyncLocalStorage();

export const requestContext = (req, _res, next) => {
  storage.run({ ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) }, next);
};

export const currentContext = () => storage.getStore() ?? {};
