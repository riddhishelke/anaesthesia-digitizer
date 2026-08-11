import re
from typing import Any, Dict, Optional, Tuple, Union

try:
    from database import create_case, end_case, get_active_case, save_reading
except ImportError:
    from backend.database import create_case, end_case, get_active_case, save_reading

# In-memory counters for consecutive good and stale cycles
_good_cycles_count: int = 0
_stale_cycles_count: int = 0


def reset_counters():
    """Resets in-memory cycle counters (mainly for testing)."""
    global _good_cycles_count, _stale_cycles_count
    _good_cycles_count = 0
    _stale_cycles_count = 0


def _parse_reading_values(readings_dict: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """Helper to extract numeric values from both flat and nested cycle readings dict."""
    extracted = {
        "heart_rate": None,
        "spo2": None,
        "bp_systolic": None,
        "bp_diastolic": None,
        "etco2": None
    }

    # 1. Parse flat format (e.g. {"heart_rate": 78, "bp_systolic": 120, ...})
    for key in ["heart_rate", "spo2", "bp_systolic", "bp_diastolic", "etco2"]:
        val = readings_dict.get(key)
        if val is not None and not isinstance(val, dict):
            try:
                extracted[key] = float(val)
            except (ValueError, TypeError):
                pass

    # 2. Parse nested dict format fallback
    hr_item = readings_dict.get("heart_rate")
    if isinstance(hr_item, dict) and hr_item.get("status") == "ok":
        val = hr_item.get("smoothed_value") if hr_item.get("smoothed_value") is not None else hr_item.get("raw_value")
        if val is not None:
            try:
                extracted["heart_rate"] = float(val)
            except (ValueError, TypeError):
                pass

    spo2_item = readings_dict.get("spo2")
    if isinstance(spo2_item, dict) and spo2_item.get("status") == "ok":
        val = spo2_item.get("smoothed_value") if spo2_item.get("smoothed_value") is not None else spo2_item.get("raw_value")
        if val is not None:
            try:
                extracted["spo2"] = float(val)
            except (ValueError, TypeError):
                pass

    etco2_item = readings_dict.get("etco2")
    if isinstance(etco2_item, dict) and etco2_item.get("status") == "ok":
        val = etco2_item.get("smoothed_value") if etco2_item.get("smoothed_value") is not None else etco2_item.get("raw_value")
        if val is not None:
            try:
                extracted["etco2"] = float(val)
            except (ValueError, TypeError):
                pass

    bp_item = readings_dict.get("blood_pressure")
    if isinstance(bp_item, dict) and bp_item.get("status") == "ok":
        val = bp_item.get("smoothed_value") if bp_item.get("smoothed_value") is not None else bp_item.get("raw_value")
        if isinstance(val, str):
            match = re.match(r"^(\d+)/(\d+)$", val.strip())
            if match:
                try:
                    extracted["bp_systolic"] = float(match.group(1))
                    extracted["bp_diastolic"] = float(match.group(2))
                except (ValueError, TypeError):
                    pass

    return extracted


def process_cycle(readings_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Processes a monitoring cycle dictionary containing field results.

    - Increments good_cycles if >= 2 fields are valid
    - Increments stale_cycles if 0 fields are valid (all unreadable/error)
    - Resets opposing counters accordingly

    Rule Actions:
    - If no active case AND 3 consecutive good cycles -> create_case(), return 'case_started'
    - If active case AND 5 consecutive stale cycles -> end_case(), return 'case_ended'
    - If active case AND readings normal -> save_reading(), return 'recording'
    - Otherwise -> return 'waiting'
    """
    global _good_cycles_count, _stale_cycles_count

    vals = _parse_reading_values(readings_dict)

    # Count valid fields (HR, SpO2, Blood Pressure, EtCO2)
    ok_count = 0
    if vals["heart_rate"] is not None:
        ok_count += 1
    if vals["spo2"] is not None:
        ok_count += 1
    if vals["bp_systolic"] is not None and vals["bp_diastolic"] is not None:
        ok_count += 1
    if vals["etco2"] is not None:
        ok_count += 1

    # Update consecutive counters
    if ok_count >= 2:
        _good_cycles_count += 1
        _stale_cycles_count = 0
    elif ok_count == 0:
        _stale_cycles_count += 1
        _good_cycles_count = 0
    else:
        # 1 field ok
        _good_cycles_count = 0
        _stale_cycles_count = 0

    active_case_id = get_active_case()

    # Rule Evaluation: Start case instantly on 1 good cycle for instant demo feedback
    if active_case_id is None and _good_cycles_count >= 1:
        new_case_id = create_case()
        _good_cycles_count = 0
        _stale_cycles_count = 0

        # Save the current reading for the new case
        save_reading(
            new_case_id,
            heart_rate=vals["heart_rate"],
            spo2=vals["spo2"],
            bp_systolic=vals["bp_systolic"],
            bp_diastolic=vals["bp_diastolic"],
            etco2=vals["etco2"]
        )

        return {
            "status": "case_started",
            "case_id": new_case_id,
            "message": "Case Started — Recording"
        }

    if active_case_id is not None and _stale_cycles_count >= 5:
        ended_case_id = active_case_id
        end_case(ended_case_id)
        _good_cycles_count = 0
        _stale_cycles_count = 0

        return {
            "status": "case_ended",
            "case_id": ended_case_id,
            "message": "Case Ended"
        }

    if active_case_id is not None:
        save_reading(
            active_case_id,
            heart_rate=vals["heart_rate"],
            spo2=vals["spo2"],
            bp_systolic=vals["bp_systolic"],
            bp_diastolic=vals["bp_diastolic"],
            etco2=vals["etco2"]
        )

        return {
            "status": "recording",
            "case_id": active_case_id,
            "message": "Case Started — Recording"
        }

    return {
        "status": "waiting",
        "case_id": None,
        "message": "Waiting for stable signal"
    }
