import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";

/**
 * Standard rate limiter to prevent API abuse.
 * Defaults to 100 requests per 15 minutes per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per window
  standardHeaders: "draft-7", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next, options) => {
    logger.warn({ ip: req.ip, url: req.originalUrl }, "Rate limit exceeded");
    res.status(options.statusCode).send(options.message);
  },
  message: {
    error: "Too many requests, please try again later.",
  },
});

/**
 * More restrictive rate limiter for expensive operations like AI analysis and fusion.
 * limit: 20 requests per 15 minutes.
 */
export const expensiveOperationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn({ ip: req.ip, url: req.originalUrl }, "Expensive operation rate limit exceeded");
    res.status(options.statusCode).send(options.message);
  },
  message: {
    error: "Too many expensive operations, please try again later.",
  },
});
