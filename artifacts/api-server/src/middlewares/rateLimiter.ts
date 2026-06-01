import { rateLimit } from "express-rate-limit";

/**
 * General rate limiter for all API endpoints to prevent brute-force and basic DoS.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: "draft-7", // Use Combined Rate Limit header
  legacyHeaders: false, // Disable the X-RateLimit-* headers
  message: {
    error: "Too many requests from this IP, please try again after 15 minutes",
  },
});

/**
 * Stricter rate limiter for resource-intensive fusion operations.
 * These operations involve AI processing and large file bundling.
 */
export const fusionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 fusion requests per windowMs
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error:
      "Heavy load detected. Please wait before attempting more fusion operations.",
  },
});
