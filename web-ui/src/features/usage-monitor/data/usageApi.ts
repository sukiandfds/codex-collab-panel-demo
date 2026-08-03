import { withAccessToken } from "../../../shared/api/http";
import type { FushengUsageSnapshot } from "../model/types";

const readUsage = async (pathname: string, signal?: AbortSignal) => {
  const response = await fetch(withAccessToken(pathname), { cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as (FushengUsageSnapshot & { error?: string }) | null;
  if (!response.ok) {
    if (response.status === 401) throw new Error("当前页面访问已失效，请重新打开完整链接");
    if (response.status === 404) throw new Error("用量服务尚未加载，请重启项目服务");
    throw new Error(payload?.error || `用量查询暂不可用（${response.status}）`);
  }
  if (!payload?.provider) throw new Error("用量数据返回格式错误");
  return payload;
};

export const usageApi = {
  read: (force = false, turnId = "", signal?: AbortSignal) => {
    const parameters = new URLSearchParams();
    if (force) parameters.set("refresh", "1");
    if (turnId) parameters.set("turnId", turnId);
    const parameterText = parameters.toString();
    const query = parameterText ? `?${parameterText}` : "";
    return readUsage(`/api/usage/fusheng${query}`, signal);
  },
};
