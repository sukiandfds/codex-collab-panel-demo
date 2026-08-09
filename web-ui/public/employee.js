(() => {
  const params = new URLSearchParams(window.location.search);
  const employeeId = params.get("employeeId") || "developer";
  const token = params.get("token") || "";
  const state = {
    employee: null,
    project: null,
    conversation: null,
    status: null,
    messages: [],
    pendingAssistant: "",
    sending: false,
    growth: {
      facts: [],
      proposals: [],
      loading: true,
      loaded: false,
      error: "",
      busyId: "",
      requestVersion: 0,
    },
  };

  const byId = (id) => document.getElementById(id);
  if (token) byId("back-link").href = `/group.html?token=${encodeURIComponent(token)}`;
  const withToken = (path) => {
    if (!token) return path;
    const joiner = path.includes("?") ? "&" : "?";
    return `${path}${joiner}token=${encodeURIComponent(token)}`;
  };

  const jsonRequest = async (path, options = {}) => {
    const response = await fetch(withToken(path), {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
    return body;
  };

  const growthCategoryLabels = { fact: "事实记忆", rule: "规则建议", skill: "Skill 建议" };
  const growthStatusLabels = { ready: "待审批", pending: "处理中", approved: "已批准", rejected: "已拒绝", failed: "保存失败" };
  const normalizeGrowthProposal = (value) => {
    const raw = value || {};
    return {
      ...raw,
      category: raw.category || raw.kind || "rule",
      content: String(raw.content || raw.text || ""),
      status: raw.writeStatus === "failed" ? "failed" : raw.status === "pending" ? "ready" : raw.status || "ready",
    };
  };

  const renderGrowth = () => {
    const content = byId("growth-content");
    const status = byId("growth-state");
    if (!content || !status) return;
    const growth = state.growth;
    content.replaceChildren();
    if (growth.loading) {
      status.textContent = "读取中";
      status.dataset.state = "loading";
      const loading = document.createElement("p");
      loading.className = "growth-empty";
      loading.textContent = "正在读取成长记录...";
      content.append(loading);
      return;
    }

    const actionableCount = growth.proposals.filter((proposal) => proposal.status === "ready" || proposal.status === "failed").length;
    status.textContent = growth.error ? "读取失败" : actionableCount ? `${actionableCount} 条待审批` : "已同步";
    status.dataset.state = growth.error ? "error" : actionableCount ? "ready" : "stable";

    if (growth.error) {
      const error = document.createElement("p");
      error.className = "growth-error";
      error.textContent = growth.error;
      content.append(error);
    }
    if (growth.facts.length) {
      const facts = document.createElement("div");
      facts.className = "growth-facts";
      const heading = document.createElement("strong");
      heading.textContent = "已记录事实";
      facts.append(heading);
      for (const fact of growth.facts.slice(-3)) {
        const item = document.createElement("p");
        item.textContent = fact.text;
        facts.append(item);
      }
      content.append(facts);
    }
    if (!growth.facts.length && !growth.proposals.length && !growth.error) {
      const empty = document.createElement("p");
      empty.className = "growth-empty";
      empty.textContent = "本次暂无新的成长记录";
      content.append(empty);
    }
    for (const proposal of growth.proposals.slice(-6)) {
      const article = document.createElement("article");
      article.className = "growth-proposal";
      article.dataset.status = proposal.status;
      const header = document.createElement("div");
      header.className = "growth-proposal-header";
      const category = document.createElement("strong");
      category.textContent = growthCategoryLabels[proposal.category] || proposal.category;
      const proposalStatus = document.createElement("span");
      proposalStatus.textContent = growthStatusLabels[proposal.status] || proposal.status;
      header.append(category, proposalStatus);
      article.append(header);
      if (proposal.title) {
        const title = document.createElement("h4");
        title.textContent = proposal.title;
        article.append(title);
      }
      const text = document.createElement("p");
      text.textContent = proposal.content;
      article.append(text);
      if (proposal.error) {
        const error = document.createElement("small");
        error.textContent = proposal.error;
        article.append(error);
      }
      if (proposal.status === "ready" || proposal.status === "failed") {
        const actions = document.createElement("div");
        actions.className = "growth-actions";
        for (const action of ["approve", "reject"]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `growth-action growth-action-${action}`;
          button.dataset.growthAction = action;
          button.dataset.proposalId = proposal.id;
          button.disabled = Boolean(growth.busyId);
          button.textContent = action === "approve" ? "批准" : "拒绝";
          actions.append(button);
        }
        article.append(actions);
      }
      if (growth.busyId === proposal.id) {
        const busy = document.createElement("span");
        busy.className = "growth-busy";
        busy.textContent = "处理中";
        article.append(busy);
      }
      content.append(article);
    }
  };

  const refreshGrowth = async () => {
    if (state.growth.busyId) return;
    const requestVersion = ++state.growth.requestVersion;
    state.growth.loading = !state.growth.loaded;
    state.growth.error = "";
    renderGrowth();
    try {
      const result = await jsonRequest(`/api/employee-growth?employeeId=${encodeURIComponent(employeeId)}`);
      if (requestVersion !== state.growth.requestVersion) return;
      state.growth.facts = Array.isArray(result?.facts) ? result.facts.filter((item) => item?.id && item.text) : [];
      state.growth.proposals = Array.isArray(result?.proposals)
        ? result.proposals.filter((item) => item?.id && (item.content || item.text)).map(normalizeGrowthProposal)
        : [];
      state.growth.loaded = true;
      state.growth.loading = false;
    } catch (error) {
      if (requestVersion !== state.growth.requestVersion) return;
      state.growth.loading = false;
      state.growth.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (requestVersion === state.growth.requestVersion) renderGrowth();
    }
  };

  const decideGrowth = async (proposalId, action) => {
    if (state.growth.busyId) return;
    const proposal = state.growth.proposals.find((item) => item.id === proposalId);
    if (!proposal || !["ready", "failed"].includes(proposal.status)) return;
    state.growth.requestVersion += 1;
    state.growth.busyId = proposalId;
    state.growth.error = "";
    proposal.status = "pending";
    proposal.error = "";
    renderGrowth();
    try {
      const result = await jsonRequest(`/api/employee-growth/${action}`, {
        method: "POST",
        body: JSON.stringify({ employeeId, proposalId, requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` }),
      });
      const normalized = normalizeGrowthProposal(result);
      state.growth.proposals = state.growth.proposals.map((item) => item.id === proposalId ? { ...item, ...normalized } : item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.growth.proposals = state.growth.proposals.map((item) => item.id === proposalId ? { ...item, status: "failed", error: message } : item);
      state.growth.error = message;
    } finally {
      state.growth.busyId = "";
      renderGrowth();
    }
  };

  const setConnection = (label, status) => {
    const element = byId("connection-state");
    element.textContent = label;
    element.dataset.state = status;
  };

  const setStatus = (status, confirmed = state.employee?.modificationConfirmed) => {
    state.status = status || state.status;
    const current = state.status || {};
    byId("work-state").textContent = current.label || (confirmed ? "等待任务" : "等待确认");
    byId("permission-state").textContent = confirmed ? "可执行" : "只读";
    byId("permission-state").dataset.state = confirmed ? "write" : "readonly";
    byId("permission-copy").textContent = confirmed
      ? "已确认修改权限。员工可以在需要时调用 Codex 原生子 Agent 完成具体工作。"
      : "当前只讨论、分析和读取信息。确认后，员工才可以进入修改流程。";
    const confirmButton = byId("confirm-button");
    confirmButton.disabled = Boolean(confirmed) || current.active;
    confirmButton.textContent = confirmed ? "已确认执行修改" : current.active ? "处理中" : "确认执行修改";
    byId("send-hint").textContent = confirmed
      ? "消息会进入该员工的长期主对话"
      : "当前是只读讨论，确认后才允许修改文件";
  };

  const renderMessages = () => {
    const list = byId("message-list");
    list.replaceChildren();
    if (!state.messages.length && !state.pendingAssistant) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "还没有消息，从这里开始和员工讨论。";
      list.append(empty);
      return;
    }
    for (const message of state.messages) {
      const item = document.createElement("article");
      item.className = "message";
      item.dataset.role = message.role;
      const label = document.createElement("span");
      label.className = "message-label";
      label.textContent = message.role === "user" ? "你" : (state.employee?.name || "员工");
      item.append(label, document.createTextNode(message.text || ""));
      list.append(item);
    }
    if (state.pendingAssistant) {
      const item = document.createElement("article");
      item.className = "message pending";
      item.dataset.role = "assistant";
      const label = document.createElement("span");
      label.className = "message-label";
      label.textContent = `${state.employee?.name || "员工"} · 处理中`;
      item.append(label, document.createTextNode(state.pendingAssistant));
      list.append(item);
    }
    list.scrollTop = list.scrollHeight;
  };

  const renderIdentity = () => {
    const employee = state.employee || {};
    byId("employee-name").textContent = employee.name || "开发总监";
    byId("employee-heading").textContent = employee.name || "开发总监";
    byId("employee-responsibility").textContent = employee.responsibility || "负责已确认的代码实现、验证和结果汇报";
    byId("project-key").textContent = state.project?.key || employee.projectKey || "employee-developer";
    byId("runtime-kind").textContent = state.project?.runtime || employee.runtimeKind || "codex";
    byId("thread-state").textContent = state.conversation?.threadId ? "已绑定" : "已打开";
  };

  const applySession = (session) => {
    state.employee = session.employee;
    state.project = session.project;
    state.conversation = session.conversation;
    state.status = session.status;
    state.messages = Array.isArray(session.messages) ? session.messages : [];
    renderIdentity();
    setStatus(state.status, Boolean(state.employee?.modificationConfirmed));
    renderMessages();
  };

  const openSession = async () => {
    setConnection("连接中", "loading");
    const session = await jsonRequest(`/api/employee/session?employeeId=${encodeURIComponent(employeeId)}`);
    applySession(session);
    setConnection("已连接", "ready");
  };

  const connectEvents = () => {
    const source = new EventSource(withToken("/events"));
    source.onopen = () => setConnection("已连接", "ready");
    source.onerror = () => setConnection("连接中断，等待恢复", "error");
    source.onmessage = (event) => {
      let value;
      try { value = JSON.parse(event.data); } catch { return; }
      if (value.employeeId !== employeeId) return;
      if (value.type?.startsWith("employee_growth")) {
        void refreshGrowth();
        return;
      }
      if (value.type === "employee_status") {
        setStatus(value.status, value.modificationConfirmed);
        return;
      }
      if (value.type === "employee_confirmation_changed") {
        if (state.employee) state.employee.modificationConfirmed = value.modificationConfirmed;
        setStatus(state.status, value.modificationConfirmed);
        return;
      }
      if (value.type === "employee_assistant_delta") {
        state.pendingAssistant += String(value.delta || "");
        renderMessages();
        return;
      }
      if (value.type === "employee_message_completed") {
        const message = value.message;
        if (!message?.text) return;
        if (message.role === "assistant") {
          state.pendingAssistant = "";
          if (!state.messages.some((entry) => entry.id === message.id)) state.messages.push(message);
        } else {
          let optimisticIndex = -1;
          for (let index = state.messages.length - 1; index >= 0; index -= 1) {
            const candidate = state.messages[index];
            if (candidate.optimistic && candidate.text === message.text) {
              optimisticIndex = index;
              break;
            }
          }
          if (optimisticIndex >= 0) state.messages[optimisticIndex] = message;
          else if (!state.messages.some((entry) => entry.id === message.id)) state.messages.push(message);
        }
        renderMessages();
      }
    };
  };

  byId("growth-content")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button[data-growth-action]") : null;
    if (!target) return;
    void decideGrowth(target.dataset.proposalId || "", target.dataset.growthAction || "");
  });

  byId("confirm-button").addEventListener("click", async () => {
    if (state.employee?.modificationConfirmed || state.status?.active) return;
    const button = byId("confirm-button");
    button.disabled = true;
    button.textContent = "确认中";
    try {
      const result = await jsonRequest("/api/employee/confirm", {
        method: "POST",
        body: JSON.stringify({ employeeId }),
      });
      state.employee = result.employee;
      setStatus(result.status, true);
    } catch (error) {
      button.disabled = false;
      button.textContent = "确认执行修改";
      byId("permission-copy").textContent = error.message;
    }
  });

  byId("message-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.sending) return;
    const input = byId("message-input");
    const text = input.value.trim();
    if (!text) return;
    state.sending = true;
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    state.messages.push({ id: `local-${requestId}`, role: "user", text, optimistic: true, createdAt: new Date().toISOString() });
    state.pendingAssistant = "";
    renderMessages();
    input.value = "";
    const sendButton = byId("send-button");
    sendButton.disabled = true;
    sendButton.dataset.state = "sending";
    sendButton.textContent = "处理中";
    try {
      await jsonRequest("/api/employee/message", {
        method: "POST",
        body: JSON.stringify({ employeeId, text, requestId }),
      });
    } catch (error) {
      byId("send-hint").textContent = error.message;
    } finally {
      state.sending = false;
      sendButton.disabled = false;
      sendButton.dataset.state = "ready";
      sendButton.textContent = "发送";
      input.focus();
    }
  });

  connectEvents();
  renderGrowth();
  void refreshGrowth();
  window.setInterval(() => void refreshGrowth(), 8000);
  openSession().catch((error) => {
    setConnection("无法连接", "error");
    byId("message-list").textContent = error.message;
  });
})();
