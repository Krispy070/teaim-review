import os
import magic
import tempfile
import subprocess
import shutil
from pypdf import PdfReader
from docx import Document
# import mailparser  # Commented out due to dependency issues
from typing import Tuple, Optional

# OCR dependencies
try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print("Warning: OCR libraries not available. Image processing will be disabled.")

def extract_text_from_file(file_path: str, content_type: str) -> Tuple[str, Optional[str]]:
    """
    Extract text from various file formats
    Returns (extracted_text, error_message)
    """
    try:
        # Verify content type with python-magic
        detected_type = magic.from_file(file_path, mime=True)
        
        if content_type == "application/pdf" or detected_type == "application/pdf":
            # Use OCR-enhanced PDF extraction if available
            if OCR_AVAILABLE:
                return extract_pdf_text_with_ocr(file_path), None
            else:
                return extract_pdf_text(file_path), None
        elif content_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
                             "application/msword"] or "word" in detected_type:
            return extract_docx_text(file_path), None
        elif content_type == "message/rfc822" or detected_type == "message/rfc822":
            return extract_eml_text(file_path), None
        elif content_type == "text/plain" or detected_type.startswith("text/"):
            return extract_txt_text(file_path), None
        elif content_type == "text/vtt":
            return extract_vtt_text(file_path), None
        elif is_image_type(content_type) or is_image_type(detected_type):
            if OCR_AVAILABLE:
                return extract_image_text_ocr(file_path), None
            else:
                return "", "OCR not available for image processing"
        else:
            return "", f"Unsupported file type: {content_type} (detected: {detected_type})"
    except Exception as e:
        return "", f"Error extracting text: {str(e)}"

def extract_pdf_text(file_path: str) -> str:
    """Extract text from PDF file"""
    text = ""
    with open(file_path, 'rb') as file:
        reader = PdfReader(file)
        for page in reader.pages:
            # Handle None return values from page.extract_text()
            page_text = page.extract_text() or ""
            text += page_text + "\n"
    return text.strip()

def extract_docx_text(file_path: str) -> str:
    """Extract text from DOCX file"""
    doc = Document(file_path)
    text = ""
    for paragraph in doc.paragraphs:
        text += paragraph.text + "\n"
    return text.strip()

def extract_eml_text(file_path: str) -> str:
    """Extract text from EML email file (simplified version without mailparser)"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
            content = file.read()
        
        # Simple text extraction - just return the content for now
        # In a production system, you'd want proper email parsing
        return content.strip()
    except Exception as e:
        return f"Error reading email file: {str(e)}"

def extract_txt_text(file_path: str) -> str:
    """Extract text from plain text file"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
        return file.read().strip()

def extract_vtt_text(file_path: str) -> str:
    """Extract text from VTT subtitle file"""
    text = ""
    with open(file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()
        
    for line in lines:
        line = line.strip()
        # Skip VTT headers, timestamps, and empty lines
        if (line.startswith("WEBVTT") or 
            "-->" in line or 
            line.startswith("NOTE") or 
            not line):
            continue
        text += line + " "
    
    return text.strip()

def is_image_type(content_type: str) -> bool:
    """Check if content type is an image format supported by OCR"""
    if not content_type:
        return False
    
    image_types = [
        "image/jpeg", "image/jpg", "image/png", "image/tiff", "image/tif",
        "image/bmp", "image/gif", "image/webp"
    ]
    return any(img_type in content_type.lower() for img_type in image_types)

def extract_image_text_ocr(file_path: str) -> str:
    """Extract text from image file using OCR"""
    if not OCR_AVAILABLE:
        return ""
    
    try:
        # Open and process image with PIL
        with Image.open(file_path) as image:
            # Convert to RGB if necessary (for consistent OCR processing)
            if image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')
            
            # Use Tesseract OCR to extract text
            text = pytesseract.image_to_string(image, config='--psm 3 --oem 3')
            return text.strip()
    except Exception as e:
        print(f"OCR failed for {file_path}: {e}")
        return ""

def is_pdf_image_based(file_path: str) -> bool:
    """Detect if PDF contains mostly images and little text"""
    try:
        with open(file_path, 'rb') as file:
            reader = PdfReader(file)
            total_text_chars = 0
            total_pages = len(reader.pages)
            
            # Check first few pages to determine if PDF is text-based
            pages_to_check = min(3, total_pages)
            for i in range(pages_to_check):
                page_text = reader.pages[i].extract_text() or ""  # Handle None values
                total_text_chars += len(page_text.strip())
            
            # If very little text per page, likely image-based
            avg_chars_per_page = total_text_chars / pages_to_check if pages_to_check > 0 else 0
            return avg_chars_per_page < 100  # Threshold for image-based PDFs
    except Exception:
        return False

def extract_pdf_text_with_ocr(file_path: str) -> str:
    """Extract text from PDF, using OCR if it's image-based"""
    if not OCR_AVAILABLE:
        return extract_pdf_text(file_path)  # Fall back to regular extraction
    
    regular_text = ""
    should_use_ocr = False
    
    try:
        # First try regular text extraction
        regular_text = extract_pdf_text(file_path)
        
        # If we got substantial text, return it
        if len(regular_text.strip()) > 200:
            return regular_text
        
        # If text is short OR PDF appears image-based, use OCR
        should_use_ocr = len(regular_text.strip()) < 200 or is_pdf_image_based(file_path)
        
    except Exception as e:
        print(f"Regular PDF extraction failed for {file_path}: {e}")
        # If regular extraction fails, definitely try OCR
        should_use_ocr = True
    
    if should_use_ocr:
        try:
            print(f"PDF has minimal text ({len(regular_text.strip())} chars), attempting OCR: {file_path}")
            ocr_text = extract_pdf_images_ocr(file_path)
            # Return OCR text if successful, otherwise fall back to regular text
            return ocr_text if ocr_text.strip() else regular_text
        except Exception as e:
            print(f"PDF OCR processing failed for {file_path}: {e}")
            return regular_text  # Return whatever we got from regular extraction
    
    return regular_text

def detect_pdf_conversion_tool():
    """Detect which PDF-to-image tool is available and return command"""
    # Try poppler pdftoppm first (more secure)
    if shutil.which("pdftoppm"):
        return "pdftoppm"
    
    # Try ImageMagick convert (traditional) - WARNING: Security risk with untrusted PDFs  
    if shutil.which("convert"):
        return "convert"
    
    # Try ImageMagick magick command (newer versions) - WARNING: Security risk with untrusted PDFs
    if shutil.which("magick"):
        return "magick"
    
    return None

def extract_pdf_images_ocr(file_path: str) -> str:
    """Extract text from PDF images using OCR via PDF-to-image conversion"""
    if not OCR_AVAILABLE:
        return ""
    
    # Detect available conversion tool
    tool = detect_pdf_conversion_tool()
    if not tool:
        print("No PDF-to-image conversion tool available (pdftoppm, convert, or magick)")
        return ""
    
    try:
        # Convert PDF pages to images, then OCR each page
        with tempfile.TemporaryDirectory() as temp_dir:
            combined_text = ""
            
            if tool == "pdftoppm":
                # Use poppler's pdftoppm (more secure than ImageMagick)
                cmd = [
                    "pdftoppm", 
                    "-r", "300",      # 300 DPI resolution
                    "-png",           # PNG output
                    "-f", "1",        # Start page
                    "-l", "10",       # End page (limit to 10 pages)
                    file_path,
                    os.path.join(temp_dir, "page")
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                if result.returncode != 0:
                    print(f"pdftoppm conversion failed: {result.stderr}")
                    return ""
                
                # OCR each generated PNG (pdftoppm creates page-001.png, page-002.png, etc.)
                for i in range(1, 11):
                    image_path = os.path.join(temp_dir, f"page-{i:03d}.png")
                    if os.path.exists(image_path):
                        try:
                            with Image.open(image_path) as img:
                                page_text = pytesseract.image_to_string(img, config='--psm 3 --oem 3')
                                combined_text += f"\n--- Page {i} ---\n{page_text}"
                        except Exception as e:
                            print(f"OCR failed for page {i}: {e}")
                            continue
                            
            else:  # ImageMagick convert or magick
                output_pattern = os.path.join(temp_dir, "page_%d.png")
                
                # Build command based on detected tool
                if tool == "magick":
                    cmd = ["magick"]
                else:  # convert
                    cmd = ["convert"]
                
                cmd.extend([
                    "-density", "300",        # High resolution for better OCR
                    "-quality", "100",
                    f"{file_path}[0-9]",     # First 10 pages
                    output_pattern
                ])
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                if result.returncode != 0:
                    print(f"{tool} conversion failed: {result.stderr}")
                    return ""
                
                # OCR each generated image
                for i in range(10):  # Check up to 10 pages
                    image_path = os.path.join(temp_dir, f"page_{i}.png")
                    if os.path.exists(image_path):
                        try:
                            with Image.open(image_path) as img:
                                page_text = pytesseract.image_to_string(img, config='--psm 3 --oem 3')
                                combined_text += f"\n--- Page {i+1} ---\n{page_text}"
                        except Exception as e:
                            print(f"OCR failed for page {i+1}: {e}")
                            continue
            
            return combined_text.strip()
            
    except subprocess.TimeoutExpired:
        print("PDF OCR processing timed out")
        return ""
    except Exception as e:
        print(f"PDF OCR extraction failed: {e}")
        return ""

def validate_file_safety(file_path: str, max_size_mb: int = 50) -> Tuple[bool, Optional[str]]:
    """
    Validate file safety (size, type, etc.)
    Returns (is_safe, error_message)
    """
    try:
        # Check file size
        file_size = os.path.getsize(file_path)
        if file_size > max_size_mb * 1024 * 1024:
            return False, f"File too large: {file_size / (1024*1024):.1f}MB (max: {max_size_mb}MB)"
        
        # Check file type with python-magic
        file_type = magic.from_file(file_path, mime=True)
        allowed_types = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "message/rfc822",
            "text/plain",
            "text/vtt",
            # Image types for OCR processing
            "image/jpeg", "image/jpg", "image/png", "image/tiff", "image/tif",
            "image/bmp", "image/gif", "image/webp"
        ]
        
        if not any(allowed_type in file_type for allowed_type in allowed_types):
            return False, f"File type not allowed: {file_type}"
        
        # TODO: Add ClamAV antivirus scanning
        # This would require ClamAV to be installed and configured
        
        return True, None
    except Exception as e:
        return False, f"Error validating file: {str(e)}"
