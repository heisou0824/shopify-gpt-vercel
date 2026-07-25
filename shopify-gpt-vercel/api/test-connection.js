import { handleOptions, json, requireBearer } from "../lib/http.js";
import { graphql, errorPayload } from "../lib/shopify.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireBearer(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "只支持GET" });
  }

  try {
    const data = await graphql(`
      query ConnectionTest {
        shop {
          name
          myshopifyDomain
          currencyCode
        }
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `);

    return json(res, 200, {
      ok: true,
      shop: data.shop,
      scopes:
        data.currentAppInstallation?.accessScopes?.map((item) => item.handle) || []
    });
  } catch (error) {
    return json(res, error.status || 500, errorPayload(error));
  }
}
