import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const runtimeRoot = path.join(projectRoot, "runtime");
const stateFile = path.join(runtimeRoot, "negus-tunnel.json");
const configFile = path.join(runtimeRoot, "negus-tunnel.yml");
const logFile = path.join(runtimeRoot, "negus-tunnel.log");
const port = Number(process.env.NEGUS_PORT || "9360");
const token = process.env.NEGUS_TOKEN || "demo123";
const command = process.argv[2] || "status";
const hostnameArgument = process.argv.slice(3).find((argument) => argument !== "--");
const cloudflaredCommand = process.env.NEGUS_CLOUDFLARED || "cloudflared";
const commandDeadline = Date.now() + 55_000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const remainingCommandMs = () => Math.max(1, commandDeadline - Date.now());

const fail = (message) => {
  console.error("[ERROR] " + message);
  process.exitCode = 1;
};

const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readState = async () => {
  try {
    return JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw new Error("Tunnel state is unreadable: " + (error instanceof Error ? error.message : String(error)));
  }
};

const writeState = async (state) => {
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");
};

const runCloudflared = (argumentsList) => {
  const result = spawnSync(cloudflaredCommand, argumentsList, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: remainingCommandMs(),
    windowsHide: true,
  });
  if (result.error) {
    const detail = result.error.code === "ETIMEDOUT"
      ? "Timed out before the 55-second command limit."
      : result.error.message;
    throw new Error("cloudflared could not run: " + detail);
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "Unknown cloudflared error").trim();
    throw new Error("cloudflared " + argumentsList.join(" ") + " failed: " + detail);
  }
  return String(result.stdout || "");
};

const ensureCloudflared = () => {
  const result = spawnSync(cloudflaredCommand, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("cloudflared is required. Install it first, then rerun this command.");
  }
};

const normalizeHostname = (value) => {
  const hostname = String(value || "").trim().toLowerCase().replace(/\.$/u, "");
  const valid = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(hostname);
  if (!valid) throw new Error("Provide a valid full hostname, for example: mac.negus.us.ci");
  return hostname;
};

const tunnelNameFor = (hostname) => {
  const readable = hostname.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 42);
  const suffix = createHash("sha256").update(hostname).digest("hex").slice(0, 8);
  return "negus-mac-" + readable + "-" + suffix;
};

const credentialsFileFor = (tunnelId) => path.join(os.homedir(), ".cloudflared", tunnelId + ".json");

const yamlString = (value) => "'" + String(value).replaceAll("'", "''") + "'";

const writeConfig = async (state) => {
  const contents = [
    "tunnel: " + state.tunnelId,
    "credentials-file: " + yamlString(state.credentialsFile),
    "ingress:",
    "  - hostname: " + state.hostname,
    "    service: http://127.0.0.1:" + port,
    "  - service: http_status:404",
    "",
  ].join("\n");
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(configFile, contents, "utf8");
};

const extractTunnelId = (output) => {
  const match = output.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/iu);
  if (!match) throw new Error("cloudflared created a tunnel but did not return its ID.");
  return match[0].toLowerCase();
};

const localReady = () => new Promise((resolve) => {
  const request = http.get({
    hostname: "127.0.0.1",
    port,
    path: "/api/project?token=" + encodeURIComponent(token),
    timeout: 2_000,
  }, (response) => {
    response.resume();
    resolve(response.statusCode === 200);
  });
  request.once("timeout", () => {
    request.destroy();
    resolve(false);
  });
  request.once("error", () => resolve(false));
});

const publicIpv4 = async (hostname) => {
  const resolver = new dns.Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  const addresses = await Promise.race([
    resolver.resolve4(hostname),
    wait(4_000).then(() => { throw new Error("public DNS lookup timed out"); }),
  ]);
  if (!addresses.length) throw new Error("public DNS returned no IPv4 address");
  return addresses[0];
};

const publicResponse = async (hostname) => {
  try {
    const address = await publicIpv4(hostname);
    return await new Promise((resolve) => {
      const request = https.get("https://" + hostname + "/api/project?token=" + encodeURIComponent(token), {
        timeout: 4_000,
       headers: { "user-agent": "negus-tunnel-health-check" },
        lookup: (_hostname, options, callback) => {
          if (options?.all) callback(null, [{ address, family: 4 }]);
          else callback(null, address, 4);
        },
      }, (response) => {
        response.resume();
        resolve({ statusCode: response.statusCode || 0 });
      });
      request.once("timeout", () => {
        request.destroy();
        resolve({ statusCode: 0, detail: "timed out" });
      });
      request.once("error", (error) => resolve({ statusCode: 0, detail: error.message }));
    });
  } catch (error) {
    return { statusCode: 0, detail: error instanceof Error ? error.message : String(error) };
  }
};

const publicResultDetail = (result) => {
  const detail = result.statusCode || result.detail || "unknown error";
  if (result.statusCode === 0 && /handshake failure|EPROTO/iu.test(String(result.detail || ""))) {
    return detail + "; this second-level Tunnel hostname needs a manually ordered Cloudflare Advanced Certificate";
  }
  return detail;
};

const tailLog = async () => {
  const value = await fs.readFile(logFile, "utf8").catch(() => "");
  return value.trim().split(/\r?\n/u).slice(-6).join("\n");
};

const verifyCloudflareLogin = () => {
  try {
    runCloudflared(["tunnel", "list", "--output", "json"]);
  } catch (error) {
    throw new Error("Cloudflare authorization is missing or expired. Run pnpm negus:tunnel:login and select the correct zone. " + error.message);
  }
};

const configureDns = (state) => {
  runCloudflared(["tunnel", "route", "dns", state.tunnelId, state.hostname]);
};

const move = async () => {
  ensureCloudflared();
  const hostname = normalizeHostname(hostnameArgument);
  const state = await readState();
  if (!state) throw new Error("No tunnel is configured. Run pnpm negus:tunnel:setup -- <hostname> first.");
  if (state.hostname === hostname) {
    console.log("[OK] Tunnel already uses https://" + hostname + "/?token=" + encodeURIComponent(token));
    return;
  }

  verifyCloudflareLogin();
  // Route the new hostname before changing the local connector configuration.
  configureDns({ ...state, hostname });
  const movedState = {
    ...state,
    hostname,
    dnsRouted: true,
    dnsRoutedAt: new Date().toISOString(),
    previousHostname: state.hostname,
    movedAt: new Date().toISOString(),
  };
  await writeConfig(movedState);
  await writeState(movedState);

  if (processIsAlive(state.pid)) {
    await stop();
    await start();
  }
  console.log("[OK] Fixed hostname moved to https://" + hostname + "/?token=" + encodeURIComponent(token));
  console.log("[INFO] The previous DNS route was left unchanged.");
};

const setup = async () => {
  ensureCloudflared();
  const hostname = normalizeHostname(hostnameArgument);
  verifyCloudflareLogin();

  let state = await readState();
  if (state && state.hostname !== hostname) {
    throw new Error(
      "This Mac is already configured for " + state.hostname
      + ". Refusing to change DNS automatically. Keep that hostname, or explicitly remove the local tunnel state after deciding the migration."
    );
  }

  if (!state) {
    const tunnelName = tunnelNameFor(hostname);
    const credentialDirectory = path.join(os.homedir(), ".cloudflared");
    await fs.mkdir(credentialDirectory, { recursive: true });
    const credentialFile = path.join(credentialDirectory, tunnelName + ".pending.json");
    const output = runCloudflared([
      "tunnel", "create",
      "--credentials-file", credentialFile,
      tunnelName,
    ]);
    const tunnelId = extractTunnelId(output);
    const finalCredentialFile = credentialsFileFor(tunnelId);
    if (credentialFile !== finalCredentialFile) {
      await fs.rename(credentialFile, finalCredentialFile).catch(async (error) => {
        if (error && typeof error === "object" && error.code === "EXDEV") {
          await fs.copyFile(credentialFile, finalCredentialFile);
          await fs.rm(credentialFile, { force: true });
          return;
        }
        throw error;
      });
    }
    state = {
      version: 1,
      hostname,
      tunnelId,
      tunnelName,
      credentialsFile: finalCredentialFile,
      dnsRouted: false,
      createdAt: new Date().toISOString(),
      pid: null,
    };
    await writeState(state);
  }

  const credentialExists = await fs.stat(state.credentialsFile).then((entry) => entry.isFile()).catch(() => false);
  if (!credentialExists) throw new Error("Tunnel credentials are missing: " + state.credentialsFile);
  await writeConfig(state);
  if (!state.dnsRouted) {
    configureDns(state);
    state = { ...state, dnsRouted: true, dnsRoutedAt: new Date().toISOString() };
    await writeState(state);
  }
  console.log("[OK] Fixed hostname configured: https://" + state.hostname + "/?token=" + encodeURIComponent(token));
  console.log("[NEXT] Start the local project with pnpm negus:start, then run pnpm negus:tunnel:start.");
};

const start = async () => {
  ensureCloudflared();
  const state = await readState();
  if (!state) throw new Error("No tunnel is configured. Run pnpm negus:tunnel:setup -- <hostname> first.");
  if (!await localReady()) throw new Error("The local project is not ready on 127.0.0.1:" + port + ". Run pnpm negus:start first.");
  if (processIsAlive(state.pid)) {
    console.log("[OK] Tunnel is already running: https://" + state.hostname + "/?token=" + encodeURIComponent(token));
    return;
  }
  const configExists = await fs.stat(configFile).then((entry) => entry.isFile()).catch(() => false);
  if (!configExists) await writeConfig(state);
  const credentialExists = await fs.stat(state.credentialsFile).then((entry) => entry.isFile()).catch(() => false);
  if (!credentialExists) throw new Error("Tunnel credentials are missing: " + state.credentialsFile);

  await fs.mkdir(runtimeRoot, { recursive: true });
  const log = await fs.open(logFile, "a");
  const child = spawn(cloudflaredCommand, [
    "--config", configFile,
    "--no-autoupdate",
    "--grace-period", "5s",
    "tunnel", "run", state.tunnelId,
  ], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    windowsHide: true,
  });
  child.unref();
  await log.close();
  const runningState = { ...state, pid: child.pid, startedAt: new Date().toISOString() };
  await writeState(runningState);

  await wait(1_000);
  if (!processIsAlive(child.pid)) {
    await writeState({ ...runningState, pid: null, stoppedAt: new Date().toISOString() });
    const detail = await tailLog();
    throw new Error("Tunnel exited during startup." + (detail ? "\n" + detail : ""));
  }
  const response = await publicResponse(state.hostname);
  if (response.statusCode === 200) {
    console.log("[OK] Fixed public URL is responding: https://" + state.hostname + "/?token=" + encodeURIComponent(token));
  } else {
    console.log("[OK] Tunnel connector started: https://" + state.hostname + "/?token=" + encodeURIComponent(token));
    console.log("[WARN] Public check is not ready yet (" + publicResultDetail(response) + "). Run pnpm negus:tunnel:status shortly.");
  }
};

const stop = async () => {
  const state = await readState();
  if (!state || !processIsAlive(state.pid)) {
    console.log("[OK] Tunnel is not running.");
    return;
  }
  process.kill(state.pid, "SIGTERM");
  for (let attempt = 0; attempt < 30 && processIsAlive(state.pid); attempt += 1) await wait(200);
  if (processIsAlive(state.pid)) process.kill(state.pid, "SIGKILL");
  await writeState({ ...state, pid: null, stoppedAt: new Date().toISOString() });
  console.log("[OK] Stopped tunnel PID " + state.pid + ".");
};

const status = async () => {
  const state = await readState();
  if (!state) {
    console.log("[INFO] No fixed public tunnel is configured.");
    return;
  }
  const connector = processIsAlive(state.pid);
  const local = await localReady();
  const publicResult = connector ? await publicResponse(state.hostname) : { statusCode: 0, detail: "connector is stopped" };
  console.log((connector ? "[OK]" : "[WARN]") + " Tunnel connector: " + (connector ? "running (PID " + state.pid + ")" : "stopped"));
  console.log((local ? "[OK]" : "[WARN]") + " Local project: " + (local ? "ready" : "not ready on 127.0.0.1:" + port));
  console.log((publicResult.statusCode === 200 ? "[OK]" : "[WARN]") + " Public URL: https://" + state.hostname + "/?token=" + encodeURIComponent(token)
    + " (" + publicResultDetail(publicResult) + ")");
};

const login = async () => {
  ensureCloudflared();
  const child = spawn(cloudflaredCommand, ["tunnel", "login"], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve("timeout");
    }, remainingCommandMs());
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code || 0);
    });
  });
  if (result === "timeout") throw new Error("Cloudflare login did not complete within 55 seconds. Rerun the command and finish browser approval promptly.");
  if (result !== 0) throw new Error("Cloudflare login did not complete.");
  console.log("[OK] Cloudflare authorization completed.");
};

const usage = () => {
  console.log("Usage:");
  console.log("  pnpm negus:tunnel:login");
  console.log("  pnpm negus:tunnel:setup -- <hostname>");
  console.log("  pnpm negus:tunnel:move -- <hostname>");
  console.log("  pnpm negus:tunnel:start|stop|status|restart");
};

try {
  if (command === "login") await login();
  else if (command === "setup") await setup();
  else if (command === "move") await move();
  else if (command === "start") await start();
  else if (command === "stop") await stop();
  else if (command === "status") await status();
  else if (command === "restart") {
    await stop();
    await start();
  } else {
    usage();
    if (command !== "help" && command !== "--help" && command !== "-h") process.exitCode = 1;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
