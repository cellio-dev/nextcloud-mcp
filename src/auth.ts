import type { Request, Response, NextFunction } from "express";

export function createBearerAuth(expectedToken: string) {
  return function bearerAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) {
      res.status(401).json({
        error: "unauthorized",
        message: "Missing or malformed Authorization header. Use Bearer <token>.",
      });
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token || token !== expectedToken) {
      res.status(403).json({
        error: "forbidden",
        message: "Invalid bearer token.",
      });
      return;
    }

    next();
  };
}
