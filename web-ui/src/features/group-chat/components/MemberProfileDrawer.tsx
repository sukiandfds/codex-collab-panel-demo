import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CircleUserRound, X } from "lucide-react";
import { readModelCatalog, writeModelCatalog } from "../../models/data/modelCatalogCache";
import { modelApi } from "../../models/data/modelApi";
import { formatModelDisplayName } from "../../models/model/modelDisplayName";
import { formatReasoningEffort } from "../../models/model/reasoningEffortLabels";
import type { CodexModel } from "../../models/model/types";
import { AgentMessageLauncher } from "../../agent-sharing/components/AgentMessageLauncher";
import { groupApi } from "../data/groupApi";
import type { GroupAgent, GroupProfile } from "../model/types";
import styles from "./MemberProfileDrawer.module.css";

export function MemberProfileDrawer({ profile, roomId, onClose, onAgentUpdated }: {
  profile: GroupProfile | null;
  roomId: string;
  onClose: () => void;
  onAgentUpdated: (agent: GroupAgent) => void;
}) {
  const agent = profile?.kind === "agent" ? profile.profile : null;
  const agentId = agent?.id || "";
  const [initialModels] = useState(readModelCatalog);
  const [models, setModels] = useState<CodexModel[]>(initialModels);
  const [modelsLoading, setModelsLoading] = useState(!initialModels.length);
  const [draftModel, setDraftModel] = useState("");
  const [draftEffort, setDraftEffort] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const saveControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveControllerRef.current?.abort();
    saveControllerRef.current = null;
    setApplying(false);
    if (!agentId) {
      setDraftModel("");
      setDraftEffort("");
      setError("");
      return;
    }
    setDraftModel(agent?.model || "");
    setDraftEffort(agent?.reasoningEffort || "");
    setError("");
  }, [agentId, agent?.model, agent?.reasoningEffort]);

  useEffect(() => {
    if (!agentId || models.length) {
      setModelsLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setModelsLoading(true);
    void modelApi.list(controller.signal)
      .then((result) => {
        if (!active) return;
        setModels(result);
        writeModelCatalog(result);
      })
      .catch((reason) => {
        if (active) setError(controller.signal.aborted ? "模型列表读取超时，请关闭后重试" : reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setModelsLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [agentId, models.length]);

  const modelOptions = useMemo(() => {
    if (!agent?.model || models.some((entry) => entry.model === agent.model)) return models;
    return [{
      id: agent.model,
      model: agent.model,
      displayName: agent.model,
      description: "当前配置",
      isDefault: false,
      supportedReasoningEfforts: [],
    }, ...models];
  }, [agent?.model, models]);
  const selectedModel = modelOptions.find((entry) => entry.model === draftModel);
  const effortOptions = selectedModel?.supportedReasoningEfforts || [];
  const displayEffortOptions = draftEffort && !effortOptions.some((entry) => entry.reasoningEffort === draftEffort)
    ? [{ reasoningEffort: draftEffort, description: "当前配置" }, ...effortOptions]
    : effortOptions;
  const hasChanges = Boolean(agent && (draftModel !== (agent.model || "") || draftEffort !== (agent.reasoningEffort || "")));

  if (!profile) return null;

  const isAgent = profile.kind === "agent";
  const name = profile.profile.name;
  const initial = isAgent ? profile.profile.shortName : name.slice(0, 1);
  const subtitle = isAgent ? "Agent" : "在线用户";

  const saveAgentSettings = async () => {
    if (!agent || !hasChanges || applying || modelsLoading || !draftModel || !draftEffort) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    saveControllerRef.current?.abort();
    saveControllerRef.current = controller;
    setApplying(true);
    setError("");
    try {
      const updated = await groupApi.updateAgentSettings(agent.id, draftModel, draftEffort, roomId, controller.signal);
      if (!controller.signal.aborted) onAgentUpdated(updated);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      else setError("模型设置保存超时，请重试");
    } finally {
      window.clearTimeout(timeout);
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
        setApplying(false);
      }
    }
  };

  return (
    <div className={styles.layer} role="presentation">
      <button className={styles.backdrop} type="button" aria-label="关闭个人信息" onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="group-profile-title">
        <div className={styles.header}>
          <span className={styles.headerTitle}>个人信息</span>
          <button className={styles.closeButton} type="button" aria-label="关闭个人信息" title="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.identity}>
          <span className={`${styles.avatar} ${isAgent ? styles.agentAvatar : ""}`}>
            {isAgent ? <Bot aria-hidden="true" /> : <CircleUserRound aria-hidden="true" />}
            <small>{initial}</small>
          </span>
          <h2 id="group-profile-title">{name}</h2>
          <p>{subtitle}</p>
        </div>
        {isAgent ? (
          <>
            <AgentMessageLauncher agentId={agentId} onOpened={onClose} />
            <dl className={styles.details}>
              <div>
                <dt>推理模型</dt>
                <dd>
                  <select
                    value={draftModel}
                    disabled={modelsLoading || applying}
                    aria-label="选择 Agent 推理模型"
                    onChange={(event) => {
                      const nextModel = event.target.value;
                      const nextEntry = models.find((entry) => entry.model === nextModel);
                      setDraftModel(nextModel);
                      if (draftEffort && nextEntry && !nextEntry.supportedReasoningEfforts.some((entry) => entry.reasoningEffort === draftEffort)) {
                        setDraftEffort("");
                      }
                    }}
                  >
                    {!draftModel ? <option value="">{modelsLoading ? "读取模型" : "选择模型"}</option> : null}
                    {modelOptions.map((entry) => <option key={entry.id} value={entry.model}>{formatModelDisplayName(entry.model, entry.displayName)}</option>)}
                  </select>
                </dd>
              </div>
              <div>
                <dt>推理强度</dt>
                <dd>
                  <select
                    value={draftEffort}
                    disabled={modelsLoading || applying || !displayEffortOptions.length}
                    aria-label="选择 Agent 推理强度"
                    onChange={(event) => setDraftEffort(event.target.value)}
                  >
                    {!draftEffort ? <option value="">{displayEffortOptions.length ? "选择强度" : "暂无可用强度"}</option> : null}
                    {displayEffortOptions.map((entry) => <option key={entry.reasoningEffort} value={entry.reasoningEffort}>{formatReasoningEffort(entry.reasoningEffort)}</option>)}
                  </select>
                </dd>
              </div>
            </dl>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.actions}>
              <button className={styles.cancelButton} type="button" disabled={applying} onClick={onClose}>取消</button>
              <button className={styles.confirmButton} type="button" disabled={!hasChanges || applying || modelsLoading || !draftModel || !draftEffort} onClick={() => void saveAgentSettings()}>
                {applying ? "正在应用" : "确认"}
              </button>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
