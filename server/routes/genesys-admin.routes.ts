import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin";
import { GenesysConfigService } from "../services/genesys/genesys-config.service";
import { genesysApiClient } from "../services/genesys/genesys-api.client";
import { genesysRegionService } from "../services/genesys/genesys-region.service";
import { encryptSecret } from "../services/genesys/secret.service";
import type { GenesysConfig } from "../services/genesys/types";
import {
  bulkSyncPolicies,
  syncPolicy,
  validateContactListSchema,
} from "../services/genesys/genesys-sync.service";
import { z } from "zod";
import { mapCampaignContact } from "../domain/campaign-contact";
import { customers, policies, products } from "../domain/store";

export const genesysAdminRouter = Router();
const configService = new GenesysConfigService();

genesysAdminRouter.use(requireAdmin);

genesysAdminRouter.get("/regions", async (_request, response, next) => {
  try {
    response.json({ regions: await genesysRegionService.listRegions() });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.get(
  "/regions/:regionId",
  async (request, response, next) => {
    try {
      response.json({
        region: await genesysRegionService.getRegion(request.params.regionId),
        history: await genesysRegionService.getHistory(request.params.regionId),
      });
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.post("/regions", async (request, response, next) => {
  try {
    const region = await genesysRegionService.createCustomRegion(
      request.body,
      request.user?.name,
    );
    response.status(201).json({ region });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.put(
  "/regions/:regionId",
  async (request, response, next) => {
    try {
      const region = await genesysRegionService.updateRegion(
        request.params.regionId,
        request.body,
        request.user?.name,
      );
      response.json({ region });
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.post(
  "/regions/:regionId/test",
  async (request, response, next) => {
    try {
      response.json({
        regionId: request.params.regionId,
        results:
          Object.keys(request.body ?? {}).length > 0
            ? await genesysRegionService.validateEndpointValues(request.body)
            : await genesysRegionService.validateEndpoints(
                request.params.regionId,
              ),
      });
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.post(
  "/regions/:regionId/reset",
  async (request, response, next) => {
    try {
      response.json({
        region: await genesysRegionService.resetRegion(
          request.params.regionId,
          request.user?.name,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.delete(
  "/regions/:regionId",
  async (request, response, next) => {
    try {
      await genesysRegionService.deleteRegion(request.params.regionId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.get("/config", async (_request, response, next) => {
  try {
    const config = await configService.getConfig();
    const activeRegion = await genesysRegionService.getActiveRegion();
    const regions = await genesysRegionService.listRegions();
    response.json({
      config: serializeConfig(config),
      activeRegion,
      enabledRegions: regions.filter((region) => region.enabled),
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.put("/config", async (request, response, next) => {
  try {
    const body = request.body as Partial<GenesysConfig> & {
      clientSecret?: string;
    };
    if (body.regionId) {
      const region = await genesysRegionService.getRegion(body.regionId);
      if (!region.enabled) {
        response.status(400).json({ message: "Selected region is disabled" });
        return;
      }
    }
    const update: Partial<GenesysConfig> = {
      enabled: body.enabled,
      regionId: body.regionId,
      clientId: body.clientId,
      contactListId: body.contactListId,
      contactListName: body.contactListName,
      phoneColumn: body.phoneColumn,
    };
    if (body.clientSecret !== undefined) {
      update.clientSecretEncrypted = encryptSecret(body.clientSecret);
    }

    const config = await configService.updateConfig(update, request.user?.name);
    response.json({
      config: serializeConfig(config),
      activeRegion: await genesysRegionService.getActiveRegion(),
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.post("/test-connection", async (request, response) => {
  try {
    const draft = z
      .object({
        regionId: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
      })
      .parse(request.body || {});
    await genesysApiClient.getAccessToken(draft);
    await genesysApiClient.get(
      "/api/v2/outbound/contactlists?pageSize=1",
      draft,
    );
    const saved = await configService.getConfig();
    const isSaved =
      (!draft.regionId || draft.regionId === saved.regionId) &&
      (!draft.clientId || draft.clientId === saved.clientId) &&
      !draft.clientSecret;
    const config = isSaved
      ? await configService.markConnection("SUCCESS")
      : saved;
    response.json({
      ok: true,
      config: serializeConfig(config),
      message: isSaved
        ? "Connection verified"
        : "Draft connection verified; save to apply",
    });
  } catch (error) {
    const config =
      request.body && Object.keys(request.body).length
        ? await configService.getConfig()
        : await configService.markConnection("FAILED");
    response.status(400).json({
      ok: false,
      config: serializeConfig(config),
      message:
        error instanceof Error ? error.message : "Connection test failed",
    });
  }
});

genesysAdminRouter.post(
  "/load-contact-lists",
  async (_request, response, next) => {
    try {
      const data = await genesysApiClient.get(
        "/api/v2/outbound/contactlists?pageSize=100",
      );
      response.json(data);
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.post(
  "/validate-schema",
  async (_request, response, next) => {
    try {
      const schema = await validateContactListSchema();
      response.json({
        ok: schema.valid,
        schema,
        config: serializeConfig(await configService.getConfig()),
        message: schema.message,
      });
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.get(
  "/sync/policies/:id/payload",
  async (request, response) => {
    const policy = await policies.findById("policyId", request.params.id);
    if (!policy) {
      response.status(404).json({ message: "Policy not found" });
      return;
    }
    const [customer, product] = await Promise.all([
      customers.findById("customerId", policy.customerId),
      products.findById("productId", policy.productId),
    ]);
    if (!customer || !product) {
      response
        .status(409)
        .json({ message: "Policy customer or product is missing" });
      return;
    }
    response.json({
      data: mapCampaignContact(policy, customer, product),
      callable: !customer.dnc,
      eligibility: customer.dnc ? "DNC" : "READY",
    });
  },
);

genesysAdminRouter.post(
  "/sync/policies/:id",
  async (request, response, next) => {
    try {
      response.json(await syncPolicy(request.params.id, request.user!.name));
    } catch (error) {
      next(error);
    }
  },
);

genesysAdminRouter.post("/sync/bulk", async (request, response, next) => {
  try {
    const body = z
      .object({
        policyIds: z.array(z.string()).min(1).max(100),
        campaignListId: z.string().optional(),
      })
      .parse(request.body);
    response.json(
      await bulkSyncPolicies(
        body.policyIds,
        request.user!.name,
        body.campaignListId,
      ),
    );
  } catch (error) {
    next(error);
  }
});

function serializeConfig(config: GenesysConfig) {
  return {
    ...config,
    clientSecretEncrypted: undefined,
    secretConfigured: Boolean(config.clientSecretEncrypted),
  };
}
