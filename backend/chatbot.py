from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import openai
import os
from dotenv import load_dotenv
from gtts import gTTS
from datetime import datetime, timezone
import time

# Load environment variables
openai.api_key = "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"

if not openai.api_key:
    raise ValueError("Missing OpenAI API key. Set OPENAI_API_KEY in your .env file.")

# Flask App Setup
app = Flask(__name__)
CORS(app)

# Folders
UPLOAD_FOLDER = "uploads"
KEYWORDS_FOLDER = "keywords"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(KEYWORDS_FOLDER, exist_ok=True)

@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    if "file" not in request.files:
        return jsonify({"error": "No audio file provided."}), 400

    file = request.files["file"]
    audio_path = os.path.join(UPLOAD_FOLDER, "latest_audio.wav")

    # Ensure 'uploads' directory exists and safely remove any existing file
    if os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except PermissionError:
            time.sleep(0.5)
            try:
                os.remove(audio_path)
            except Exception as e:
                print(f"Failed to delete previous audio file: {e}")

    file.save(audio_path)

    # Create timestamp for keyword file
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    try:
        # Transcribe with Whisper
        with open(audio_path, "rb") as audio_file:
            response = openai.Audio.transcribe(model="whisper-1", file=audio_file)
            transcription = response.get("text", "").strip()

        if not transcription:
            return jsonify({"error": "Transcription failed or audio was empty."}), 500

        # Extract keywords with more leniency
        prompt = f"""Extract the key medical symptoms or conditions from the following doctor-patient conversation:
        
        "{transcription}"
        
        Return a list of medical symptoms, conditions, or issues that were mentioned explicitly in the conversation."""
        
        keyword_response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role": "system", "content": "You are an AI medical assistant extracting relevant symptoms or conditions."},
                      {"role": "user", "content": prompt}]
        )

        keywords = keyword_response["choices"][0]["message"]["content"].strip()

        # Save keywords to file
        keywords_filename = f"patient_{timestamp}.txt"
        keywords_path = os.path.join(KEYWORDS_FOLDER, keywords_filename)
        with open(keywords_path, "w") as f:
            f.write(keywords)

        # Safe removal after use
        time.sleep(0.5)  # Ensure file is fully released
        try:
            os.remove(audio_path)
        except PermissionError:
            time.sleep(1)
            try:
                os.remove(audio_path)
            except Exception as e:
                print(f"Failed to delete audio after transcription: {e}")

        return jsonify({
            "transcription": transcription,
            "keywords": keywords,
            "keywords_file": keywords_filename
        })

    except openai.error.AuthenticationError:
        return jsonify({"error": "Invalid OpenAI API key. Check your .env file."}), 401
    except openai.error.OpenAIError as api_err:
        return jsonify({"error": f"OpenAI error: {str(api_err)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@app.route("/analyze", methods=["POST"])
def analyze_symptoms():
    data = request.json
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No transcription provided."}), 400

    prompt = f"""
    Analyze the following doctor-patient conversation:
    {text}
    Respond concisely and do not repeat sections.
    Provide structured medical advice in the following format:

    **Key Symptoms Identified:**
    - List the most relevant symptoms or medical conditions mentioned in the conversation.

    **Possible Medical Diagnosis:**
    - Provide a possible diagnosis based on the symptoms described. If uncertain, state "Diagnosis pending further details."

    **Follow-up Questions for Further Diagnosis:**
    - List any follow-up questions to further clarify the diagnosis.

    **Recommended Next Steps:**
    - Provide next steps or tests that could be done to help confirm the diagnosis.
    """

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role": "system", "content": "You are an AI medical assistant providing structured medical advice."},
                      {"role": "user", "content": prompt}]
        )

        return jsonify({
            "analysis": response["choices"][0]["message"]["content"].strip()
        })

    except openai.error.OpenAIError as api_err:
        return jsonify({"error": f"OpenAI error: {str(api_err)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@app.route("/speak", methods=["POST"])
def text_to_speech():
    data = request.json
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        tts = gTTS(text=text, lang="en")
        output_path = os.path.join("static", "audio.mp3")
        tts.save(output_path)
        return send_file(output_path, mimetype="audio/mp3", as_attachment=True)

    except Exception as e:
        return jsonify({"error": f"Error generating speech: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True)
