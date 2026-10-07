import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin";
import { GenesysConfigService } from "../services/genesys/genesys-config.service";
import { genesysApiClient } from "../services/genesys/genesys-api.client";
import { genesysRegionService } from "../services/genesys/genesys-region.service";
import { encryptSecret } from "../services/genesys/secret.service";
import type { GenesysConfig } from "../services/genesys/types";

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

genesysAdminRouter.get("/regions/:regionId", async (request, response, next) => {
  try {
    response.json({
      region: await genesysRegionService.getRegion(request.params.regionId),
      history: await genesysRegionService.getHistory(request.params.regionId)
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.post("/regions", async (request, response, next) => {
  try {
    const region = await genesysRegionService.createCustomRegion(request.body, request.user?.name);
    response.status(201).json({ region });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.put("/regions/:regionId", async (request, response, next) => {
  try {
    const region = await genesysRegionService.updateRegion(
      request.params.regionId,
      request.body,
      request.user?.name
    );
    response.json({ region });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.post("/regions/:regionId/test", async (request, response, next) => {
  try {
    response.json({
      regionId: request.params.regionId,
      results:
        Object.keys(request.body ?? {}).length > 0
          ? await genesysRegionService.validateEndpointValues(request.body)
          : await genesysRegionService.validateEndpoints(request.params.regionId)
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.post("/regions/:regionId/reset", async (request, response, next) => {
  try {
    response.json({
      region: await genesysRegionService.resetRegion(request.params.regionId, request.user?.name)
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.delete("/regions/:regionId", async (request, response, next) => {
  try {
    await genesysRegionService.deleteRegion(request.params.regionId);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.get("/config", async (_request, response, next) => {
  try {
    const config = await configService.getConfig();
    const activeRegion = await genesysRegionService.getActiveRegion();
    const regions = await genesysRegionService.listRegions();
    response.json({
      config: serializeConfig(config),
      activeRegion,
      enabledRegions: regions.filter((region) => region.enabled)
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.put("/config", async (request, response, next) => {
  try {
    const body = request.body as Partial<GenesysConfig> & { clientSecret?: string };
    const update: Partial<GenesysConfig> = {
      enabled: body.enabled,
      regionId: body.regionId,
      clientId: body.clientId,
      contactListId: body.contactListId,
      contactListName: body.contactListName,
      phoneColumn: body.phoneColumn
    };
    if (body.clientSecret !== undefined) {
      update.clientSecretEncrypted = encryptSecret(body.clientSecret);
    }

    const config = await configService.updateConfig(update, request.user?.name);
    response.json({
      config: serializeConfig(config),
      activeRegion: await genesysRegionService.getActiveRegion()
    });
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.post("/test-connection", async (_request, response, next) => {
  try {
    await genesysApiClient.getAccessToken();
    const config = await configService.markConnection("SUCCESS");
    response.json({ ok: true, config: serializeConfig(config) });
  } catch (error) {
    const config = await configService.markConnection("FAILED");
    response.status(400).json({
      ok: false,
      config: serializeConfig(config),
      message: error instanceof Error ? error.message : "Connection test failed"
    });
  }
});

genesysAdminRouter.post("/load-contact-lists", async (_request, response, next) => {
  try {
    const data = await genesysApiClient.get("/api/v2/outbound/contactlists?pageSize=100");
    response.json(data);
  } catch (error) {
    next(error);
  }
});

genesysAdminRouter.post("/validate-schema", async (_request, response) => {
  const config = await configService.getConfig();
  const valid = Boolean(config.contactListId && config.phoneColumn);
  const next = await configService.markSchema(valid ? "VALID" : "INVALID");
  response.status(valid ? 200 : 400).json({
    ok: valid,
    config: serializeConfig(next),
    message: valid ? "Schema is valid." : "Contact List ID and Phone Column are required."
  });
});

function serializeConfig(config: GenesysConfig) {
  return {
    ...config,
    clientSecretEncrypted: undefined,
    secretConfigured: Boolean(config.clientSecretEncrypted)
  };
}
