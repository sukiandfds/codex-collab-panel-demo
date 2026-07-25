const token = new URLSearchParams(window.location.search).get("token") || "";

// Installed PWAs reopen without the original query string; the server-issued
// HttpOnly cookie carries access in that case.
export const hasAccessToken = true;

export const withAccessToken = (pathname: string) => {
  if (/^(?:https?:|data:|blob:)/iu.test(pathname)) return pathname;
  return `${pathname}${pathname.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
};

export const fetchJson = async <T,>(pathname: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(withAccessToken(pathname), { cache: "no-store", signal });
  if (!response.ok) {
    if (response.status === 401) throw new Error("访问令牌无效，请使用启动命令输出的完整链接");
    if (response.status === 404) throw new Error("请求的项目会话不存在");
    throw new Error(`项目数据服务暂不可用（${response.status}）`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("当前链接未连接到项目数据服务，请使用 pnpm start:demo 输出的 9360 链接");
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error("项目数据返回格式错误");
  }
};

export const postJson = async <T,>(pathname: string, body: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(withAccessToken(pathname), {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `发送失败（${response.status}）`);
  return payload as T;
};
