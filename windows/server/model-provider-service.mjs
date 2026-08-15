import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createAppServerClient } from "./app-server-client.mjs";

export const CURRENT_MODEL_PROVIDER_ID = "current";
export const GROK_MODEL_PROVIDER_ID = "fusheng-grok";
export const GROK_MODEL_ID = "grok-4.6";

const providerIdPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/u;
const helperScript = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "model-provider-credential.ps1",
);

const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const clean = (value, maxLength = 400) => String(value || "").trim().slice(0, maxLength);
const tomlString = (value) => JSON.stringify(String(value));
const tomlStringArray = (values) => `[${values.map(tomlString).join(", ")}]`;

const normalizeProvider = (value) => {
  const id = clean(value?.id, 80);
  if (!providerIdPattern.test(id)) throw new Error(`Invalid model provider id: ${id || "empty"}`);
  const mode = value?.mode === "current" ? "current" : "isolated";
  const models = (Array.isArray(value?.models) ? value.models : []).map((entry) => ({
    id: clean(entry?.id || entry?.model, 120),
    model: clean(entry?.model || entry?.id, 120),
    displayName: clean(entry?.displayName || entry?.model || entry?.id, 160),
    description: clean(entry?.description, 500),
    isDefault: Boolean(entry?.isDefault),
    supportedReasoningEfforts: Array.isArray(entry?.supportedReasoningEfforts)
      ? entry.supportedReasoningEfforts
      : [],
    experimental: Boolean(entry?.experimental),
  })).filter((entry) => entry.model);
  return {
    id,
    mode,
    displayName: clean(value?.displayName, 160) || id,
    baseUrl: clean(value?.baseUrl, 500),
    wireApi: clean(value?.wireApi, 40) || "responses",
    defaultModel: clean(value?.defaultModel, 120) || models[0]?.model || "",
    models,
  };
};

export const defaultModelProviders = () => [
  normalizeProvider({
    id: CURRENT_MODEL_PROVIDER_ID,
    mode: "current",
    displayName: "Current Codex provider",
  }),
  normalizeProvider({
    id: GROK_MODEL_PROVIDER_ID,
    displayName: "Fusheng Grok",
    baseUrl: "https://fushengyunsuan.cn/v1",
    wireApi: "responses",
    defaultModel: GROK_MODEL_ID,
    models: [{
      id: GROK_MODEL_ID,
      model: GROK_MODEL_ID,
      displayName: "Grok 4.6 (Test)",
      description: "Grok 4.6 through the configured Fusheng provider.",
      supportedReasoningEfforts: [],
      experimental: true,
    }],
  }),
];

const requireProviderId = (providerId) => {
  const id = clean(providerId, 80);
  if (!providerIdPattern.test(id)) throw statusError("Invalid model provider id.", 400);
  return id;
};

export const protectCredentialWithDpapi = (secret, {
  credentialHelper = helperScript,
  powershell = "powershell.exe",
  spawn = spawnSync,
} = {}) => {
  const token = String(secret || "").trim();
  if (!token) throw statusError("Model provider credential cannot be empty.", 400);
  const result = spawn(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", path.resolve(credentialHelper),
    "-Mode", "protect",
  ], {
    input: token,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw statusError("Windows could not encrypt the model provider credential.", 500);
  }
  const encrypted = String(result.stdout || "").trim();
  if (!encrypted || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encrypted)) {
    throw statusError("Windows returned an invalid encrypted credential.", 500);
  }
  return encrypted;
};

export const createModelProviderCredentialStore = ({
  root,
  credentialHelper = helperScript,
  protect = (secret) => protectCredentialWithDpapi(secret, { credentialHelper }),
} = {}) => {
  if (!root) throw new Error("Model provider credential root is required.");
  const credentialRoot = path.resolve(root);
  const credentialPath = (providerId) => path.join(credentialRoot, `${requireProviderId(providerId)}.dpapi`);

  const isConfigured = async (providerId) => {
    try {
      const stat = await fs.stat(credentialPath(providerId));
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  };

  const save = async (providerId, secret) => {
    const file = credentialPath(providerId);
    const encrypted = await protect(secret);
    await fs.mkdir(credentialRoot, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporary, `${encrypted}\n`, { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporary, file);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return { providerId: requireProviderId(providerId), file };
  };

  return { credentialPath, isConfigured, save };
};

export const renderModelProviderConfig = ({
  provider,
  credentialFile,
  credentialHelper = helperScript,
  workingDirectory,
}) => {
  const normalized = normalizeProvider(provider);
  if (normalized.mode !== "isolated" || !normalized.baseUrl || !normalized.defaultModel) {
    throw new Error(`Provider ${normalized.id} does not have an isolated runtime configuration.`);
  }
  const cwd = path.resolve(workingDirectory);
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", path.resolve(credentialHelper),
    "-Mode", "read",
    "-CredentialFile", path.resolve(credentialFile),
  ];
  return [
    `model_provider = ${tomlString(normalized.id)}`,
    `model = ${tomlString(normalized.defaultModel)}`,
    "",
    `[model_providers.${normalized.id}]`,
    `name = ${tomlString(normalized.displayName)}`,
    `base_url = ${tomlString(normalized.baseUrl)}`,
    `wire_api = ${tomlString(normalized.wireApi)}`,
    "",
    `[model_providers.${normalized.id}.auth]`,
    `command = ${tomlString("powershell.exe")}`,
    `args = ${tomlStringArray(args)}`,
    "timeout_ms = 5000",
    "refresh_interval_ms = 300000",
    `cwd = ${tomlString(cwd)}`,
    "",
  ].join("\n");
};

const ensureCodexHome = async ({ runtimeRoot, provider, credentialStore, credentialHelper, projectRoot }) => {
  const codexHome = path.join(path.resolve(runtimeRoot), provider.id, "codex-home");
  const configFile = path.join(codexHome, "config.toml");
  const config = renderModelProviderConfig({
    provider,
    credentialFile: credentialStore.credentialPath(provider.id),
    credentialHelper,
    workingDirectory: projectRoot,
  });
  let current = "";
  try { current = await fs.readFile(configFile, "utf8"); } catch {}
  if (current !== config) {
    await fs.mkdir(codexHome, { recursive: true });
    const temporary = `${configFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, config, "utf8");
    await fs.rename(temporary, configFile);
  }
  return codexHome;
};

export const createModelProviderService = ({
  projectRoot,
  defaultClient,
  providers = defaultModelProviders(),
  runtimeRoot = path.join(projectRoot, "runtime", "model-providers"),
  credentialRoot = path.join(projectRoot, "runtime", "model-provider-credentials"),
  credentialHelper = helperScript,
  credentialStore = createModelProviderCredentialStore({ root: credentialRoot, credentialHelper }),
  createClient = createAppServerClient,
} = {}) => {
  if (!projectRoot) throw new Error("Project root is required for model provider routing.");
  const providerMap = new Map(providers.map(normalizeProvider).map((provider) => [provider.id, provider]));
  const currentProvider = providerMap.get(CURRENT_MODEL_PROVIDER_ID);
  if (!currentProvider || currentProvider.mode !== "current") {
    throw new Error(`Provider ${CURRENT_MODEL_PROVIDER_ID} must use the current runtime.`);
  }
  const clientPromises = new Map();
  const ownedClients = new Map();

  const modelOwner = (model) => {
    const modelId = clean(model, 120);
    return [...providerMap.values()].find((provider) => (
      provider.mode === "isolated" && provider.models.some((entry) => entry.model === modelId)
    )) || currentProvider;
  };

  const resolveRoute = ({ model = "", modelProviderId = "" } = {}) => {
    const requestedModel = clean(model, 120);
    const requestedProviderId = modelProviderId ? requireProviderId(modelProviderId) : "";
    const requestedProvider = requestedProviderId ? providerMap.get(requestedProviderId) : null;
    if (requestedProviderId && !requestedProvider) throw statusError("Model provider is not registered.", 400);
    const modelId = requestedModel || requestedProvider?.defaultModel || "";
    const inferred = modelOwner(modelId);
    const provider = requestedProvider || inferred;
    if (!provider) throw statusError("Model provider is not registered.", 400);
    if (provider.id !== inferred.id) {
      throw statusError(`Model ${modelId || "(default)"} does not belong to provider ${provider.id}.`, 400);
    }
    return { modelProviderId: provider.id, model: modelId, provider };
  };

  const isProviderConfigured = async (providerId) => {
    const provider = providerMap.get(requireProviderId(providerId));
    if (!provider) return false;
    return provider.mode === "current" || credentialStore.isConfigured(provider.id);
  };

  const listModels = async (currentModels = []) => {
    const current = (Array.isArray(currentModels) ? currentModels : []).map((model) => ({
      ...model,
      modelProviderId: CURRENT_MODEL_PROVIDER_ID,
      providerDisplayName: currentProvider.displayName,
      available: true,
      experimental: Boolean(model?.experimental),
    }));
    const external = [];
    for (const provider of providerMap.values()) {
      if (provider.mode === "current") continue;
      const available = await credentialStore.isConfigured(provider.id);
      external.push(...provider.models.map((model) => ({
        ...model,
        modelProviderId: provider.id,
        providerDisplayName: provider.displayName,
        available,
      })));
    }
    return [...current, ...external];
  };

  const getClient = async (routeInput = {}) => {
    const route = resolveRoute(routeInput);
    if (route.provider.mode === "current") {
      if (!defaultClient) throw statusError("Current Codex provider is unavailable.", 503);
      return defaultClient;
    }
    if (!await credentialStore.isConfigured(route.provider.id)) {
      throw statusError(`${route.provider.displayName} credential is not configured.`, 503);
    }
    if (!clientPromises.has(route.provider.id)) {
      const promise = ensureCodexHome({
        runtimeRoot,
        provider: route.provider,
        credentialStore,
        credentialHelper,
        projectRoot,
      }).then((codexHome) => {
        const client = createClient({
          codexHome,
          label: route.provider.id,
          sanitizeEnvironment: true,
          workingDirectory: path.resolve(projectRoot),
        });
        ownedClients.set(route.provider.id, client);
        return client;
      }).catch((error) => {
        clientPromises.delete(route.provider.id);
        throw error;
      });
      clientPromises.set(route.provider.id, promise);
    }
    return clientPromises.get(route.provider.id);
  };

  const close = () => {
    for (const client of ownedClients.values()) client.close?.();
    ownedClients.clear();
    clientPromises.clear();
  };

  return {
    providers: () => [...providerMap.values()].map((provider) => ({ ...provider })),
    resolveRoute,
    listModels,
    isProviderConfigured,
    getClient,
    credentials: credentialStore,
    close,
  };
};
