import { rateLimit } from "express-rate-limit";

/**
 * Standard rate limiter for general API endpoints.
 * Allows 100 requests per 15 minutes per IP.
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests, please try again later.",
  },
});

/**
 * More restrictive rate limiter for resource-intensive fusion and analysis endpoints.
 * Allows 10 requests per 15 minutes per IP to mitigate DoS and cost risks.
 */
export const intensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Resource-intensive operation limit reached. Please try again in 15 minutes.",
  },
});
