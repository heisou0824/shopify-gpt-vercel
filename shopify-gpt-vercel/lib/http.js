export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

export function json(res, status, body) {
  cors(res);
  return res.status(status).json(body);
}

export function requireBearer(req, res) {
  const expected = process.env.GPT_API_KEY?.trim();
  if (!expected) {
    json(res, 500, {
      ok: false,
      error: "Vercel未设置GPT_API_KEY"
    });
    return false;
  }

  const header = String(req.headers.authorization || "");
  const supplied = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";

  if (!supplied || supplied !== expected) {
    json(res, 401, {
      ok: false,
      error: "接口API Key无效"
    });
    return false;
  }

  return true;
}

export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }
  return {};
}
