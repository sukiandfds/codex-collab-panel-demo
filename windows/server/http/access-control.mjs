export const authorized = (request, token) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (url.searchParams.get("token") === token) return true;
  const cookies = String(request.headers.cookie || "").split(";");
  return cookies.some((cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    const cookieValue = value.join("=");
    return name === "codex_demo_token" && (cookieValue === token || cookieValue === encodeURIComponent(token));
  });
};

export const rememberAuthorizedDevice = (request, response, url, token) => {
  if (url.searchParams.get("token") !== token) return;
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").toLowerCase();
  const secure = forwardedProto === "https" || Boolean(request.socket?.encrypted);
  const attributes = [`codex_demo_token=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=2592000"];
  if (secure) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
};
