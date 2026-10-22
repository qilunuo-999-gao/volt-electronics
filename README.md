# VOLT — 电子技术计算智能体

在线静态版：**https://qilunuo-999-gao.github.io/volt-electronics/**

VOLT 把自然语言里的电子技术参数解析出来，用明确的电路公式计算，给出结论、公式、代入步骤和工程提醒。

## 在线版特性

- 计算器和 MNA 电路求解器由 Pyodide 在浏览器内运行，不需要后端
- 电路画布：元件、导线、节点、电压源正负极、导线电流箭头
- **未知量反求（考试模式）**
  - 把电阻设为未知 `R = ?`，或把电压源设为未知 `U = ?`
  - 在一条导线上填已知电流，并点“作为已知电流”
  - 点“求解”：反推未知 R/U，写回元件后重新计算整条电路
- 电阻计算：选中电阻，填 U / I / R 中任意两个，求第三个
- 画布直接显示 `R = 4.7 kΩ`、`U = 12 V` 和 U/I 测量徽标
- 免费 AI 助教（Pollinations），可对选中电阻点“AI 讲解”
- 纯静态站点，可直接部署到 GitHub Pages

## 静态版限制

- 图片 OCR / 识屏需要 Windows 本机服务，静态版禁用；请直接输入题目文字
- 首次计算需要从 CDN 加载 Pyodide，约几秒钟
- AI 依赖外部免费模型，可能排队或限流

## 本地完整版

```powershell
pip install -r requirements.txt
python server.py --port 8765 --open
```