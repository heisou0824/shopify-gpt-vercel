let cachedToken = "";
let expiresAt = 0;
let cachedLocationId = "";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少Vercel环境变量：${name}`);
  return value;
}

function shopSubdomain() {
  return required("SHOPIFY_SHOP")
    .replace(/^https?:\/\//i, "")
    .replace(/\.myshopify\.com.*$/i, "")
    .replace(/\/+$/g, "");
}

export function publicConfig() {
  return {
    shop: shopSubdomain(),
    apiVersion: process.env.SHOPIFY_API_VERSION?.trim() || "2026-07"
  };
}

export async function getAccessToken() {
  if (cachedToken && Date.now() < expiresAt - 60_000) {
    return cachedToken;
  }

  const shop = shopSubdomain();
  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: required("SHOPIFY_CLIENT_ID"),
        client_secret: required("SHOPIFY_CLIENT_SECRET")
      })
    }
  );

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok || !data.access_token) {
    const error = new Error("Shopify访问令牌获取失败");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  cachedToken = data.access_token;
  expiresAt = Date.now() + Number(data.expires_in || 86399) * 1000;
  return cachedToken;
}

export async function graphql(query, variables = {}) {
  const shop = shopSubdomain();
  const apiVersion = process.env.SHOPIFY_API_VERSION?.trim() || "2026-07";

  const response = await fetch(
    `https://${shop}.myshopify.com/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": await getAccessToken()
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`Shopify请求失败：HTTP ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  if (payload.errors?.length) {
    const error = new Error("Shopify GraphQL返回错误");
    error.status = 400;
    error.details = payload.errors;
    throw error;
  }

  return payload.data;
}

export async function getLocationId() {
  const manual = process.env.SHOPIFY_LOCATION_ID?.trim();
  if (manual) return manual;
  if (cachedLocationId) return cachedLocationId;

  const data = await graphql(`
    query FirstActiveLocation {
      locations(first: 10, includeInactive: false) {
        nodes {
          id
          name
          isActive
        }
      }
    }
  `);

  const location = data?.locations?.nodes?.find((item) => item.isActive);
  if (!location?.id) {
    throw new Error(
      "未读取到有效库存地点。请增加read_locations权限，或填写SHOPIFY_LOCATION_ID。"
    );
  }

  cachedLocationId = location.id;
  return cachedLocationId;
}

export function errorPayload(error) {
  return {
    ok: false,
    error: error?.message || "未知错误",
    details: error?.details || null
  };
}
