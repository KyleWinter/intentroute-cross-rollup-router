import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateIntentPayload } from "./lib/intent-schema.mjs";
import { listEnvironments } from "./lib/environments.mjs";
import { quoteIntent } from "./lib/router.mjs";
import { getIntent, listIntents, saveIntent } from "./lib/store.mjs";
import { isOnChainMode, startExecutionSimulation } from "./lib/simulator.mjs";
import { loadDeployments } from "./lib/chain-client.mjs";
import { nowIso } from "./lib/utils.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const frontendDir = join(__dirname, "..", "frontend");
const dataDir = join(__dirname, "..", "data");
const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, url);
      return;
    }

    await serveStaticAsset(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "internal_server_error",
      message: "Unexpected server failure"
    });
  }
});

server.listen(port, host, () => {
  console.log(`IntentRoute running at http://${host}:${port}`);
});

async function handleApiRequest(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "intent-route",
      timestamp: nowIso()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/environments") {
    sendJson(response, 200, listEnvironments());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/mode") {
    let deployments = null;
    if (isOnChainMode()) {
      try {
        deployments = await loadDeployments();
      } catch (_) {
        deployments = null;
      }
    }
    sendJson(response, 200, {
      onChain: isOnChainMode(),
      deployments
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/intents") {
    sendJson(response, 200, { intents: listIntents() });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/intents/")) {
    const id = url.pathname.split("/").pop();
    const record = id ? getIntent(id) : null;

    if (!record) {
      sendJson(response, 404, { error: "intent_not_found" });
      return;
    }

    sendJson(response, 200, record);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/benchmark-sample") {
    const benchmarkPath = join(dataDir, "benchmark-sample.json");
    const contents = await readFile(benchmarkPath, "utf8");
    sendJson(response, 200, JSON.parse(contents));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/benchmark-expanded") {
    const benchmarkPath = join(dataDir, "benchmark-expanded.json");
    const contents = await readFile(benchmarkPath, "utf8");
    sendJson(response, 200, JSON.parse(contents));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/benchmark-report") {
    const reportPath = join(dataDir, "benchmark-report.md");
    const contents = await readFile(reportPath, "utf8");
    response.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8"
    });
    response.end(contents);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/intents/quote") {
    const payload = await readJsonBody(request);
    const validation = validateIntentPayload(payload);

    if (!validation.ok) {
      sendJson(response, 422, { error: "invalid_intent", details: validation.errors });
      return;
    }

    const quote = quoteIntent(validation.intent, {
      scenario: payload.scenario ?? "normal"
    });
    sendJson(response, 200, {
      intent: validation.intent,
      ...quote
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/intents/submit") {
    const payload = await readJsonBody(request);
    const validation = validateIntentPayload(payload);

    if (!validation.ok) {
      sendJson(response, 422, { error: "invalid_intent", details: validation.errors });
      return;
    }

    const quote = quoteIntent(validation.intent, {
      scenario: payload.scenario ?? "normal"
    });

    if (!quote.selectedRoute) {
      sendJson(response, 422, {
        error: "no_valid_routes",
        candidates: quote.candidates
      });
      return;
    }

    const record = saveIntent({
      id: validation.intent.intentId,
      intent: validation.intent,
      status: "created",
      createdAt: nowIso(),
      candidates: quote.candidates,
      selectedRoute: quote.selectedRoute,
      events: [
        {
          status: "created",
          note: "Intent accepted by router",
          at: nowIso()
        },
        {
          status: "quoted",
          note: `Router evaluated ${quote.candidates.length} candidate routes`,
          at: nowIso()
        },
        {
          status: "selected",
          note: `Selected ${quote.selectedRoute.environmentName} with score ${quote.selectedRoute.compositeScore}`,
          at: nowIso()
        }
      ]
    });

    startExecutionSimulation(record);
    sendJson(response, 201, record);
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveStaticAsset(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const assetPath = join(frontendDir, safePath);
  const contents = await readFile(assetPath);
  response.writeHead(200, {
    "Content-Type": getMimeType(extname(assetPath))
  });
  response.end(contents);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function getMimeType(extension) {
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
}
