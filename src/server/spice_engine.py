#!/usr/bin/env python3
"""
NASA/JPL NAIF SPICE Ephemeris Engine (SpiceyPy / CSPICE).

Runs exclusively on the backend (never in browser/frontend).
Supports:
  - Persistent JSON-lines daemon mode (`--daemon`) for zero-overhead kernel reuse
  - One-shot CLI health & coverage inspection (`--health`)
  - One-shot CLI ephemeris calculation (`--compute` reading JSON from stdin)
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
import os
import sys
from typing import Any

REQUIRED_KERNELS = [
    ("naif0012.tls", "lsk", "Leap Seconds Kernel (UTC -> TDB/ET)"),
    ("pck00011.tpc", "pck", "Planetary Constants Kernel (body radii)"),
    ("moon_de440_250416.tf", "fk", "Lunar DE440 Reference Frame Kernel (MOON_PA / MOON_ME)"),
    ("moon_assoc_me.tf", "fk", "Lunar Frame-Body Association Kernel (Moon -> MOON_ME)"),
    ("moon_pa_de440_200625.bpc", "bpc", "Binary Lunar Orientation PCK (DE440 PA)"),
    ("de440s.bsp", "spk", "JPL DE440 Short-Span Planetary & Lunar Ephemeris SPK"),
]

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_KERNELS_DIR = os.path.join(ROOT_DIR, "kernels")

_SPICE_STATE: dict[str, Any] | None = None


def _parse_iso_ms(iso_str: str) -> int:
    s = iso_str.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return int(round(dt.timestamp() * 1000))


def _ms_to_iso_z(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _et_to_iso_z(spice: Any, et: float) -> str:
    return spice.et2utc(et, "ISOC", 0) + "Z"


def init_spice(kernels_dir: str | None = None) -> dict[str, Any]:
    global _SPICE_STATE
    if _SPICE_STATE is not None and _SPICE_STATE.get("available"):
        return _SPICE_STATE

    kdir = os.path.abspath(kernels_dir or os.environ.get("SPICE_KERNELS_DIR") or DEFAULT_KERNELS_DIR)
    missing: list[str] = []
    for fname, _, _ in REQUIRED_KERNELS:
        fpath = os.path.join(kdir, fname)
        if not os.path.isfile(fpath) or os.path.getsize(fpath) == 0:
            missing.append(fname)

    if missing:
        state = {
            "available": False,
            "toolkit": None,
            "spiceypy_version": None,
            "kernels_dir": kdir,
            "loaded_kernels": [],
            "missing_kernels": missing,
            "coverage_start_utc": None,
            "coverage_end_utc": None,
            "coverage_start_et": None,
            "coverage_end_et": None,
            "frame": "MOON_ME",
            "abcorr": "LT+S",
            "error": f"Missing required SPICE kernels in {kdir}: {', '.join(missing)}",
        }
        _SPICE_STATE = state
        return state

    try:
        import spiceypy as spice  # type: ignore

        spice.kclear()
        loaded_kernels: list[dict[str, Any]] = []
        for fname, ktype, role in REQUIRED_KERNELS:
            fpath = os.path.join(kdir, fname)
            spice.furnsh(fpath)
            loaded_kernels.append(
                {
                    "filename": fname,
                    "type": ktype,
                    "role": role,
                    "size_bytes": os.path.getsize(fpath),
                }
            )

        spk_path = os.path.join(kdir, "de440s.bsp")
        bpc_path = os.path.join(kdir, "moon_pa_de440_200625.bpc")

        # Verify actual SPK coverage for Sun (10), Earth (399), Moon (301) and PCK frame 31008
        start_ets: list[float] = []
        end_ets: list[float] = []
        for body_id in (10, 399, 301):
            cov = spice.spkcov(spk_path, body_id)
            iv_start, iv_end = spice.wnfetd(cov, 0)
            start_ets.append(float(iv_start))
            end_ets.append(float(iv_end))

        pck_cov = spice.pckcov(bpc_path, 31008)
        pck_start, pck_end = spice.wnfetd(pck_cov, 0)
        start_ets.append(float(pck_start))
        end_ets.append(float(pck_end))

        eff_start_et = max(start_ets)
        eff_end_et = min(end_ets)

        moon_radii = [float(x) for x in spice.bodvrd("MOON", "RADII", 3)[1]]
        sun_radii = [float(x) for x in spice.bodvrd("SUN", "RADII", 3)[1]]

        # Attach per-kernel coverage metadata dynamically
        spk_window = f"{_et_to_iso_z(spice, max(start_ets[:3]))} -> {_et_to_iso_z(spice, min(end_ets[:3]))}"
        bpc_window = f"{_et_to_iso_z(spice, float(pck_start))} -> {_et_to_iso_z(spice, float(pck_end))}"
        for entry in loaded_kernels:
            if entry["filename"] == "de440s.bsp":
                entry["coverage"] = spk_window
            elif entry["filename"] == "moon_pa_de440_200625.bpc":
                entry["coverage"] = bpc_window
            else:
                entry["coverage"] = "Time-invariant / full kernel span"

        state = {
            "available": True,
            "toolkit": str(spice.tkvrsn("TOOLKIT")),
            "spiceypy_version": str(spice.__version__),
            "kernels_dir": kdir,
            "loaded_kernels": loaded_kernels,
            "missing_kernels": [],
            "coverage_start_utc": _et_to_iso_z(spice, eff_start_et),
            "coverage_end_utc": _et_to_iso_z(spice, eff_end_et),
            "coverage_start_et": eff_start_et,
            "coverage_end_et": eff_end_et,
            "moon_radii_km": moon_radii,
            "sun_radius_km": sun_radii[0],
            "frame": "MOON_ME",
            "abcorr": "LT+S",
            "error": None,
        }
        _SPICE_STATE = state
        return state
    except Exception as exc:
        state = {
            "available": False,
            "toolkit": None,
            "spiceypy_version": None,
            "kernels_dir": kdir,
            "loaded_kernels": [],
            "missing_kernels": [],
            "coverage_start_utc": None,
            "coverage_end_utc": None,
            "coverage_start_et": None,
            "coverage_end_et": None,
            "frame": "MOON_ME",
            "abcorr": "LT+S",
            "error": f"Failed to initialize SpiceyPy/CSPICE: {exc}",
        }
        _SPICE_STATE = state
        return state


def get_health_summary() -> dict[str, Any]:
    state = init_spice()
    return {k: v for k, v in state.items() if k not in ("coverage_start_et", "coverage_end_et")}


def compute_ephemeris(req: dict[str, Any]) -> dict[str, Any]:
    state = init_spice()
    if not state.get("available"):
        raise RuntimeError(state.get("error") or "SPICE backend is unavailable.")

    import spiceypy as spice  # type: ignore

    lat_deg = float(req["latitude_deg"])
    lon_deg = float(req["longitude_deg"])
    observer_height_m = float(req.get("observer_height_m", 2.0))
    start_iso = str(req["start_iso"])
    end_iso = str(req["end_iso"])
    step_minutes = int(round(float(req["step_minutes"])))

    if not (-90.0 <= lat_deg <= 90.0):
        raise ValueError(f"Latitude out of range [-90, 90]: {lat_deg}")
    if step_minutes < 1:
        raise ValueError(f"step_minutes must be >= 1: {step_minutes}")

    start_ms = _parse_iso_ms(start_iso)
    end_ms = _parse_iso_ms(end_iso)
    if end_ms <= start_ms:
        raise ValueError("end_iso must be strictly after start_iso")

    step_ms = step_minutes * 60_000
    max_samples = int(req.get("max_samples", 2000))

    times_iso: list[str] = []
    cur_ms = start_ms
    while cur_ms < end_ms or len(times_iso) == 0:
        times_iso.append(_ms_to_iso_z(cur_ms))
        if len(times_iso) > max_samples:
            raise ValueError(f"Requested samples exceed maximum limit ({max_samples}).")
        cur_ms += step_ms
        if cur_ms >= end_ms:
            break

    # Verify strict kernel coverage before computing
    ets = [float(spice.str2et(ts[:-1])) for ts in times_iso]
    cov_start = float(state["coverage_start_et"])
    cov_end = float(state["coverage_end_et"])
    if ets[0] < cov_start or ets[-1] > cov_end:
        raise LookupError(
            f"Requested UTC window ({times_iso[0]} to {times_iso[-1]}) lies outside bundled SPICE DE440s kernel coverage "
            f"({state['coverage_start_utc']} to {state['coverage_end_utc']})."
        )

    radii = state["moon_radii_km"]
    re_km = float(radii[0])
    rp_km = float(radii[2])
    flattening = (re_km - rp_km) / re_km
    obs_h_km = max(0.0, observer_height_m) / 1000.0
    obspos = spice.georec(math.radians(lon_deg), math.radians(lat_deg), obs_h_km, re_km, flattening)

    sun_az: list[float] = []
    sun_el: list[float] = []
    sun_dist: list[float] = []
    earth_az: list[float] = []
    earth_el: list[float] = []
    earth_dist: list[float] = []

    for et in ets:
        # azccw=False -> clockwise from local North (matches JPL Horizons QUANTITIES=4)
        # elplsz=True  -> positive elevation above local tangent horizon
        # abcorr="LT+S" -> apparent astrometric + stellar aberration (matches APPARENT=AIRLESS)
        s_azl, _ = spice.azlcpo(
            "ELLIPSOID", "SUN", et, "LT+S", False, True, obspos, "MOON", "MOON_ME"
        )
        e_azl, _ = spice.azlcpo(
            "ELLIPSOID", "EARTH", et, "LT+S", False, True, obspos, "MOON", "MOON_ME"
        )

        sun_dist.append(round(float(s_azl[0]), 1))
        sun_az.append(round((math.degrees(float(s_azl[1])) % 360.0), 4) % 360.0)
        sun_el.append(round(math.degrees(float(s_azl[2])), 4))

        earth_dist.append(round(float(e_azl[0]), 1))
        earth_az.append(round((math.degrees(float(e_azl[1])) % 360.0), 4) % 360.0)
        earth_el.append(round(math.degrees(float(e_azl[2])), 4))

    return {
        "timesIso": times_iso,
        "sun": {
            "azimuthDeg": sun_az,
            "elevationDeg": sun_el,
            "distanceKm": sun_dist,
        },
        "earth": {
            "azimuthDeg": earth_az,
            "elevationDeg": earth_el,
            "distanceKm": earth_dist,
        },
        "metadata": {
            "toolkit": state["toolkit"],
            "spiceypy_version": state["spiceypy_version"],
            "frame": "MOON_ME",
            "abcorr": "LT+S",
            "ephemeris": "DE440 (de440s.bsp + moon_pa_de440_200625.bpc)",
            "kernels": [k["filename"] for k in state["loaded_kernels"]],
        },
    }


def _handle_message(msg: dict[str, Any]) -> dict[str, Any]:
    req_id = msg.get("id")
    action = msg.get("action")
    try:
        if action == "health":
            return {"id": req_id, "ok": True, "result": get_health_summary()}
        if action == "compute":
            result = compute_ephemeris(msg.get("payload") or {})
            return {"id": req_id, "ok": True, "result": result}
        return {"id": req_id, "ok": False, "error": f"Unknown SPICE action: {action}", "code": "BAD_ACTION"}
    except LookupError as exc:
        return {"id": req_id, "ok": False, "error": str(exc), "code": "OUT_OF_COVERAGE"}
    except Exception as exc:
        return {"id": req_id, "ok": False, "error": str(exc), "code": "SPICE_ERROR"}


def run_daemon() -> int:
    # Initialize kernels once at worker startup
    init_spice()
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            resp = {"id": None, "ok": False, "error": f"Invalid JSON request: {exc}", "code": "BAD_JSON"}
        else:
            resp = _handle_message(msg)
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="NASA/JPL NAIF SPICE Ephemeris Engine")
    parser.add_argument("--health", action="store_true", help="Print SPICE health & kernel coverage JSON")
    parser.add_argument("--compute", action="store_true", help="Read JSON params on stdin and output ephemeris")
    parser.add_argument("--daemon", action="store_true", help="Run persistent JSON-lines stdin/stdout worker")
    args = parser.parse_args()

    if args.daemon:
        return run_daemon()
    if args.health:
        health = get_health_summary()
        print(json.dumps(health, indent=2))
        return 0 if health.get("available") else 1
    if args.compute:
        payload = json.load(sys.stdin)
        print(json.dumps(compute_ephemeris(payload)))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
