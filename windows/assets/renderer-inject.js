((cssText, artDataUrl, rawConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const ROOT_CLASSES = [
    "codex-dream-skin",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-standard",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const SUMMARY_PANEL_ID = "codex-dream-summary-panel";
  const SUMMARY_STYLE_ID = "codex-dream-summary-style";
  const SUMMARY_STATE_KEY = "__CODEX_DREAM_SUMMARY_STATE__";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof config?.palette?.accent === "string"
      ? config.palette.accent.trim()
      : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const metadataRatio = Number(config?.artMetadata?.ratio);
    return {
      appearance,
      safeArea,
      taskMode,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
    };
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();
  const config = normalizeConfig(rawConfig);
  const summaryState = window[SUMMARY_STATE_KEY] || {
    open: true,
    view: "summary",
    enabled: true,
    model: "fast-summary",
    endpoint: "",
    apiKey: "",
    lastUpdated: Date.now(),
    connection: "未连接总结模型",
    capture: null,
  };
  if (summaryState.captureTimer) clearInterval(summaryState.captureTimer);
  window[SUMMARY_STATE_KEY] = summaryState;
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "3";
  }

  const analyzeArt = () => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
        }
        const resolvedAccent = accentWeight > 1
          ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: averageBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          luma: clamp(averageBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = artUrl;
  });

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-dream-skin");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(SUMMARY_PANEL_ID)?.remove();
    document.getElementById(SUMMARY_STYLE_ID)?.remove();
  };

  const summaryCss = `
    #${SUMMARY_PANEL_ID} {
      --summary-bg: color-mix(in srgb, #171a21 94%, var(--dream-accent, #8da7ff));
      --summary-border: color-mix(in srgb, #ffffff 14%, transparent);
      --summary-text: #f3f5f8;
      --summary-muted: #aeb7c6;
      position: fixed; top: 76px; right: 18px; width: 348px; max-height: calc(100vh - 98px);
      display: flex; flex-direction: column; z-index: 2147483000; overflow: hidden;
      color: var(--summary-text); background: var(--summary-bg); border: 1px solid var(--summary-border);
      border-radius: 16px; box-shadow: 0 18px 55px rgba(0,0,0,.34); backdrop-filter: blur(22px);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${SUMMARY_PANEL_ID} * { box-sizing: border-box; }
    #${SUMMARY_PANEL_ID}[data-closed="true"] { display: none; }
    #${SUMMARY_PANEL_ID} .summary-head { display:flex; align-items:center; justify-content:space-between; padding: 14px 16px 10px; border-bottom:1px solid var(--summary-border); }
    #${SUMMARY_PANEL_ID} .summary-title { display:flex; align-items:center; gap:9px; font-weight:700; letter-spacing:.01em; }
    #${SUMMARY_PANEL_ID} .summary-dot { width:8px; height:8px; border-radius:50%; background:#6ee7b7; box-shadow:0 0 0 4px rgba(110,231,183,.13); }
    #${SUMMARY_PANEL_ID} .summary-icon { border:0; color:var(--summary-muted); background:transparent; cursor:pointer; font-size:18px; line-height:1; padding:2px 4px; }
    #${SUMMARY_PANEL_ID} .summary-tabs { display:flex; gap:5px; padding: 10px 12px 0; }
    #${SUMMARY_PANEL_ID} .summary-tab { flex:1; border:1px solid transparent; border-radius:9px; padding:7px 8px; color:var(--summary-muted); background:transparent; cursor:pointer; }
    #${SUMMARY_PANEL_ID} .summary-tab[data-active="true"] { color:var(--summary-text); background:rgba(255,255,255,.09); border-color:var(--summary-border); }
    #${SUMMARY_PANEL_ID} .summary-body { overflow:auto; padding: 12px; }
    #${SUMMARY_PANEL_ID} .summary-card { padding:12px; margin-bottom:9px; border:1px solid var(--summary-border); border-radius:11px; background:rgba(255,255,255,.045); }
    #${SUMMARY_PANEL_ID} .summary-label { color:var(--summary-muted); font-size:11px; margin-bottom:4px; }
    #${SUMMARY_PANEL_ID} .summary-value { color:var(--summary-text); font-weight:600; }
    #${SUMMARY_PANEL_ID} .summary-list { margin:7px 0 0; padding-left:17px; color:#d8dee8; }
    #${SUMMARY_PANEL_ID} .summary-list li { margin:4px 0; }
    #${SUMMARY_PANEL_ID} .summary-preview { color:#d8dee8; white-space:pre-wrap; overflow-wrap:anywhere; }
    #${SUMMARY_PANEL_ID} .summary-section { padding:8px 0; border-top:1px solid rgba(255,255,255,.09); }
    #${SUMMARY_PANEL_ID} .summary-section:first-child { padding-top:0; border-top:0; }
    #${SUMMARY_PANEL_ID} .summary-section-title { color:#f3f5f8; font-size:12px; font-weight:700; margin-bottom:4px; }
    #${SUMMARY_PANEL_ID} .summary-section-item { color:#d8dee8; margin:3px 0; padding-left:12px; position:relative; }
    #${SUMMARY_PANEL_ID} .summary-section-item::before { content:""; width:4px; height:4px; border-radius:50%; background:#8da7ff; position:absolute; left:1px; top:.62em; }
    #${SUMMARY_PANEL_ID} .summary-foot { padding:9px 14px 12px; color:var(--summary-muted); font-size:11px; border-top:1px solid var(--summary-border); }
    #${SUMMARY_PANEL_ID} label { display:block; color:var(--summary-muted); font-size:11px; margin:10px 0 5px; }
    #${SUMMARY_PANEL_ID} input, #${SUMMARY_PANEL_ID} select { width:100%; border:1px solid var(--summary-border); border-radius:8px; padding:9px 10px; color:var(--summary-text); background:rgba(0,0,0,.2); outline:none; }
    #${SUMMARY_PANEL_ID} input:focus, #${SUMMARY_PANEL_ID} select:focus { border-color:var(--dream-accent, #8da7ff); }
    #${SUMMARY_PANEL_ID} .summary-actions { display:flex; gap:8px; margin-top:14px; }
    #${SUMMARY_PANEL_ID} .summary-action { flex:1; border:1px solid var(--summary-border); border-radius:8px; padding:8px 10px; color:var(--summary-text); background:rgba(255,255,255,.08); cursor:pointer; }
    #${SUMMARY_PANEL_ID} .summary-action.primary { color:#10131a; background:#dce6ff; border-color:transparent; font-weight:650; }
    #codex-dream-summary-tab { position:fixed; right:0; top:42%; z-index:2147482999; border:1px solid rgba(255,255,255,.16); border-right:0; border-radius:10px 0 0 10px; padding:11px 8px; color:#f3f5f8; background:#202630; cursor:pointer; writing-mode:vertical-rl; font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; box-shadow:0 8px 24px rgba(0,0,0,.25); }
    #codex-dream-summary-tab[data-closed="false"] { display:none; }
  `;

  const bindSummaryEvent = (target, eventName, handler) => {
    if (typeof target?.addEventListener === "function") target.addEventListener(eventName, handler);
  };

  const makeSummaryButton = (label, className, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    bindSummaryEvent(button, "click", (event) => { event.stopPropagation?.(); handler(); });
    return button;
  };

  const appendSummaryChildren = (parent, ...children) => {
    if (typeof parent?.append === "function") parent.append(...children);
    else children.forEach((child) => parent?.appendChild?.(child));
  };

  const renderSummaryPanel = (panel, tab) => {
    if (typeof panel?.appendChild !== "function") return;
    panel.dataset.closed = String(!summaryState.open);
    tab.dataset.closed = String(!summaryState.open);
    if (typeof panel.replaceChildren === "function") panel.replaceChildren();
    else panel.textContent = "";

    const head = document.createElement("div");
    head.className = "summary-head";
    const title = document.createElement("div");
    title.className = "summary-title";
    const dot = document.createElement("span");
    dot.className = "summary-dot";
    const titleText = document.createElement("span");
    titleText.textContent = "研发实时记录";
    appendSummaryChildren(title, dot, titleText);
    appendSummaryChildren(head, title, makeSummaryButton("×", "summary-icon", () => {
      summaryState.open = false;
      renderSummaryPanel(panel, tab);
    }));
    panel.appendChild(head);

    const tabs = document.createElement("div");
    tabs.className = "summary-tabs";
    for (const [key, label] of [["summary", "研发记录"], ["settings", "设置"]]) {
      const tabButton = makeSummaryButton(label, "summary-tab", () => {
        summaryState.view = key;
        renderSummaryPanel(panel, tab);
      });
      tabButton.dataset.active = String(summaryState.view === key);
      tabs.appendChild(tabButton);
    }
    panel.appendChild(tabs);

    const body = document.createElement("div");
    body.className = "summary-body";
    if (summaryState.view === "summary") {
      const status = document.createElement("div");
      status.className = "summary-card";
      status.hidden = true;
      status.innerHTML = '<div class="summary-label">本地记录状态</div><div id="summary-capture-status" class="summary-value">正在等待本地记录服务</div><div id="summary-capture-meta" class="summary-label" style="margin-top:7px">尚未读取当前 Codex 会话</div>';
      body.appendChild(status);
      const latestUser = document.createElement("div");
      latestUser.className = "summary-card";
      latestUser.hidden = true;
      latestUser.innerHTML = '<div class="summary-label">最近用户要求</div><div id="summary-last-user" class="summary-preview">尚未捕获</div>';
      body.appendChild(latestUser);
      const latestAssistant = document.createElement("div");
      latestAssistant.className = "summary-card";
      latestAssistant.hidden = true;
      latestAssistant.innerHTML = '<div class="summary-label">最近 Codex 回复</div><div id="summary-last-assistant" class="summary-preview">尚未捕获</div>';
      body.appendChild(latestAssistant);
      const aiSummary = document.createElement("div");
      aiSummary.className = "summary-card";
      aiSummary.innerHTML = '<div class="summary-label">研发记录</div><div id="summary-ai-text" class="summary-preview">等待本地总结服务</div><div id="summary-ai-meta" class="summary-label" style="margin-top:7px">尚未调用模型</div>';
      const topic = document.createElement("div");
      topic.className = "summary-card";
      topic.innerHTML = '<div class="summary-label">讨论主题</div><div class="summary-value">negus Demo</div><ul class="summary-list"><li>增加项目实时总结面板</li><li>增加 API Key 与模型设置入口</li><li>暂不执行代码修改或上传数据</li></ul>';
      body.appendChild(topic);
      body.appendChild(aiSummary);
      const pending = document.createElement("div");
      pending.className = "summary-card";
      pending.hidden = true;
      pending.innerHTML = '<div class="summary-label">模型连接</div><div class="summary-value">未连接</div><div class="summary-label" style="margin-top:7px">这是界面验证版本，尚未接入真实总结模型。</div>';
      body.appendChild(pending);
    } else {
      const label = document.createElement("label");
      label.textContent = "总结模型";
      const model = document.createElement("select");
      for (const optionValue of ["fast-summary", "balanced-summary"]) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue === "fast-summary" ? "快速低价模型" : "平衡模型";
        option.selected = summaryState.model === optionValue;
        model.appendChild(option);
      }
      bindSummaryEvent(model, "change", () => { summaryState.model = model.value; });
      appendSummaryChildren(body, label, model);
      const endpointLabel = document.createElement("label");
      endpointLabel.textContent = "API 地址（可选）";
      const endpoint = document.createElement("input");
      endpoint.placeholder = "https://api.example.com/v1";
      endpoint.value = summaryState.endpoint;
      bindSummaryEvent(endpoint, "input", () => { summaryState.endpoint = endpoint.value; });
      appendSummaryChildren(body, endpointLabel, endpoint);
      const keyLabel = document.createElement("label");
      keyLabel.textContent = "API Key（仅保存在当前会话）";
      const key = document.createElement("input");
      key.type = "password";
      key.placeholder = summaryState.apiKey ? "已填写" : "sk-...";
      key.value = summaryState.apiKey;
      bindSummaryEvent(key, "input", () => { summaryState.apiKey = key.value; });
      appendSummaryChildren(body, keyLabel, key);
      const actions = document.createElement("div");
      actions.className = "summary-actions";
      appendSummaryChildren(actions,
        makeSummaryButton("测试连接", "summary-action primary", () => {
          summaryState.connection = summaryState.apiKey ? "已填写 Key，等待接入测试" : "请先填写 API Key";
          summaryState.lastUpdated = Date.now();
          renderSummaryPanel(panel, tab);
        }),
        makeSummaryButton(summaryState.enabled ? "暂停总结" : "启用总结", "summary-action", () => {
          summaryState.enabled = !summaryState.enabled;
          renderSummaryPanel(panel, tab);
        }),
      );
      body.appendChild(actions);
      const note = document.createElement("div");
      note.className = "summary-foot";
      note.textContent = `当前状态：${summaryState.connection}。本版本不会上传 API Key。`;
      body.appendChild(note);
    }
    panel.appendChild(body);
    const foot = document.createElement("div");
    foot.className = "summary-foot";
    foot.textContent = `界面 Demo · ${summaryState.enabled ? "总结已启用" : "总结已暂停"} · 刚刚更新`;
    panel.appendChild(foot);
  };

  const ensureSummaryPanel = () => {
    if (!document.body) return;
    let style = document.getElementById(SUMMARY_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = SUMMARY_STYLE_ID;
      style.textContent = summaryCss;
      document.head?.appendChild(style);
    }
    let tab = document.getElementById("codex-dream-summary-tab");
    let created = false;
    if (!tab) {
      created = true;
      tab = document.createElement("button");
      tab.id = "codex-dream-summary-tab";
      tab.type = "button";
      tab.textContent = "AI 总结";
      bindSummaryEvent(tab, "click", () => {
        summaryState.open = true;
        const panel = document.getElementById(SUMMARY_PANEL_ID);
        if (panel) renderSummaryPanel(panel, tab);
      });
      document.body.appendChild(tab);
    }
    let panel = document.getElementById(SUMMARY_PANEL_ID);
    if (!panel) {
      created = true;
      panel = document.createElement("aside");
      panel.id = SUMMARY_PANEL_ID;
      panel.setAttribute("aria-label", "研发实时记录");
      document.body.appendChild(panel);
    }
    if (created) renderSummaryPanel(panel, tab);
  };

  const summarySectionNames = new Set([
    "当前主题", "用户需求与确认", "AI执行与进度", "已完成与验证",
    "问题与风险", "待办", "待讨论", "经验与关联上下文",
  ]);

  const renderSummaryText = (container, text) => {
    const normalizedText = String(text || "");
    if (container.dataset.renderedSummary === normalizedText &&
        container.querySelector(".summary-section")) return;
    const scrollRoot = container.closest(".summary-body");
    const previousScrollTop = scrollRoot?.scrollTop || 0;
    const lines = normalizedText.split(/\r?\n/);
    const sections = [];
    let current = null;
    for (const rawLine of lines) {
      const line = rawLine.replace(/^\s*(?:#{1,3}\s*)?/, "").trim();
      if (!line) continue;
      const heading = line.replace(/[：:]\s*$/, "").trim();
      if (summarySectionNames.has(heading)) {
        current = { title: heading, items: [] };
        sections.push(current);
        continue;
      }
      if (!current) {
        current = { title: "记录", items: [] };
        sections.push(current);
      }
      const item = line.replace(/^(?:[-*•]|\d+[.)])\s*/, "").trim();
      if (item) current.items.push(item);
    }
    if (!sections.length) {
      container.textContent = normalizedText || "等待一轮对话结束后总结";
      container.dataset.renderedSummary = normalizedText;
      return;
    }
    container.replaceChildren();
    for (const section of sections) {
      const block = document.createElement("section");
      block.className = "summary-section";
      const heading = document.createElement("div");
      heading.className = "summary-section-title";
      heading.textContent = section.title;
      block.appendChild(heading);
      for (const item of section.items) {
        const row = document.createElement("div");
        row.className = "summary-section-item";
        row.textContent = item;
        block.appendChild(row);
      }
      container.appendChild(block);
    }
    container.dataset.renderedSummary = normalizedText;
    if (scrollRoot) scrollRoot.scrollTop = previousScrollTop;
  };

  const applySummaryCapture = (capture) => {
    summaryState.capture = capture && typeof capture === "object" ? capture : { connected: false };
    const status = document.getElementById("summary-capture-status");
    const meta = document.getElementById("summary-capture-meta");
    const lastUser = document.getElementById("summary-last-user");
    const lastAssistant = document.getElementById("summary-last-assistant");
    const aiText = document.getElementById("summary-ai-text");
    const aiMeta = document.getElementById("summary-ai-meta");
    if (!status || !meta) return;
    if (!capture?.connected) {
      status.textContent = "本地记录服务未连接";
      meta.textContent = "启动 summary-observer 后，这里会显示新增对话捕获状态";
      if (lastUser) lastUser.textContent = "尚未捕获";
      if (lastAssistant) lastAssistant.textContent = "尚未捕获";
      if (aiText) aiText.textContent = "等待本地总结服务";
      if (aiMeta) aiMeta.textContent = "尚未调用模型";
      return;
    }
    status.textContent = "本地记录服务已连接";
    meta.textContent = `用户 ${capture.userMessages || 0} 条 · Codex 回复 ${capture.assistantMessages || 0} 条 · 最近更新 ${capture.lastUpdated ? new Date(capture.lastUpdated).toLocaleTimeString() : "暂无"}`;
    if (lastUser) lastUser.textContent = capture.lastUserPreview || "尚未捕获";
    if (lastAssistant) lastAssistant.textContent = capture.lastAssistantPreview || "尚未捕获";
    if (aiText) {
      if (capture.summaryStatus === "summarizing") {
        if (!aiText.dataset.renderedSummary && !aiText.querySelector(".summary-section") &&
            aiText.dataset.summaryStatus !== "summarizing") {
          aiText.textContent = "Luna 正在总结最近一轮对话…";
          delete aiText.dataset.renderedSummary;
        }
      } else if (capture.summaryStatus === "error") {
        const errorText = `总结失败：${capture.summaryError || "未知错误"}`;
        if (aiText.textContent !== errorText) aiText.textContent = errorText;
        delete aiText.dataset.renderedSummary;
      } else {
        renderSummaryText(aiText, capture.summary || "等待一轮对话结束后总结");
      }
      aiText.dataset.summaryStatus = capture.summaryStatus || "waiting";
    }
    if (aiMeta) {
      if (capture.summaryStatus === "ready") {
        aiMeta.textContent = `${capture.summaryModel || "Luna"} · ${capture.summaryElapsedMs || 0} ms · 最近更新 ${capture.summaryUpdated ? new Date(capture.summaryUpdated).toLocaleTimeString() : "暂无"}`;
      } else if (capture.summaryStatus === "error") aiMeta.textContent = "未自动回退到其他模型";
      else if (capture.summaryStatus === "waiting" && capture.summary) aiMeta.textContent = "上一轮已完成 · 等待下一轮对话";
      else aiMeta.textContent = `状态：${capture.summaryStatus || "waiting"}`;
    }
  };
  window.__CODEX_DREAM_APPLY_CAPTURE__ = applySummaryCapture;

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const accentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    root.style.setProperty("--dream-art", `url("${artUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", profile.luma.toFixed(3));
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    const shellMain = document.querySelector("main.main-surface");
    const shellSidebar = document.querySelector("aside.app-shell-left-panel");
    if (!shellMain || !shellSidebar) {
      clearSkinDom();
      return;
    }

    root.classList.add("codex-dream-skin");
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "3") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "3";
    }

    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"]')) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home ? home.querySelectorAll('[class*="_homeUtilityBar_"]') : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    ensureSummaryPanel();
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[SUMMARY_STATE_KEY];
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver((records) => {
    if (samplingNativeShell) return;
    if (records.length && records.every((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target?.closest?.(`#${SUMMARY_PANEL_ID}, #codex-dream-summary-tab`);
    })) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure, cleanup, observer, timer, scheduler, artUrl, profile, config, installToken, version: "1.2.0",
  };
  ensure();
  applySummaryCapture(summaryState.capture);
  analyzeArt().then((result) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_DREAM_SKIN_DISABLED__) return;
    profile = result;
    state.profile = result;
    ensure();
  });
  return { installed: true, version: "1.2.0", adaptive: true };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)
