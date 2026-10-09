import { ReplitConnectors } from "@replit/connectors-sdk";

// Configuration only. Never creates customers or charges a store account.
const connectors = new ReplitConnectors();
const project = "projc174b989";
const base = `/v2/projects/${project}`;
async function api(path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await connectors.proxy("revenuecat", `${base}${path}`, {
    method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
async function ensure(path: string, matches: (item: any) => boolean, body: unknown) {
  const list = await api(path);
  return list.items.find(matches) ?? api(path, "POST", body);
}
const android = await ensure("/apps", a => a.type === "play_store", {
  name: "Lumina Android", type: "play_store", play_store: { package_name: "com.lumina.app" },
});
// This connection exposes the standard RevenueCat API, not Replit's simulated
// Test Store. Real prices must be configured in Google Play ($4.99 USD/month).
const products = [await ensure("/products", p => p.app_id === android.id && p.store_identifier === "lumina_premium:monthly", {
  app_id: android.id, store_identifier: "lumina_premium:monthly",
  type: "subscription", display_name: "Lumina Premium Monthly",
})];
const entitlement = await ensure("/entitlements", e => e.lookup_key === "premium", {
  lookup_key: "premium", display_name: "Lumina Premium",
});
await api(`/entitlements/${entitlement.id}/actions/attach_products`, "POST", { product_ids: products.map(p => p.id) });
const offering = await ensure("/offerings", o => o.lookup_key === "default", {
  lookup_key: "default", display_name: "Lumina plans",
});
if (!offering.is_current) await api(`/offerings/${offering.id}`, "PATCH", { is_current: true });
const pkg = await ensure(`/offerings/${offering.id}/packages`, p => p.lookup_key === "$rc_monthly", {
  lookup_key: "$rc_monthly", display_name: "Monthly Premium",
});
await api(`/packages/${pkg.id}/actions/attach_products`, "POST", {
  products: products.map(p => ({ product_id: p.id, eligibility_criteria: "all" })),
});
console.log(JSON.stringify({ projectId: project, androidAppId: android.id, entitlementId: entitlement.id }));
