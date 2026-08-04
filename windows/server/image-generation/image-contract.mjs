export const imageModelByResolution = Object.freeze({
  "1K": "gpt-image-2",
  "2K": "gpt-image-2-2k",
  "4K": "gpt-image-2-4k",
});

export const normalizeImageResolution = (value, fallback = "1K") => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized in imageModelByResolution ? normalized : fallback;
};

export const modelForImageResolution = (value) => imageModelByResolution[normalizeImageResolution(value)];

export const providerImageRequestFromArgs = (args = {}) => ({
  prompt: args.prompt,
  model: args.model || modelForImageResolution(args.resolution),
  size: args.size,
  n: args.n,
  quality: args.quality,
  targetSize: args.target_size || args.targetSize,
  outputDirectory: args.output_directory || args.outputDirectory,
  outputName: args.output_name || args.outputName,
});
