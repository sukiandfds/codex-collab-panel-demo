import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createHappyEveringImageClient } from "./happyevering-client.mjs";
import { providerImageRequestFromArgs } from "./image-contract.mjs";

const commonInput = {
  prompt: z.string().min(1).describe("Use the user's original visual request. Do not rewrite it or add extra quality terms unless requested."),
  resolution: z.enum(["1K", "2K", "4K"]).optional().describe("Set only when the user explicitly requests 1K, 2K, or 4K. Omit otherwise."),
  size: z.string().min(1).optional().describe("User-requested aspect ratio or pixel size, such as 2.35:1 or 3840x1632. Omit if unspecified."),
  n: z.number().int().min(1).max(20).optional().describe("Requested image count. Omit for the default of one image."),
};

const resultText = (verb, result) => {
  const lines = result.outputs.map((output) => {
    const dimensions = output.width && output.height ? ` (${output.width}x${output.height})` : "";
    return `${output.path}${dimensions}`;
  });
  return `${verb} ${lines.length} image(s):\n${lines.join("\n")}`;
};

const toolResult = async (operation, successVerb) => {
  try {
    const result = await operation();
    const images = await Promise.all(result.outputs.map(async (output) => ({
      type: "image",
      data: (await fs.readFile(output.path)).toString("base64"),
      mimeType: output.mimeType,
    })));
    return {
      content: [{ type: "text", text: resultText(successVerb, result) }, ...images],
      structuredContent: result,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
};

export const createImageMcpServer = ({ client = createHappyEveringImageClient() } = {}) => {
  const server = new McpServer({ name: "negus-image", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.registerTool("generate_image", {
    title: "Generate image",
    description: "Call immediately when the user explicitly asks to generate or create an image. Preserve the user's wording and pass only options the user specified. The result already includes the image; do not call another image-viewing tool after success.",
    inputSchema: z.object(commonInput),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => toolResult(() => client.generate(providerImageRequestFromArgs(args)), "Generated"));
  server.registerTool("edit_image", {
    title: "Edit image",
    description: "Use for a request to change an existing image. Reuse the latest generated image path when available and pass only options the user specified. The result already includes the image; do not call another image-viewing tool after success.",
    inputSchema: z.object({
      ...commonInput,
      image_paths: z.array(z.string().min(1)).min(1).max(16).describe("Absolute local paths in the user's original attachment order. Never reorder them."),
      aspect_source_image_index: z.number().int().min(1).max(16).optional().describe("One-based attachment index whose aspect ratio should be preserved. Set only when the user explicitly asks to preserve that image's ratio, and omit when size is set."),
      mask_path: z.string().min(1).optional().describe("Optional absolute path to a PNG mask."),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => toolResult(() => client.edit({
    ...providerImageRequestFromArgs(args),
    imagePaths: args.image_paths,
    maskPath: args.mask_path,
  }), "Edited"));
  return server;
};

export const startImageMcpServer = () => serveStdio(() => createImageMcpServer(), {
  legacy: "serve",
  onerror: (error) => process.stderr.write(`[negus-image] ${error.message}\n`),
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startImageMcpServer();
}
