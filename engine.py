"""VOLT — 电子技术计算引擎。

设计原则：
1. 所有计算都用明确公式，不做 LLM 估算。
2. 输入尽量宽松：支持 10k、4.7uF、20mA、10°C 等写法。
3. 输出统一包含：结论、公式、代入步骤、注意事项。
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable


# ---------------------------------------------------------------------------
# 数据模型
# ---------------------------------------------------------------------------

@dataclass
class Q:
    raw: str
    value: float          # 书写值，例如 4.7uF 中的 4.7
    si: float             # 换算到基本单位后的值，例如 4.7e-6 F
    unit: str             # 归一化单位：V/A/Ω/F/H/Hz/s/Ah/°C/W/dB/%/oz/mm/mil
    prefix: str
    pos: int
    end: int


PREFIX = {
    "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "μ": 1e-6,
    "m": 1e-3, "": 1.0, "k": 1e3, "K": 1e3,
    "M": 1e6, "G": 1e9, "T": 1e12,
}

_UNIT_ALIASES = {
    "v": "V", "伏": "V", "伏特": "V",
    "a": "A", "安": "A", "安培": "A",
    "w": "W", "瓦": "W", "瓦特": "W",
    "f": "F", "法": "F", "法拉": "F",
    "h": "H", "亨": "H", "亨利": "H",
    "hz": "Hz", "赫": "Hz", "赫兹": "Hz",
    "s": "s", "秒": "s",
    "ah": "Ah", "安时": "Ah",
    "ω": "Ω", "欧": "Ω", "欧姆": "Ω", "ohm": "Ω", "ohms": "Ω",
    "°c": "°C", "℃": "°C", "摄氏度": "°C",
    "db": "dB", "分贝": "dB",
    "oz": "oz", "盎司": "oz",
    "mm": "mm", "mil": "mil", "%": "%",
}

_Q_RE = re.compile(
    r"(?<![\d.])"
    r"(?P<num>\d+(?:\.\d+)?)\s*"
    r"(?P<prefix>[pnuµμmkKMGT])?\s*"
    r"(?P<unit>(?i:mAh|Ah|dB|Hz|Ω|ohms?|V|A|W|F|H|S|mm|mil|oz|%|℃|°C|欧姆?|伏特?|安培?|瓦特?|法拉?|亨利?|赫兹?))"
    r"(?![A-Za-z])"
)
_BARE_RE = re.compile(
    r"(?<![\d.])(?P<num>\d+(?:\.\d+)?)\s*(?P<prefix>[pnuµμmkKMGT])(?![A-Za-z0-9])"
)
_NUM_RE = re.compile(r"(?<![\d.])\d+(?:\.\d+)?")
_HFE_RE = re.compile(r"(?:hfe|HFE|β|放大倍数)\s*[=:：]?\s*(\d+(?:\.\d+)?)")


def _norm_unit(raw: str) -> str:
    key = raw.strip()
    if key in ("Ω", "Ω"):
        return "Ω"
    return _UNIT_ALIASES.get(key.lower(), key)


def scan(text: str) -> list[Q]:
    """扫描文本中的所有带单位量，以及 10k 这类带前缀的裸值。"""
    out: list[Q] = []
    spans: list[tuple[int, int]] = []
    for m in _Q_RE.finditer(text):
        num = float(m.group("num"))
        raw_unit = m.group("unit")
        unit = _norm_unit(raw_unit)
        prefix = m.group("prefix") or ""
        mult = PREFIX.get(prefix, 1.0)
        out.append(Q(m.group(0), num, num * mult, unit, prefix, m.start(), m.end()))
        spans.append((m.start(), m.end()))
    for m in _BARE_RE.finditer(text):
        if any(a <= m.start() < b for a, b in spans):
            continue
        num = float(m.group("num"))
        prefix = m.group("prefix") or ""
        out.append(Q(m.group(0), num, num * PREFIX.get(prefix, 1.0), "", prefix, m.start(), m.end()))
    out.sort(key=lambda q: q.pos)
    return out


def by_unit(qs: Iterable[Q], unit: str) -> list[Q]:
    return [q for q in qs if q.unit == unit]


def first(qs: Iterable[Q], unit: str) -> Q | None:
    return next((q for q in qs if q.unit == unit), None)


def resistances(qs: Iterable[Q]) -> list[Q]:
    """电阻：带 Ω 的值，或 10k / 2M2 这类带前缀的裸值。"""
    return [
        q for q in qs
        if q.unit == "Ω" or (q.unit == "" and q.prefix in ("k", "K", "M", "G", "m", "R", "r"))
    ]


def numbers(text: str) -> list[float]:
    return [float(x) for x in _NUM_RE.findall(text)]


def count_of(text: str) -> int | None:
    m = re.search(r"(\d+)\s*个", text)
    if m:
        return int(m.group(1))
    cn = {"两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    m = re.search(r"([两二三四五六七八九十])\s*个", text)
    return cn.get(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# 格式化
# ---------------------------------------------------------------------------

def fmt(x: float, sig: int = 4) -> str:
    if not math.isfinite(x):
        return "—"
    if abs(x) < 1e-15:
        return "0"
    s = f"{x:.{sig}g}"
    if "e" in s:
        mant, exp = s.split("e")
        return f"{mant}e{int(exp)}"
    return s


def eng(x: float, unit: str = "", sig: int = 4) -> str:
    if not math.isfinite(x):
        return "—"
    # 消掉浮点求解产生的 -0.9999999999999991 之类噪声
    if abs(x - round(x)) < 1e-9:
        x = float(round(x))
    if x == 0:
        return f"0 {unit}".strip()
    if unit in ("°C", "dB", "%", "oz", "mm", "mil", ""):
        return f"{fmt(x, sig)} {unit}".strip()

    exp = int(math.floor(math.log10(abs(x)) / 3) * 3)
    exp = max(-12, min(12, exp))
    scaled = x / (10 ** exp)
    if abs(scaled) >= 1000 and exp < 12:
        exp += 3
        scaled /= 1000
    if abs(scaled) < 1 and exp > -12:
        exp -= 3
        scaled *= 1000
    pref = {-12: "p", -9: "n", -6: "µ", -3: "m", 0: "", 3: "k", 6: "M", 9: "G", 12: "T"}.get(exp, "")
    return f"{fmt(scaled, sig)} {pref}{unit}".strip()


E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
       3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]


def next_e24(value: float) -> float:
    if value <= 0:
        return value
    decade = 10 ** math.floor(math.log10(value))
    norm = value / decade
    for e in E24:
        if e >= norm * (1 - 1e-9):
            return e * decade
    return 10 * decade


def result(
    title: str,
    category: str,
    summary: str,
    formula: str,
    steps: list[str],
    values: list[dict] | None = None,
    notes: list[str] | None = None,
    followups: list[str] | None = None,
) -> dict:
    return {
        "ok": True,
        "title": title,
        "category": category,
        "summary": summary,
        "formula": formula,
        "steps": steps,
        "values": values or [],
        "notes": notes or [],
        "followups": followups or [],
    }


def fail(message: str, followups: list[str] | None = None) -> dict:
    return {
        "ok": False,
        "title": "还差一点信息",
        "category": "提示",
        "summary": message,
        "formula": "",
        "steps": [],
        "values": [],
        "notes": ["可以直接输入数值和单位，例如：5V 100Ω、10k 并联 4.7k、RC 1k 100nF。"],
        "followups": followups or ["5V 100Ω 电流", "12V 10k 4.7k 分压", "RC 1k 100nF 截止频率"],
    }


# ---------------------------------------------------------------------------
# 计算器
# ---------------------------------------------------------------------------

def calc_ohm(text: str, qs: list[Q]) -> dict:
    v = first(qs, "V")
    i = first(qs, "A")
    r = first(resistances(qs), "Ω") or (resistances(qs)[0] if resistances(qs) else None)
    p = first(qs, "W")

    V = v.si if v else None
    I = i.si if i else None
    R = r.si if r else None
    P = p.si if p else None

    if V is not None and I is not None:
        R = V / I if I else None
        P = V * I
        used = "V、I"
    elif V is not None and R is not None:
        I = V / R if R else None
        P = V * I if I is not None else None
        used = "V、R"
    elif I is not None and R is not None:
        V = I * R
        P = I * I * R
        used = "I、R"
    elif P is not None and V is not None and V != 0:
        I = P / V
        R = V * V / P if P else None
        used = "P、V"
    elif P is not None and I is not None and I != 0:
        V = P / I
        R = P / (I * I) if I else None
        used = "P、I"
    elif P is not None and R is not None and R != 0:
        I = math.sqrt(P / R)
        V = math.sqrt(P * R)
        used = "P、R"
    else:
        return fail("至少给出电压、电流、电阻、功率中的两个量。", ["5V 100Ω 电流", "12V 1A 功率"])

    vals = []
    if V is not None: vals.append({"label": "电压 V", "value": eng(V, "V")})
    if I is not None: vals.append({"label": "电流 I", "value": eng(I, "A")})
    if R is not None: vals.append({"label": "电阻 R", "value": eng(R, "Ω")})
    if P is not None: vals.append({"label": "功率 P", "value": eng(P, "W")})

    low = text.lower()
    summary = (
        f"I = {eng(I, 'A')}，P = {eng(P, 'W')}"
        if "电流" in text or "current" in low or "I" in text
        else f"P = {eng(P, 'W')}，I = {eng(I, 'A')}"
    )
    title = "功率计算" if any(k in low for k in ("功率", "瓦", "power")) else "欧姆定律"

    steps = [f"已知：{used}"]
    if V is not None and I is not None:
        steps += [f"I = V / R = {eng(V, 'V')} / {eng(R, 'Ω')} = {eng(I, 'A')}",
                  f"P = V × I = {eng(V, 'V')} × {eng(I, 'A')} = {eng(P, 'W')}"]
    elif V is not None and R is not None:
        steps += [f"I = V / R = {eng(V, 'V')} / {eng(R, 'Ω')} = {eng(I, 'A')}",
                  f"P = V² / R = ({eng(V, 'V')})² / {eng(R, 'Ω')} = {eng(P, 'W')}"]
    elif I is not None and R is not None:
        steps += [f"V = I × R = {eng(I, 'A')} × {eng(R, 'Ω')} = {eng(V, 'V')}",
                  f"P = I² × R = ({eng(I, 'A')})² × {eng(R, 'Ω')} = {eng(P, 'W')}"]
    else:
        steps.append("由功率公式与欧姆定律联立求解。")

    return result(
        title, "直流基础", summary,
        "V = I·R    P = V·I = I²R = V²/R",
        steps, vals,
        ["电阻按理想线性元件计算；实际选型建议功率至少留 2 倍余量。"],
        ["这个电阻选 1/4W 够吗？", "如果是 12V 呢？"],
    )


def calc_series_parallel(text: str, qs: list[Q]) -> dict:
    rs = resistances(qs)
    n = count_of(text)
    if not rs:
        return fail("请给出电阻值，例如：10k 和 4.7k 并联。")
    if len(rs) == 1 and n:
        rs = [rs[0]] * n
    if len(rs) < 2:
        return fail("串并联至少需要两个电阻（或一个电阻 + 个数）。")

    values = [q.si for q in rs]
    if "并联" in text:
        req = 1 / sum(1 / x for x in values)
        formula = "1/R总 = 1/R1 + 1/R2 + …"
        steps = ["1/R总 = " + " + ".join(f"1/{eng(x, 'Ω')}" for x in values),
                 f"R总 = {eng(req, 'Ω')}"]
        title = "电阻并联"
    else:
        req = sum(values)
        formula = "R总 = R1 + R2 + …"
        steps = ["R总 = " + " + ".join(eng(x, "Ω") for x in values),
                 f"R总 = {eng(req, 'Ω')}"]
        title = "电阻串联"

    return result(
        title, "直流基础", f"等效电阻 = {eng(req, 'Ω')}", formula, steps,
        [{"label": "等效电阻", "value": eng(req, "Ω")},
         {"label": "电阻个数", "value": str(len(values))}],
        ["并联后的等效电阻一定小于其中最小的一个。"],
    )


def calc_divider(text: str, qs: list[Q]) -> dict:
    vin = first(qs, "V")
    rs = resistances(qs)
    if not vin or len(rs) < 2:
        return fail("分压需要输入电压和两个电阻，例如：12V 10k 4.7k 分压。")
    r1, r2 = rs[0].si, rs[1].si
    vout = vin.si * r2 / (r1 + r2)
    current = vin.si / (r1 + r2)
    p = vin.si * current
    return result(
        "电阻分压", "直流基础", f"输出电压 = {eng(vout, 'V')}",
        "Vout = Vin × R2 / (R1 + R2)",
        [f"Vout = {eng(vin.si, 'V')} × {eng(r2, 'Ω')} / ({eng(r1, 'Ω')} + {eng(r2, 'Ω')})",
         f"Vout = {eng(vout, 'V')}",
         f"分压电流 = {eng(current, 'A')}，总功耗 = {eng(p, 'W')}"],
        [{"label": "输出电压", "value": eng(vout, "V")},
         {"label": "分压电流", "value": eng(current, "A")},
         {"label": "总功耗", "value": eng(p, "W")}],
        ["按 R1 为上臂、R2 为下臂计算；输出端接负载时需重新计算并联等效。"],
    )


LED_VF = {
    "红": 2.0, "red": 2.0,
    "黄": 2.1, "yellow": 2.1,
    "绿": 2.2, "green": 2.2,
    "蓝": 3.2, "blue": 3.2,
    "白": 3.2, "white": 3.2,
    "橙": 2.0, "orange": 2.0,
}


def calc_led(text: str, qs: list[Q]) -> dict:
    vs = first(qs, "V")
    if not vs:
        return fail("LED 限流需要电源电压，例如：5V 红色 LED 20mA。")
    currents = by_unit(qs, "A")
    current = currents[0].si if currents else 0.02
    volts = by_unit(qs, "V")
    vf = None
    if len(volts) >= 2:
        vf = volts[1].si
    if vf is None:
        for key, val in LED_VF.items():
            if key in text.lower():
                vf = val
                break
    if vf is None:
        vf = 2.0
    if vs.si <= vf:
        return fail("电源电压必须高于 LED 正向压降。")
    r = (vs.si - vf) / current
    p = (vs.si - vf) * current
    std = next_e24(r)
    return result(
        "LED 限流电阻", "器件应用", f"限流电阻 ≈ {eng(r, 'Ω')}",
        "R = (Vs − Vf) / I",
        [f"R = ({eng(vs.si, 'V')} − {eng(vf, 'V')}) / {eng(current, 'A')}",
         f"R = {eng(r, 'Ω')}，取 E24 标准值 {eng(std, 'Ω')}",
         f"电阻功耗 = {eng(p, 'W')}，建议选 {eng(next_e24(p * 2), 'W')} 以上"],
        [{"label": "理论电阻", "value": eng(r, "Ω")},
         {"label": "E24 取值", "value": eng(std, "Ω")},
         {"label": "电阻功耗", "value": eng(p, "W")}],
        [f"按 Vf = {eng(vf, 'V')} 估算；不同颜色/批次的 LED 压降会变化，建议实测后微调。",
         "电阻功率建议留 2 倍以上余量；LED 电流不要超过额定值。"],
    )


def calc_rc_rl(text: str, qs: list[Q]) -> dict:
    r = first(qs, "Ω") or (resistances(qs)[0] if resistances(qs) else None)
    c = first(qs, "F")
    l = first(qs, "H")
    if not r:
        return fail("RC/RL 计算需要电阻，例如：RC 1k 100nF 截止频率。")
    if c:
        fc = 1 / (2 * math.pi * r.si * c.si)
        tau = r.si * c.si
        tr = 2.2 * tau
        return result(
            "RC 截止频率", "交流与滤波", f"fc = {eng(fc, 'Hz')}，τ = {eng(tau, 's')}",
            "fc = 1 / (2πRC)    τ = RC    tr(10–90%) ≈ 2.2τ",
            [f"fc = 1 / (2π × {eng(r.si, 'Ω')} × {eng(c.si, 'F')})",
             f"fc = {eng(fc, 'Hz')}",
             f"τ = {eng(tau, 's')}，10–90% 上升时间 ≈ {eng(tr, 's')}"],
            [{"label": "截止频率", "value": eng(fc, "Hz")},
             {"label": "时间常数 τ", "value": eng(tau, "s")},
             {"label": "上升时间", "value": eng(tr, "s")}],
            ["低通/高通的截止频率定义相同，只是通带位置不同。", "这是 -3dB 频率，不是陡峭的开关点。"],
        )
    if l:
        fc = r.si / (2 * math.pi * l.si)
        tau = l.si / r.si
        return result(
            "RL 截止频率", "交流与滤波", f"fc = {eng(fc, 'Hz')}，τ = {eng(tau, 's')}",
            "fc = R / (2πL)    τ = L / R",
            [f"fc = {eng(r.si, 'Ω')} / (2π × {eng(l.si, 'H')})",
             f"fc = {eng(fc, 'Hz')}",
             f"τ = {eng(tau, 's')}"],
            [{"label": "截止频率", "value": eng(fc, "Hz")},
             {"label": "时间常数 τ", "value": eng(tau, "s")}],
        )
    return fail("还需要电容 C 或电感 L，例如：RC 1k 100nF 或 RL 1k 10mH。")


def calc_reactance(text: str, qs: list[Q]) -> dict:
    f = first(qs, "Hz")
    c = first(qs, "F")
    l = first(qs, "H")
    r = first(qs, "Ω") or (resistances(qs)[0] if resistances(qs) else None)
    if not f:
        return fail("容抗/感抗需要频率，例如：100nF 50Hz 容抗。")

    if "阻抗" in text and r and (c or l):
        xc = 1 / (2 * math.pi * f.si * c.si) if c else 0.0
        xl = 2 * math.pi * f.si * l.si if l else 0.0
        x = xl - xc
        z = math.hypot(r.si, x)
        phase = math.degrees(math.atan2(x, r.si))
        return result(
            "RLC 串联阻抗", "交流与滤波", f"|Z| = {eng(z, 'Ω')}，相位 {fmt(phase)}°",
            "|Z| = √(R² + (XL − XC)²)    φ = arctan((XL − XC) / R)",
            [f"XC = {eng(xc, 'Ω')}" if c else "XC = 0",
             f"XL = {eng(xl, 'Ω')}" if l else "XL = 0",
             f"|Z| = √({eng(r.si, 'Ω')}² + ({eng(x, 'Ω')})²) = {eng(z, 'Ω')}",
             f"φ = arctan({eng(x, 'Ω')} / {eng(r.si, 'Ω')}) = {fmt(phase)}°"],
            [{"label": "阻抗 |Z|", "value": eng(z, "Ω")},
             {"label": "电抗 X", "value": eng(x, "Ω")},
             {"label": "相位角", "value": f"{fmt(phase)}°"}],
            ["负相位表示电流超前电压（容性），正相位表示感性。"],
        )

    if c:
        xc = 1 / (2 * math.pi * f.si * c.si)
        return result(
            "容抗 XC", "交流与滤波", f"XC = {eng(xc, 'Ω')}",
            "XC = 1 / (2πfC)",
            [f"XC = 1 / (2π × {eng(f.si, 'Hz')} × {eng(c.si, 'F')})", f"XC = {eng(xc, 'Ω')}"],
            [{"label": "容抗", "value": eng(xc, "Ω")},
             {"label": "频率", "value": eng(f.si, "Hz")}],
            ["频率越高，容抗越小；直流时容抗趋于无穷。"],
        )
    if l:
        xl = 2 * math.pi * f.si * l.si
        return result(
            "感抗 XL", "交流与滤波", f"XL = {eng(xl, 'Ω')}",
            "XL = 2πfL",
            [f"XL = 2π × {eng(f.si, 'Hz')} × {eng(l.si, 'H')}", f"XL = {eng(xl, 'Ω')}"],
            [{"label": "感抗", "value": eng(xl, "Ω")},
             {"label": "频率", "value": eng(f.si, "Hz")}],
            ["频率越高，感抗越大；直流时感抗为零。"],
        )
    return fail("还需要电容或电感，例如：100nF 50Hz 容抗。")


def calc_resonance(text: str, qs: list[Q]) -> dict:
    l = first(qs, "H")
    c = first(qs, "F")
    if not l or not c:
        return fail("LC 谐振需要电感和电容，例如：10uH 100nF 谐振频率。")
    f0 = 1 / (2 * math.pi * math.sqrt(l.si * c.si))
    period = 1 / f0
    vals = [{"label": "谐振频率", "value": eng(f0, "Hz")},
            {"label": "周期", "value": eng(period, "s")}]
    steps = [f"f0 = 1 / (2π√(LC))",
             f"f0 = 1 / (2π√({eng(l.si, 'H')} × {eng(c.si, 'F')}))",
             f"f0 = {eng(f0, 'Hz')}"]
    notes = ["这是理想 LC 的固有谐振频率；实际电路受寄生参数和负载影响。"]
    r = first(qs, "Ω")
    if r:
        q = (1 / r.si) * math.sqrt(l.si / c.si)
        bw = f0 / q
        vals += [{"label": "品质因数 Q", "value": fmt(q)},
                 {"label": "带宽", "value": eng(bw, "Hz")}]
        steps.append(f"Q = (1/R)√(L/C) = {fmt(q)}，BW = f0/Q = {eng(bw, 'Hz')}")
    return result("LC 谐振", "交流与滤波", f"f0 = {eng(f0, 'Hz')}",
                  "f0 = 1 / (2π√(LC))", steps, vals, notes)


def calc_555(text: str, qs: list[Q]) -> dict:
    c = first(qs, "F")
    rs = [q for q in resistances(qs)]
    if not c:
        return fail("555 计算需要电容，例如：555 10k 10k 100nF 频率。")
    if "单稳" in text or "monostable" in text.lower():
        if not rs:
            return fail("555 单稳态需要电阻 R 和电容 C。")
        r = rs[0].si
        t = 1.1 * r * c.si
        return result(
            "555 单稳态", "数字与定时", f"输出脉宽 = {eng(t, 's')}",
            "T = 1.1 × R × C",
            [f"T = 1.1 × {eng(r, 'Ω')} × {eng(c.si, 'F')}", f"T = {eng(t, 's')}"],
            [{"label": "脉宽 T", "value": eng(t, "s")}],
            ["忽略复位引脚漏电流和阈值误差；实际脉宽会有几个百分点偏差。"],
        )
    if not rs:
        return fail("555 无稳态需要 R1、R2 和 C。")
    if len(rs) >= 2:
        r1, r2 = rs[0].si, rs[1].si
    else:
        r1 = r2 = rs[0].si
    f = 1.44 / ((r1 + 2 * r2) * c.si)
    duty = (r1 + r2) / (r1 + 2 * r2) * 100
    th = 0.693 * (r1 + r2) * c.si
    tl = 0.693 * r2 * c.si
    return result(
        "555 无稳态", "数字与定时", f"频率 = {eng(f, 'Hz')}，占空比 = {fmt(duty)}%",
        "f = 1.44 / ((R1 + 2R2)C)    Duty = (R1 + R2) / (R1 + 2R2)",
        [f"f = 1.44 / (({eng(r1, 'Ω')} + 2×{eng(r2, 'Ω')}) × {eng(c.si, 'F')})",
         f"f = {eng(f, 'Hz')}",
         f"t_high = 0.693(R1+R2)C = {eng(th, 's')}",
         f"t_low = 0.693R2C = {eng(tl, 's')}",
         f"占空比 = {fmt(duty)}%"],
        [{"label": "频率", "value": eng(f, "Hz")},
         {"label": "占空比", "value": f"{fmt(duty)}%"},
         {"label": "高电平时间", "value": eng(th, "s")},
         {"label": "低电平时间", "value": eng(tl, "s")}],
        ["按理想 555 公式计算；R1 不能太小，否则放电晶体管电流过大。",
         "如果只给了一个电阻，已按 R1 = R2 估算。"],
    )


def calc_opamp(text: str, qs: list[Q]) -> dict:
    rs = resistances(qs)
    if "跟随" in text or "buffer" in text.lower():
        return result("运放跟随器", "模拟电路", "增益 = 1", "Vout = Vin",
                      ["输入直接接同相端，输出与反相端短接。"],
                      [{"label": "电压增益", "value": "1 V/V"}])
    if "反相" in text and len(rs) >= 2:
        rin, rf = rs[0].si, rs[1].si
        gain = -rf / rin
        db = 20 * math.log10(abs(gain))
        return result(
            "反相放大器", "模拟电路", f"增益 = {fmt(gain)} V/V（{fmt(db)} dB）",
            "Av = −Rf / Rin",
            [f"Av = −{eng(rf, 'Ω')} / {eng(rin, 'Ω')} = {fmt(gain)}",
             f"|Av| = {fmt(abs(gain))}，{fmt(db)} dB"],
            [{"label": "电压增益", "value": f"{fmt(gain)} V/V"},
             {"label": "增益(dB)", "value": f"{fmt(db)} dB"},
             {"label": "输入阻抗", "value": eng(rin, "Ω")}],
            ["反相端是虚地；输入阻抗约等于 Rin。", "输出不能超过运放电源轨。"],
        )
    if ("同相" in text or "非反相" in text) and len(rs) >= 2:
        rg, rf = rs[0].si, rs[1].si
        gain = 1 + rf / rg
        db = 20 * math.log10(abs(gain))
        return result(
            "同相放大器", "模拟电路", f"增益 = {fmt(gain)} V/V（{fmt(db)} dB）",
            "Av = 1 + Rf / Rg",
            [f"Av = 1 + {eng(rf, 'Ω')} / {eng(rg, 'Ω')} = {fmt(gain)}",
             f"{fmt(db)} dB"],
            [{"label": "电压增益", "value": f"{fmt(gain)} V/V"},
             {"label": "增益(dB)", "value": f"{fmt(db)} dB"}],
            ["按 Rg 为接地电阻、Rf 为反馈电阻计算。", "同相输入阻抗很高，增益带宽积会限制高频表现。"],
        )
    return fail("请说明运放组态，例如：运放 反相 10k 100k 增益。")


def calc_bjt(text: str, qs: list[Q]) -> dict:
    vcc = first(qs, "V")
    rs = resistances(qs)
    if not vcc or not rs:
        return fail("三极管偏置需要 Vcc 和基极电阻，例如：三极管 12V 100k hFE=100。")
    vbe_q = by_unit(qs, "V")
    vbe = vbe_q[1].si if len(vbe_q) >= 2 else 0.7
    rb = rs[0].si
    hfe_m = _HFE_RE.search(text)
    hfe = float(hfe_m.group(1)) if hfe_m else None
    if hfe is None:
        nums = numbers(text)
        hfe = next((n for n in reversed(nums) if 10 <= n <= 2000), None)
    if not hfe:
        return fail("请给出 hFE（电流放大倍数），例如：三极管 12V 100k hFE=100。")
    ib = (vcc.si - vbe) / rb
    ic = hfe * ib
    out = [{"label": "基极电流 Ib", "value": eng(ib, "A")},
           {"label": "集电极电流 Ic", "value": eng(ic, "A")},
           {"label": "基极电阻 Rb", "value": eng(rb, "Ω")}]
    steps = [f"Ib = (Vcc − Vbe) / Rb = ({eng(vcc.si, 'V')} − {eng(vbe, 'V')}) / {eng(rb, 'Ω')}",
             f"Ib = {eng(ib, 'A')}",
             f"Ic = hFE × Ib = {fmt(hfe)} × {eng(ib, 'A')} = {eng(ic, 'A')}"]
    notes = [
        f"按 Vbe = {eng(vbe, 'V')}、放大区线性模型估算。",
        "实际 hFE 离散性很大，偏置设计应避免依赖单一 hFE 值。",
    ]
    if len(rs) >= 2:
        rc = rs[1].si
        vce = vcc.si - ic * rc
        out.append({"label": "集电极电压 Vce", "value": eng(vce, "V")})
        steps.append(f"Vce = Vcc − Ic×Rc = {eng(vce, 'V')}")
        if vce < 0.2:
            notes.append("计算得到 Vce < 0.2V，三极管已进入饱和，线性放大假设不成立。")
    return result(
        "三极管直流偏置", "模拟电路", f"Ib = {eng(ib, 'A')}，Ic ≈ {eng(ic, 'A')}",
        "Ib = (Vcc − Vbe)/Rb    Ic = hFE × Ib",
        steps, out, notes,
    )


def calc_pcb_trace(text: str, qs: list[Q]) -> dict:
    i = first(qs, "A")
    dt = first(qs, "°C")
    oz = first(qs, "oz")
    if not i:
        return fail("PCB 线宽需要电流，例如：PCB 2A 10°C 1oz 外层。")
    current = i.si
    delta_t = dt.si if dt else 10.0
    copper = oz.si if oz else 1.0
    outer = not ("内层" in text or "internal" in text.lower())
    k = 0.048 if outer else 0.024
    area_mil2 = (current / (k * delta_t ** 0.44)) ** (1 / 0.725)
    thickness_mil = copper * 1.378
    width_mil = area_mil2 / thickness_mil
    width_mm = width_mil * 0.0254
    return result(
        "PCB 走线宽度", "PCB 与工程", f"最小线宽 ≈ {fmt(width_mm, 3)} mm（{fmt(width_mil, 3)} mil）",
        "A = (I / (k·ΔT^0.44))^(1/0.725)    W = A / (铜厚 × 1.378)",
        [f"按 {'外层' if outer else '内层'}、{fmt(copper, 3)} oz、ΔT = {fmt(delta_t, 3)}°C",
         f"截面积 A = {fmt(area_mil2, 4)} mil²",
         f"线宽 = {fmt(width_mil, 4)} mil = {fmt(width_mm, 4)} mm"],
        [{"label": "建议线宽", "value": f"{fmt(width_mm, 3)} mm"},
         {"label": "mil", "value": f"{fmt(width_mil, 3)} mil"},
         {"label": "温升", "value": f"{fmt(delta_t, 3)} °C"}],
        ["基于 IPC-2221 近似公式，只适用于常规 FR-4 铜箔。",
         "实际布线建议再留 20–50% 余量；大电流/高可靠场景请按 IPC-2152 或厂家规范复核。"],
    )


def calc_battery(text: str, qs: list[Q]) -> dict:
    cap = first(qs, "Ah")
    cur = first(qs, "A")
    if not cap or not cur:
        return fail("电池续航需要容量和电流，例如：2000mAh 100mA 续航。")
    hours = cap.si / cur.si
    return result(
        "电池续航估算", "电源与工程", f"理想续航 ≈ {fmt(hours, 4)} 小时（{fmt(hours / 24, 3)} 天）",
        "t = 容量 / 负载电流",
        [f"t = {eng(cap.si, 'Ah')} / {eng(cur.si, 'A')}",
         f"t = {fmt(hours, 4)} h"],
        [{"label": "理想续航", "value": f"{fmt(hours, 4)} h"},
         {"label": "约合天数", "value": f"{fmt(hours / 24, 3)} 天"}],
        ["未考虑电池放电曲线、温度、升压/降压损耗；实际可按 70–85% 估算。"],
    )


def calc_regulator(text: str, qs: list[Q]) -> dict:
    volts = by_unit(qs, "V")
    cur = first(qs, "A")
    if not cur:
        return fail("稳压器功耗需要输入电压、输出电压和电流，例如：7805 12V 5V 0.5A。")
    if len(volts) >= 2:
        vin, vout = volts[0].si, volts[1].si
    elif len(volts) == 1 and "7805" in text:
        vin, vout = volts[0].si, 5.0
    else:
        return fail("稳压器功耗需要输入电压、输出电压和电流，例如：7805 12V 5V 0.5A。")
    i = cur.si
    pd = (vin - vout) * i
    eff = vout / vin * 100 if vin else 0
    return result(
        "线性稳压器功耗", "电源与工程", f"功耗 = {eng(pd, 'W')}，效率 ≈ {fmt(eff, 3)}%",
        "Pd = (Vin − Vout) × I    η ≈ Vout / Vin",
        [f"Pd = ({eng(vin, 'V')} − {eng(vout, 'V')}) × {eng(i, 'A')}",
         f"Pd = {eng(pd, 'W')}",
         f"η = {eng(vout, 'V')} / {eng(vin, 'V')} = {fmt(eff, 3)}%"],
        [{"label": "耗散功率", "value": eng(pd, "W")},
         {"label": "效率", "value": f"{fmt(eff, 3)}%"},
         {"label": "负载电流", "value": eng(i, "A")}],
        ["未计算静态电流；线性稳压器的损耗全部变成热。",
         "需要根据 θJA 或散热器热阻核算结温。"],
    )


def calc_db(text: str, qs: list[Q]) -> dict:
    db = first(qs, "dB")
    power = "功率" in text or "power" in text.lower()
    if db:
        ratio = 10 ** (db.si / (10 if power else 20))
        kind = "功率比" if power else "电压/电流比"
        return result("分贝换算", "工具", f"{fmt(db.si, 4)} dB → {kind} {fmt(ratio, 4)}",
                      "dB = 10log10(P2/P1)  或  20log10(V2/V1)",
                      [f"{kind} = 10^({fmt(db.si, 4)}/{10 if power else 20}) = {fmt(ratio, 4)}"],
                      [{"label": "分贝", "value": f"{fmt(db.si, 4)} dB"},
                       {"label": kind, "value": fmt(ratio, 4)}])
    nums = numbers(text)
    if nums:
        ratio = nums[0]
        val = (10 if power else 20) * math.log10(ratio)
        kind = "功率比" if power else "电压/电流比"
        return result("分贝换算", "工具", f"{kind} {fmt(ratio, 4)} → {fmt(val, 4)} dB",
                      "dB = 10log10(P2/P1)  或  20log10(V2/V1)",
                      [f"dB = {10 if power else 20} × log10({fmt(ratio, 4)}) = {fmt(val, 4)}"],
                      [{"label": "分贝", "value": f"{fmt(val, 4)} dB"},
                       {"label": kind, "value": fmt(ratio, 4)}])
    return fail("请给出分贝值或比值，例如：20dB 功率比。")


def calc_color_code(text: str) -> dict:
    colors = {
        "黑": (0, None), "棕": (1, 1), "红": (2, 2), "橙": (3, None),
        "黄": (4, None), "绿": (5, 0.5), "蓝": (6, 0.25), "紫": (7, 0.1),
        "灰": (8, 0.05), "白": (9, None), "金": (-1, 5), "银": (-2, 10),
    }
    chars = [c for c in text if c in colors]
    if len(chars) < 3:
        return fail("请给出色环颜色，例如：棕黑红金。")
    if len(chars) >= 5:
        d1, d2, d3 = colors[chars[0]][0], colors[chars[1]][0], colors[chars[2]][0]
        mult = colors[chars[3]][0]
        tol = colors[chars[4]][1] if chars[4] in colors else None
        tol = tol if tol is not None else 20
        val = (d1 * 100 + d2 * 10 + d3) * (10 ** mult)
        bands = 5
    else:
        d1, d2 = colors[chars[0]][0], colors[chars[1]][0]
        mult = colors[chars[2]][0]
        tol = colors[chars[3]][1] if len(chars) >= 4 else None
        tol = tol if tol is not None else 20
        val = (d1 * 10 + d2) * (10 ** mult)
        bands = 4
    return result(
        "电阻色环", "工具", f"{eng(val, 'Ω')} ±{fmt(tol, 3)}%",
        "阻值 = (前几位数字) × 10^倍率",
        [f"{bands} 环：{'、'.join(chars[:bands])}", f"阻值 = {eng(val, 'Ω')}，精度 ±{fmt(tol, 3)}%"],
        [{"label": "阻值", "value": eng(val, "Ω")},
         {"label": "精度", "value": f"±{fmt(tol, 3)}%"}],
        ["色环读数从靠近端部的一侧开始；金色/银色通常表示倍率或精度。"],
    )


def calc_cap_code(text: str) -> dict:
    m = re.search(r"(?<![\d.])(\d{3})(?![\d.])", text)
    val_pf = None
    if m:
        code = m.group(1)
        val_pf = int(code[:2]) * (10 ** int(code[2]))
    else:
        m = re.search(r"(?<![\d.])(\d+)([pnuµm])(\d+)(?![\d.])", text, re.I)
        if m:
            val_pf = float(m.group(1) + "." + m.group(3)) * {
                "p": 1, "n": 1e3, "u": 1e6, "µ": 1e6, "m": 1e9
            }[m.group(2).lower()]
    if val_pf is None:
        return fail("请给出电容代码，例如：104、223、4n7。")
    return result(
        "电容代码", "工具", f"{eng(val_pf * 1e-12, 'F')}",
        "前两位为有效数字，第三位为 10 的幂（单位 pF）",
        [f"{val_pf:g} pF", f"= {eng(val_pf * 1e-12, 'F')}"],
        [{"label": "电容值", "value": eng(val_pf * 1e-12, "F")},
         {"label": "pF", "value": f"{val_pf:g} pF"}],
        ["三位代码的单位是 pF；例如 104 = 10×10⁴ pF = 100nF。"],
    )


def calc_convert(text: str, qs: list[Q]) -> dict | None:
    m = re.search(
        r"(?:(?<![A-Za-z])(?:多少|等于|to|in))\s*([pnuµmkKMGT]?)\s*(Hz|F|Ω|H|V|A|W)(?![A-Za-z])",
        text,
        re.I,
    )
    if not m:
        return None
    target_prefix, unit = m.group(1), _norm_unit(m.group(2))
    source = next((q for q in qs if q.unit == unit), None)
    if not source and unit == "Ω":
        rs = resistances(qs)
        source = rs[0] if rs else None
    if not source:
        return None
    target_mult = PREFIX.get(target_prefix, 1.0)
    val = source.si / target_mult
    shown_prefix = "µ" if target_prefix == "u" else target_prefix
    return result(
        "单位换算", "工具", f"{eng(source.si, unit)} = {fmt(val, 6)} {shown_prefix}{unit}",
        "同一物理量，仅改变 SI 前缀",
        [f"{eng(source.si, unit)}", f"= {fmt(val, 6)} {shown_prefix}{unit}"],
        [{"label": "原值", "value": eng(source.si, unit)},
         {"label": "换算值", "value": f"{fmt(val, 6)} {shown_prefix}{unit}"}],
    )


# ---------------------------------------------------------------------------
# 路由
# ---------------------------------------------------------------------------

def calculate(query: str) -> dict:
    text = (query or "").strip()
    if not text:
        return fail("请输入一个电子技术计算问题。")
    low = text.lower()
    qs = scan(text)
    rs = resistances(qs)

    if any(k in low for k in ("帮助", "help", "怎么用", "示例")):
        return {
            "ok": True,
            "title": "VOLT 使用说明",
            "category": "帮助",
            "summary": "直接描述电路参数和想求的量，我会选择公式并给出步骤。",
            "formula": "示例：5V 100Ω 电流 / 12V 10k 4.7k 分压 / RC 1k 100nF 截止频率",
            "steps": [
                "支持 10k、4.7uF、20mA、10°C、1oz 这类写法。",
                "可计算：欧姆定律、功率、串并联、分压、LED、RC/RL、容抗/感抗、谐振、555、运放、三极管、PCB 线宽、电池续航、稳压器、dB、色环、电容代码。",
            ],
            "values": [],
            "notes": ["结果按理想元件计算；工程选型请留余量并复核。"],
            "followups": ["5V 100Ω 电流", "12V 10k 4.7k 分压", "PCB 2A 10°C 1oz 线宽"],
        }

    # 工具类优先，避免被通用欧姆定律截走
    if any(k in text for k in ("色环", "颜色环")) or "color code" in low:
        return calc_color_code(text)
    if ("电容" in text or "capacitor" in low) and (
        "代码" in text
        or re.search(r"(?<![\d.])\d{3}(?![\d.])", text)
        or re.search(r"(?<![\d.])\d+[pnuµm]\d+(?![\d.])", text, re.I)
    ):
        # 纯单位换算优先
        conv = calc_convert(text, qs)
        if conv:
            return conv
        return calc_cap_code(text)
    conv = calc_convert(text, qs)
    if conv:
        return conv
    if "db" in low or "分贝" in text:
        return calc_db(text, qs)
    if "555" in text:
        return calc_555(text, qs)
    if any(k in low for k in ("运放", "opamp", "op-amp", "op amp", "放大器")):
        return calc_opamp(text, qs)
    if any(k in low for k in ("三极管", "bjt", "基极", "偏置", "transistor")):
        return calc_bjt(text, qs)
    if any(k in low for k in ("pcb", "走线", "线宽", "trace")):
        return calc_pcb_trace(text, qs)
    if any(k in low for k in ("电池", "续航", "mah", "电量", "battery")):
        return calc_battery(text, qs)
    if any(k in low for k in ("稳压", "7805", "ldo", "lm317", "regulator")):
        return calc_regulator(text, qs)
    if "led" in low or "发光二极管" in text:
        return calc_led(text, qs)
    if (
        "分压" in text
        or "divider" in low
        or ("输出电压" in text and len(rs) >= 2)
        or ("vout" in low and len(rs) >= 2)
    ):
        return calc_divider(text, qs)
    if "谐振" in text or "resonance" in low:
        return calc_resonance(text, qs)
    if any(k in low for k in ("容抗", "感抗", "阻抗", "xc", "xl", "reactance", "impedance")):
        return calc_reactance(text, qs)
    if any(k in low for k in ("rc", "rl", "cutoff", "low-pass", "high-pass", "lowpass", "highpass")):
        return calc_rc_rl(text, qs)
    if any(k in low for k in ("串联", "并联", "series", "parallel")):
        return calc_series_parallel(text, qs)
    if rs and (any(k in text for k in ("电阻", "Ω", "欧")) or first(qs, "V") or first(qs, "A")):
        # 只有电阻、没有电压/电流/功率时，默认按串并联处理
        if (first(qs, "V") or first(qs, "A") or first(qs, "W")):
            return calc_ohm(text, qs)
        if len(rs) >= 2:
            return calc_series_parallel(text, qs)
    if first(qs, "V") or first(qs, "A") or first(qs, "W"):
        return calc_ohm(text, qs)

    # 宽松回退：只给元件和频率/参数，也尽量推断意图
    if first(qs, "F") and first(qs, "Hz"):
        return calc_reactance(text, qs)
    if first(qs, "H") and first(qs, "Hz"):
        return calc_reactance(text, qs)
    if first(qs, "H") and first(qs, "F"):
        return calc_resonance(text, qs)
    if rs and first(qs, "F"):
        return calc_rc_rl(text, qs)
    if rs and first(qs, "H"):
        return calc_rc_rl(text, qs)

    return fail(
        "没有识别出要计算的类型。可以换一种说法，或直接给“数值 + 单位 + 求什么”。",
        ["5V 100Ω 电流", "两个 10k 电阻并联", "100nF 50Hz 容抗", "555 10k 10k 100nF 频率"],
    )


def examples() -> list[dict]:
    return [
        {"group": "直流基础", "items": [
            "5V 100Ω 电流和功率",
            "两个 10k 电阻并联",
            "12V 10k 4.7k 分压",
            "5V 红色 LED 20mA 限流电阻",
        ]},
        {"group": "交流与滤波", "items": [
            "RC 1k 100nF 截止频率",
            "100nF 50Hz 容抗",
            "10mH 1kHz 感抗",
            "10uH 100nF 谐振频率",
        ]},
        {"group": "器件与数字", "items": [
            "555 10k 10k 100nF 频率",
            "运放 反相 10k 100k 增益",
            "三极管 12V 100k hFE=100",
            "7805 12V 5V 0.5A 功耗",
        ]},
        {"group": "工程工具", "items": [
            "PCB 2A 10°C 1oz 外层 线宽",
            "2000mAh 100mA 续航",
            "20dB 功率比",
            "棕黑红金 色环",
        ]},
    ]
