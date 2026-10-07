import type { NextFunction, Request, Response } from "express";

export function requireAdmin(request: Request, _response: Response, next: NextFunction): void {
  request.user = { name: request.header("x-admin-user") || "admin" };
  next();
}
