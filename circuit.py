"""VOLT 电路求解器：直流线性网络的改进节点电压法（MNA）。

支持的元件：
    R1 A B 2         电阻，单位 Ω
    V1 A B 17        独立电压源，A 为正端，B 为负端
    I1 A B 1m        独立电流源，电流从 A 流向 B

节点 0 / gnd / ground 为参考地。数值支持 10k、4.7m、2.2M、1u 等写法。
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from engine import eng, fmt


class CircuitError(Exception):
    pass


@dataclass
class Element:
    name: str
    kind: str          # R / V / I
    n1: str
    n2: str
    value: float


PREFIX = {
    "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "μ": 1e-6,
    "m": 1e-3, "": 1.0, "k": 1e3, "K": 1e3,
    "M": 1e6, "G": 1e9,
}
_VALUE_RE = re.compile(
    r"^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([pnuµμmkKMGT]?)\s*"
    r"(?:Ω|ohm|ohms|V|A|F|H|Hz)?\s*$",
    re.I,
)
_NODE_ALIASES = {"0", "GND", "GROUND", "GND!", "0V"}


def _node(name: str) -> str:
    n = name.strip().upper()
    return "0" if n in _NODE_ALIASES else n


def _value(token: str) -> float:
    m = _VALUE_RE.match(token.strip())
    if not m:
        raise CircuitError(f"无法识别数值：{token}（示例：2、10k、4.7u、17V）")
    num = float(m.group(1))
    prefix = m.group(2)
    # 单位存在时，前缀区分大小写；否则 m/M 仍按 SI 处理
    mult = PREFIX.get(prefix, None)
    if mult is None:
        mult = PREFIX.get(prefix.lower(), 1.0) if prefix.lower() in ("m",) else 1.0
    return num * mult


def parse_netlist(text: str) -> list[Element]:
    elements: list[Element] = []
    names: set[str] = set()
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith(("#", "*", "//")):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = re.split(r"[\s,;]+", line)
        if len(parts) != 4:
            raise CircuitError(
                f"第 {lineno} 行格式不对：{raw.strip()}\n"
                "每行应为：元件名 节点1 节点2 数值，例如 R1 A B 10k"
            )
        name, a, b, val = parts
        name = name.upper()
        kind = name[0]
        if kind not in ("R", "V", "I"):
            raise CircuitError(f"第 {lineno} 行：暂只支持 R / V / I，收到 {name}")
        if name in names:
            raise CircuitError(f"第 {lineno} 行：元件名重复 {name}")
        names.add(name)
        n1, n2 = _node(a), _node(b)
        if n1 == n2:
            raise CircuitError(f"第 {lineno} 行：{name} 两端接在同一个节点 {n1}")
        value = _value(val)
        if kind == "R" and value == 0:
            raise CircuitError(f"第 {lineno} 行：电阻不能为 0")
        elements.append(Element(name, kind, n1, n2, value))
    if not elements:
        raise CircuitError("网表为空，请至少输入一个元件。")
    return elements


def _solve_linear(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """带部分主元的高斯消元。"""
    n = len(rhs)
    a = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]
    scale = max(1.0, max(abs(x) for row in matrix for x in row))
    eps = 1e-12 * scale
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < eps:
            raise CircuitError(
                "矩阵奇异：可能存在悬空节点、重复的理想电压源，或理想电压源回路。"
            )
        if pivot != col:
            a[col], a[pivot] = a[pivot], a[col]
        pv = a[col][col]
        for r in range(col + 1, n):
            factor = a[r][col] / pv
            if factor == 0:
                continue
            for c in range(col, n + 1):
                a[r][c] -= factor * a[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = a[r][n] - sum(a[r][c] * x[c] for c in range(r + 1, n))
        x[r] = s / a[r][r]
    return x


def solve_netlist(text: str) -> dict:
    elements = parse_netlist(text)
    nodes = sorted(
        {n for e in elements for n in (e.n1, e.n2) if n != "0"},
        key=lambda s: (len(s), s),
    )
    idx = {n: i for i, n in enumerate(nodes)}
    vsrc = [e for e in elements if e.kind == "V"]
    n = len(nodes)
    m = len(vsrc)
    size = n + m
    if size == 0:
        raise CircuitError("电路没有非地节点，无法求解。")
    A = [[0.0] * size for _ in range(size)]
    z = [0.0] * size

    def ii(node: str) -> int:
        return idx.get(node, -1)

    for e in elements:
        a, b = ii(e.n1), ii(e.n2)
        if e.kind == "R":
            g = 1.0 / e.value
            if a >= 0:
                A[a][a] += g
            if b >= 0:
                A[b][b] += g
            if a >= 0 and b >= 0:
                A[a][b] -= g
                A[b][a] -= g
        elif e.kind == "I":
            # 电流从 n1 流向 n2：n1 流出，n2 流入
            if a >= 0:
                z[a] -= e.value
            if b >= 0:
                z[b] += e.value

    for k, e in enumerate(vsrc):
        a, b = ii(e.n1), ii(e.n2)
        row = n + k
        if a >= 0:
            A[row][a] += 1.0
            A[a][row] += 1.0
        if b >= 0:
            A[row][b] -= 1.0
            A[b][row] -= 1.0
        z[row] = e.value

    x = _solve_linear(A, z)
    node_v = {node: x[i] for node, i in idx.items()}
    node_v["0"] = 0.0

    comps = []
    vsrc_index = {e.name: n + k for k, e in enumerate(vsrc)}
    total_resistor_power = 0.0
    total_source_power = 0.0
    for e in elements:
        va = node_v[e.n1]
        vb = node_v[e.n2]
        if e.kind == "R":
            current = (va - vb) / e.value
            power = current * current * e.value
            total_resistor_power += power
            comps.append({
                "name": e.name,
                "kind": "R",
                "from": e.n1,
                "to": e.n2,
                "value": eng(e.value, "Ω"),
                "current": eng(current, "A"),
                "current_raw": current,
                "voltage": eng(va - vb, "V"),
                "power": eng(power, "W"),
                "power_delivered": -power,
            })
        elif e.kind == "V":
            current = x[vsrc_index[e.name]]
            p_del = -(va - vb) * current
            total_source_power += p_del
            comps.append({
                "name": e.name,
                "kind": "V",
                "from": e.n1,
                "to": e.n2,
                "value": eng(e.value, "V"),
                "current": eng(current, "A"),
                "current_raw": current,
                "voltage": eng(va - vb, "V"),
                "power": eng(p_del, "W"),
                "power_delivered": p_del,
                "note": "电流正方向：从 + 端到 − 端流过电源内部",
            })
        else:
            p_del = (vb - va) * e.value
            total_source_power += p_del
            comps.append({
                "name": e.name,
                "kind": "I",
                "from": e.n1,
                "to": e.n2,
                "value": eng(e.value, "A"),
                "current": eng(e.value, "A"),
                "current_raw": e.value,
                "voltage": eng(va - vb, "V"),
                "power": eng(p_del, "W"),
                "power_delivered": p_del,
                "note": "电流正方向：从 from 节点流向 to 节点",
            })

    balance = total_source_power - total_resistor_power
    return {
        "ok": True,
        "nodes": {k: {"voltage": v, "display": eng(v, "V")} for k, v in sorted(node_v.items())},
        "components": comps,
        "total_source_power": eng(total_source_power, "W"),
        "total_resistor_power": eng(total_resistor_power, "W"),
        "balance": eng(balance, "W"),
        "balance_ok": abs(balance) <= max(1e-9, 1e-6 * max(1.0, abs(total_source_power))),
        "counts": {"nodes": len(nodes), "elements": len(elements), "voltage_sources": m},
    }
