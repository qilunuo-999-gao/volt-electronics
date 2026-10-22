"""把识别出的题面/元件标注匹配到常见电路拓扑，生成网表并求解。

这不是通用的“像素级识图”，而是针对教材常见题型的模板匹配：
- 双电源三电阻（叠加定理）
- 电阻分压
识别不到模板时，仍由用户手动输入网表。
"""

from __future__ import annotations

import re

from engine import by_unit, fmt, resistances, scan
from circuit import CircuitError, solve_netlist


def _sol(netlist: str):
    try:
        return solve_netlist(netlist)
    except CircuitError as exc:
        return {"ok": False, "error": str(exc)}


def infer_circuit(text: str) -> dict | None:
    qs = scan(text)
    vs = by_unit(qs, "V")
    rs = resistances(qs)
    low = text.lower()

    # 双电源 + 三个电阻：叠加定理的经典桥式/三支路题
    if (
        ("叠加" in text or "superposition" in low)
        and vs
        and len(rs) >= 3
    ):
        v1 = vs[0].si
        if len(vs) >= 2:
            v2 = vs[1].si
        elif re.search(r"E1\s*=\s*E2", text, re.I):
            v2 = v1
        else:
            return None
        r1, r2, r3 = rs[0].si, rs[1].si, rs[2].si
        netlist = (
            f"V1 n1 0 {fmt(v1, 8)}\n"
            f"R1 n1 A {fmt(r1, 8)}\n"
            f"V2 n2 0 {fmt(v2, 8)}\n"
            f"R2 n2 A {fmt(r2, 8)}\n"
            f"R3 A 0 {fmt(r3, 8)}"
        )
        return {
            "template": "two_source_three_resistor",
            "name": "双电源三电阻 / 叠加定理",
            "netlist": netlist,
            "solution": _sol(netlist),
            "reason": (
                f"识别到 E1=E2={fmt(v1, 4)}V，"
                f"R1={fmt(r1, 4)}Ω，R2={fmt(r2, 4)}Ω，R3={fmt(r3, 4)}Ω，"
                "匹配双电源三电阻模板。"
            ),
            "assumptions": [
                "两个电压源的正端都朝向 A 节点。",
                "R1、R2 分别在两个电源支路，R3 为中间支路。",
            ],
        }

    # 电阻分压
    if (
        ("分压" in text or "输出电压" in text or "vout" in low)
        and vs
        and len(rs) >= 2
    ):
        vin = vs[0].si
        r1, r2 = rs[0].si, rs[1].si
        netlist = (
            f"V1 in 0 {fmt(vin, 8)}\n"
            f"R1 in out {fmt(r1, 8)}\n"
            f"R2 out 0 {fmt(r2, 8)}"
        )
        return {
            "template": "divider",
            "name": "电阻分压",
            "netlist": netlist,
            "solution": _sol(netlist),
            "reason": (
                f"识别到 Vin={fmt(vin, 4)}V，R1={fmt(r1, 4)}Ω，R2={fmt(r2, 4)}Ω，"
                "匹配电阻分压模板。"
            ),
            "assumptions": ["R1 为上臂，R2 为下臂，输出取 R2 两端电压。"],
        }

    return None
