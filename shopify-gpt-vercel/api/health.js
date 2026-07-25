import { handleOptions, json } from "../lib/http.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "只支持GET" });
  }

  return json(res, 200, {
    ok: true,
    service: "Shopify GPT Vercel API",
    configured: {
      shop: Boolean(process.env.SHOPIFY_SHOP),
      clientId: Boolean(process.env.SHOPIFY_CLIENT_ID),
      clientSecret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
      apiKey: Boolean(process.env.GPT_API_KEY)
    },
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-07"
  });
}
