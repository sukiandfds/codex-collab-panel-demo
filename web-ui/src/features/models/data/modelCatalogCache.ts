import { readLocalCache, writeLocalCache } from "../../../shared/state/localCache";
import type { CodexModel } from "../model/types";

const modelsCacheKey = "negus-models-v1";
const validModels = (value: unknown): value is CodexModel[] => Array.isArray(value)
  && value.every((entry) => Boolean(entry)
    && typeof entry === "object"
    && typeof entry.model === "string"
    && Array.isArray(entry.supportedReasoningEfforts));

export const readModelCatalog = () => readLocalCache(modelsCacheKey, validModels) || [];
export const writeModelCatalog = (models: CodexModel[]) => writeLocalCache(modelsCacheKey, models);
