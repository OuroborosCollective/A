import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { standardLimiter, intensiveLimiter } from "./middlewares/rateLimiter";

const app: Express = express();

// Trust proxy is required for correct IP detection behind Replit/proxy
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply standard rate limiting to all API routes
app.use("/api", standardLimiter);

// Apply more restrictive rate limiting to intensive endpoints
app.use("/api/fusion/analyze", intensiveLimiter);
app.use("/api/fusion/fuse", intensiveLimiter);
app.use("/api/fusion/download", intensiveLimiter);

app.use("/api", router);

export default app;
