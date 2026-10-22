/* VOLT 可视化电路画布：放置元件、拖拽、导线、节点、生成网表并求解。 */
(() => {
  const $ = (s) => document.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const DEFAULT_VALUE = {
    R: "1k", POT: "10k", C: "100nF", L: "10mH", V: "12V", AC: "12V", I: "1mA",
    D: "0.7V", LED: "2V", NPN: "", PNP: "", OP: "", SW: "", F: "1A", T: "1:1",
    XTAL: "8MHz", GND: "",
  };
  const LABEL_PREFIX = { R: "R", POT: "RP", C: "C", L: "L", V: "V", AC: "VAC", I: "I", D: "D", LED: "LED", NPN: "Q", PNP: "Q", OP: "U", SW: "SW", F: "F", T: "T", XTAL: "X", GND: "GND" };

  const PINS = {
    R: { "1": [-48, 0], "2": [48, 0] },
    POT: { "1": [-48, 0], "2": [48, 0], "3": [0, -46] },
    C: { "1": [-48, 0], "2": [48, 0] },
    L: { "1": [-48, 0], "2": [48, 0] },
    V: { "1": [-48, 0], "2": [48, 0] },
    AC: { "1": [-48, 0], "2": [48, 0] },
    I: { "1": [-48, 0], "2": [48, 0] },
    D: { "1": [-48, 0], "2": [48, 0] },
    LED: { "1": [-48, 0], "2": [48, 0] },
    NPN: { "b": [-48, 0], "c": [30, -42], "e": [30, 42] },
    PNP: { "b": [-48, 0], "c": [30, -42], "e": [30, 42] },
    OP: { "-": [-48, -18], "+": [-48, 18], "out": [48, 0] },
    SW: { "1": [-48, 0], "2": [48, 0] },
    F: { "1": [-48, 0], "2": [48, 0] },
    T: { "p1": [-48, -20], "p2": [-48, 20], "s1": [48, -20], "s2": [48, 20] },
    XTAL: { "1": [-48, 0], "2": [48, 0] },
    GND: { "1": [0, -48] },
  };

  const SYMBOLS = {
    R: () => `<path class="sch-symbol" d="M-48 0H-30L-24-11L-12 11L0-11L12 11L24-11L30 0H48"/>`,
    POT: () => `<path class="sch-symbol" d="M-48 0H-30V-12H30V12H-30V0H48"/><path class="sch-symbol" d="M0-46V-12M-7-20L0-12L7-20"/>`,
    C: () => `<path class="sch-symbol" d="M-48 0H-6M6 0H48M-6-18V18M6-18V18"/>`,
    L: () => `<path class="sch-symbol" d="M-48 0H-34C-34-18-18-18-18 0C-18-18-2-18-2 0C-2-18 14-18 14 0C14-18 30-18 30 0H48"/>`,
    V: () => `<circle class="sch-symbol" cx="0" cy="0" r="17"/><path class="sch-symbol" d="M-48 0H-17M17 0H48"/>`,
    AC: () => `<circle class="sch-symbol" cx="0" cy="0" r="17"/><path class="sch-symbol" d="M-48 0H-17M17 0H48M-9 0C-6-8 0-8 3 0C6 8 12 8 15 0"/>`,
    I: () => `<circle class="sch-symbol" cx="0" cy="0" r="17"/><path class="sch-symbol" d="M-8 0H8M3-5L9 0L3 5M-48 0H-17M17 0H48"/>`,
    D: () => `<path class="sch-symbol" d="M-48 0H-14M-14-16L14 0L-14 16Z M14-16V16M14 0H48"/>`,
    LED: () => `<path class="sch-symbol" d="M-48 0H-14M-14-16L14 0L-14 16Z M14-16V16M14 0H48M4-22L14-32M14-32L9-30M14-32L12-27M14-22L24-32M24-32L19-30M24-32L22-27"/>`,
    NPN: () => `<circle class="sch-symbol" cx="0" cy="0" r="27"/><path class="sch-symbol" d="M-48 0H-12M-12-16V16M-12-10L30-42M-12 10L30 42M20 24L30 42L10 40"/>`,
    PNP: () => `<circle class="sch-symbol" cx="0" cy="0" r="27"/><path class="sch-symbol" d="M-48 0H-12M-12-16V16M-12-10L30-42M-12 10L30 42M4 8L-12 10L-2-6"/>`,
    OP: () => `<path class="sch-symbol" d="M-30-32L30 0L-30 32Z M-48-18H-30M-48 18H-30M30 0H48"/><text x="-24" y="-10" fill="#07825f" font-size="12">−</text><text x="-24" y="26" fill="#07825f" font-size="12">+</text>`,
    SW: () => `<path class="sch-symbol" d="M-48 0H-12M12 0H48M-12 0L10-16"/>`,
    F: () => `<path class="sch-symbol" d="M-48 0H-30M30 0H48"/><rect class="sch-symbol" x="-30" y="-10" width="60" height="20"/><path class="sch-symbol" d="M-30 0H30"/>`,
    T: () => `<path class="sch-symbol" d="M-48-20H-24M-48 20H-24M24-20H48M24 20H48M-24-20V20M24-20V20M-12-20C-24-20-24 0-12 0C-24 0-24 20-12 20M12-20C24-20 24 0 12 0C24 0 24 20 12 20M-8-26V26M8-26V26"/>`,
    XTAL: () => `<path class="sch-symbol" d="M-48 0H-18M18 0H48M-18-18V18M18-18V18M-8-12H8V12H-8Z"/>`,
    GND: () => `<path class="sch-symbol" d="M0-48V-10M-18-10H18M-12 0H12M-6 10H6"/>`,
  };

  const PALETTE = [
    { group: "基础", items: [
      { type: "R", name: "电阻" }, { type: "POT", name: "电位器" },
      { type: "C", name: "电容" }, { type: "L", name: "电感" },
    ]},
    { group: "电源 / 地", items: [
      { type: "V", name: "直流电压源" }, { type: "AC", name: "交流电压源" },
      { type: "I", name: "直流电流源" }, { type: "GND", name: "接地" },
    ]},
    { group: "半导体", items: [
      { type: "D", name: "二极管" }, { type: "LED", name: "发光二极管" },
      { type: "NPN", name: "NPN 三极管" }, { type: "PNP", name: "PNP 三极管" },
      { type: "OP", name: "运算放大器" },
    ]},
    { group: "开关 / 保护", items: [
      { type: "SW", name: "开关" }, { type: "F", name: "保险丝" },
      { type: "T", name: "变压器" }, { type: "XTAL", name: "晶振" },
    ]},
  ];

  const state = {
    comps: [], nodes: [], wires: [],
    selected: null,
    tool: "select",
    placing: null,
    wireStart: null,
    wirePreview: null,
    drag: null,
    panning: null,
    view: { x: 30, y: 30, k: 1 },
    ids: {},
    showCurrents: false,
  };

  const svg = $("#schSvg");
  const world = $("#schWorld");
  const overlay = $("#schOverlay");
  const editor = $("#schematicEditor");
  const flipBtn = $("#schFlip");
  const varBtn = $("#schVar");
  const measured = $("#schMeasured");
  const fieldLabel = $("#schFieldLabel");
  const branchCalc = $("#schBranchCalc");
  const voltageInput = $("#schVoltage");
  const currentInput = $("#schCurrent");
  const calcResult = $("#schCalcResult");

  function uid(prefix) {
    state.ids[prefix] = (state.ids[prefix] || 0) + 1;
    return `${prefix}${state.ids[prefix]}`;
  }
  function labelFor(type) {
    const p = LABEL_PREFIX[type] || type;
    state.ids[`label_${p}`] = (state.ids[`label_${p}`] || 0) + 1;
    return `${p}${state.ids[`label_${p}`]}`;
  }
  function snap(v) { return Math.round(v / 20) * 20; }
  function snapPoint(p) { return [snap(p[0]), snap(p[1])]; }
  function pinLocal(type, pin) { return PINS[type]?.[pin] || PINS[type]?.p1 || [0, 0]; }
  function pinPos(c, pin) {
    const [lx, ly] = pinLocal(c.type, pin);
    const a = (c.rot || 0) * Math.PI / 180;
    return [c.x + lx * Math.cos(a) - ly * Math.sin(a), c.y + lx * Math.sin(a) + ly * Math.cos(a)];
  }
  function anchorPos(a) {
    if (!a) return [0, 0];
    if (a.k === "pin") {
      const c = state.comps.find((x) => x.id === a.cid);
      return c ? pinPos(c, a.pin) : [0, 0];
    }
    if (a.k === "node") {
      const n = state.nodes.find((x) => x.id === a.nid);
      return n ? [n.x, n.y] : [0, 0];
    }
    return [a.x, a.y];
  }
  function anchorKey(a) {
    if (!a) return "";
    if (a.k === "pin") return `p:${a.cid}:${a.pin}`;
    if (a.k === "node") return `n:${a.nid}`;
    return `pt:${snap(a.x)},${snap(a.y)}`;
  }
  const P = (cid, pin) => ({ k: "pin", cid, pin });
  const N = (nid) => ({ k: "node", nid });
  const PT = (x, y) => ({ k: "pt", x, y });

  function invalidate() {
    state.lastSolve = null;
    state.wireWarnings = [];
    for (const w of state.wires) w.computedCurrent = null;
  }

  function addComp(type, x, y, rot = 0, value = null, label = null) {
    invalidate();
    const c = {
      id: uid("c"), label: label || labelFor(type), type,
      x: snap(x), y: snap(y), rot: (rot + 360) % 360,
      value: value ?? DEFAULT_VALUE[type] ?? "",
      flip: false,
      unknown: false,
    };
    state.comps.push(c);
    return c;
  }
  function addNode(x, y) {
    invalidate();
    const n = { id: uid("n"), x: snap(x), y: snap(y) };
    state.nodes.push(n);
    return n;
  }
  function addWire(a, b) {
    if (anchorKey(a) === anchorKey(b)) return null;
    invalidate();
    const w = { id: uid("w"), a, b, manualCurrent: null, computedCurrent: null, known: false };
    state.wires.push(w);
    return w;
  }

  function wirePath(a, b) {
    const [x1, y1] = a, [x2, y2] = b;
    if (Math.abs(x1 - x2) < 2 || Math.abs(y1 - y2) < 2) {
      return `M${x1} ${y1}L${x2} ${y2}`;
    }
    if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
      return `M${x1} ${y1}H${x2}V${y2}`;
    }
    return `M${x1} ${y1}V${y2}H${x2}`;
  }

  function symbolMarkup(type) {
    return (SYMBOLS[type] || (() => ""))();
  }

  function compMarkup(c) {
    const selected = state.selected?.kind === "comp" && state.selected.id === c.id ? "selected" : "";
    const pins = Object.keys(PINS[c.type] || {}).map((pin) => {
      const [x, y] = pinLocal(c.type, pin);
      return `<circle class="pin" data-cid="${c.id}" data-pin="${pin}" cx="${x}" cy="${y}" r="4.5"/>`;
    }).join("");
    const isGnd = c.type === "GND";
    let valueText = c.value || "";
    let measure = "";
    if (c.type === "R") {
      const rv = parseEng(c.value);
      valueText = c.unknown ? "R = ?" : (Number.isFinite(rv) ? `R = ${fmtOhm(rv)}` : (c.value ? `R = ${c.value}` : "R = ?"));
      const u = parseEng(c.voltage);
      const i = parseEng(c.current);
      if (!c.unknown && (Number.isFinite(u) || Number.isFinite(i))) {
        const lines = [];
        if (Number.isFinite(u)) lines.push(`U ${fmtUnit(u, "V")}`);
        if (Number.isFinite(i)) lines.push(`I ${fmtA(i)}`);
        measure = `<g class="sch-res-measure" transform="translate(${c.x + 62} ${c.y - 26})">
          <rect x="0" y="0" width="118" height="42" rx="6"/>
          ${lines.map((line, idx) => `<text x="8" y="${15 + idx * 15}">${esc(line)}</text>`).join("")}
        </g>`;
      }
    } else if (c.type === "V") {
      const vv = parseEng(c.value);
      valueText = c.unknown
        ? "U = ?"
        : (Number.isFinite(vv) ? `U = ${fmtUnit(vv, "V")}` : (c.value ? `U = ${c.value}` : "U = ?"));
    }
    let signs = "";
    if (c.type === "V") {
      const pp = c.flip ? pinPos(c, "2") : pinPos(c, "1");
      const mp = c.flip ? pinPos(c, "1") : pinPos(c, "2");
      const sp = (p) => {
        const dx = c.x - p[0], dy = c.y - p[1];
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * 13;
        const oy = (dx / len) * 13;
        return [p[0] + dx * 0.55 + ox, p[1] + dy * 0.55 + oy];
      };
      const [px, py] = sp(pp);
      const [mx, my] = sp(mp);
      signs = `<text class="sch-source-sign" x="${px}" y="${py + 4}" text-anchor="middle">+</text>
               <text class="sch-source-sign" x="${mx}" y="${my + 4}" text-anchor="middle">−</text>`;
    }
    return `<g class="sch-comp ${selected}" data-id="${c.id}">
      <g transform="translate(${c.x} ${c.y}) rotate(${c.rot})">
        <rect class="hit" x="-60" y="-48" width="120" height="96"/>
        ${symbolMarkup(c.type)}
        ${pins}
      </g>
      <text x="${c.x}" y="${c.y - 54}" text-anchor="middle">${esc(c.label)}</text>
      ${isGnd ? "" : `<text x="${c.x}" y="${c.y + 66}" text-anchor="middle" fill="#7a8e84">${esc(valueText)}</text>`}
      ${measure}
      ${signs}
    </g>`;
  }

  function polyline(a, b) {
    if (Math.abs(a[0] - b[0]) < 2 || Math.abs(a[1] - b[1]) < 2) return [a, b];
    if (Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1])) return [a, [b[0], a[1]], b];
    return [a, [a[0], b[1]], b];
  }
  function pointAlong(points, frac) {
    let total = 0;
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      segs.push(len); total += len;
    }
    let target = total * frac;
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i] || i === segs.length - 1) {
        const t = segs[i] ? target / segs[i] : 0;
        const p0 = points[i], p1 = points[i + 1];
        return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, Math.atan2(p1[1] - p0[1], p1[0] - p0[0])];
      }
      target -= segs[i];
    }
    return [points[0][0], points[0][1], 0];
  }
  function fmtUnit(v, unit) {
    const a = Math.abs(v);
    if (a >= 1) return `${Number(v.toPrecision(3))} ${unit}`;
    if (a >= 1e-3) return `${Number((v * 1e3).toPrecision(3))} m${unit}`;
    if (a >= 1e-6) return `${Number((v * 1e6).toPrecision(3))} µ${unit}`;
    return `${Number((v * 1e9).toPrecision(3))} n${unit}`;
  }
  function fmtA(v) { return fmtUnit(v, "A"); }
  function fmtOhm(r) {
    if (!Number.isFinite(r)) return "?";
    if (Math.abs(r) >= 1e6) return `${Number((r / 1e6).toPrecision(3))} MΩ`;
    if (Math.abs(r) >= 1e3) return `${Number((r / 1e3).toPrecision(3))} kΩ`;
    return `${Number(r.toPrecision(3))} Ω`;
  }
  function engR(r) {
    if (!Number.isFinite(r)) return "";
    if (Math.abs(r) >= 1e6) return `${Number((r / 1e6).toPrecision(6))}M`;
    if (Math.abs(r) >= 1e3) return `${Number((r / 1e3).toPrecision(6))}k`;
    return `${Number(r.toPrecision(6))}`;
  }
  function parseEng(text) {
    const m = String(text ?? "").trim().match(/^([+-]?\d+(?:\.\d+)?)\s*([pnuµmkKMGT]?)/);
    if (!m) return NaN;
    return parseFloat(m[1]) * ({ p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2]] ?? 1);
  }
  function selectedResistor() {
    if (state.selected?.kind !== "comp") return null;
    const c = state.comps.find((x) => x.id === state.selected.id);
    return c?.type === "R" ? c : null;
  }

  function resistorSolution(c) {
    return (state.lastSolve?.components || []).find((x) => x.name === c.label) || null;
  }

  function calcOhm(kind) {
    const c = selectedResistor();
    if (!c) return;
    const sol = resistorSolution(c);
    let u = parseEng(voltageInput.value);
    let i = parseEng(currentInput.value);
    let r = parseEng(c.value);
    if (!Number.isFinite(u) && sol) u = parseEng(sol.voltage);
    if (!Number.isFinite(i) && sol) i = Number(sol.current_raw);
    const show = (text, err = false) => {
      calcResult.className = "sch-calc-result" + (err ? " err" : "");
      calcResult.textContent = text;
    };

    if (kind === "R") {
      if (!Number.isFinite(u) || !Number.isFinite(i) || i === 0) {
        show("需要 U 和 I，且 I 不能为 0。", true);
        return;
      }
      r = Math.abs(u / i);
      c.value = engR(r);
      c.voltage = fmtUnit(Math.abs(u), "V");
      c.current = fmtA(Math.abs(i));
      render();
      show(`R = U / I = ${fmtUnit(Math.abs(u), "V")} / ${fmtA(Math.abs(i))} = ${fmtOhm(r)}`);
      return;
    }

    if (kind === "U") {
      if (!Number.isFinite(i) || !Number.isFinite(r) || r <= 0) {
        show("需要 I 和 R，且 R 不能为 0。", true);
        return;
      }
      u = Math.abs(i) * r;
      c.voltage = fmtUnit(u, "V");
      c.current = fmtA(Math.abs(i));
      render();
      show(`U = I × R = ${fmtA(Math.abs(i))} × ${fmtOhm(r)} = ${fmtUnit(u, "V")}`);
      return;
    }

    if (!Number.isFinite(u) || !Number.isFinite(r) || r <= 0) {
      show("需要 U 和 R，且 R 不能为 0。", true);
      return;
    }
    i = Math.abs(u / r);
    c.current = fmtA(i);
    c.voltage = fmtUnit(Math.abs(u), "V");
    render();
    show(`I = U / R = ${fmtUnit(Math.abs(u), "V")} / ${fmtOhm(r)} = ${fmtA(i)}`);
  }
  function wireCurrent(w) {
    if (w.manualCurrent !== undefined && w.manualCurrent !== null) return w.manualCurrent;
    return w.computedCurrent ?? null;
  }
  function wireMarkup(w) {
    const a = anchorPos(w.a), b = anchorPos(w.b);
    const d = wirePath(a, b);
    const sel = state.selected?.kind === "wire" && state.selected.id === w.id ? "selected" : "";
    const knownCls = w.known ? "known" : "";
    let annot = "";
    const cur = wireCurrent(w);
    const annotate = state.showCurrents || (state.selected?.kind === "wire" && state.selected.id === w.id);
    if (cur !== null && Number.isFinite(cur)) {
      const pts = polyline(a, b);
      const [mx, my, ang] = pointAlong(pts, 0.55);
      const v = Number(cur);
      const arrowAng = v >= 0 ? ang : ang + Math.PI;
      if (Math.abs(v) > 1e-12) {
        const ax = mx, ay = my;
        const len = 9;
        const p1 = [ax + Math.cos(arrowAng) * len, ay + Math.sin(arrowAng) * len];
        const p2 = [ax + Math.cos(arrowAng + 2.5) * len, ay + Math.sin(arrowAng + 2.5) * len];
        const p3 = [ax + Math.cos(arrowAng - 2.5) * len, ay + Math.sin(arrowAng - 2.5) * len];
        annot += `<polygon class="sch-wire-arrow" points="${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}"/>`;
      }
      if (annotate) {
        const nx = Math.cos(ang + Math.PI / 2) * 15;
        const ny = Math.sin(ang + Math.PI / 2) * 15;
        annot += `<text class="sch-wire-value" x="${mx + nx}" y="${my + ny + 3}" text-anchor="middle">${esc(fmtA(v))}</text>`;
      }
    }
    return `<g><path class="sch-wire ${sel} ${knownCls}" d="${d}"/><path class="sch-wire-hit" data-wid="${w.id}" d="${d}"/>${annot}</g>`;
  }

  function render() {
    world.setAttribute("transform", `translate(${state.view.x} ${state.view.y}) scale(${state.view.k})`);

    const wires = state.wires.map(wireMarkup).join("");

    const nodes = state.nodes.map((n) => {
      const sel = state.selected?.kind === "node" && state.selected.id === n.id;
      return `<circle class="sch-junction ${sel ? "selected" : ""}" data-nid="${n.id}" cx="${n.x}" cy="${n.y}" r="4.5"/>`;
    }).join("");

    const comps = state.comps.map(compMarkup).join("");
    world.innerHTML = wires + nodes + comps;

    if (state.wireStart) {
      const a = anchorPos(state.wireStart);
      const b = state.wirePreview || a;
      overlay.innerHTML = `<path class="sch-wire-preview" d="${wirePath(a, b)}"/>`;
    } else {
      overlay.innerHTML = "";
    }

    svg.classList.toggle("select-mode", state.tool === "select");
    updateInspector();
  }

  function updateNetlistPreview() {
    const { netlist, warnings, error } = buildNetlist();
    const el = $("#schNetlist");
    if (error) {
      el.textContent = `# ${error}`;
    } else if (!netlist) {
      el.textContent = "放置元件并连线后显示网表。";
    } else {
      el.textContent = (warnings.length ? warnings.map((w) => `# ${w}`).join("\n") + "\n" : "") + netlist;
    }
    return { netlist, warnings, error };
  }

  function anchorLabel(a) {
    if (!a) return "?";
    if (a.k === "pin") {
      const c = state.comps.find((x) => x.id === a.cid);
      return c ? `${c.label}:${a.pin}` : "?";
    }
    if (a.k === "node") return "节点";
    return `${Math.round(a.x)},${Math.round(a.y)}`;
  }

  function updateInspector() {
    const sel = state.selected;
    const val = $("#schValue");
    const selText = $("#schSelection");
    const rotate = $("#schRotate");
    const del = $("#schDelete");
    fieldLabel.textContent = "数值";
    val.placeholder = "例如 10k / 5V / 100nF";
    flipBtn.style.display = "none";
    varBtn.style.display = "none";
    measured.innerHTML = "";
    branchCalc.classList.remove("show");
    if (!sel) {
      selText.textContent = "未选择";
      val.value = "";
      val.disabled = true;
      rotate.disabled = true;
      del.disabled = true;
    } else if (sel.kind === "comp") {
      const c = state.comps.find((x) => x.id === sel.id);
      if (!c) { state.selected = null; return updateInspector(); }
      selText.textContent = `${c.label} · ${c.type} · ${c.rot}°`;
      val.disabled = c.type === "GND" || ["NPN", "PNP", "OP", "SW", "T", "XTAL"].includes(c.type);
      val.value = c.value || "";
      rotate.disabled = false;
      del.disabled = false;
      if (c.type === "V") {
        flipBtn.style.display = "";
        flipBtn.textContent = c.flip ? "正负极已反转" : "正负极反转";
      }
      if (c.type === "R" || c.type === "V") {
        varBtn.style.display = "";
        varBtn.textContent = c.unknown ? "取消未知" : (c.type === "R" ? "设为未知 R" : "设为未知 U");
        if (c.unknown) {
          val.disabled = true;
          val.value = "";
          fieldLabel.textContent = c.type === "R" ? "电阻 R (Ω) = ?" : "电压 U (V) = ?";
          val.placeholder = "未知量，由已知导线电流反求";
        }
      }
      const sol = (state.lastSolve?.components || []).find((x) => x.name === c.label);
      if (sol && !c.unknown) {
        measured.innerHTML = `<b>${esc(c.label)}</b> 电压 ${esc(sol.voltage)} · 电流 ${esc(sol.current)} · 功率 ${esc(sol.power)}`;
      } else if (c.unknown) {
        measured.textContent = "未知量：在一条导线上填写已知电流，再点“求解”反求。";
      } else if (!["R", "V", "I", "C", "L", "F", "SW", "GND"].includes(c.type)) {
        measured.textContent = "该元件目前仅绘图，不参与直流求解。";
      }
      if (c.type === "R" && !c.unknown) {
        fieldLabel.textContent = "电阻 R (Ω)";
        val.placeholder = "未知可留空，用 U/I 求";
        branchCalc.classList.add("show");
        voltageInput.value = c.voltage ?? sol?.voltage ?? "";
        currentInput.value = c.current ?? (sol ? fmtA(sol.current_raw) : "");
        calcResult.className = "sch-calc-result";
        calcResult.textContent = "填 U 和 I 求 R；填 I 和 R 求 U；填 U 和 R 求 I。";
      }
    } else if (sel.kind === "wire") {
      const w = state.wires.find((x) => x.id === sel.id);
      if (!w) { state.selected = null; return updateInspector(); }
      selText.textContent = `导线 ${anchorLabel(w.a)} → ${anchorLabel(w.b)}`;
      val.disabled = false;
      fieldLabel.textContent = w.known ? "已知导线电流 I (A)" : "导线电流 I (A)";
      val.placeholder = "例如 1A 或 20mA";
      val.value = w.manualCurrent ?? "";
      rotate.disabled = true;
      del.disabled = false;
      flipBtn.style.display = "";
      flipBtn.textContent = "方向反转";
      varBtn.style.display = "";
      varBtn.textContent = w.known ? "取消已知电流" : "作为已知电流";
      const cur = w.computedCurrent;
      let m = cur === null || cur === undefined
        ? "求解后会显示计算电流。"
        : `<b>计算电流</b> ${esc(fmtA(cur))}（${esc(anchorLabel(w.a))} → ${esc(anchorLabel(w.b))}）`;
      const manual = Number(w.manualCurrent);
      if (w.manualCurrent !== null && w.manualCurrent !== undefined && Number.isFinite(manual)) {
        m += `<br><b>标注电流</b> ${esc(fmtA(manual))}`;
        if (cur !== null && cur !== undefined) {
          m += ` · 偏差 ${esc(fmtA(manual - cur))}`;
        }
      }
      measured.innerHTML = m;
    } else {
      selText.textContent = "节点 / 连接点";
      val.value = "";
      val.disabled = true;
      rotate.disabled = true;
      del.disabled = false;
    }
    updateNetlistPreview();
  }

  function buildNetlist() {
    if (!state.comps.length) return { netlist: "", warnings: [], error: "画布上还没有元件。" };
    const parent = {};
    function find(x) {
      if (!(x in parent)) parent[x] = x;
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    }
    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }

    for (const c of state.comps) for (const p of Object.keys(PINS[c.type] || {})) find(anchorKey(P(c.id, p)));
    for (const n of state.nodes) find(anchorKey(N(n.id)));
    for (const w of state.wires) union(anchorKey(w.a), anchorKey(w.b));

    const grounds = state.comps.filter((c) => c.type === "GND");
    if (!grounds.length) return { netlist: "", warnings: [], error: "请至少放置一个接地符号（GND）。" };
    const gndKey = anchorKey(P(grounds[0].id, "1"));
    for (const g of grounds) union(gndKey, anchorKey(P(g.id, "1")));
    const gndRoot = find(gndKey);

    const warnings = [];
    const shorted = [];
    for (const c of state.comps) {
      if (c.type === "L" || c.type === "F" || (c.type === "SW" && c.value !== "open")) {
        const a = anchorKey(P(c.id, "1")), b = anchorKey(P(c.id, "2"));
        union(a, b);
        if (c.type === "L") warnings.push(`${c.label} 电感在直流下按短路处理`);
        if (c.type === "F") warnings.push(`${c.label} 保险丝按短路处理`);
        if (c.type === "SW") warnings.push(`${c.label} 开关按闭合处理`);
      } else if (c.type === "C") {
        warnings.push(`${c.label} 电容在直流下按开路忽略`);
      } else if (["POT", "AC", "D", "LED", "NPN", "PNP", "OP", "T", "XTAL"].includes(c.type)) {
        warnings.push(`${c.label} ${c.type} 暂不参与直流求解`);
      }
    }

    const rootName = new Map();
    rootName.set(gndRoot, "0");
    let n = 0;
    for (const c of state.comps) {
      for (const p of Object.keys(PINS[c.type] || {})) {
        const r = find(anchorKey(P(c.id, p)));
        if (r !== gndRoot && !rootName.has(r)) rootName.set(r, `N${++n}`);
      }
    }

    const lines = [];
    const supported = new Set(["R", "V", "I"]);
    for (const c of state.comps) {
      if (!supported.has(c.type)) continue;
      if (c.unknown) {
        warnings.push(`${c.label} 是未知量，点“求解”反推`);
        continue;
      }
      let p1 = "1", p2 = "2";
      if (c.type === "V") {
        p1 = c.flip ? "2" : "1";
        p2 = c.flip ? "1" : "2";
      } else if (c.type === "I") {
        p1 = "1";
        p2 = "2";
      }
      const n1 = rootName.get(find(anchorKey(P(c.id, p1))));
      const n2 = rootName.get(find(anchorKey(P(c.id, p2))));
      if (!n1 || !n2) continue;
      if (n1 === n2) {
        shorted.push(c.label);
        warnings.push(`${c.label} 两端被短接，已跳过`);
        continue;
      }
      const value = String(c.value || DEFAULT_VALUE[c.type] || "").trim();
      if (!value) { warnings.push(`${c.label} 没有数值，已跳过`); continue; }
      lines.push(`${c.label} ${n1} ${n2} ${value}`);
    }

    if (!lines.length) return { netlist: "", warnings, error: "没有可求解的 R/V/I 元件。请放置电阻、电压源或电流源并连线。" };
    return { netlist: lines.join("\n"), warnings, error: "" };
  }

  function placeAt(type, x, y) {
    const c = addComp(type, x, y, 0);
    state.selected = { kind: "comp", id: c.id };
    state.tool = "select";
    state.placing = null;
    document.querySelectorAll("[data-sch-tool]").forEach((b) => b.classList.toggle("active", b.dataset.schTool === "select"));
    document.querySelectorAll(".sch-item").forEach((b) => b.classList.remove("active"));
    render();
  }

  function findAnchor(x, y) {
    const tol = 20 / Math.max(0.4, state.view.k);
    let best = null, bestD = tol;
    for (const c of state.comps) {
      for (const p of Object.keys(PINS[c.type] || {})) {
        const [px, py] = pinPos(c, p);
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) { bestD = d; best = P(c.id, p); }
      }
    }
    for (const n of state.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) { bestD = d; best = N(n.id); }
    }
    return best;
  }

  function worldPoint(e) {
    const r = svg.getBoundingClientRect();
    return [
      (e.clientX - r.left - state.view.x) / state.view.k,
      (e.clientY - r.top - state.view.y) / state.view.k,
    ];
  }

  function selectAt(target) {
    const comp = target.closest?.(".sch-comp");
    if (comp) { state.selected = { kind: "comp", id: comp.dataset.id }; return; }
    const wire = target.closest?.("[data-wid]");
    if (wire) { state.selected = { kind: "wire", id: wire.dataset.wid }; return; }
    const node = target.closest?.("[data-nid]");
    if (node) { state.selected = { kind: "node", id: node.dataset.nid }; return; }
    state.selected = null;
  }

  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || state.panning) {
      state.panning = { x: e.clientX, y: e.clientY, ox: state.view.x, oy: state.view.y };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = worldPoint(e);
    if (state.tool === "place" && state.placing) {
      placeAt(state.placing.type, wx, wy);
      return;
    }
    if (state.tool === "node") {
      const n = addNode(wx, wy);
      state.selected = { kind: "node", id: n.id };
      render();
      return;
    }
    if (state.tool === "wire") {
      const a = findAnchor(wx, wy) || PT(snap(wx), snap(wy));
      if (!state.wireStart) {
        state.wireStart = a;
        state.wirePreview = anchorPos(a);
      } else {
        const w = addWire(state.wireStart, a);
        state.wireStart = null;
        state.wirePreview = null;
        if (w) state.selected = { kind: "wire", id: w.id };
        render();
      }
      return;
    }
    selectAt(e.target);
    if (state.selected?.kind === "comp") {
      const c = state.comps.find((x) => x.id === state.selected.id);
      if (c) {
        state.drag = { id: c.id, dx: wx - c.x, dy: wy - c.y };
        svg.setPointerCapture(e.pointerId);
      }
    }
    render();
  });

  svg.addEventListener("pointermove", (e) => {
    if (state.panning) {
      state.view.x = state.panning.ox + (e.clientX - state.panning.x);
      state.view.y = state.panning.oy + (e.clientY - state.panning.y);
      render();
      return;
    }
    if (state.drag) {
      const [wx, wy] = worldPoint(e);
      const c = state.comps.find((x) => x.id === state.drag.id);
      if (c) {
        c.x = snap(wx - state.drag.dx);
        c.y = snap(wy - state.drag.dy);
        render();
      }
      return;
    }
    if (state.wireStart) {
      const [wx, wy] = worldPoint(e);
      const a = findAnchor(wx, wy) || PT(snap(wx), snap(wy));
      state.wirePreview = anchorPos(a);
      render();
    }
  });

  svg.addEventListener("pointerup", () => {
    state.drag = null;
    state.panning = null;
  });
  svg.addEventListener("pointercancel", () => { state.drag = null; state.panning = null; });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const before = [(mx - state.view.x) / state.view.k, (my - state.view.y) / state.view.k];
    const k = Math.max(0.35, Math.min(2.5, state.view.k * (e.deltaY > 0 ? 0.9 : 1.1)));
    state.view.k = k;
    state.view.x = mx - before[0] * k;
    state.view.y = my - before[1] * k;
    render();
  }, { passive: false });
  svg.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (!editor.classList.contains("show")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selected) { e.preventDefault(); deleteSelected(); }
    } else if (e.key.toLowerCase() === "r") {
      rotateSelected();
    } else if (e.key === "Escape") {
      state.wireStart = null; state.wirePreview = null;
      state.placing = null; state.tool = "select";
      render();
    }
  });

  function deleteSelected() {
    const sel = state.selected;
    if (!sel) return;
    invalidate();
    if (sel.kind === "comp") {
      state.comps = state.comps.filter((c) => c.id !== sel.id);
      state.wires = state.wires.filter((w) =>
        !(w.a.k === "pin" && w.a.cid === sel.id) && !(w.b.k === "pin" && w.b.cid === sel.id)
      );
    } else if (sel.kind === "wire") {
      state.wires = state.wires.filter((w) => w.id !== sel.id);
    } else {
      state.nodes = state.nodes.filter((n) => n.id !== sel.id);
      state.wires = state.wires.filter((w) =>
        !(w.a.k === "node" && w.a.nid === sel.id) && !(w.b.k === "node" && w.b.nid === sel.id)
      );
    }
    state.selected = null;
    render();
  }

  function rotateSelected() {
    const sel = state.selected;
    if (sel?.kind !== "comp") return;
    const c = state.comps.find((x) => x.id === sel.id);
    if (!c) return;
    c.rot = (c.rot + 90) % 360;
    render();
  }

  function loadDivider() {
    clearAll(false);
    const v1 = addComp("V", 260, 420, 90, "12V");
    const r1 = addComp("R", 520, 260, 90, "10k");
    const r2 = addComp("R", 520, 480, 90, "4.7k");
    const gnd = addComp("GND", 520, 640, 0, "");
    const n1 = addNode(260, 160);
    const nA = addNode(520, 160);
    const nB = addNode(520, 360);
    const nG = addNode(260, 592);
    addWire(P(v1.id, "1"), N(n1.id));
    addWire(N(n1.id), N(nA.id));
    addWire(N(nA.id), P(r1.id, "1"));
    addWire(P(r1.id, "2"), N(nB.id));
    addWire(N(nB.id), P(r2.id, "1"));
    addWire(P(r2.id, "2"), P(gnd.id, "1"));
    addWire(P(v1.id, "2"), N(nG.id));
    addWire(N(nG.id), P(gnd.id, "1"));
    state.selected = { kind: "comp", id: r2.id };
    render();
  }

  function loadSuper() {
    clearAll(false);
    const r1 = addComp("R", 520, 300, 90, "2");
    const v1 = addComp("V", 520, 460, 90, "17V");
    const r2 = addComp("R", 880, 300, 90, "1");
    const v2 = addComp("V", 880, 460, 90, "17V");
    const r3 = addComp("R", 700, 380, 90, "5");
    const gnd = addComp("GND", 700, 640, 0, "");
    const nA = addNode(700, 200);
    const nL = addNode(520, 200);
    const nR = addNode(880, 200);
    const nGL = addNode(520, 592);
    const nGR = addNode(880, 592);
    addWire(P(r1.id, "1"), N(nL.id));
    addWire(N(nL.id), N(nA.id));
    addWire(P(r2.id, "1"), N(nR.id));
    addWire(N(nR.id), N(nA.id));
    addWire(P(r3.id, "1"), N(nA.id));
    addWire(P(r1.id, "2"), P(v1.id, "1"));
    addWire(P(r2.id, "2"), P(v2.id, "1"));
    addWire(P(r3.id, "2"), P(gnd.id, "1"));
    addWire(P(v1.id, "2"), N(nGL.id));
    addWire(N(nGL.id), P(gnd.id, "1"));
    addWire(P(v2.id, "2"), N(nGR.id));
    addWire(N(nGR.id), P(gnd.id, "1"));
    state.selected = { kind: "comp", id: r3.id };
    render();
  }

  function clearAll(doRender = true) {
    state.comps = []; state.nodes = []; state.wires = [];
    state.selected = null; state.wireStart = null; state.wirePreview = null;
    state.ids = {};
    if (doRender) render();
  }

  async function solveNetlistRaw(netlist) {
    if (window.VOLT_STATIC && window.voltSolveCircuit) {
      return window.voltSolveCircuit(netlist);
    }
    const res = await fetch("/api/circuit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ netlist }),
    });
    return res.json();
  }

  function targetComponent(w, includeUnknown = false) {
    for (const a of [w.a, w.b]) {
      if (a.k !== "pin") continue;
      const c = state.comps.find((x) => x.id === a.cid);
      if (c && ["R", "V", "I"].includes(c.type) && (includeUnknown || !c.unknown)) return c;
    }
    return null;
  }

  function applySolution(data) {
    const out = $("#schResult");
    state.lastSolve = data;
    state.wireWarnings = computeWireCurrents(data);
    render();
    const nodes = Object.entries(data.nodes).filter(([k]) => k !== "0")
      .map(([k, v]) => `${k.padEnd(4)} ${v.display}`).join("\n");
    const comps = data.components.map((c) =>
      `${c.name.padEnd(4)} ${c.kind}  ${c.from}→${c.to}  ${c.current}  ${c.power}`
    ).join("\n");
    out.className = "sch-result ok";
    out.textContent = `节点电压\n${nodes}\n\n支路\n${comps}\n\n功率\n电源 ${data.total_source_power} / 电阻 ${data.total_resistor_power} / 差 ${data.balance}`
      + (state.wireWarnings.length ? `\n\n提示\n${state.wireWarnings.join("\n")}` : "");
  }

  async function solveUnknown(unknown) {
    const out = $("#schResult");
    const knownWires = state.wires.filter((w) =>
      w.known && w.manualCurrent !== null && w.manualCurrent !== undefined &&
      Number.isFinite(Number(w.manualCurrent)) && Math.abs(Number(w.manualCurrent)) > 1e-12
    );
    if (!knownWires.length) {
      out.className = "sch-result err";
      out.textContent = "有未知量，但没有已知电流约束。请选中一条导线，填电流并点“作为已知电流”。";
      return;
    }
    const targetWire = knownWires[0];
    const target = targetComponent(targetWire, true);
    if (!target) {
      out.className = "sch-result err";
      out.textContent = "已知电流所在导线没有直接连接可测量的元件。请把约束放在电阻/电源支路的导线上。";
      return;
    }
    const targetValue = Math.abs(Number(targetWire.manualCurrent));
    out.className = "sch-result";
    out.textContent = `正在反推 ${unknown.label}…`;
    const original = unknown.value;
    const trial = async (value) => {
      unknown.unknown = false;
      unknown.value = value;
      const { netlist, error } = buildNetlist();
      if (error) {
        unknown.unknown = true;
        unknown.value = original;
        return null;
      }
      const data = await solveNetlistRaw(netlist);
      unknown.unknown = true;
      unknown.value = original;
      if (!data.ok) return null;
      const sol = (data.components || []).find((x) => x.name === target.label);
      return sol ? Math.abs(sol.current_raw) : null;
    };

    try {
      if (unknown.type === "R") {
        let lo = 0.1, hi = 1e8;
        const iLo = await trial(engR(lo));
        const iHi = await trial(engR(hi));
        if (iLo === null || iHi === null) throw new Error("试算失败，请检查电路连接");
        if (targetValue < Math.min(iLo, iHi) || targetValue > Math.max(iLo, iHi)) {
          throw new Error(`目标电流 ${fmtA(targetValue)} 超出可调范围（${fmtA(iLo)} ~ ${fmtA(iHi)}）`);
        }
        for (let k = 0; k < 36; k++) {
          const mid = Math.sqrt(lo * hi);
          const im = await trial(engR(mid));
          if (im === null) throw new Error("试算失败");
          if (im > targetValue) lo = mid; else hi = mid;
        }
        unknown.value = engR(Math.sqrt(lo * hi));
      } else if (unknown.type === "V") {
        const i0 = await trial("0");
        const i1 = await trial("1");
        if (i0 === null || i1 === null || Math.abs(i1 - i0) < 1e-15) {
          throw new Error("电压源变化对目标电流没有可测影响");
        }
        const v = (targetValue - i0) / (i1 - i0);
        unknown.value = `${Number(v.toPrecision(8))}V`;
      } else {
        throw new Error("目前只支持未知电阻 R 或未知电压源 U");
      }
      unknown.unknown = false;
      invalidate();
      await solve();
    } catch (err) {
      unknown.unknown = true;
      unknown.value = original;
      out.className = "sch-result err";
      out.textContent = String(err?.message || err);
      render();
    }
  }

  async function solve() {
    const unknown = state.comps.find((c) => c.unknown);
    if (unknown) {
      await solveUnknown(unknown);
      return;
    }
    const { netlist, error } = updateNetlistPreview();
    const out = $("#schResult");
    if (error) {
      out.className = "sch-result err";
      out.textContent = error;
      return;
    }
    out.className = "sch-result";
    out.textContent = "求解中…";
    try {
      const data = await solveNetlistRaw(netlist);
      if (!data.ok) {
        out.className = "sch-result err";
        out.textContent = data.error || "求解失败";
        return;
      }
      applySolution(data);
    } catch (err) {
      out.className = "sch-result err";
      out.textContent = `求解服务连接失败：${err}`;
    }
  }

  function computeWireCurrents(data) {
    const byLabel = new Map((data.components || []).map((c) => [c.name, c]));
    const vertices = new Set();
    for (const c of state.comps) for (const p of Object.keys(PINS[c.type] || {})) vertices.add(anchorKey(P(c.id, p)));
    for (const n of state.nodes) vertices.add(anchorKey(N(n.id)));
    const inj = new Map([...vertices].map((v) => [v, 0]));

    for (const c of state.comps) {
      if (!["R", "V", "I"].includes(c.type)) continue;
      const sol = byLabel.get(c.label);
      if (!sol) continue;
      let iPin1To2 = sol.current_raw;
      if (c.type === "V" && c.flip) iPin1To2 = -iPin1To2;
      const k1 = anchorKey(P(c.id, "1")), k2 = anchorKey(P(c.id, "2"));
      inj.set(k1, (inj.get(k1) || 0) - iPin1To2);
      inj.set(k2, (inj.get(k2) || 0) + iPin1To2);
    }

    const edges = state.wires.map((w) => ({
      w, a: anchorKey(w.a), b: anchorKey(w.b), current: 0, tree: false,
    }));
    const adj = new Map();
    const add = (v, item) => {
      if (!adj.has(v)) adj.set(v, []);
      adj.get(v).push(item);
    };
    edges.forEach((e, i) => { add(e.a, { v: e.b, i, dir: 1 }); add(e.b, { v: e.a, i, dir: -1 }); });

    const seen = new Set();
    const warnings = [];
    for (const start of vertices) {
      if (seen.has(start) || !adj.has(start)) continue;
      const compVerts = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const v = stack.pop(); compVerts.push(v);
        for (const nb of adj.get(v)) if (!seen.has(nb.v)) { seen.add(nb.v); stack.push(nb.v); }
      }
      const sum = compVerts.reduce((s, v) => s + (inj.get(v) || 0), 0);
      if (Math.abs(sum) > 1e-8) warnings.push("该导线子网不满足 KCL，可能有未连接的元件");
      const parent = new Map(), parentEdge = new Map(), order = [];
      const visited = new Set([start]);
      const dfs = [start];
      while (dfs.length) {
        const v = dfs.pop(); order.push(v);
        for (const nb of adj.get(v)) {
          if (visited.has(nb.v)) continue;
          visited.add(nb.v); parent.set(nb.v, v); parentEdge.set(nb.v, nb);
          dfs.push(nb.v);
        }
      }
      const sub = new Map(compVerts.map((v) => [v, inj.get(v) || 0]));
      for (let i = order.length - 1; i >= 0; i--) {
        const v = order[i];
        if (v === start) continue;
        const pe = parentEdge.get(v);
        edges[pe.i].tree = true;
        const s = sub.get(v) || 0;
        const e = edges[pe.i];
        // 边方向修正为 a→b
        const oriented = e.a === v ? s : -s;
        e.current = oriented;
        sub.set(parent.get(v), (sub.get(parent.get(v)) || 0) + s);
      }
    }

    for (const e of edges) {
      e.w.computedCurrent = Number.isFinite(e.current) ? e.current : 0;
      if (!e.tree && e.w.computedCurrent === 0) e.w.computedCurrent = 0;
      const manual = Number(e.w.manualCurrent);
      if (e.w.manualCurrent !== null && e.w.manualCurrent !== undefined && Number.isFinite(manual)) {
        const diff = manual - e.w.computedCurrent;
        if (Math.abs(diff) > 1e-9) {
          warnings.push(`导线标注 ${fmtA(manual)} 与计算 ${fmtA(e.w.computedCurrent)} 不一致`);
        }
      }
    }
    return warnings;
  }

  function setTool(tool) {
    state.tool = tool;
    state.placing = null;
    state.wireStart = null;
    state.wirePreview = null;
    document.querySelectorAll("[data-sch-tool]").forEach((b) => b.classList.toggle("active", b.dataset.schTool === tool));
    document.querySelectorAll(".sch-item").forEach((b) => b.classList.remove("active"));
    render();
  }

  function buildPalette() {
    const root = $("#schPalette");
    root.innerHTML = "";
    for (const group of PALETTE) {
      const g = document.createElement("div");
      g.className = "sch-group";
      g.innerHTML = `<h4>${esc(group.group)}</h4>`;
      for (const item of group.items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sch-item";
        b.dataset.type = item.type;
        b.innerHTML = `<svg viewBox="-60 -45 120 90">${symbolMarkup(item.type)}</svg><span>${esc(item.name)}</span>`;
        b.addEventListener("click", () => {
          setTool("place");
          state.placing = item;
          b.classList.add("active");
          $("#schSelection").textContent = `放置：${item.name}——点击画布`;
        });
        g.appendChild(b);
      }
      root.appendChild(g);
    }
  }

  buildPalette();
  $("#schematicBtn")?.addEventListener("click", () => {
    editor.classList.add("show");
    render();
  });
  $("#schClose")?.addEventListener("click", () => editor.classList.remove("show"));
  $("#schClear")?.addEventListener("click", () => clearAll());
  $("#schExampleDivider")?.addEventListener("click", loadDivider);
  $("#schExampleSuper")?.addEventListener("click", loadSuper);
  $("#schSolve")?.addEventListener("click", solve);
  $("#schRotate")?.addEventListener("click", rotateSelected);
  $("#schDelete")?.addEventListener("click", deleteSelected);
  document.querySelectorAll("[data-sch-tool]").forEach((b) => {
    b.addEventListener("click", () => setTool(b.dataset.schTool));
  });
  $("#schCurrentToggle")?.addEventListener("click", (e) => {
    state.showCurrents = !state.showCurrents;
    e.currentTarget.classList.toggle("active", state.showCurrents);
    render();
  });
  $("#schValue")?.addEventListener("input", (e) => {
    if (state.selected?.kind === "comp") {
      const c = state.comps.find((x) => x.id === state.selected.id);
      if (!c) return;
      invalidate();
      c.value = e.target.value;
      render();
    } else if (state.selected?.kind === "wire") {
      const w = state.wires.find((x) => x.id === state.selected.id);
      if (!w) return;
      const n = parseEng(e.target.value);
      w.manualCurrent = Number.isFinite(n) ? n : null;
      render();
    }
  });

  voltageInput?.addEventListener("input", (e) => {
    const c = selectedResistor();
    if (c) c.voltage = e.target.value;
  });
  currentInput?.addEventListener("input", (e) => {
    const c = selectedResistor();
    if (c) c.current = e.target.value;
  });
  $("#schCalcR")?.addEventListener("click", () => calcOhm("R"));
  $("#schCalcV")?.addEventListener("click", () => calcOhm("U"));
  $("#schCalcI")?.addEventListener("click", () => calcOhm("I"));
  $("#schAskAI")?.addEventListener("click", () => {
    const c = selectedResistor();
    if (!c) return;
    const u = parseEng(voltageInput.value);
    const i = parseEng(currentInput.value);
    const r = parseEng(c.value);
    const known = [];
    if (Number.isFinite(u)) known.push(`电压 U=${fmtUnit(u, "V")}`);
    if (Number.isFinite(i)) known.push(`电流 I=${fmtA(i)}`);
    if (Number.isFinite(r)) known.push(`电阻 R=${fmtOhm(r)}`);
    const q = `电阻 ${c.label}：${known.join("，") || "已知部分参数"}。请用欧姆定律解释它的电压、电流、电阻关系，并说明计算过程。`;
    editor.classList.remove("show");
    if (typeof window.askAI === "function") window.askAI(q, known.join("；"));
  });

  varBtn?.addEventListener("click", () => {
    if (state.selected?.kind === "comp") {
      const c = state.comps.find((x) => x.id === state.selected.id);
      if (!c || !["R", "V"].includes(c.type)) return;
      if (c.unknown) {
        c.unknown = false;
        if (c._knownValue) c.value = c._knownValue;
      } else {
        c._knownValue = c.value;
        c.unknown = true;
        c.value = "";
        c.voltage = null;
        c.current = null;
      }
      invalidate();
      render();
      return;
    }
    if (state.selected?.kind === "wire") {
      const w = state.wires.find((x) => x.id === state.selected.id);
      if (!w) return;
      w.known = !w.known;
      render();
    }
  });

  flipBtn?.addEventListener("click", () => {
    if (state.selected?.kind === "comp") {
      const c = state.comps.find((x) => x.id === state.selected.id);
      if (c?.type === "V") {
        c.flip = !c.flip;
        invalidate();
        render();
      }
    } else if (state.selected?.kind === "wire") {
      const w = state.wires.find((x) => x.id === state.selected.id);
      if (!w) return;
      const cur = wireCurrent(w);
      if (cur !== null && Number.isFinite(cur)) {
        w.manualCurrent = -cur;
        render();
      }
    }
  });

  // 初始加载一个分压示例，打开即可看到画布怎么用
  loadDivider();
  const boot = new URLSearchParams(location.search);
  if (boot.get("editor") === "1") {
    editor.classList.add("show");
    render();
    if (boot.get("solve") === "1") solve();
  }
})();
