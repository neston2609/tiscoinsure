import { randomUUID } from "node:crypto";
import { JsonRepository } from "./json-repository";
import {
  seedCampaignLists,
  seedCustomers,
  seedInquiries,
  seedPolicies,
  seedProducts,
} from "./seed";
import type {
  AuditRecord,
  CampaignList,
  Customer,
  GenesysScheduleTask,
  Inquiry,
  Policy,
  Product,
} from "./types";

export const customers = new JsonRepository<Customer>(
  "customers.json",
  seedCustomers,
);
export const products = new JsonRepository<Product>(
  "products.json",
  seedProducts,
);
export const policies = new JsonRepository<Policy>(
  "policies.json",
  seedPolicies,
);
export const inquiries = new JsonRepository<Inquiry>(
  "inquiries.json",
  seedInquiries,
);
export const campaigns = new JsonRepository<CampaignList>(
  "campaign-lists.json",
  seedCampaignLists,
);
export const genesysScheduleTasks = new JsonRepository<GenesysScheduleTask>(
  "genesys-schedule-tasks.json",
  () => [],
);
export const auditLog = new JsonRepository<AuditRecord>(
  "audit-log.json",
  () => [],
);
export const businessRepositories = [
  customers,
  products,
  policies,
  inquiries,
  campaigns,
  genesysScheduleTasks,
  auditLog,
] as const;

export async function initializeBusinessData(): Promise<void> {
  for (const repository of businessRepositories) await repository.initialize();
}

export async function audit(
  action: string,
  actor: string,
  target = "",
  detail: Record<string, unknown> = {},
): Promise<void> {
  await auditLog.mutate((rows) => {
    rows.unshift({
      id: randomUUID(),
      action,
      actor,
      target,
      detail,
      timestamp: new Date().toISOString(),
    });
  });
}

export function nextId<T>(prefix: string, rows: T[], key: keyof T): string {
  const highest = rows.reduce((max, row) => {
    const match = String(row[key] ?? "").match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(5, "0")}`;
}
