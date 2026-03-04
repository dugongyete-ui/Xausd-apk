import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { derivService } from "./derivService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Current market state — price, trend, EMA, Fibonacci, active signal
  app.get("/api/market-state", (_req: Request, res: Response) => {
    res.json(derivService.getSnapshot());
  });

  // Signal history — all detected signals this session
  app.get("/api/signals", (_req: Request, res: Response) => {
    res.json(derivService.getSignalHistory());
  });

  // Register push token — called by app on startup to enable background notifications
  app.post("/api/register-token", (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: "Token required" });
      return;
    }
    derivService.registerToken(token);
    res.json({ success: true, totalTokens: derivService.getTokenCount() });
  });

  // Unregister push token — called when user disables notifications
  app.post("/api/unregister-token", (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: "Token required" });
      return;
    }
    derivService.unregisterToken(token);
    res.json({ success: true, totalTokens: derivService.getTokenCount() });
  });

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toUTCString(),
      registeredDevices: derivService.getTokenCount(),
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
