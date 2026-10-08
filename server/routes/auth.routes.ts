import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { audit } from "../domain/store";
import { requireAdmin } from "../middleware/require-admin";
import { adminCredentials } from "../services/admin-credentials.service";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

authRouter.get("/session", async (request, response) => {
  const authenticated = await adminCredentials.isSessionValid(
    request.session.admin,
    request.session.adminCredentialVersion,
  );
  response.json({
    authenticated,
    username: authenticated ? request.session.admin : "",
  });
});

authRouter.post("/login", loginLimiter, async (request, response, next) => {
  try {
    const username = String(request.body?.username ?? "");
    const password = String(request.body?.password ?? "");
    const account =
      username.length <= 100 && password.length <= 256
        ? await adminCredentials.authenticate(username, password)
        : null;
    if (!account) {
      response.status(401).json({ message: "Invalid username or password" });
      return;
    }
    request.session.regenerate((error) => {
      if (error) {
        next(error);
        return;
      }
      request.session.admin = account.username;
      request.session.adminCredentialVersion = account.version;
      request.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        void audit("LOGIN", account.username).catch(() => undefined);
        response.json({ authenticated: true, username: account.username });
      });
    });
  } catch (error) {
    next(error);
  }
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many password change attempts. Please try again later.",
  },
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });

authRouter.post(
  "/change-password",
  requireAdmin,
  changePasswordLimiter,
  async (request, response, next) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(
        request.body,
      );
      if (
        !(await adminCredentials.changePassword(currentPassword, newPassword))
      ) {
        response.status(400).json({ message: "Current password is incorrect" });
        return;
      }
      const user = request.user!.name;
      request.session.destroy((error) => {
        if (error) {
          next(error);
          return;
        }
        response.clearCookie("mfec.sid");
        void audit("PASSWORD_CHANGED", user).catch(() => undefined);
        response.status(204).end();
      });
    } catch (error) {
      next(error);
    }
  },
);

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
