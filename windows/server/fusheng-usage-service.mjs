import fs from "node:fs/promises";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_FEATURED_GROUP = "gpt 易燃易爆炸";

const serviceError = (message, statusCode = 503) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundAmount = (value) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

const shanghaiRange = (date) => {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startMs = Date.UTC(year, month, day) - SHANGHAI_OFFSET_MS;
  return {
    queryDate: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    startTimestamp: Math.floor(startMs / 1000),
    endTimestamp: Math.floor(date.getTime() / 1000),
  };
};

const readCredentials = async (credentialsFile) => {
  let credentials;
  try {
    credentials = JSON.parse(await fs.readFile(credentialsFile, "utf8"));
  } catch {
    throw serviceError("浮生云算凭据文件不可用");
  }
  const baseUrl = String(credentials.base_url || "").trim().replace(/\/+$/u, "");
  const userId = Number(credentials.user_id);
  const accessToken = String(credentials.access_token || "").trim();
  if (!baseUrl || !Number.isInteger(userId) || !accessToken) {
    throw serviceError("浮生云算凭据配置不完整");
  }
  return { baseUrl, userId, accessToken };
};

const requestJson = async (fetchImpl, url, headers = undefined) => {
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(url, { method: "GET", headers });
      break;
    } catch {
      if (attempt === 1) throw serviceError("浮生云算网络连接失败");
    }
  }
  if (!response) throw serviceError("浮生云算网络连接失败");
  if (response.status === 401) throw serviceError("浮生云算访问令牌无效", 401);
  if (!response.ok) throw serviceError(`浮生云算接口暂不可用（${response.status}）`);
  try {
    return await response.json();
  } catch {
    throw serviceError("浮生云算返回格式错误");
  }
};

export const createFushengUsageService = ({
  credentialsFile,
  fetchImpl = fetch,
  now = () => new Date(),
  cacheMs = 15_000,
  featuredGroupName = DEFAULT_FEATURED_GROUP,
}) => {
  let cached = null;
  let cachedAt = 0;
  let cachedKey = "";
  let inFlight = null;

  const query = async () => {
    const currentDate = now();
    const range = shanghaiRange(currentDate);
    const credentials = await readCredentials(credentialsFile);
    const headers = {
      Authorization: `Bearer ${credentials.accessToken}`,
      "New-Api-User": String(credentials.userId),
    };
    const usageUrl = new URL("/api/data/self", credentials.baseUrl);
    usageUrl.searchParams.set("start_timestamp", String(range.startTimestamp));
    usageUrl.searchParams.set("end_timestamp", String(range.endTimestamp));
    usageUrl.searchParams.set("default_time", "hour");

    const [accountResponse, usageResponse, statusResponse, pricingResponse] = await Promise.all([
      requestJson(fetchImpl, new URL("/api/user/self", credentials.baseUrl), headers),
      requestJson(fetchImpl, usageUrl, headers),
      requestJson(fetchImpl, new URL("/api/status", credentials.baseUrl)),
      requestJson(fetchImpl, new URL("/api/pricing", credentials.baseUrl)),
    ]);

    const account = accountResponse?.data;
    if (!account || Number(account.id) !== credentials.userId) {
      throw serviceError("浮生云算账户校验失败", 502);
    }
    const quotaPerUnit = finiteNumber(statusResponse?.data?.quota_per_unit);
    if (quotaPerUnit <= 0) throw serviceError("浮生云算金额换算单位无效", 502);

    const totals = (Array.isArray(usageResponse?.data) ? usageResponse.data : []).reduce((summary, row) => ({
      requests: summary.requests + finiteNumber(row?.count),
      tokens: summary.tokens + finiteNumber(row?.token_used),
      quota: summary.quota + finiteNumber(row?.quota),
    }), { requests: 0, tokens: 0, quota: 0 });

    const groupRatios = Object.fromEntries(Object.entries(pricingResponse?.group_ratio || {})
      .map(([name, ratio]) => [name, finiteNumber(ratio)]));

    return {
      provider: "fusheng",
      updatedAt: currentDate.toISOString(),
      queryDate: range.queryDate,
      today: {
        amountUsd: roundAmount(totals.quota / quotaPerUnit),
        requests: Math.trunc(totals.requests),
        tokens: Math.trunc(totals.tokens),
      },
      account: {
        balanceUsd: roundAmount(finiteNumber(account.quota) / quotaPerUnit),
        historicalUsageUsd: roundAmount(finiteNumber(account.used_quota) / quotaPerUnit),
        historicalRequests: Math.trunc(finiteNumber(account.request_count)),
      },
      featuredGroup: {
        name: featuredGroupName,
        ratio: Object.hasOwn(groupRatios, featuredGroupName) ? groupRatios[featuredGroupName] : null,
      },
      groupRatios,
    };
  };

  const read = async ({ force = false, cacheKey = "" } = {}) => {
    const currentDate = now();
    const currentRange = shanghaiRange(currentDate);
    const fresh = cached
      && cacheKey
      && cachedKey === cacheKey
      && cached.queryDate === currentRange.queryDate
      && currentDate.getTime() - cachedAt < cacheMs;
    if (!force && fresh) return cached;
    if (inFlight) return inFlight;
    inFlight = query()
      .then((result) => {
        cached = result;
        cachedAt = currentDate.getTime();
        cachedKey = cacheKey;
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return { read };
};
