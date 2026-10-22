const $ = (sel) => document.querySelector(sel);
const chat = $("#chat");
const input = $("#input");
const form = $("#form");
const sendBtn = $("#send");
const clearBtn = $("#clearBtn");
const ocrBtn = $("#ocrBtn");
const screenBtn = $("#screenBtn");
const circuitBtn = $("#circuitBtn");
const circuitModal = $("#circuitModal");
const circuitClose = $("#circuitClose");
const circuitSolve = $("#circuitSolve");
const circuitExample = $("#circuitExample");
const netlist = $("#netlist");
const circuitError = $("#circuitError");
const imageInput = $("#imageInput");
const dropOverlay = $("#dropOverlay");
const inspector = $("#inspector");
const inspectorStatus = $("#inspectorStatus");
const STATIC = !!window.VOLT_STATIC;

let busy = false;
let initialWelcome = "";
let exampleGroups = [];
const objectUrls = [];

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const FALLBACK = [
  { group: "直流基础", items: ["5V 100Ω 电流和功率", "两个 10k 电阻并联", "12V 10k 4.7k 分压", "5V 红色 LED 20mA 限流电阻"] },
  { group: "交流与滤波", items: ["RC 1k 100nF 截止频率", "100nF 50Hz 容抗", "10mH 1kHz 感抗", "10uH 100nF 谐振频率"] },
  { group: "器件与数字", items: ["555 10k 10k 100nF 频率", "运放 反相 10k 100k 增益", "三极管 12V 100k hFE=100", "7805 12V 5V 0.5A 功耗"] },
  { group: "工程工具", items: ["PCB 2A 10°C 1oz 外层 线宽", "2000mAh 100mA 续航", "20dB 功率比", "棕黑红金 色环"] },
];

function renderLibrary(groups) {
  const nav = $("#groups");
  nav.innerHTML = "";
  groups.forEach((g, gi) => {
    const div = document.createElement("div");
    div.className = "group" + (gi === 0 ? " open" : "");
    div.innerHTML = `
      <div class="group-head"><span>${esc(g.group)}</span><span class="count">${String(g.items.length).padStart(2, "0")}</span></div>
      <div class="group-items">
        ${g.items.map((q) => `<button class="group-item" data-query="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>`;
    div.querySelector(".group-head").addEventListener("click", () => {
      if (window.matchMedia("(max-width: 820px)").matches) {
        input.value = g.items[0];
        input.focus();
        resizeInput();
      } else {
        div.classList.toggle("open");
      }
    });
    nav.appendChild(div);
  });

  const cards = $("#welcomeCards");
  cards.innerHTML = "";
  groups.slice(0, 4).forEach((g) => {
    const card = document.createElement("div");
    card.className = "wcard";
    card.innerHTML = `<h3>${esc(g.group)}</h3>${g.items.slice(0, 3).map((q) => `<button data-query="${esc(q)}">${esc(q)}</button>`).join("")}`;
    cards.appendChild(card);
  });

  const sug = $("#suggestions");
  sug.innerHTML = "";
  const picks = [
    groups[0]?.items[0], groups[0]?.items[2], groups[1]?.items[0],
    groups[2]?.items[0], groups[3]?.items[0], groups[3]?.items[2],
  ].filter(Boolean);
  picks.forEach((q) => {
    const b = document.createElement("button");
    b.className = "suggestion";
    b.type = "button";
    b.dataset.query = q;
    b.textContent = q;
    sug.appendChild(b);
  });

  if (!initialWelcome) initialWelcome = chat.innerHTML;
}

function ensureMessages() {
  let box = chat.querySelector(".messages");
  if (!box) {
    const welcome = $("#welcome");
    if (welcome) welcome.remove();
    box = document.createElement("div");
    box.className = "messages";
    chat.appendChild(box);
  }
  return box;
}

function addUser(text) {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg user";
  const b = document.createElement("div");
  b.className = "bubble";
  b.textContent = text;
  msg.appendChild(b);
  box.appendChild(msg);
  scrollBottom();
}

function addUserImage(url, label) {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg user";
  msg.innerHTML = `<div class="bubble image-bubble"><img src="${url}" alt="题目图片"><span>${esc(label)}</span></div>`;
  box.appendChild(msg);
  scrollBottom();
}

function ocrLoadingNode() {
  const msg = document.createElement("div");
  msg.className = "msg agent";
  msg.id = "ocr-loading";
  msg.innerHTML = `
    <div class="agent-label"><span class="mini-mark">V</span> VOLT / READING IMAGE</div>
    <div class="ocr-loading"><div class="spinner"></div><div>正在识别题目文字与参数…<br><span style="color:#4d625c">本地 OCR，不上传云端</span></div></div>`;
  return msg;
}

function ocrDetails(data) {
  const open = !(data.result && data.result.ok);
  const langs = (data.languages || []).filter(Boolean).join(" + ") || "OCR";
  return `
    <details class="ocr-details" ${open ? "open" : ""}>
      <summary>识别文字 / 可修正</summary>
      <textarea class="ocr-text" spellcheck="false">${esc(data.text || "")}</textarea>
      <div class="ocr-actions">
        <button class="followup" type="button" data-ocr-recalc>按这段文字计算</button>
        <button class="followup" type="button" data-ocr-use>填入输入框</button>
      </div>
      <div class="ocr-meta">${esc(langs)} · ${esc(data.elapsed ?? "—")}s · 识别到 ${(data.quantities || []).length} 个带单位参数</div>
    </details>`;
}

function circuitNote(circuit) {
  const assumptions = (circuit.assumptions || []).map((a) => `<li>${esc(a)}</li>`).join("");
  return `
    <details class="ocr-details">
      <summary>电路图识别 / 网表</summary>
      <div class="ocr-meta">${esc(circuit.name || "拓扑模板")} · ${esc(circuit.reason || "")}</div>
      <pre class="netlist-preview">${esc(circuit.netlist || "")}</pre>
      ${assumptions ? `<ul class="notes">${assumptions}</ul>` : ""}
    </details>`;
}

function addOcrResult(data) {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg agent";
  const result = data.result;
  const circuit = data.circuit;
  if (circuit && circuit.solution && circuit.solution.ok) {
    msg.innerHTML = `<div class="agent-label"><span class="mini-mark">V</span> VOLT / 电路图识别 · 已求解</div>${renderCircuit(circuit.solution)}${circuitNote(circuit)}${ocrDetails(data)}`;
    inspectorStatus.textContent = "已求解";
    const nodeSummary = Object.entries(circuit.solution.nodes || {})
      .filter(([k]) => k !== "0")
      .map(([k, v]) => `${k} = ${v.display}`)
      .join("，");
    inspector.innerHTML = `<div class="insp-cat">CIRCUIT / ${esc(circuit.name || "MNA")}</div><div class="insp-title">电路图识别</div><div class="insp-summary">${esc(nodeSummary || "已求解")}</div><div class="insp-formula">${esc(circuit.solution.total_source_power)} 输出 / ${esc(circuit.solution.total_resistor_power)} 消耗</div>`;
  } else if (result && result.ok) {
    msg.innerHTML = `<div class="agent-label"><span class="mini-mark">V</span> VOLT / 题目识别 · 已计算</div>${renderAnswer(result, data.query || data.text || "")}${ocrDetails(data)}`;
    renderInspector(result);
  } else {
    const pseudo = {
      ok: false,
      title: "识别完成，但还不能直接算",
      category: "OCR / 题目识别",
      summary: (data.quantities || []).length
        ? `识别到 ${data.quantities.length} 个带单位参数。请检查下面的文字，修正后点“按这段文字计算”。`
        : "没有识别到带单位的参数。请换一张更清晰、正对题目的图片。",
      formula: "",
      steps: [],
      values: (data.quantities || []).map((q) => ({ label: q.raw, value: q.display })),
      notes: ["OCR 对手写、反光、倾斜和复杂电路图会有误差；识别文字可以直接编辑。"],
      followups: [],
    };
    msg.innerHTML = `<div class="agent-label"><span class="mini-mark">V</span> VOLT / 题目识别 · 待确认</div>${renderAnswer(pseudo, data.query || data.text || "")}${ocrDetails(data)}`;
    renderInspector(pseudo);
  }
  box.appendChild(msg);
  requestAnimationFrame(() => {
    const anchor = msg.previousElementSibling || msg;
    const top = anchor.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
    chat.scrollTop = Math.max(0, top - 14);
  });
}

function addUserNetlist(text) {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg user";
  msg.innerHTML = `<div class="bubble netlist-bubble">${esc(text)}</div>`;
  box.appendChild(msg);
  scrollBottom();
}

function renderCircuit(r) {
  const nodes = Object.entries(r.nodes || {})
    .map(([name, v]) => `<tr><td class="mint">${esc(name)}</td><td>${esc(v.display)}</td></tr>`)
    .join("");
  const comps = (r.components || [])
    .map((c) => {
      const powerLabel = c.kind === "R" ? "消耗" : "输出";
      return `<tr>
        <td class="mint">${esc(c.name)}</td>
        <td>${esc(c.kind)}</td>
        <td>${esc(c.from)} → ${esc(c.to)}</td>
        <td>${esc(c.value)}</td>
        <td>${esc(c.current)}</td>
        <td class="${c.kind === "R" ? "amber" : "mint"}">${esc(c.power)}</td>
      </tr>`;
    })
    .join("");
  return `
    <article class="answer">
      <div class="answer-top">
        <div><div class="kicker">CIRCUIT / DC MNA</div><h3>电路求解</h3></div>
        <div class="badge">${r.balance_ok ? "BALANCED" : "CHECK"}</div>
      </div>
      <div class="answer-body">
        <div class="summary">节点电压已求解，${r.counts?.elements ?? 0} 个元件 / ${r.counts?.nodes ?? 0} 个节点</div>
        <div class="formula">节点电压法：G·V = I（含独立电压源支路电流）</div>
        <div class="section-label">NODES / 节点电压</div>
        <div class="circuit-scroll"><table class="circuit-table"><thead><tr><th>节点</th><th>电压</th></tr></thead><tbody>${nodes}</tbody></table></div>
        <div class="section-label">BRANCHES / 支路</div>
        <div class="circuit-scroll"><table class="circuit-table"><thead><tr><th>元件</th><th>类型</th><th>方向</th><th>数值</th><th>电流</th><th>功率</th></tr></thead><tbody>${comps}</tbody></table></div>
        <div class="section-label">POWER / 功率平衡</div>
        <div class="values">
          <div class="value"><div class="label">电源输出</div><div class="v">${esc(r.total_source_power)}</div></div>
          <div class="value"><div class="label">电阻消耗</div><div class="v">${esc(r.total_resistor_power)}</div></div>
          <div class="value"><div class="label">差值</div><div class="v">${esc(r.balance)}</div></div>
        </div>
        <div class="section-label">NOTES / 方向说明</div>
        <ul class="notes">
          <li>R 的电流正方向：从第一个节点流向第二个节点。</li>
          <li>V 的电流正方向：从 + 端到 − 端流过电源内部；功率为正值表示电源输出。</li>
          <li>I 的电流正方向：从第一个节点流向第二个节点。</li>
        </ul>
      </div>
    </article>`;
}

function addCircuitResult(r, netlistText) {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg agent";
  if (r.ok) {
    msg.innerHTML = `<div class="agent-label"><span class="mini-mark">V</span> VOLT / CIRCUIT SOLVED</div>${renderCircuit(r)}`;
    inspectorStatus.textContent = "已求解";
    const nodeSummary = Object.entries(r.nodes || {})
      .filter(([k]) => k !== "0")
      .map(([k, v]) => `${k} = ${v.display}`)
      .join("，");
    inspector.innerHTML = `<div class="insp-cat">CIRCUIT / DC MNA</div><div class="insp-title">直流电路求解</div><div class="insp-summary">${esc(nodeSummary || "已求解")}</div><div class="insp-formula">${esc(r.total_source_power)} 输出 / ${esc(r.total_resistor_power)} 消耗</div>`;
  } else {
    const body = esc(r.error || "求解失败，请检查网表。");
    msg.innerHTML = `<div class="agent-label"><span class="mini-mark">V</span> VOLT / CIRCUIT ERROR</div><article class="answer error"><div class="answer-top"><div><div class="kicker">CIRCUIT / DC MNA</div><h3>网表无法求解</h3></div><div class="badge">ERROR</div></div><div class="answer-body"><div class="summary">${body}</div><div class="formula">${esc(netlistText)}</div></div></article>`;
    inspectorStatus.textContent = "求解失败";
  }
  box.appendChild(msg);
  requestAnimationFrame(() => {
    const anchor = msg.previousElementSibling || msg;
    const top = anchor.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
    chat.scrollTop = Math.max(0, top - 14);
  });
}

function addAiResult(data) {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg agent";
  msg.innerHTML = `
    <div class="agent-label"><span class="mini-mark">V</span> VOLT / AI TUTOR · FREE</div>
    <article class="answer ai-answer">
      <div class="answer-top">
        <div><div class="kicker">AI TUTOR / FREE MODEL</div><h3>电子助教</h3></div>
        <div class="badge">FREE</div>
      </div>
      <div class="answer-body">
        <div class="ai-text">${esc(data.answer || "")}</div>
        <div class="section-label">NOTE / 说明</div>
        <ul class="notes">
          <li>由免费模型 ${esc(data.model || "openai-fast")} 生成，仅用于解释和思路。</li>
          <li>数值结果请以 VOLT 的确定性计算/求解器为准；AI 不负责精确计算。</li>
        </ul>
      </div>
    </article>`;
  box.appendChild(msg);
  requestAnimationFrame(() => {
    const top = msg.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
    chat.scrollTop = Math.max(0, top - 14);
  });
}

async function askAI(query, context = "") {
  if (!query || busy) return;
  busy = true;
  sendBtn.disabled = true;
  const t = ocrLoadingNode();
  t.querySelector(".agent-label").innerHTML = `<span class="mini-mark">V</span> VOLT / AI TUTOR · THINKING`;
  t.querySelector(".ocr-loading").innerHTML = `<div class="spinner"></div><div>免费模型正在组织解释…<br><span style="color:#4d625c">Pollinations / openai-fast</span></div>`;
  chat.appendChild(t);
  scrollBottom();

  let data;
  try {
    if (STATIC && window.voltAI) {
      data = await window.voltAI(query, context);
    } else {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context }),
      });
      data = await res.json();
    }
  } catch (err) {
    data = { ok: false, error: STATIC ? "静态版 AI 模型暂时不可用；计算器仍可使用。" : "AI 服务连接失败，请稍后再试。" };
  }
  document.getElementById("ocr-loading")?.remove();
  if (data.ok) {
    addAiResult(data);
  } else {
    addAgent({
      ok: false,
      title: "AI 助手暂时不可用",
      category: "AI TUTOR",
      summary: data.error || "免费模型没有返回结果。",
      formula: "",
      steps: [],
      values: [],
      notes: ["你仍然可以使用上面的确定性计算器和电路求解器。"],
      followups: [],
    });
  }
  busy = false;
  sendBtn.disabled = false;
  input.focus();
}

function typingNode() {
  const msg = document.createElement("div");
  msg.className = "msg agent";
  msg.id = "typing";
  msg.innerHTML = `
    <div class="agent-label"><span class="mini-mark">V</span> VOLT / CALCULATING</div>
    <div class="typing"><i></i><i></i><i></i></div>`;
  return msg;
}

function renderAnswer(r, query = "") {
  const ok = r.ok !== false;
  const values = (r.values || []).map((v) => `
    <div class="value"><div class="label">${esc(v.label)}</div><div class="v">${esc(v.value)}</div></div>`).join("");
  const steps = (r.steps || []).length
    ? `<div class="section-label">STEPS / 代入</div><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "";
  const notes = (r.notes || []).length
    ? `<div class="section-label">NOTES / 注意</div><ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";
  const aiContext = [r.summary, r.formula, ...(r.values || []).map((v) => `${v.label}=${v.value}`)].filter(Boolean).join(" | ");
  const aiButton = query
    ? `<button class="followup ai-btn" data-ai-query="${esc(query)}" data-ai-context="${esc(aiContext)}">${ok ? "让 AI 解释" : "问 AI 助手"}</button>`
    : "";
  const chipButtons = (r.followups || []).map((f) => `<button class="followup" data-query="${esc(f)}">${esc(f)}</button>`).join("");
  const followups = (chipButtons || aiButton)
    ? `<div class="followups">${chipButtons}${aiButton}</div>` : "";

  return `
    <article class="answer ${ok ? "" : "error"}">
      <div class="answer-top">
        <div><div class="kicker">${esc(r.category || "CALCULATION")}</div><h3>${esc(r.title || "计算结果")}</h3></div>
        <div class="badge">${ok ? "CALCULATED" : "INPUT NEEDED"}</div>
      </div>
      <div class="answer-body">
        <div class="summary">${esc(r.summary || "")}</div>
        ${r.formula ? `<div class="formula">${esc(r.formula)}</div>` : ""}
        ${steps}
        ${values ? `<div class="section-label">VALUES / 结果</div><div class="values">${values}</div>` : ""}
        ${notes}
        ${followups}
      </div>
    </article>`;
}

function addAgent(r, query = "") {
  const box = ensureMessages();
  const msg = document.createElement("div");
  msg.className = "msg agent";
  msg.innerHTML = `<div class="agent-label"><span class="mini-mark">V</span> VOLT / RESULT</div>${renderAnswer(r, query)}`;
  box.appendChild(msg);
  renderInspector(r);
  requestAnimationFrame(() => {
    const anchor = msg.previousElementSibling || msg;
    const top = anchor.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
    chat.scrollTop = Math.max(0, top - 14);
  });
}

function renderInspector(r) {
  inspectorStatus.textContent = r.ok === false ? "需要补充" : "已计算";
  const vals = (r.values || []).map((v) => `<div class="insp-value"><span class="l">${esc(v.label)}</span><span class="v">${esc(v.value)}</span></div>`).join("");
  const notes = (r.notes || []).slice(0, 3).map((n) => `<p>${esc(n)}</p>`).join("");
  inspector.innerHTML = `
    <div class="insp-cat">${esc(r.category || "")}</div>
    <div class="insp-title">${esc(r.title || "")}</div>
    <div class="insp-summary">${esc(r.summary || "")}</div>
    ${r.formula ? `<div class="insp-formula">${esc(r.formula)}</div>` : ""}
    ${vals ? `<div class="insp-values">${vals}</div>` : ""}
    ${notes ? `<div class="insp-notes">${notes}</div>` : ""}`;
}

function scrollBottom() {
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}

async function sendQuery(text) {
  const q = String(text || "").trim();
  if (!q || busy) return;
  busy = true;
  sendBtn.disabled = true;
  addUser(q);
  input.value = "";
  resizeInput();
  const t = typingNode();
  chat.appendChild(t);
  scrollBottom();

  let data;
  try {
    if (STATIC && window.voltCalculate) {
      data = await window.voltCalculate(q);
    } else {
      const res = await fetch("/api/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      data = await res.json();
    }
  } catch (err) {
    data = { ok: false, title: STATIC ? "计算引擎加载失败" : "连接失败", category: "ERROR", summary: STATIC ? "浏览器计算引擎没有加载成功，请刷新页面后重试。" : "无法连接本地计算服务，请确认 server.py 正在运行。", formula: "", steps: [], values: [], notes: [], followups: [] };
  }
  document.getElementById("typing")?.remove();
  addAgent(data, q);
  busy = false;
  sendBtn.disabled = false;
  input.focus();
}

async function handleImage(file, label = "识别这道题") {
  if (!file || busy) return;
  if (!file.type.startsWith("image/")) {
    addAgent({ ok: false, title: "文件不是图片", category: "OCR", summary: "请上传 PNG、JPG、WebP 或 BMP 图片。", formula: "", steps: [], values: [], notes: [], followups: [] });
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    addAgent({ ok: false, title: "图片太大", category: "OCR", summary: "图片超过 15MB，请压缩后再试。", formula: "", steps: [], values: [], notes: [], followups: [] });
    return;
  }
  if (STATIC) {
    addAgent({
      ok: false,
      title: "静态版不支持本机 OCR",
      category: "OCR",
      summary: "GitHub Pages 是纯静态站点，无法调用 Windows 本机 OCR。请直接输入题目文字，或使用本地 server.py 版本识别图片。",
      formula: "",
      steps: [],
      values: [],
      notes: ["计算器和电路画布在静态版仍可正常使用。"],
      followups: [],
    });
    return;
  }

  busy = true;
  sendBtn.disabled = true;
  ocrBtn.disabled = true;
  screenBtn.disabled = true;
  const url = URL.createObjectURL(file);
  objectUrls.push(url);
  addUserImage(url, label);
  const t = ocrLoadingNode();
  chat.appendChild(t);
  scrollBottom();

  let data;
  try {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "image/png",
        "X-Filename": `upload.${(file.name.split(".").pop() || "png").toLowerCase()}`,
      },
      body: file,
    });
    data = await res.json();
  } catch (err) {
    data = { ok: false, error: "OCR 服务连接失败，请确认 server.py 正在运行。", text: "", quantities: [] };
  }
  document.getElementById("ocr-loading")?.remove();
  if (data.ok) {
    addOcrResult(data);
  } else {
    addAgent({
      ok: false,
      title: "识别失败",
      category: "OCR",
      summary: data.error || "没有读出题目，请换一张更清晰的图片。",
      formula: "",
      steps: [],
      values: [],
      notes: ["建议：正对题目、光线均匀、减少反光，保留完整题干和单位。"],
      followups: [],
    });
  }
  busy = false;
  sendBtn.disabled = false;
  ocrBtn.disabled = false;
  screenBtn.disabled = false;
  input.focus();
}

async function captureScreen() {
  if (busy) return;
  if (STATIC) {
    addAgent({
      ok: false,
      title: "静态版不支持识屏",
      category: "OCR",
      summary: "GitHub Pages 无法调用本机 OCR。请直接输入题目文字，或使用本地 server.py 版本。",
      formula: "",
      steps: [],
      values: [],
      notes: ["静态版仍可使用计算器和电路画布。"],
      followups: [],
    });
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    addAgent({ ok: false, title: "浏览器不支持识屏", category: "OCR", summary: "请使用新版 Chrome / Edge，或直接上传题目图片。", formula: "", steps: [], values: [], notes: [], followups: [] });
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
    const video = document.createElement("video");
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 260));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((track) => track.stop());
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) await handleImage(new File([blob], "screen.png", { type: "image/png" }), "识别屏幕上的题目");
  } catch (err) {
    stream?.getTracks().forEach((track) => track.stop());
    if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
      addAgent({ ok: false, title: "识屏失败", category: "OCR", summary: String(err?.message || err), formula: "", steps: [], values: [], notes: [], followups: [] });
    }
  }
}

async function solveCircuit() {
  const text = netlist.value.trim();
  if (!text || busy) return;
  circuitError.classList.remove("show");
  circuitModal.classList.remove("show");
  busy = true;
  circuitSolve.disabled = true;
  addUserNetlist(text);
  const t = ocrLoadingNode();
  t.querySelector(".ocr-loading").innerHTML = `<div class="spinner"></div><div>正在列节点方程并求解…<br><span style="color:#4d625c">DC / MNA</span></div>`;
  chat.appendChild(t);
  scrollBottom();

  let data;
  try {
    if (STATIC && window.voltSolveCircuit) {
      data = await window.voltSolveCircuit(text);
    } else {
      const res = await fetch("/api/circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ netlist: text }),
      });
      data = await res.json();
    }
  } catch (err) {
    data = { ok: false, error: STATIC ? "静态版电路求解引擎加载失败，请刷新页面后重试。" : "电路求解服务连接失败，请确认 server.py 正在运行。" };
  }
  document.getElementById("ocr-loading")?.remove();
  addCircuitResult(data, text);
  busy = false;
  circuitSolve.disabled = false;
  input.focus();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendQuery(input.value);
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuery(input.value);
  }
});

const EXAMPLE_NETLIST = `V1 n1 0 17
R1 n1 A 2
V2 n2 0 17
R2 n2 A 1
R3 A 0 5`;

netlist.value = `V1 in 0 12
R1 in out 10k
R2 out 0 4.7k`;

circuitBtn.addEventListener("click", () => {
  circuitError.classList.remove("show");
  circuitModal.classList.add("show");
  netlist.focus();
});
circuitClose.addEventListener("click", () => circuitModal.classList.remove("show"));
circuitModal.addEventListener("click", (e) => {
  if (e.target === circuitModal) circuitModal.classList.remove("show");
});
circuitExample.addEventListener("click", () => {
  netlist.value = EXAMPLE_NETLIST;
  netlist.focus();
});
circuitSolve.addEventListener("click", solveCircuit);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") circuitModal.classList.remove("show");
});

ocrBtn.addEventListener("click", () => imageInput.click());
screenBtn.addEventListener("click", captureScreen);
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) handleImage(file);
  imageInput.value = "";
});

document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        handleImage(file, "粘贴的题目图片");
      }
      break;
    }
  }
});

let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  dragDepth += 1;
  dropOverlay.classList.add("show");
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove("show");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove("show");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleImage(file, "拖入的题目图片");
});

document.addEventListener("click", (e) => {
  const ai = e.target.closest("[data-ai-query]");
  if (ai) {
    askAI(ai.dataset.aiQuery || "", ai.dataset.aiContext || "");
    return;
  }
  const recalc = e.target.closest("[data-ocr-recalc]");
  if (recalc) {
    const box = recalc.closest(".ocr-details");
    const text = box?.querySelector(".ocr-text")?.value.trim();
    if (text) sendQuery(text);
    return;
  }
  const use = e.target.closest("[data-ocr-use]");
  if (use) {
    const box = use.closest(".ocr-details");
    const text = box?.querySelector(".ocr-text")?.value.trim();
    if (text) {
      input.value = text;
      input.focus();
      resizeInput();
    }
    return;
  }
  const q = e.target.closest("[data-query]")?.dataset.query;
  if (q) {
    sendQuery(q);
  }
});

clearBtn.addEventListener("click", () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.length = 0;
  chat.innerHTML = initialWelcome;
  inspector.innerHTML = `<div class="empty"><div class="scope">⌁</div><p>计算结果会在这里展开<br>公式、数值和注意事项。</p></div>`;
  inspectorStatus.textContent = "待输入";
  input.value = "";
  resizeInput();
  input.focus();
});

(async function init() {
  if (STATIC) {
    exampleGroups = FALLBACK;
    ocrBtn.disabled = true;
    screenBtn.disabled = true;
    ocrBtn.title = "静态版不支持本机 OCR";
    screenBtn.title = "静态版不支持本机 OCR";
    const tag = document.querySelector(".tag");
    if (tag) tag.textContent = "STATIC";
    const status = document.querySelector(".status");
    if (status) status.innerHTML = '<i></i>浏览器计算 · 静态版';
  } else {
    try {
      const res = await fetch("/api/examples");
      const data = await res.json();
      exampleGroups = data.groups?.length ? data.groups : FALLBACK;
    } catch {
      exampleGroups = FALLBACK;
    }
  }
  renderLibrary(exampleGroups);
  resizeInput();
  const bootQuery = new URLSearchParams(location.search).get("q");
  if (bootQuery) sendQuery(bootQuery);
})();
