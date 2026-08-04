import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createHappyEveringImageClient } from "./happyevering-client.mjs";
import { providerImageRequestFromArgs } from "./image-contract.mjs";

const commonInput = {
  prompt: z.string().min(1).describe("Natural-language image prompt or edit instruction."),
  resolution: z.enum(["1K", "2K", "4K"]).optional().describe("Requested output resolution tier."),
  model: z.string().min(1).optional().describe("Optional provider model override. Prefer resolution for normal use."),
  size: z.string().min(1).optional().describe("Aspect ratio or pixel size accepted by the provider, such as 3:4 or 1024x1024."),
  n: z.number().int().min(1).max(20).optional().describe("Number of output images. Defaults to 1."),
  quality: z.string().min(1).optional().describe("Optional provider quality setting."),
  target_size: z.string().min(1).optional().describe("Optional final target size supported by the provider."),
  output_directory: z.string().min(1).optional().describe("Local directory for saved images. Defaults to the configured temp directory."),
  output_name: z.string().min(1).optional().describe("Optional filename stem. The real image extension is detected automatically."),
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
    return {
      content: [{ type: "text", text: resultText(successVerb, result) }],
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
    description: "Generate one or more raster images from a natural-language prompt through HappyEvering and save them as local files.",
    inputSchema: z.object(commonInput),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => toolResult(() => client.generate(providerImageRequestFromArgs(args)), "Generated"));
  server.registerTool("edit_image", {
    title: "Edit image",
    description: "Edit or transform one or more local reference images through HappyEvering and save the results as local files.",
    inputSchema: z.object({
      ...commonInput,
      image_paths: z.array(z.string().min(1)).min(1).max(16).describe("Absolute local paths to reference images."),
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
