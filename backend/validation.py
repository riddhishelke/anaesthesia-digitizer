import re
from typing import Any, Optional, Union


def validate_reading(field_type: str, value: Any) -> Optional[Union[int, float, str]]:
    """
    Validates if a reading is physiologically plausible.

    Ranges:
    - heart_rate: 30 to 250
    - spo2: 50 to 100
    - etco2: 10 to 80
    - blood_pressure: "systolic/diastolic" where 60 <= systolic <= 250,
      30 <= diastolic <= 150, and systolic > diastolic.

    Returns the valid value if plausible, otherwise returns None.
    """
    if value is None:
        return None

    if field_type == "heart_rate":
        try:
            val = float(value)
            if 30 <= val <= 250:
                return value
        except (ValueError, TypeError):
            return None
        return None

    elif field_type == "spo2":
        try:
            val = float(value)
            if 50 <= val <= 100:
                return value
        except (ValueError, TypeError):
            return None
        return None

    elif field_type == "etco2":
        try:
            val = float(value)
            if 10 <= val <= 80:
                return value
        except (ValueError, TypeError):
            return None
        return None

    elif field_type == "blood_pressure":
        if not isinstance(value, str):
            return None
        match = re.match(r"^(\d{2,3})\s*/\s*(\d{2,3})$", value.strip())
        if not match:
            return None
        try:
            systolic = int(match.group(1))
            diastolic = int(match.group(2))
        except ValueError:
            return None

        if 60 <= systolic <= 250 and 30 <= diastolic <= 150 and systolic > diastolic:
            return f"{systolic}/{diastolic}"
        return None

    return None
