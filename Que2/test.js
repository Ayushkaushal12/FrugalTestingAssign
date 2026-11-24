const crypto = require("crypto");
const http = require("http");
const fs = require("fs");

const { app, secret } = require("./server");

const port = 3137;
const baseUrl = `http://127.0.0.1:${port}`;
const server = app.listen(port);

function sign(timestamp, nonce, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.`)
    .update(rawBody)
    .digest("hex");
}

function request(method, path, rawBody, timestamp, nonce, signedRawBody = rawBody) {
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  const signedPayload = Buffer.isBuffer(signedRawBody)
    ? signedRawBody
    : Buffer.from(signedRawBody || "");
  const sig = sign(String(timestamp), nonce, signedPayload);

  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length,
        "X-Signature-Auth": `${timestamp}.${nonce}.${sig}`
      }
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({
        status: res.statusCode,
        body: body ? JSON.parse(body) : null,
        headers: res.headers
      }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const checks = [];

  const originalCreate = Buffer.from('{"name":"original"}');
  const created = await request("POST", "/resources", originalCreate, now, "create-nonce-1");
  checks.push({ test: "POST resource creation", passed: created.status === 201 });
  if (created.status !== 201) throw new Error(`POST failed: ${created.status}`);

  const id = String(created.body.id);
  checks.push({ test: "Dynamic entity ID extraction", passed: /^\d+$/.test(id) && created.headers.location === `/resources/${id}` });

  const originalUpdate = Buffer.from('{"name":"updated","quantity":2}');
  const updated = await request("PUT", `/resources/${id}`, originalUpdate, now, "update-nonce-1");
  checks.push({ test: "PUT resource modification", passed: updated.status === 200 && updated.body.name === "updated" && updated.body.quantity === 2 });

  const replay = await request("PUT", `/resources/${id}`, originalUpdate, now, "update-nonce-1");
  checks.push({ test: "Nonce replay prevention", passed: replay.status === 409 });

  const tampered = await request(
    "PUT",
    `/resources/${id}`,
    Buffer.from('{"name":"tampered","quantity":99}'),
    now,
    "tamper-nonce-1",
    originalUpdate
  );
  checks.push({ test: "Request body tampering detection", passed: tampered.status === 401 });

  const staleTimestamp = now - 600;
  const stale = await request("PUT", `/resources/${id}`, originalUpdate, staleTimestamp, "stale-nonce-1");
  checks.push({ test: "Unix timestamp validation", passed: stale.status === 401 });

  const stored = await new Promise((resolve, reject) => {
    http.get(`${baseUrl}/resources/${id}`, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on("error", reject);
  });
  checks.push({ test: "HTTP status and state validation", passed: stored.status === 200 && stored.body.quantity === 2 && stored.body.name === "updated" });

  const report = {
    severity: "CRITICAL",
    category: "Cryptographic Replay Testing",
    timestamp: new Date().toISOString(),
    summary: checks.every(check => check.passed)
      ? "No critical replay, signature, timestamp, or tampering vulnerability observed."
      : "One or more critical cryptographic controls failed.",
    checks
  };
  fs.writeFileSync("vulnerability-report.json", JSON.stringify(report, null, 2));

  const failed = checks.filter(check => !check.passed);
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exitCode = 1;
}

server.on("listening", () => {
  run().finally(() => server.close());
});
