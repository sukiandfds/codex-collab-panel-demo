import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

const previewTypeFor = (mimeType, name) => {
  const type = String(mimeType || "").toLowerCase();
  const extension = path.extname(String(name || "")).toLowerCase();
  if (type === "text/markdown" || extension === ".md" || extension === ".markdown") return "markdown";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || extension === ".pdf") return "pdf";
  return "none";
};

const fileSha256 = (file) => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(file);
  stream.on("error", reject);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("end", () => resolve(hash.digest("hex")));
});

const insideRoot = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
};

const publicVersion = (version) => ({
  version: version.version,
  name: version.name,
  mimeType: version.mimeType,
  size: version.size,
  sha256: version.sha256,
  status: version.status,
  sourceMediaId: version.sourceMediaId,
  sourceUrl: `/api/media/${version.sourceMediaId}`,
  previewType: version.previewType,
  previewMediaId: version.previewMediaId || null,
  previewUrl: version.previewMediaId ? `/api/media/${version.previewMediaId}` : null,
  reviewDecision: version.reviewDecision || null,
  reviewNote: version.reviewNote || "",
  reviewedBy: version.reviewedBy || "",
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
});

const publicArtifact = (artifact) => {
  const current = artifact.versions.find((version) => version.version === artifact.currentVersion)
    || artifact.versions[artifact.versions.length - 1];
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    taskId: artifact.taskId || null,
    messageId: artifact.messageId || null,
    createdByAgent: artifact.createdByAgent,
    createdByName: artifact.createdByName,
    currentVersion: artifact.currentVersion,
    ...publicVersion(current),
    versions: artifact.versions.map(publicVersion),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
};

export const createArtifactService = async ({ stateFile, allowedRoot, projectId, media, broadcast }) => {
  const artifacts = new Map();
  let writeQueue = Promise.resolve();
  const root = path.resolve(allowedRoot);
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);

  let stored = {};
  try {
    stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {}
  for (const artifact of Array.isArray(stored.artifacts) ? stored.artifacts : []) {
    if (!artifact?.id || !Array.isArray(artifact.versions) || !artifact.versions.length) continue;
    artifacts.set(artifact.id, artifact);
    for (const version of artifact.versions) {
      if (!version.sourceRelativePath) continue;
      const source = path.resolve(realRoot, version.sourceRelativePath);
      if (insideRoot(realRoot, source)) media.register(source, { name: version.name, mimeType: version.mimeType });
    }
  }

  const persist = () => {
    const payload = `${JSON.stringify({ version: 1, artifacts: [...artifacts.values()] }, null, 2)}\n`;
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(stateFile), { recursive: true });
        const temporary = `${stateFile}.${process.pid}.tmp`;
        await fs.writeFile(temporary, payload, "utf8");
        await fs.rename(temporary, stateFile);
      });
    return writeQueue;
  };

  const resolveAllowedFile = async (relativePath) => {
    const supplied = cleanText(relativePath, 500);
    if (!supplied || path.isAbsolute(supplied)) {
      throw Object.assign(new Error("交付物路径必须是允许目录中的相对路径"), { statusCode: 400 });
    }
    const candidate = path.resolve(realRoot, supplied);
    if (!insideRoot(realRoot, candidate)) {
      throw Object.assign(new Error("交付物路径超出允许目录"), { statusCode: 400 });
    }
    let realFile;
    let stat;
    try {
      realFile = await fs.realpath(candidate);
      stat = await fs.stat(realFile);
    } catch {
      throw Object.assign(new Error("交付物文件不存在"), { statusCode: 404 });
    }
    if (!insideRoot(realRoot, realFile) || !stat.isFile()) {
      throw Object.assign(new Error("交付物路径不是允许目录中的文件"), { statusCode: 400 });
    }
    const registered = media.register(realFile);
    return { entry: media.resolveMany([registered.id])[0], sourceRelativePath: path.relative(realRoot, realFile) };
  };

  const resolveSource = async ({ mediaId, relativePath }) => {
    if (mediaId && relativePath) throw Object.assign(new Error("只能选择 mediaId 或相对路径中的一种来源"), { statusCode: 400 });
    if (mediaId) {
      const entry = media.resolveMany([cleanText(mediaId, 80)])[0];
      if (!entry) throw Object.assign(new Error("交付物媒体文件不存在"), { statusCode: 404 });
      return { entry, sourceRelativePath: null };
    }
    return resolveAllowedFile(relativePath);
  };

  const publish = async ({ artifactId, taskId, messageId, createdByAgent, createdByName, mediaId, relativePath }) => {
    const agentId = cleanText(createdByAgent, 80);
    if (!agentId) throw Object.assign(new Error("createdByAgent 不能为空"), { statusCode: 400 });
    const { entry, sourceRelativePath } = await resolveSource({ mediaId, relativePath });
    const stat = await fs.stat(entry.path);
    if (!stat.isFile()) throw Object.assign(new Error("交付物来源不是文件"), { statusCode: 400 });
    const now = new Date().toISOString();
    const existingId = cleanText(artifactId, 80);
    const existing = existingId ? artifacts.get(existingId) : null;
    if (existingId && !existing) throw Object.assign(new Error("交付物不存在"), { statusCode: 404 });
    const id = existing?.id || randomUUID();
    const versionNumber = existing ? existing.currentVersion + 1 : 1;
    const displayName = entry.name;
    const displayType = entry.mimeType;
    const version = {
      version: versionNumber,
      name: displayName,
      mimeType: displayType,
      size: stat.size,
      sha256: await fileSha256(entry.path),
      status: "ready",
      sourceMediaId: entry.id,
      sourceRelativePath,
      previewType: previewTypeFor(displayType, displayName),
      previewMediaId: null,
      reviewDecision: null,
      reviewNote: "",
      reviewedBy: "",
      createdAt: now,
      updatedAt: now,
    };
    const versions = existing ? existing.versions.map((item) => item.version === existing.currentVersion
      ? { ...item, status: "superseded", updatedAt: now }
      : item) : [];
    versions.push(version);
    const artifact = {
      id,
      projectId,
      taskId: cleanText(taskId, 80) || existing?.taskId || null,
      messageId: cleanText(messageId, 80) || existing?.messageId || null,
      createdByAgent: agentId,
      createdByName: cleanText(createdByName, 80) || existing?.createdByName || agentId,
      currentVersion: versionNumber,
      versions,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    artifacts.set(id, artifact);
    await persist();
    const result = publicArtifact(artifact);
    broadcast({
      type: "artifact.ready",
      artifactId: id,
      messageId: artifact.messageId,
      status: version.status,
      version: versionNumber,
      updatedAt: now,
    });
    return result;
  };

  const get = (id) => {
    const artifact = artifacts.get(cleanText(id, 80));
    if (!artifact) throw Object.assign(new Error("交付物不存在"), { statusCode: 404 });
    return publicArtifact(artifact);
  };

  const list = ({ messageId, taskId } = {}) => [...artifacts.values()]
    .filter((artifact) => (!messageId || artifact.messageId === messageId) && (!taskId || artifact.taskId === taskId))
    .map(publicArtifact);

  const review = async (id, decision, note, reviewedBy) => {
    if (decision !== "approve" && decision !== "reject") {
      throw Object.assign(new Error("审核决定必须是 approve 或 reject"), { statusCode: 400 });
    }
    const artifact = artifacts.get(cleanText(id, 80));
    if (!artifact) throw Object.assign(new Error("交付物不存在"), { statusCode: 404 });
    const now = new Date().toISOString();
    artifact.versions = artifact.versions.map((version) => version.version === artifact.currentVersion ? {
      ...version,
      status: decision === "reject" ? "rejected" : "ready",
      reviewDecision: decision,
      reviewNote: cleanText(note, 2000),
      reviewedBy: cleanText(reviewedBy, 80),
      updatedAt: now,
    } : version);
    artifact.updatedAt = now;
    artifacts.set(artifact.id, artifact);
    await persist();
    const result = publicArtifact(artifact);
    broadcast({
      type: "artifact.reviewed",
      artifactId: artifact.id,
      messageId: artifact.messageId,
      status: result.status,
      version: artifact.currentVersion,
      decision,
      updatedAt: now,
    });
    return result;
  };

  await persist();
  return { publish, get, list, review, close: () => writeQueue };
};
