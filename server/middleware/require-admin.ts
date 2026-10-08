import type { NextFunction, Request, Response } from "express";

export function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  const user = request.session?.admin;
  if (!user) {
    response.status(401).json({ message: "Administrator authentication required" });
    return;
  }
  request.user = { name: user };
  next();
}
