from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import openai
import os
from dotenv import load_dotenv
from gtts import gTTS  # Import for text-to-speech

# Load environment variables
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

if not openai.api_key:
    raise ValueError("Missing OpenAI API key. Set OPENAI_API_KEY as an environment variable.")

# Flask app setup
app = Flask(__name__)  # ✅ Fixed here
CORS(app)  # Enable CORS for React frontend

# Audio Configuration
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    """Receives uploaded audio, transcribes it using OpenAI Whisper, and returns text."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    file_path = os.path.join(UPLOAD_FOLDER, "audio.wav")
    file.save(file_path)

    try:
        with open(file_path, "rb") as audio_file:
            response = openai.Audio.transcribe(model="whisper-1", file=audio_file)
            transcription = response.get("text", "")
            return jsonify({"transcription": transcription})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/analyze", methods=["POST"])
def analyze_symptoms():
    """Analyzes transcribed text and provides a structured diagnosis."""
    data = request.json
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No transcription provided"}), 400

    prompt = f"""
    Analyze the following doctor-patient conversation:
    {text}
    Provide structured medical advice in the following format:

    **Key Symptoms Identified:**
    - Symptom 1
    - Symptom 2

    **Possible Medical Diagnosis:**
    - Condition 1
    - Condition 2

    **Follow-up Questions for Further Diagnosis:**
    - Question 1
    - Question 2

    **Recommended Next Steps:**
    - Step 1
    - Step 2
    """

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an AI medical assistant providing structured medical advice."},
                {"role": "user", "content": prompt}
            ]
        )
        return jsonify({"analysis": response["choices"][0]["message"]["content"].strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/speak", methods=["POST"])
def text_to_speech():
    """Converts diagnosis text to speech and returns an audio file."""
    data = request.json
    text = data.get("text", "")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    tts = gTTS(text=text, lang="en")
    speech_path = os.path.join(UPLOAD_FOLDER, "speech.mp3")
    tts.save(speech_path)

    return send_file(speech_path, mimetype="audio/mpeg")

@app.route('/')
def home():
   return "Backend is running!"

if __name__ == '__main__':  # ✅ Fixed here
    app.run(host='0.0.0.0', port=5000)
