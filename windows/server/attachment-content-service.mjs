import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const maxTextBytes = 8 * 1024 * 1024;
const maxTextCharacters = 120000;
const cache = new Map();
const nativeExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".mp3", ".wav", ".m4a", ".ogg", ".mp4", ".webm", ".mov"]);
const textExtensions = new Set([".txt", ".md", ".markdown", ".json", ".csv", ".xml", ".yaml", ".yml", ".html", ".htm", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".sql", ".py", ".ps1", ".sh", ".bat", ".cmd", ".log", ".toml"]);

const docxTextScript = [
  '$ErrorActionPreference = "Stop"',
  '[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  '$filePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("__FILE_PATH_BASE64__"))',
  '$archive = [IO.Compression.ZipFile]::OpenRead($filePath)',
  'try {',
  '  $entry = $archive.GetEntry("word/document.xml")',
  '  if (-not $entry) { throw "Word 文档正文不存在" }',
  '  $reader = New-Object IO.StreamReader($entry.Open())',
  '  try { $xmlText = $reader.ReadToEnd() } finally { $reader.Dispose() }',
  '  $xml = New-Object Xml.XmlDocument',
  '  $xml.LoadXml($xmlText)',
  '  $namespaces = New-Object Xml.XmlNamespaceManager($xml.NameTable)',
  '  $namespaces.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")',
  '  $paragraphs = foreach ($paragraph in $xml.SelectNodes("//w:body//w:p", $namespaces)) {',
  '    (($paragraph.SelectNodes(".//w:t", $namespaces) | ForEach-Object { $_.InnerText }) -join "")',
  '  }',
  '  [Console]::Out.Write(($paragraphs -join "`n"))',
  '} finally { $archive.Dispose() }',
].join("\n");

const clampText = (value) => String(value || "").replace(/\u0000/gu, "").trim().slice(0, maxTextCharacters);
const cacheKeyFor = (file, stat) => `${path.resolve(file)}:${stat.size}:${stat.mtimeMs}`;

const status = (value, extra = {}) => ({ status: value, ...extra });

const readDocx = async (file) => {
  const encodedPath = Buffer.from(path.resolve(file), "utf8").toString("base64");
  const command = docxTextScript.replace("__FILE_PATH_BASE64__", encodedPath);
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  const result = await execFileAsync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand,
  ], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 10000, windowsHide: true });
  return clampText(result.stdout);
};

const readText = async (file, stat) => {
  if (stat.size > maxTextBytes) throw new Error("文本附件超过 8 MB，暂不自动读取");
  const value = await fs.readFile(file, "utf8");
  if (value.includes("\u0000")) throw new Error("附件不是可读取的文本文件");
  return clampText(value);
};

export const createAttachmentContentService = () => {
  const inspect = async (attachment) => {
    const file = path.resolve(String(attachment?.path || ""));
    if (!file) return status("failed", { error: "附件路径为空" });
    let stat;
    try {
      stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error("附件不是文件");
    } catch (error) {
      return status("failed", { error: error instanceof Error ? error.message : "附件不可用" });
    }

    const extension = path.extname(String(attachment?.name || file)).toLowerCase();
    const key = cacheKeyFor(file, stat);
    const cached = cache.get(key);
    if (cached) return cached;
    if (nativeExtensions.has(extension) || String(attachment?.mimeType || "").startsWith("image/")) {
      const result = status("native");
      cache.set(key, result);
      return result;
    }
    if (!textExtensions.has(extension) && extension !== ".docx") {
      const result = status("unsupported", { error: "该格式暂不自动读取" });
      cache.set(key, result);
      return result;
    }

    try {
      const content = extension === ".docx" ? await readDocx(file) : await readText(file, stat);
      const result = content
        ? status("ready", { content, characters: content.length })
        : status("failed", { error: "附件正文为空" });
      cache.set(key, result);
      return result;
    } catch (error) {
      const result = status("failed", { error: error instanceof Error ? error.message : "附件读取失败" });
      cache.set(key, result);
      return result;
    }
  };

  return { inspect };
};
