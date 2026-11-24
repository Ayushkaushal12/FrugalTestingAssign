const crypto = require("crypto");
const express = require("express");

const app = express();
const port = Number(process.env.PORT || 3000);
const secret = process.env.HMAC_SECRET || "local-development-secret";
const timestampToleranceSeconds = Number(process.env.TIMESTAMP_TOLERANCE_SECONDS || 300);

const resources = new Map();
let nextId = 1;

// A nonce is recorded only after a request has passed signature validation.
const usedNonces = new Map();

function parseSignatureAuth(rawHeader, req) {
  if (!rawHeader) {
    return {
      timestamp: req.get("X-Timestamp"),
      nonce: req.get("X-Nonce"),
      signature: req.get("X-Signature")
    };
  }

  const value = rawHeader.trim();

  const keyValue = {};
  for (const match of value.matchAll(/(?:^|[;,]\s*)(timestamp|nonce|signature)\s*[=:]\s*([^;,]+)/gi)) {
    keyValue[match[1].toLowerCase()] = match[2].trim();
  }
  if (keyValue.timestamp || keyValue.nonce || keyValue.signature) {
    return keyValue;
  }

  // Also accepts compact X-Signature-Auth values:
  // timestamp.nonce.signature or timestamp|nonce|signature or timestamp:nonce:signature
  const compact = value.split(/[.|:]/);
  if (compact.length === 3) {
    return {
      timestamp: compact[0],
      nonce: compact[1],
      signature: compact[2]
    };
  }

  return {};
}

function timingSafeHexEqual(actual, expected) {
  if (!/^[a-fA-F0-9]{64}$/.test(actual) || !/^[a-fA-F0-9]{64}$/.test(expected)) {
    return false;
  }
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function purgeExpiredNonces(nowSeconds) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= nowSeconds) {
      usedNonces.delete(nonce);
    }
  }
}

app.use(express.raw({
  type: "*/*",
  limit: "1mb"
}));

app.get("/", (req, res) => {
  res.status(200).json({
    service: "Cryptographic Replay Testing API",
    status: "running",
    endpoints: ["POST /resources", "PUT /resources/:id", "GET /resources/:id"]
  });
});

function verifySignature(req, res, next) {
  const auth = parseSignatureAuth(req.get("X-Signature-Auth"), req);
  if (!auth.timestamp || !auth.nonce || !auth.signature) {
    return res.status(401).json({ error: "Missing timestamp, nonce, or signature" });
  }
  if (!/^\d+$/.test(auth.timestamp) || !auth.nonce.trim()) {
    return res.status(401).json({ error: "Invalid timestamp or nonce format" });
  }

  const timestamp = Number(auth.timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > timestampToleranceSeconds) {
    return res.status(401).json({ error: "Timestamp outside allowed window" });
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${auth.timestamp}.${auth.nonce}.`);
  hmac.update(req.body);
  const expected = hmac.digest("hex");

  if (!timingSafeHexEqual(auth.signature, expected)) {
    return res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
  }

  purgeExpiredNonces(now);
  if (usedNonces.has(auth.nonce)) {
    return res.status(409).json({ error: "Replay detected: nonce already used" });
  }

  usedNonces.set(auth.nonce, now + timestampToleranceSeconds);
  req.authContext = auth;
  next();
}

function parseJsonBody(req, res) {
  if (!req.body || req.body.length === 0) {
    res.status(400).json({ error: "Request body is required" });
    return null;
  }

  try {
    const body = JSON.parse(req.body.toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("JSON object required");
    }
    return body;
  } catch (error) {
    res.status(400).json({ error: "Invalid JSON body" });
    return null;
  }
}

app.post("/resources", verifySignature, (req, res) => {
  const body = parseJsonBody(req, res);
  if (!body) return;

  const id = String(nextId++);
  const resource = { id, ...body };
  resources.set(id, resource);
  res.status(201).location(`/resources/${id}`).json(resource);
});

app.put("/resources/:id", verifySignature, (req, res) => {
  const body = parseJsonBody(req, res);
  if (!body) return;

  if (!resources.has(req.params.id)) {
    return res.status(404).json({ error: "Resource not found" });
  }

  const resource = { ...resources.get(req.params.id), ...body, id: req.params.id };
  resources.set(req.params.id, resource);
  res.status(200).json(resource);
});

app.get("/resources/:id", (req, res) => {
  if (!resources.has(req.params.id)) {
    return res.status(404).json({ error: "Resource not found" });
  }
  res.status(200).json(resources.get(req.params.id));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Signed API listening on http://localhost:${port}`);
  });
}

module.exports = { app, resources, secret };
