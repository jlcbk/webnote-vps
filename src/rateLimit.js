function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({
  windowMs,
  max,
  message = '请求过于频繁，请稍后再试',
  keyGenerator = (req) => `${clientIp(req)}:${req.path}`
}) {
  const buckets = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = keyGenerator(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count <= max) return next();

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: message });
  };
}

export function rateLimitKey(...parts) {
  return parts.filter(Boolean).join(':');
}
