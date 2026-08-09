import { fetchJson } from "../../../shared/api/http";
import type { DirectoryProject, ProjectDirectoryResponse } from "../model/types";

export const projectDirectoryApi = {
  list: async (signal?: AbortSignal): Promise<DirectoryProject[]> => {
    const response = await fetchJson<ProjectDirectoryResponse>("/api/project-directory", signal);
    return Array.isArray(response?.projects) ? response.projects : [];
  },
};
