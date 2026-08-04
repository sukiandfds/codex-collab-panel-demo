import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHappyEveringImageClient } from "../server/image-generation/happyevering-client.mjs";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const pngBuffer = Buffer.from(pngBase64, "base64");

const temporaryRoot = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-image-mcp-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};

const readRequestBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => resolve(Buffer.concat(chunks)));
  request.on("error", reject);
});

const mockServer = async (t, handler) => {
  const server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: error.message } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}/v1`;
};

test("submits and polls a generation task using Retry-After", async (t) => {
  const outputDirectory = await temporaryRoot(t);
  const requests = [];
  const baseUrl = await mockServer(t, async (request, response) => {
    const body = JSON.parse((await readRequestBody(request)).toString("utf8"));
    requests.push(body);
    if (!body.task_id) {
      response.writeHead(202, { "Content-Type": "application/json", "Retry-After": "0.002" });
      response.end(JSON.stringify({ task_id: "img-test-1" }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: pngBase64 }], usage: { total_tokens: 12 } }));
  });
  const sleeps = [];
  const client = createHappyEveringImageClient({
    apiKey: "test-key",
    baseUrl,
    outputDirectory,
    timeoutMs: 5_000,
    pollIntervalMs: 1,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });
  const result = await client.generate({ prompt: "a minimal test image", size: "1:1" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].async, true);
  assert.equal(requests[0].response_format, "b64_json");
  assert.deepEqual(requests[1], { model: "gpt-image-2", task_id: "img-test-1" });
  assert.deepEqual(sleeps, [2]);
  assert.equal(result.taskId, "img-test-1");
  assert.equal(result.outputs[0].width, 1);
  assert.equal(result.outputs[0].height, 1);
  assert.equal(path.extname(result.outputs[0].path), ".png");
  assert.deepEqual(await fs.readFile(result.outputs[0].path), pngBuffer);
});

test("uploads multiple references and a PNG mask as multipart edit data", async (t) => {
  const root = await temporaryRoot(t);
  const first = path.join(root, "first.png");
  const second = path.join(root, "second.png");
  const mask = path.join(root, "mask.png");
  await Promise.all([first, second, mask].map((file) => fs.writeFile(file, pngBuffer)));
  let multipartText = "";
  const baseUrl = await mockServer(t, async (request, response) => {
    assert.match(request.headers["content-type"], /^multipart\/form-data; boundary=/u);
    multipartText = (await readRequestBody(request)).toString("latin1");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: pngBase64 }] }));
  });
  const client = createHappyEveringImageClient({ apiKey: "test-key", baseUrl, outputDirectory: root, timeoutMs: 5_000 });
  const result = await client.edit({ prompt: "combine the references", imagePaths: [first, second], maskPath: mask });
  assert.equal((multipartText.match(/name="image"/gu) || []).length, 2);
  assert.match(multipartText, /name="mask"/u);
  assert.match(multipartText, /name="async"\r\n\r\ntrue/u);
  assert.match(multipartText, /name="response_format"\r\n\r\nb64_json/u);
  assert.equal(result.outputs.length, 1);
});

test("downloads URL results and uses the detected image extension", async (t) => {
  const root = await temporaryRoot(t);
  let origin = "";
  const baseUrl = await mockServer(t, async (request, response) => {
    if (request.url === "/image") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(pngBuffer);
      return;
    }
    await readRequestBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ url: `${origin}/image` }] }));
  });
  origin = baseUrl.replace(/\/v1$/u, "");
  const client = createHappyEveringImageClient({ apiKey: "test-key", baseUrl, outputDirectory: root, timeoutMs: 5_000 });
  const result = await client.generate({ prompt: "URL response", outputName: "wrong-extension.jpg" });
  assert.equal(path.basename(result.outputs[0].path), "wrong-extension.png");
});

test("returns provider errors without leaking the API key", async (t) => {
  const root = await temporaryRoot(t);
  const baseUrl = await mockServer(t, async (request, response) => {
    await readRequestBody(request);
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "content_policy", message: "request rejected" } }));
  });
  const client = createHappyEveringImageClient({ apiKey: "secret-test-key", baseUrl, outputDirectory: root, timeoutMs: 5_000 });
  await assert.rejects(
    client.generate({ prompt: "rejected request" }),
    (error) => error.message.includes("content_policy") && !error.message.includes("secret-test-key"),
  );
});

test("stdio MCP advertises the image tools and completes a mocked tool call", async (t) => {
  const projectRoot = path.resolve(import.meta.dirname, "..", "..");
  const outputDirectory = await temporaryRoot(t);
  const baseUrl = await mockServer(t, async (request, response) => {
    await readRequestBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: pngBase64 }] }));
  });
  const serverFile = path.join(projectRoot, "windows", "server", "image-generation", "mcp-server.mjs");
  const child = spawn(process.execPath, [serverFile], {
    cwd: projectRoot,
    env: {
      ...process.env,
      LYNN_IMAGE_API_KEY: "test-key",
      LYNN_IMAGE_BASE_URL: baseUrl,
      LYNN_IMAGE_OUTPUT_DIR: outputDirectory,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  let buffer = "";
  const messages = [];
  const waiters = new Map();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      messages.push(message);
      waiters.get(message.id)?.(message);
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const responseFor = (id) => new Promise((resolve, reject) => {
    const existing = messages.find((message) => message.id === id);
    if (existing) return resolve(existing);
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for MCP response ${id}`)), 5_000);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
  });
  const initialized = await responseFor(1);
  assert.equal(initialized.result.serverInfo.name, "negus-image");
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const listed = await responseFor(2);
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["generate_image", "edit_image"]);
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "generate_image", arguments: { prompt: "mocked MCP image", size: "1:1" } },
  });
  const called = await responseFor(3);
  assert.equal(called.result.isError, undefined);
  assert.match(called.result.content[0].text, /Generated 1 image/u);
  assert.equal(called.result.structuredContent.outputs[0].width, 1);
  await fs.access(called.result.structuredContent.outputs[0].path);
  child.stdin.end();
});
