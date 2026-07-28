import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const maxHtmlBytes = 5 * 1024 * 1024;
const defaultTicketTtlMs = 5 * 60 * 1000;

const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

export const isWebOutputRequest = (text) => {
  const value = String(text || "").trim();
  if (!value) return false;
  const asksForOutput = /(?:生成|制作|创建|做(?:一个|一份)?|输出|交付|generate|create|build|make)/iu.test(value);
  const asksForWebPage = /(?:html|网页|页面|报告页|web\s*page)/iu.test(value);
  return asksForOutput && asksForWebPage;
};

export const validateHtmlFile = async (file) => {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    throw statusError("Agent 未生成 index.html", 422);
  }
  if (!stat.isFile() || stat.size <= 0) throw statusError("index.html 不是有效文件", 422);
  if (stat.size > maxHtmlBytes) throw statusError("index.html 超过 5 MB 限制", 413);
  const content = await fs.readFile(file, "utf8");
  if (!/<html(?:\s|>)/iu.test(content)) throw statusError("index.html 缺少 HTML 根元素", 422);
  if (!/<meta\s+[^>]*name=["']viewport["'][^>]*>/iu.test(content)) {
    throw statusError("index.html 缺少移动端 viewport", 422);
  }
  return { content, size: stat.size };
};

export const validatePdfFile = async (file) => {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    throw statusError("Edge 未生成 result.pdf", 502);
  }
  if (!stat.isFile() || stat.size < 5) throw statusError("result.pdf 为空或不完整", 502);
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (header.toString("ascii") !== "%PDF-") throw statusError("result.pdf 文件头无效", 502);
  } finally {
    await handle.close();
  }
  return { size: stat.size };
};

export const findEdgeBinary = async (configured = process.env.EDGE_BIN) => {
  const candidates = [
    configured,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {}
  }
  throw statusError("未找到 Microsoft Edge，无法生成 PDF", 503);
};

export const renderPdfWithEdge = async ({ url, outputFile, edgeBin, timeoutMs = 60_000, spawnProcess = spawn }) => {
  const executable = await findEdgeBinary(edgeBin);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "codex-web-output-"));
  await fs.rm(outputFile, { force: true });
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--print-to-pdf-no-header",
    `--print-to-pdf=${outputFile}`,
    url,
  ];

  try {
    await new Promise((resolve, reject) => {
      const child = spawnProcess(executable, args, { windowsHide: true, stdio: "ignore" });
      let settled = false;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(statusError("Edge 生成 PDF 超时", 504)));
      }, timeoutMs);
      timer.unref?.();
      child.once("error", (error) => finish(() => reject(error)));
      child.once("exit", (code, signal) => finish(() => {
        if (code === 0) resolve();
        else reject(statusError(`Edge 生成 PDF 失败（code=${code ?? "null"}, signal=${signal || "none"}）`, 502));
      }));
    });
  } finally {
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
};

export const createWebOutputService = ({
  projectRoot,
  originBaseUrl,
  artifacts,
  media,
  renderPdf = renderPdfWithEdge,
  ticketTtlMs = defaultTicketTtlMs,
  now = () => Date.now(),
}) => {
  const outputRoot = path.join(projectRoot, "runtime", "agent-artifacts");
  const jobs = new Map();
  const tickets = new Map();

  const removeExpiredTickets = () => {
    const current = now();
    for (const [ticket, preview] of tickets) {
      if (preview.expiresAt <= current) tickets.delete(ticket);
    }
  };

  const createJob = async ({ sourceMessageId, agentId = "developer" }) => {
    const jobId = randomUUID();
    const outputDirectory = path.join(outputRoot, jobId);
    await fs.mkdir(outputDirectory, { recursive: true });
    const job = {
      jobId,
      agentId,
      sourceMessageId: cleanText(sourceMessageId, 80),
      outputDirectory,
      htmlFile: path.join(outputDirectory, "index.html"),
      pdfFile: path.join(outputDirectory, "result.pdf"),
      htmlRelativePath: path.join(jobId, "index.html"),
      pdfRelativePath: path.join(jobId, "result.pdf"),
      createdAt: new Date(now()).toISOString(),
    };
    jobs.set(jobId, job);
    return job;
  };

  const buildAgentInstructions = (job) => [
    "这是一个受控的静态网页成果任务。",
    `只将最终 HTML 写入这个确定路径：${job.htmlFile}`,
    "必须生成 UTF-8、自包含、响应式的完整 HTML，并包含移动端 viewport。",
    "CSS 必须内联在同一个 HTML 文件中；不要使用 CDN、在线字体、外部接口或项目 API。",
    "不要读取 Cookie、Token 或其他本机路径，不要创建 PDF；服务端会统一转换。",
    "完成 index.html 后，输出一条简洁的最终群消息说明成果已生成。",
  ].join("\n");

  const previewForArtifact = async (artifactId) => {
    removeExpiredTickets();
    const artifact = artifacts.get(cleanText(artifactId, 80));
    const isHtml = artifact.mimeType === "text/html" || path.extname(artifact.name).toLowerCase() === ".html";
    if (!isHtml) throw statusError("该交付物不是 HTML", 400);
    const entry = media.resolveMany([artifact.sourceMediaId])[0];
    if (!entry?.path) throw statusError("HTML 文件不存在", 404);
    await validateHtmlFile(entry.path);
    const ticket = randomBytes(24).toString("base64url");
    tickets.set(ticket, { artifactId: artifact.id, file: entry.path, expiresAt: now() + ticketTtlMs });
    return `/artifact-preview/${ticket}`;
  };

  const readPreview = async (ticketValue) => {
    removeExpiredTickets();
    const ticket = cleanText(ticketValue, 160);
    const preview = tickets.get(ticket);
    if (!preview || preview.expiresAt <= now()) {
      tickets.delete(ticket);
      throw statusError("网页预览链接已失效", 404);
    }
    const { content } = await validateHtmlFile(preview.file);
    return {
      content,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    };
  };

  const completeJob = async ({ job, finalMessageId, createdByAgent, createdByName }) => {
    try {
      await validateHtmlFile(job.htmlFile);
      const htmlArtifact = await artifacts.publish({
        taskId: job.jobId,
        messageId: finalMessageId,
        createdByAgent,
        createdByName,
        relativePath: job.htmlRelativePath,
      });
      const published = [htmlArtifact];
      let pdfError = "";
      try {
        const previewPath = await previewForArtifact(htmlArtifact.id);
        const previewUrl = new URL(previewPath, originBaseUrl).toString();
        await renderPdf({ url: previewUrl, outputFile: job.pdfFile, job });
        await validatePdfFile(job.pdfFile);
        const pdfArtifact = await artifacts.publish({
          taskId: job.jobId,
          messageId: finalMessageId,
          createdByAgent,
          createdByName,
          relativePath: job.pdfRelativePath,
        });
        published.push(pdfArtifact);
      } catch (error) {
        await fs.rm(job.pdfFile, { force: true }).catch(() => {});
        pdfError = error instanceof Error ? error.message : String(error);
      }
      return { artifacts: published, pdfError };
    } finally {
      jobs.delete(job.jobId);
    }
  };

  const abandonJob = (jobId) => jobs.delete(cleanText(jobId, 80));

  const close = () => {
    jobs.clear();
    tickets.clear();
  };

  return {
    isRequest: isWebOutputRequest,
    createJob,
    buildAgentInstructions,
    completeJob,
    abandonJob,
    previewForArtifact,
    readPreview,
    close,
  };
};
