import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test(
  "Genesys sync creates once, updates complete contact, and blocks DNC/schema mismatch",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "mfec-genesys-test-"));
    process.env.DATA_DIR = path.join(temp, "data");
    process.env.APP_SECRET = "genesys-test-encryption-secret";
    const realFetch = globalThis.fetch;
    let posts = 0,
      puts = 0,
      schemaValid = true;
    let lastPut: Record<string, unknown> = {};
    try {
      const [
        { initializeBusinessData, customers, policies },
        { updateCustomer },
        { genesysRegionService },
        { GenesysConfigService },
        { encryptSecret },
        { CONTACT_COLUMNS },
        { syncPolicy },
      ] = await Promise.all([
        import("../server/domain/store"),
        import("../server/domain/business"),
        import("../server/services/genesys/genesys-region.service"),
        import("../server/services/genesys/genesys-config.service"),
        import("../server/services/genesys/secret.service"),
        import("../server/domain/campaign-contact"),
        import("../server/services/genesys/genesys-sync.service"),
      ]);
      await genesysRegionService.initialize();
      await initializeBusinessData();
      await new GenesysConfigService().updateConfig({
        clientId: "mock-client",
        clientSecretEncrypted: encryptSecret("mock-secret"),
        contactListId: "list-1",
        contactListName: "Demo",
        phoneColumn: "phone",
      });
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";
        if (url.endsWith("/oauth/token"))
          return Response.json({
            access_token: "mock-token",
            expires_in: 3600,
          });
        if (url.endsWith("/contactlists/list-1") && method === "GET")
          return Response.json({
            id: "list-1",
            name: "Demo",
            columnNames: schemaValid
              ? [...CONTACT_COLUMNS]
              : CONTACT_COLUMNS.filter((column) => column !== "vehicleType"),
            phoneColumns: [{ columnName: "phone", type: "Cell" }],
          });
        if (
          url.endsWith("/contactlists/list-1/contacts") &&
          method === "POST"
        ) {
          posts++;
          return Response.json([{ id: "contact-1" }]);
        }
        if (url.endsWith("/contacts/contact-1") && method === "GET")
          return Response.json({
            id: "contact-1",
            contactListId: "list-1",
            callable: true,
            data: { customField: "preserve" },
          });
        if (url.endsWith("/contacts/contact-1") && method === "PUT") {
          puts++;
          lastPut = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Response.json({ id: "contact-1" });
        }
        throw new Error(`Unexpected mock request: ${method} ${url}`);
      };
      const first = await syncPolicy("POL00001", "test");
      assert.equal(first.status, "SYNCED");
      assert.equal(first.contactId, "contact-1");
      assert.equal(posts, 1);
      const second = await syncPolicy("POL00001", "test");
      assert.equal(second.status, "ALREADY_SYNCED");
      assert.equal(posts, 1);
      await updateCustomer("CUST00001", { firstName: "สมศักดิ์" }, "test");
      assert.equal(
        (await policies.findById("policyId", "POL00001"))?.genesys.syncStatus,
        "OUTDATED",
      );
      const third = await syncPolicy("POL00001", "test");
      assert.equal(third.status, "SYNCED");
      assert.equal(puts, 1);
      assert.equal(posts, 1);
      assert.equal(
        (lastPut.data as Record<string, string>).customField,
        "preserve",
      );
      assert.equal(
        (lastPut.data as Record<string, string>).firstName,
        "สมศักดิ์",
      );
      await updateCustomer("CUST00001", { dnc: true }, "test");
      assert.equal(
        (await syncPolicy("POL00001", "test")).status,
        "SKIPPED_DNC",
      );
      assert.equal(posts, 1);
      assert.equal(puts, 1);
      schemaValid = false;
      const mismatch = await syncPolicy("POL00002", "test");
      assert.equal(mismatch.status, "SCHEMA_MISMATCH");
      assert.equal(posts, 1);
      assert.equal(puts, 1);
      assert.equal(
        (await customers.findById("customerId", "CUST00001"))?.dnc,
        true,
      );
    } finally {
      globalThis.fetch = realFetch;
      await rm(temp, { recursive: true, force: true });
    }
  },
);
