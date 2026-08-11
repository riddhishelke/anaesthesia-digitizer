from collections import deque
import re
import statistics
from typing import Any, Dict, List, Optional, Union

# In-memory rolling history for last 5 valid readings per field_type
_history: Dict[str, List[Union[int, float, str]]] = {}


def get_smoothed_value(field_type: str, new_value: Any) -> Optional[Union[int, float, str]]:
    """
    Maintains a rolling history of the last 5 valid readings per field_type
    and returns the median of the current history.

    - Adds new_value to history if it is not None.
    - Keeps only the last 5 entries.
    - Returns the median of the current history (using statistics.median).
    - If history is empty, returns new_value as-is (or None if new_value is None).
    """
    if field_type not in _history:
        _history[field_type] = []

    history = _history[field_type]

    if new_value is not None:
        history.append(new_value)
        if len(history) > 5:
            _history[field_type] = history[-5:]
            history = _history[field_type]

    if not history:
        return new_value

    if field_type == "blood_pressure":
        systolics = []
        diastolics = []
        for item in history:
            if isinstance(item, str):
                match = re.match(r"^(\d+)/(\d+)$", item.strip())
                if match:
                    systolics.append(int(match.group(1)))
                    diastolics.append(int(match.group(2)))
        if systolics and diastolics:
            med_sys = int(round(statistics.median(systolics)))
            med_dia = int(round(statistics.median(diastolics)))
            return f"{med_sys}/{med_dia}"
        return new_value

    try:
        med = statistics.median(history)
        if all(isinstance(x, int) for x in history):
            return int(round(med))
        return med
    except Exception:
        return new_value


def reset_history():
    """Clears history dictionary (mainly for testing/resetting state)."""
    _history.clear()
