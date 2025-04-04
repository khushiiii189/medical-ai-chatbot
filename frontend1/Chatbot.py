from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
import os
import wave
import pyaudio
import struct
import webrtcvad
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure API key is loaded correctly
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("Missing OpenAI API key. Set OPENAI_API_KEY as an environment variable.")
openai.api_key = api_key  

# Flask app setup
app = Flask(__name__)
CORS(app) 

# Audio Configuration
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK = 320  
WAVE_OUTPUT_FILENAME = os.path.join(UPLOAD_FOLDER, "audio.wav")

vad = webrtcvad.Vad(2)
audio = pyaudio.PyAudio()

def record_audio_vad():
    """Records audio using WebRTC VAD."""
    stream = audio.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)
    frames = []
    silent_chunks = 0
    max_silence = 80  

    print("Recording started... Speak now!")

    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        pcm_data = struct.unpack("<" + ("h" * (len(data) // 2)), data)
        pcm_bytes = struct.pack("<" + ("h" * len(pcm_data)), *pcm_data)
        
        is_speech = vad.is_speech(pcm_bytes, RATE)

        if is_speech:
            frames.append(pcm_bytes)
            silent_chunks = 0
        else:
            silent_chunks += 1

        if silent_chunks > max_silence:
            break

    stream.stop_stream()
    stream.close()

    with wave.open(WAVE_OUTPUT_FILENAME, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(audio.get_sample_size(FORMAT))
        wf.setframerate(RATE)
        wf.writeframes(b"".join(frames))

    print("Recording completed.")

def transcribe_audio():
    """Transcribes the recorded audio using OpenAI Whisper."""
    try:
        with open(WAVE_OUTPUT_FILENAME, "rb") as audio_file:
            response = openai.Audio.transcribe(model="whisper-1", file=audio_file)
            transcribed_text = response.get("text", "")
            print("Transcription complete.")
            return transcribed_text
    except Exception as e:
        print("Error during transcription:", e)
        return ""

def analyze_symptoms(transcribed_text):
    """Analyzes transcribed text and provides a structured diagnosis."""
    if not transcribed_text:
        return {"error": "No valid transcription provided."}

    prompt = f"""
    Analyze the following doctor-patient conversation:
    {transcribed_text}
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
        return response["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return str(e)

@app.route("/start", methods=["POST"])
def start_recording():
    """Starts recording audio, transcribes, and analyzes automatically."""
    try:
        record_audio_vad()
        transcription = transcribe_audio()
        analysis = analyze_symptoms(transcription)

        return jsonify({
            "transcription": transcription,
            "analysis": analysis
        })
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route("/process", methods=["POST"])
def process():
    """Alias for /start to avoid frontend modification."""
    return start_recording()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))  
    app.run(host="0.0.0.0", port=port, debug=False)
