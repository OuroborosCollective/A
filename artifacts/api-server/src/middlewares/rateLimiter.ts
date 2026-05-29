import { rateLimit } from "express-rate-limit";

// Standard limiter for most endpoints: 100 requests per 15 minutes
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes" },
});

// Intensive limiter for resource-heavy fusion operations: 10 requests per 15 minutes
export const intensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Intensive operation limit reached, please try again after 15 minutes" },
});
