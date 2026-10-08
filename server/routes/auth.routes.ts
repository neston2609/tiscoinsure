import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { audit } from "../domain/store";
import { requireAdmin } from "../middleware/require-admin";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

function matchesPassword(input: string, expected: string): boolean {
  const salt = "mfec-insurrance-admin";
  const left = scryptSync(input, salt, 32);
  const right = scryptSync(expected, salt, 32);
  return timingSafeEqual(left, right);
}

authRouter.get("/session", (request, response) => {
  response.json({
    authenticated: Boolean(request.session.admin),
    username: request.session.admin || "",
  });
});

authRouter.post("/login", loginLimiter, async (request, response, next) => {
  try {
    const username = String(request.body?.username ?? "");
    const password = String(request.body?.password ?? "");
    const expectedUser = process.env.ADMIN_USERNAME || "admin";
    const expectedPassword =
      process.env.ADMIN_PASSWORD ||
      (process.env.NODE_ENV === "production" ? "" : "ChangeMe123!");
    if (
      !expectedPassword ||
      username !== expectedUser ||
      !matchesPassword(password, expectedPassword)
    ) {
      response.status(401).json({ message: "Invalid username or password" });
      return;
    }
    request.session.regenerate((error) => {
      if (error) {
        next(error);
        return;
      }
      request.session.admin = expectedUser;
      request.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        void audit("LOGIN", expectedUser).catch(() => undefined);
        response.json({ authenticated: true, username: expectedUser });
      });
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireAdmin, (request, response, next) => {
  const user = request.user!.name;
  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    response.clearCookie("mfec.sid");
    void audit("LOGOUT", user).catch(() => undefined);
    response.status(204).end();
  });
});
