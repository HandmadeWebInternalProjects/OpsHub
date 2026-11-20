#!/usr/bin/env node
/**
 * OpsHub Lighthouse reporter — reference client (PROJECT.md §5.2, M6).
 *
 * Runs in a client project's CI after `lhci autorun`/`lhci collect`: it reads the
 * local Lighthouse result files (.lighthouseci/lhr-*.json), extracts the four
 * category scores and POSTs them to OpsHub's Lighthouse webhook, signed with an
 * HMAC-SHA256 over the raw body. The client's pipeline can copy this file.
 *
 * Connection (OpsHub side):
 *   OPSHUB_URL                   base URL of OpsHub (default http://localhost:3000)
 *   OPSHUB_PROJECT_ID            the project to attach scores to (required)
 *   LIGHTHOUSE_WEBHOOK_SECRET    shared secret; must match the OpsHub env (required)
 *
 * Report metadata (Lighthouse side, optional):
 *   OPSHUB_PAGE_URL              only report the run for this URL (default: latest run)
 *   OPSHUB_EXTERNAL_ID           idempotency key (default LHCI_BUILD_CONTEXT__EXTERNAL_BUILD_ID)
 *   OPSHUB_REPORT_URL            link to the hosted report (default LHCI_BUILD_CONTEXT__EXTERNAL_BUILD_URL)
 *   LHCI_RESULTS_DIR             results directory (default ./.lighthouseci)
 *
 * Usage:
 *   node scripts/lighthouse-reporter.mjs [--results-dir DIR] [--lhr FILE] [--url URL]
 */

import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const CATEGORIES = {
  performance: "performance",
  accessibility: "accessibility",
  best_practices: "best-practices",
  seo: "seo",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = value;
      i += 1;
    }
  }
  return args;
}

function findResultFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(
      `No Lighthouse results found in "${dir}". Run \`lhci autorun\` first, or pass --results-dir.`,
    );
  }
  const files = entries
    .filter((name) => /^lhr-.*\.json$/.test(name))
    .map((name) => resolve(dir, name));
  if (files.length === 0) {
    throw new Error(`No lhr-*.json files found in "${dir}".`);
  }
  return files;
}

function pickRun(files, pageUrl) {
  const runs = files.map((file) => ({
    file,
    json: JSON.parse(readFileSync(file, "utf8")),
  }));
  if (pageUrl) {
    const match = runs.find(
      (run) =>
        run.json.finalUrl === pageUrl || run.json.requestedUrl === pageUrl,
    );
    if (!match) {
      throw new Error(
        `No Lighthouse run matches OPSHUB_PAGE_URL/--url "${pageUrl}".`,
      );
    }
    return match;
  }
  // Newest run wins (LHRs carry an ISO fetchTime).
  return runs
    .slice()
    .sort((a, b) =>
      String(a.json.fetchTime ?? "").localeCompare(
        String(b.json.fetchTime ?? ""),
      ),
    )
    .at(-1);
}

function toScore(run, lighthouseKey) {
  const score = run.categories?.[lighthouseKey]?.score;
  if (typeof score !== "number") {
    throw new Error(
      `Lighthouse run is missing the "${lighthouseKey}" category score.`,
    );
  }
  return Math.round(score * 100);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const baseUrl = (process.env.OPSHUB_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const projectId = process.env.OPSHUB_PROJECT_ID;
  const secret = process.env.LIGHTHOUSE_WEBHOOK_SECRET;

  if (!projectId) throw new Error("OPSHUB_PROJECT_ID is required.");
  if (!secret) throw new Error("LIGHTHOUSE_WEBHOOK_SECRET is required.");

  const pageUrl = args.url ?? process.env.OPSHUB_PAGE_URL ?? undefined;
  const run = args.lhr
    ? { file: args.lhr, json: JSON.parse(readFileSync(args.lhr, "utf8")) }
    : pickRun(
        findResultFiles(
          args["results-dir"] ??
            process.env.LHCI_RESULTS_DIR ??
            ".lighthouseci",
        ),
        pageUrl,
      );

  const url = pageUrl ?? run.json.finalUrl ?? run.json.requestedUrl;
  if (!url) {
    throw new Error("The Lighthouse run has no finalUrl/requestedUrl.");
  }

  const payload = {
    url,
    captured_at: run.json.fetchTime ?? new Date().toISOString(),
    performance: toScore(run.json, CATEGORIES.performance),
    accessibility: toScore(run.json, CATEGORIES.accessibility),
    best_practices: toScore(run.json, CATEGORIES.best_practices),
    seo: toScore(run.json, CATEGORIES.seo),
  };

  const externalId =
    process.env.OPSHUB_EXTERNAL_ID ??
    process.env.LHCI_BUILD_CONTEXT__EXTERNAL_BUILD_ID;
  if (externalId) payload.external_id = externalId;

  const reportUrl =
    process.env.OPSHUB_REPORT_URL ??
    process.env.LHCI_BUILD_CONTEXT__EXTERNAL_BUILD_URL;
  if (reportUrl) payload.report_url = reportUrl;

  const body = JSON.stringify(payload);
  const signature =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const endpoint = `${baseUrl}/api/webhooks/lighthouse/${projectId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ops-hub-signature": signature,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpsHub rejected the report (${response.status}): ${text}`);
  }

  console.log(
    `Reported ${url} to OpsHub (${response.status}): ` +
      Object.entries(CATEGORIES)
        .map(([key]) => `${key}=${payload[key]}`)
        .join(" "),
  );
}

main().catch((error) => {
  console.error(`Lighthouse reporter failed: ${error.message}`);
  process.exitCode = 1;
});
