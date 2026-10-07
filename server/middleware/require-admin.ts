import type { NextFunction, Request, Response } from "express";

export function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  const user = request.header("x-admin-user");
  if (process.env.NODE_ENV === "production" && !user) {
    response.status(401).json({ message: "Administrator authentication required" });
    return;
  }
  request.user = { name: user || "admin" };
  next();
}
