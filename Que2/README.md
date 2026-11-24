# Cryptographic Replay Testing API

This Express service signs and verifies resource requests with HMAC-SHA256.

## Start

```powershell
npm install
npm start
```

The API listens on `http://localhost:3000`.

## Signature format

Send `X-Signature-Auth` as:

```text
<unix-timestamp>.<nonce>.<64-character-hex-hmac>
```

The HMAC-SHA256 input is:

```text
<unix-timestamp>.<nonce>.<exact raw HTTP request body bytes>
```

The timestamp must be within 300 seconds of server time. A nonce can be used only once.
The API also accepts `X-Timestamp`, `X-Nonce`, and `X-Signature`, or key-value header
forms such as `timestamp=...;nonce=...;signature=...`.

## Endpoints

- `POST /resources` - create a resource; returns `201` and an entity ID.
- `PUT /resources/:id` - modify a resource; returns `200`.
- `GET /resources/:id` - retrieve a resource.

Relevant HTTP responses are `401` for authentication/signature/timestamp failures,
`409` for nonce replay, `404` for a missing resource, and `400` for invalid JSON.

## Test and critical report

```powershell
npm test
```

The test creates a resource, extracts its dynamic ID, modifies it, and checks replay,
tampering, stale timestamps, and HTTP state. It writes `vulnerability-report.json`.
