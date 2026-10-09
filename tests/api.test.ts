import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test(
  "public and admin workflows persist in isolated JSON files",
  { timeout: 60000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mfec-test-"));
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    let output = "";
    const child: ChildProcess = spawn(
      process.execPath,
      [path.resolve("node_modules/tsx/dist/cli.mjs"), "server/index.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "development",
          HOST: "127.0.0.1",
          PORT: String(port),
          DATA_DIR: path.join(root, "data"),
          BACKUPS_DIR: path.join(root, "backups"),
          EXPORTS_DIR: path.join(root, "exports"),
          APP_SECRET: "test-encryption-secret",
          SESSION_SECRET: "test-session-secret",
          ADMIN_USERNAME: "admin",
          ADMIN_PASSWORD: "TestPassword123!",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    try {
      let ready = false;
      for (let i = 0; i < 80; i++) {
        if (child.exitCode !== null) break;
        try {
          ready = (await fetch(`${origin}/api/health`)).ok;
          if (ready) break;
        } catch {
          /* not listening yet */
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert.ok(ready, `Server did not start: ${output}`);
      const request = (
        endpoint: string,
        method = "GET",
        body?: unknown,
        cookie?: string,
      ) =>
        fetch(`${origin}${endpoint}`, {
          method,
          headers: {
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      assert.equal((await request("/api/admin/customers")).status, 401);
      assert.equal((await request("/api/admin/genesys/config")).status, 401);
      const publicProducts = (await (
        await request("/api/public/products")
      ).json()) as { items: unknown[] };
      assert.ok(publicProducts.items.length >= 8);
      const inquiry = await request("/api/public/inquiries", "POST", {
        firstName: "ทดสอบ",
        lastName: "ระบบ",
        phone: "0812345678",
        productId: "PROD00001",
        preferredChannel: "VOICE",
        preferredContactTime: "10:00",
        consent: true,
      });
      assert.equal(inquiry.status, 201);
      assert.equal(
        (
          await request("/api/admin/auth/login", "POST", {
            username: "admin",
            password: "wrong",
          })
        ).status,
        401,
      );
      const login = await request("/api/admin/auth/login", "POST", {
        username: "admin",
        password: "TestPassword123!",
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      assert.equal(
        (await request("/api/admin/genesys/contact-lists/not-a-uuid")).status,
        401,
      );
      assert.equal(
        (
          await request(
            "/api/admin/genesys/contact-lists/not-a-uuid",
            "GET",
            undefined,
            cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/api/admin/genesys/config",
            "PUT",
            { contactListId: "Contact List Name" },
            cookie,
          )
        ).status,
        400,
      );
      const get = async <T>(endpoint: string) =>
        (await (await request(endpoint, "GET", undefined, cookie)).json()) as T;
      const customers = await get<{
        total: number;
        items: { customerId: string }[];
      }>("/api/admin/customers");
      assert.equal(customers.total, 30);
      const sample = await get<{ policyNumber: string }>(
        "/api/admin/policies/POL00001",
      );
      assert.equal(sample.policyNumber, "MFEC-MC-2026-00001");
      const createdResponse = await request(
        "/api/admin/customers",
        "POST",
        {
          firstName: "ใหม่",
          lastName: "ทดสอบ",
          phone: "0899999999",
          email: "",
          preferredChannel: "VOICE",
          province: "กรุงเทพมหานคร",
          dnc: false,
        },
        cookie,
      );
      assert.equal(
        createdResponse.status,
        201,
        await createdResponse.clone().text(),
      );
      const created = (await createdResponse.json()) as { customerId: string };
      const updatedCustomer = await request(
        `/api/admin/customers/${created.customerId}`,
        "PUT",
        { province: "นนทบุรี" },
        cookie,
      );
      assert.equal(updatedCustomer.status, 200);
      assert.equal(
        ((await updatedCustomer.json()) as { province: string }).province,
        "นนทบุรี",
      );
      const source = await get<Record<string, unknown>>(
        "/api/admin/policies/POL00001",
      );
      const policyResponse = await request(
        "/api/admin/policies",
        "POST",
        {
          ...source,
          customerId: created.customerId,
          effectiveDate: "2026-10-01",
          expiryDate: "2027-09-30",
        },
        cookie,
      );
      assert.equal(
        policyResponse.status,
        201,
        await policyResponse.clone().text(),
      );
      const createdPolicy = (await policyResponse.json()) as {
        policyId: string;
        policyNumber: string;
      };
      const updatedPolicy = await request(
        `/api/admin/policies/${createdPolicy.policyId}`,
        "PUT",
        { renewalStatus: "CONTACTED" },
        cookie,
      );
      assert.equal(updatedPolicy.status, 200);
      assert.equal(
        ((await updatedPolicy.json()) as { renewalStatus: string })
          .renewalStatus,
        "CONTACTED",
      );
      assert.equal(
        (
          await request("/api/public/policies/renew", "POST", {
            policyNumber: "UNKNOWN",
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request("/api/public/policies/renew", "POST", {
            policyNumber: "",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/api/admin/policies/${createdPolicy.policyId}/renew`,
            "POST",
          )
        ).status,
        401,
      );
      const eventController = new AbortController();
      const eventResponse = await fetch(
        `${origin}/api/admin/policies/renewal-events`,
        { headers: { Cookie: cookie }, signal: eventController.signal },
      );
      assert.equal(eventResponse.status, 200);
      const eventReader = eventResponse.body!.getReader();
      assert.match(
        new TextDecoder().decode((await eventReader.read()).value),
        /connected/,
      );
      try {
        const renewalResponse = await request(
          "/api/public/policies/renew",
          "POST",
          { policyNumber: createdPolicy.policyNumber },
        );
        assert.equal(renewalResponse.status, 200);
        const renewed = (await renewalResponse.json()) as {
          policyNumber: string;
          previousExpiryDate: string;
          effectiveDate: string;
          expiryDate: string;
          renewalStatus: string;
          alreadyRenewed: boolean;
        };
        assert.deepEqual(
          {
            previousExpiryDate: renewed.previousExpiryDate,
            effectiveDate: renewed.effectiveDate,
            expiryDate: renewed.expiryDate,
            renewalStatus: renewed.renewalStatus,
            alreadyRenewed: renewed.alreadyRenewed,
          },
          {
            previousExpiryDate: "2027-09-30",
            effectiveDate: "2027-10-01",
            expiryDate: "2028-09-30",
            renewalStatus: "RENEWED",
            alreadyRenewed: false,
          },
        );
        const eventText = new TextDecoder().decode(
          (await eventReader.read()).value,
        );
        assert.match(eventText, /event: policy-renewed/);
        assert.match(eventText, new RegExp(createdPolicy.policyNumber));
        const duplicate = await request("/api/public/policies/renew", "POST", {
          policyNumber: createdPolicy.policyNumber,
        });
        assert.equal(duplicate.status, 200);
        const duplicateBody = (await duplicate.json()) as {
          expiryDate: string;
          alreadyRenewed: boolean;
        };
        assert.equal(duplicateBody.expiryDate, "2028-09-30");
        assert.equal(duplicateBody.alreadyRenewed, true);
        const adminRenewal = await request(
          `/api/admin/policies/${createdPolicy.policyId}/renew`,
          "POST",
          {},
          cookie,
        );
        assert.equal(adminRenewal.status, 200);
        assert.equal(
          ((await adminRenewal.json()) as { alreadyRenewed: boolean })
            .alreadyRenewed,
          true,
        );
        const refreshed = await get<{
          renewalStatus: string;
          expiryDate: string;
        }>(`/api/admin/policies/${createdPolicy.policyId}`);
        assert.equal(refreshed.renewalStatus, "RENEWED");
        assert.equal(refreshed.expiryDate, "2028-09-30");
      } finally {
        eventController.abort();
      }
      assert.equal(
        (
          await request(
            `/api/admin/customers/${created.customerId}`,
            "DELETE",
            undefined,
            cookie,
          )
        ).status,
        409,
      );
      const campaignResponse = await request(
        "/api/admin/campaigns",
        "POST",
        {
          name: "Test campaign",
          description: "API test",
          filters: { excludeDnc: true },
        },
        cookie,
      );
      assert.equal(
        campaignResponse.status,
        201,
        await campaignResponse.clone().text(),
      );
      const campaign = (await campaignResponse.json()) as {
        campaignListId: string;
      };
      const dashboard = await get<{ kpis: { totalCustomers: number } }>(
        "/api/admin/dashboard",
      );
      assert.equal(dashboard.kpis.totalCustomers, 31);
      const originalProduct = await get<Record<string, unknown>>(
        "/api/admin/products/PROD00001",
      );
      const newProductResponse = await request(
        "/api/admin/products",
        "POST",
        {
          ...originalProduct,
          productCode: "MFEC-TEST",
          slug: "mfec-api-test",
          productName: "MFEC API Test",
        },
        cookie,
      );
      assert.equal(
        newProductResponse.status,
        201,
        await newProductResponse.clone().text(),
      );
      const newProduct = (await newProductResponse.json()) as {
        productId: string;
      };
      const changedProduct = await request(
        `/api/admin/products/${newProduct.productId}`,
        "PUT",
        { startingPremium: 12345 },
        cookie,
      );
      assert.equal(changedProduct.status, 200);
      assert.equal(
        ((await changedProduct.json()) as { startingPremium: number })
          .startingPremium,
        12345,
      );
      const previewResponse = await request(
        `/api/admin/campaigns/${campaign.campaignListId}/preview`,
        "POST",
        {},
        cookie,
      );
      assert.equal(previewResponse.status, 200);
      const previewBody = (await previewResponse.json()) as {
        summary: { eligible: number };
      };
      assert.ok(previewBody.summary.eligible > 0);
      const exportResponse = await request(
        `/api/admin/campaigns/${campaign.campaignListId}/export`,
        "POST",
        { selectedIds: ["POL00001"] },
        cookie,
      );
      assert.equal(
        exportResponse.status,
        200,
        await exportResponse.clone().text(),
      );
      assert.deepEqual(
        [...new Uint8Array(await exportResponse.arrayBuffer()).slice(0, 3)],
        [0xef, 0xbb, 0xbf],
      );
      const savedGenesysConfig = await request(
        "/api/admin/genesys/config",
        "PUT",
        {
          clientId: "test-client",
          clientSecret: "test-secret",
          contactListId: "11111111-1111-4111-8111-111111111111",
          contactListName: "Test List",
        },
        cookie,
      );
      assert.equal(savedGenesysConfig.status, 200);
      const configResult = (await savedGenesysConfig.json()) as {
        config: {
          secretConfigured: boolean;
          clientSecretEncrypted?: string;
          contactListId: string;
        };
        enabledRegions?: unknown[];
      };
      assert.equal(configResult.config.secretConfigured, true);
      assert.equal(configResult.config.clientSecretEncrypted, undefined);
      assert.equal(
        configResult.config.contactListId,
        "11111111-1111-4111-8111-111111111111",
      );
      assert.ok(Array.isArray(configResult.enabledRegions));
      assert.ok(configResult.enabledRegions.length > 0);
      const backupResponse = await request(
        "/api/admin/settings/backup",
        "POST",
        {},
        cookie,
      );
      assert.equal(backupResponse.status, 201);
      const backup = (await backupResponse.json()) as { downloadUrl: string };
      const download = await get<{
        files: Record<
          string,
          { clientId?: string; clientSecretEncrypted?: string }
        >;
      }>(backup.downloadUrl);
      assert.ok(download.files["config/genesys.json"]);
      assert.equal(download.files["config/genesys.json"].clientId, undefined);
      assert.equal(
        download.files["config/genesys.json"].clientSecretEncrypted,
        undefined,
      );
      assert.equal(
        (
          await request(
            `/api/admin/products/${newProduct.productId}`,
            "DELETE",
            undefined,
            cookie,
          )
        ).status,
        204,
      );
      assert.equal(
        (
          await request(
            `/api/admin/policies/${createdPolicy.policyId}`,
            "DELETE",
            undefined,
            cookie,
          )
        ).status,
        204,
      );
      assert.equal(
        (
          await request(
            `/api/admin/customers/${created.customerId}`,
            "DELETE",
            undefined,
            cookie,
          )
        ).status,
        204,
      );
      const reset = await request(
        "/api/admin/settings/reset-demo",
        "POST",
        { confirmation: "RESET" },
        cookie,
      );
      assert.equal(reset.status, 200);
      assert.equal(
        (await get<{ total: number }>("/api/admin/customers")).total,
        30,
      );
      const logout = await request(
        "/api/admin/auth/logout",
        "POST",
        {},
        cookie,
      );
      assert.equal(logout.status, 204);
      assert.equal(
        (await request("/api/admin/customers", "GET", undefined, cookie))
          .status,
        401,
      );
      assert.equal(
        (
          await request("/api/admin/auth/change-password", "POST", {
            currentPassword: "TestPassword123!",
            newPassword: "NewPassword456!",
            confirmPassword: "NewPassword456!",
          })
        ).status,
        401,
      );
      const primaryLogin = await request("/api/admin/auth/login", "POST", {
        username: "admin",
        password: "TestPassword123!",
      });
      const primaryCookie = primaryLogin.headers
        .get("set-cookie")
        ?.split(";")[0];
      assert.ok(primaryCookie);
      const secondaryLogin = await request("/api/admin/auth/login", "POST", {
        username: "admin",
        password: "TestPassword123!",
      });
      const secondaryCookie = secondaryLogin.headers
        .get("set-cookie")
        ?.split(";")[0];
      assert.ok(secondaryCookie);
      const change = (body: Record<string, string>) =>
        request("/api/admin/auth/change-password", "POST", body, primaryCookie);
      assert.equal(
        (
          await change({
            currentPassword: "incorrect",
            newPassword: "NewPassword456!",
            confirmPassword: "NewPassword456!",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await change({
            currentPassword: "TestPassword123!",
            newPassword: "",
            confirmPassword: "",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await change({
            currentPassword: "TestPassword123!",
            newPassword: "NewPassword456!",
            confirmPassword: "DifferentPassword456!",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await change({
            currentPassword: "TestPassword123!",
            newPassword: "x",
            confirmPassword: "x",
          })
        ).status,
        204,
      );
      assert.equal(
        (await request("/api/admin/customers", "GET", undefined, primaryCookie))
          .status,
        401,
      );
      assert.equal(
        (
          await request(
            "/api/admin/customers",
            "GET",
            undefined,
            secondaryCookie,
          )
        ).status,
        401,
      );
      assert.deepEqual(
        await (
          await request(
            "/api/admin/auth/session",
            "GET",
            undefined,
            secondaryCookie,
          )
        ).json(),
        { authenticated: false, username: "" },
      );
      assert.equal(
        (
          await request("/api/admin/auth/login", "POST", {
            username: "admin",
            password: "TestPassword123!",
          })
        ).status,
        401,
      );
      const newLogin = await request("/api/admin/auth/login", "POST", {
        username: "admin",
        password: "x",
      });
      assert.equal(newLogin.status, 200);
      const newCookie = newLogin.headers.get("set-cookie")?.split(";")[0];
      assert.ok(newCookie);
      assert.equal(
        (await request("/api/admin/dashboard", "GET", undefined, newCookie))
          .status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/admin/auth/change-password",
            "POST",
            {
              currentPassword: "x",
              newPassword: "x",
              confirmPassword: "x",
            },
            newCookie,
          )
        ).status,
        204,
      );
      assert.equal(
        (
          await request("/api/admin/auth/login", "POST", {
            username: "admin",
            password: "x",
          })
        ).status,
        200,
      );
      const savedCredentials = await readFile(
        path.join(root, "data", ".auth", "admin.json"),
        "utf8",
      );
      assert.ok(!savedCredentials.includes("TestPassword123!"));
      assert.ok(!savedCredentials.includes('"password":"x"'));
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
