/* GitHub Pages 静态版：用 Pyodide 在浏览器里运行 VOLT 的 Python 计算引擎。
   OCR 需要 Windows 本机服务，静态版禁用；AI 直接请求 Pollinations。 */
(() => {
  window.VOLT_STATIC = true;

  const PYODIDE_VERSION = "0.27.2";
  const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  const AI_URL = "https://text.pollinations.ai/openai";
  const AI_MODEL = "openai-fast";
  let pyPromise = null;

  function setTag(text) {
    const tag = document.querySelector(".tag");
    if (tag) tag.textContent = text;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.loadPyodide) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Pyodide 下载失败"));
      document.head.appendChild(s);
    });
  }

  async function ensurePy() {
    if (pyPromise) return pyPromise;
    pyPromise = (async () => {
      setTag("LOADING");
      await loadScript(PYODIDE_BASE + "pyodide.js");
      const py = await loadPyodide({ indexURL: PYODIDE_BASE });
      setTag("PYTHON");
      for (const file of ["engine.py", "circuit.py"]) {
        const res = await fetch(file);
        if (!res.ok) throw new Error(`加载 ${file} 失败`);
        py.FS.writeFile(`/home/pyodide/${file}`, await res.text());
      }
      await py.runPythonAsync(`
import sys, json
sys.path.insert(0, '/home/pyodide')
from engine import calculate
from circuit import solve_netlist
`);
      setTag("STATIC");
      return py;
    })();
    pyPromise.catch(() => { pyPromise = null; setTag("ERROR"); });
    return pyPromise;
  }

  function calcError(err) {
    return {
      ok: false,
      title: "计算引擎加载失败",
      category: "STATIC",
      summary: String(err?.message || err || "浏览器计算引擎没有加载成功"),
      formula: "",
      steps: [],
      values: [],
      notes: ["请刷新页面重试；如果 CDN 被网络屏蔽，计算器将无法启动。"],
      followups: [],
    };
  }

  window.voltCalculate = async (query) => {
    try {
      const py = await ensurePy();
      py.globals.set("__query", String(query));
      const raw = py.runPython("json.dumps(calculate(__query), ensure_ascii=False)");
      return JSON.parse(raw);
    } catch (err) {
      return calcError(err);
    }
  };

  window.voltSolveCircuit = async (netlist) => {
    try {
      const py = await ensurePy();
      py.globals.set("__netlist", String(netlist));
      const raw = py.runPython("json.dumps(solve_netlist(__netlist), ensure_ascii=False)");
      return JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: `电路求解失败：${String(err?.message || err)}` };
    }
  };

  function clean(s) {
    return String(s || "")
      .replace(/\r/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/\\omega/g, "ω")
      .replace(/\\Omega/g, "Ω")
      .replace(/\\div/g, "÷")
      .replace(/\\times/g, "×")
      .replace(/\\cdot/g, "·")
      .replace(/\\text\{([^}]*)\}/g, "$1")
      .replace(/\^\{2\}/g, "²")
      .replace(/\^2/g, "²")
      .replace(/\\[()[\]]/g, "")
      .replace(/\\,/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  window.voltAI = async (query, context = "") => {
    const messages = [
      { role: "system", content: "你是电子技术助教。用中文、简洁、分点解释。只做思路和解释，精确数值以确定性计算器为准。不要输出 LaTeX 公式，不要用 Markdown 表格。" },
      { role: "user", content: context ? `问题：${query}\n\n已知计算结果/上下文：${context}` : String(query) },
    ];
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, messages }),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = await res.json();
    const answer = clean(data.choices?.[0]?.message?.content);
    if (!answer) throw new Error("AI 没有返回内容");
    if (/top up|credits|余额|额度/i.test(answer)) {
      return { ok: false, error: "免费模型额度暂时不可用，请稍后再试。" };
    }
    return { ok: true, answer, model: data.model || AI_MODEL };
  };

  window.voltEnsurePy = ensurePy;
})();
