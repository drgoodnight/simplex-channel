"""Whisper transcription HTTP service for voice messages."""

import os, logging, tempfile
from flask import Flask, request, jsonify
import whisper

logging.basicConfig(level=logging.INFO, format="%(asctime)s [whisper] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)

MODEL = os.environ.get("WHISPER_MODEL", "base")
LANG = os.environ.get("WHISPER_LANGUAGE", "en")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")

log.info("Loading Whisper model '%s' on '%s'...", MODEL, DEVICE)
model = whisper.load_model(MODEL, device=DEVICE)
log.info("Model loaded.")

@app.route("/health")
def health():
    return jsonify(status="ok", model=MODEL, device=DEVICE)

@app.route("/transcribe", methods=["POST"])
def transcribe():
    temp = None
    try:
        ct = request.content_type or ""
        if "json" in ct:
            path = request.get_json(force=True).get("file_path")
            if not path or not os.path.isfile(path):
                return jsonify(error=f"File not found: {path}"), 404
        elif "multipart" in ct:
            f = request.files.get("file")
            if not f: return jsonify(error="No file"), 400
            temp = tempfile.NamedTemporaryFile(suffix=os.path.splitext(f.filename or ".ogg")[1], delete=False)
            f.save(temp.name)
            path = temp.name
        else:
            return jsonify(error="Unsupported Content-Type"), 415

        lang = LANG if LANG != "auto" else None
        result = model.transcribe(path, language=lang)
        return jsonify(text=result.get("text", "").strip(), language=result.get("language", LANG))
    except Exception as e:
        log.exception("Transcription failed")
        return jsonify(error=str(e)), 500
    finally:
        if temp and os.path.exists(temp.name): os.unlink(temp.name)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("WHISPER_PORT", "9000")))
