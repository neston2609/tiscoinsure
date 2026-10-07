import { GenesysConfigService } from "./genesys-config.service";
import { genesysRegionService } from "./genesys-region.service";
import { decryptSecret } from "./secret.service";
import { tokenCacheService } from "./token-cache.service";

export class GenesysApiClient {
  constructor(private readonly configService = new GenesysConfigService()) {}

  async apiUrl(path: string): Promise<string> {
    const region = await genesysRegionService.getActiveRegion();
    return joinUrl(region.apiBaseUrl, path);
  }

  async oauthTokenUrl(): Promise<string> {
    const region = await genesysRegionService.getActiveRegion();
    return joinUrl(region.authBaseUrl, "/oauth/token");
  }

  async getAccessToken(): Promise<string> {
    const config = await this.configService.getConfig();
    const cached = tokenCacheService.get(config.regionId);
    if (cached) {
      return cached;
    }

    const secret = decryptSecret(config.clientSecretEncrypted);
    if (!config.clientId || !secret) {
      throw new Error("Client ID and Client Secret are required before testing the Genesys connection.");
    }

    const response = await fetch(await this.oauthTokenUrl(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });

    if (!response.ok) {
      throw new Error(`Genesys OAuth failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error("Genesys OAuth response did not include an access token.");
    }
    tokenCacheService.set(config.regionId, body.access_token, body.expires_in ?? 3600);
    return body.access_token;
  }

  async get(path: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const response = await fetch(await this.apiUrl(path), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`Genesys API failed with HTTP ${response.status}`);
    }
    return response.json();
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export const genesysApiClient = new GenesysApiClient();
