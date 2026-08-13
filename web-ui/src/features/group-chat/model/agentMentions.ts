import type { GroupAgent } from "./types";

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentionBoundary = "(?=$|[^\\p{L}\\p{N}_-])";

export const mentionedAgentIds = (text: string, agents: GroupAgent[]) => {
  const matches = agents.flatMap((agent, agentOrder) => [...new Set([agent.name, ...(agent.aliases || [])])]
    .filter(Boolean)
    .flatMap((name) => [...text.matchAll(new RegExp(`@${escapePattern(name)}${mentionBoundary}`, "gu"))]
      .map((match) => ({ agentId: agent.id, agentOrder, index: match.index, length: name.length }))));
  const selected = new Map<number, typeof matches[number]>();
  for (const match of matches) {
    const current = selected.get(match.index);
    if (!current || match.length > current.length || (match.length === current.length && match.agentOrder < current.agentOrder)) selected.set(match.index, match);
  }
  return [...selected.values()].sort((left, right) => left.index - right.index).map((match) => match.agentId);
};
