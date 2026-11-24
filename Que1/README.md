# Frugal Testing Assignment - Question 1

A local Node.js, Express, WebSocket, HTML5 Canvas, and Playwright financial dashboard. It does not use Binance or any external website.

## Requirements covered

- Continuous Canvas market chart fed by local WebSocket packets.
- Initial loading skeleton and `data-state-sync` synchronization state.
- Approximately 4 packets/second, with every fourth packet dropped.
- Server delivery latency randomized from 2000 to 7000 ms.
- Skeleton and Canvas synchronization guardian with no static sleeps in application readiness logic.
- Three rapid buy clicks spaced by 80 ms, inside the requested 30-120 ms event window.
- A bounded exponential backoff/circuit breaker client utility is included in `public/resilience.js`.
- Transaction request interception replaces `precision: 2` with the invalid string representation `"2.5"`.
- Express validation rejection, toast, telemetry, and `data-error-boundary` state.
- Execution JSON/HTML reports and server/test logs.

## Project structure

```text
Que1/
  server.js
  public/
    index.html
    app.js
    styles.css
    resilience.js
  tests/
    dashboard.spec.js
  playwright.config.js
  package.json
  artifacts/
  playwright-report/
```

## Installation

```powershell
cd D:\JuspayAssignment\Que1
npm install
npx playwright install chromium
```

## Run

```powershell
npm start
```

Open `http://127.0.0.1:3000`.

Run the test in another terminal:

```powershell
npm test
```

Headed mode:

```powershell
npm run test:headed
```

Open the HTML report:

```powershell
npm run test:report
```

## Expected terminal output

The server starts with output similar to:

```text
{"timestamp":"...","event":"server_started","url":"http://127.0.0.1:3000"}
Dashboard running at http://127.0.0.1:3000
{"timestamp":"...","event":"packet_scheduled","packet":1,"latencyMs":...}
...
{"timestamp":"...","event":"packet_dropped","packet":4}
```

The Playwright run should end with:

```text
1 passed
```

Timing values are machine and scheduler dependent. The test writes actual measured values to `artifacts/playwright-timing.json`.

## Debugging

- `artifacts/server-events.log` contains packet scheduling and drop events.
- `artifacts/test-events.log` contains test timing results.
- `artifacts/playwright-results.json` contains the machine-readable Playwright result.
- `playwright-report/index.html` contains the HTML report.
- Failed tests retain Playwright traces in `test-results/`.
- Inspect WebSocket traffic in Chromium DevTools under Network > WS.
- To recreate the precision failure, submit the Buy button. The route deliberately sends `"2.5"` for `precision`.
- If the dashboard is not live, verify port 3000 is not in use and rerun `npm start`.
