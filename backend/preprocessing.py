import io
from PIL import Image, ImageFilter, ImageOps


def is_frame_too_bad(image_bytes: bytes) -> bool:
    """
    Quick image quality check to detect severe glare or camera obstruction.
    Returns True if the frame is too bad to process, False otherwise.

    Criteria:
    - Near-white glare (> 240 brightness) > 40% of total pixels -> Bad frame (severe glare)
    - Near-black dark (< 15 brightness) > 90% of total pixels -> Bad frame (obstructed camera)
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("L")
        histogram = img.histogram()
        total_pixels = sum(histogram)

        if total_pixels == 0:
            return True

        near_white_count = sum(histogram[241:])
        near_black_count = sum(histogram[:15])

        white_ratio = near_white_count / total_pixels
        black_ratio = near_black_count / total_pixels

        if white_ratio > 0.40:
            return True

        if black_ratio > 0.90:
            return True

        return False
    except Exception as e:
        print(f"Quality check warning: {e}")
        return False


def preprocess_image(image_bytes: bytes) -> bytes:
    """
    Improves image quality of medical monitor display crops before sending to OpenAI Vision API:
    1. Loads image with Pillow
    2. Converts to grayscale ('L')
    3. Applies contrast enhancement via ImageOps.autocontrast
    4. Applies mild sharpening via ImageFilter.SHARPEN
    5. Returns processed image as bytes
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))

        # 1. Convert to grayscale
        img = img.convert("L")

        # 2. Apply autocontrast
        img = ImageOps.autocontrast(img)

        # 3. Apply sharpen filter
        img = img.filter(ImageFilter.SHARPEN)

        # 4. Save processed image to bytes buffer
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=95)
        return buffer.getvalue()
    except Exception as e:
        print(f"Preprocessing warning: {e}, using raw image bytes.")
        return image_bytes
