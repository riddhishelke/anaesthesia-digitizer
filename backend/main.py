import base64
import os
import re
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

try:
    from validation import validate_reading
    from smoothing import get_smoothed_value
    from database import init_db, get_case_readings, get_active_case
    from case_manager import process_cycle
    from report_generator import generate_report_html, generate_report_pdf
    from preprocessing import preprocess_image, is_frame_too_bad
except ImportError:
    from backend.validation import validate_reading
    from backend.smoothing import get_smoothed_value
    from backend.database import init_db, get_case_readings, get_active_case
    from backend.case_manager import process_cycle
    from backend.report_generator import generate_report_html, generate_report_pdf
    from backend.preprocessing import preprocess_image, is_frame_too_bad

load_dotenv()

app = FastAPI()

@app.on_event("startup")
def startup_event():
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROMPTS = {
    "heart_rate": (
        "This image shows a heart rate reading from a medical monitor display, typically "
        "a number between 30 and 250. Respond with ONLY the numeric value you see, no "
        "other text. If you cannot clearly read a number, respond with exactly: unreadable"
    ),
    "spo2": (
        "This image shows an SpO2 reading from a medical monitor display, typically "
        "a percentage between 70 and 100. Respond with ONLY the numeric value you see, no "
        "other text. If you cannot clearly read a number, respond with exactly: unreadable"
    ),
    "blood_pressure": (
        "This image shows a blood pressure reading from a medical monitor display, typically "
        "in systolic/diastolic format like 120/80 (numbers between 40 and 250). Respond with "
        "ONLY the systolic/diastolic reading in that format (e.g., 120/80), no other text. "
        "If you cannot clearly read a number, respond with exactly: unreadable"
    ),
    "etco2": (
        "This image shows an EtCO2 reading from a medical monitor display, typically "
        "a number between 10 and 60. Respond with ONLY the numeric value you see, no "
        "other text. If you cannot clearly read a number, respond with exactly: unreadable"
    ),
}

MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/read-value")
async def read_value(
    file: UploadFile = File(...),
    field_type: str = Form(...)
):
    # 1. Input validation: field_type
    if field_type not in PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field_type '{field_type}'. Must be one of: {list(PROMPTS.keys())}"
        )

    # 2. Input validation: image file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file must be an image."
        )

    # 3. Input validation: file size (max 2MB)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds maximum limit of 2MB."
        )

    # 4. Image Quality Pre-check: Skip AI call if severe glare or camera obstruction
    if is_frame_too_bad(contents):
        smoothed = get_smoothed_value(field_type, None)
        return {"raw_value": None, "smoothed_value": smoothed, "status": "bad_frame"}

    # 5. OpenAI Vision API processing
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or api_key == "your_key_here":
            smoothed = get_smoothed_value(field_type, None)
            return {"raw_value": None, "smoothed_value": smoothed, "status": "error"}

        # Preprocess crop image for optimal vision AI clarity (grayscale, autocontrast, sharpening)
        processed_contents = preprocess_image(contents)

        client = OpenAI(api_key=api_key)
        base64_image = base64.b64encode(processed_contents).decode("utf-8")
        media_type = "image/jpeg"

        prompt = PROMPTS[field_type]

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{base64_image}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=50,
        )

        raw_result = response.choices[0].message.content.strip()
        clean_result = raw_result.lower()

        if "unreadable" in clean_result or not clean_result:
            smoothed = get_smoothed_value(field_type, None)
            return {"raw_value": None, "smoothed_value": smoothed, "status": "unreadable"}

        if field_type == "blood_pressure":
            match = re.search(r"(\d{2,3}\s*/\s*\d{2,3})", raw_result)
            if match:
                extracted_val = match.group(1).replace(" ", "")
            else:
                smoothed = get_smoothed_value(field_type, None)
                return {"raw_value": None, "smoothed_value": smoothed, "status": "unreadable"}
        else:
            match = re.search(r"(\d+(?:\.\d+)?)", raw_result)
            if match:
                num_str = match.group(1)
                extracted_val = float(num_str) if "." in num_str else int(num_str)
            else:
                smoothed = get_smoothed_value(field_type, None)
                return {"raw_value": None, "smoothed_value": smoothed, "status": "unreadable"}

        validated_val = validate_reading(field_type, extracted_val)
        if validated_val is None:
            smoothed = get_smoothed_value(field_type, None)
            return {"raw_value": None, "smoothed_value": smoothed, "status": "invalid_range"}

        smoothed_val = get_smoothed_value(field_type, validated_val)
        return {"raw_value": validated_val, "smoothed_value": smoothed_val, "status": "ok"}

    except Exception:
        smoothed = get_smoothed_value(field_type, None)
        return {"raw_value": None, "smoothed_value": smoothed, "status": "error"}


@app.post("/process-cycle")
async def process_monitoring_cycle(payload: dict):
    readings = payload.get("readings", payload)
    return process_cycle(readings)


@app.get("/case/{case_id}/readings")
def get_readings_for_case(case_id: str):
    readings = get_case_readings(case_id)
    return {"case_id": case_id, "readings": readings}


@app.get("/active-case")
def get_current_active_case():
    case_id = get_active_case()
    return {"case_id": case_id}


@app.get("/case/{case_id}/report")
def get_case_report_pdf(case_id: str):
    filename = f"anaesthesia_report_{case_id}.pdf"
    pdf_bytes = generate_report_pdf(case_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


