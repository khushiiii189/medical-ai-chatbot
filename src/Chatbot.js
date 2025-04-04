import React, { useState, useRef } from "react";
import Recorder from "recorder-js";
import "./Chatbot.css";

const backendUrl = "https://chatbot-backend-p2a5.onrender.com";

const MedicalChatbot = () => {
  const [conversation, setConversation] = useState([]);
  const [diagnosis, setDiagnosis] = useState(null);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const audioContextRef = useRef(null);
  const recorderRef = useRef(null);
  const silenceTimer = useRef(null);
  const speechRef = useRef(null);

  const handleStartRecording = async () => {
    setError(null);
    setIsRecording(true);

    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderRef.current = new Recorder(audioContextRef.current);
      recorderRef.current.init(stream);
      recorderRef.current.start();

      // Set up silence detection
      const audioInput = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      audioInput.connect(analyser);

      const checkSilence = () => {
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        const maxAmplitude = Math.max(...buffer.map(Math.abs));

        if (maxAmplitude < 0.01) { // Silence threshold
          if (!silenceTimer.current) {
            silenceTimer.current = setTimeout(() => handleStopRecording(), 1500); // Stop after 1.5s of silence
          }
        } else {
          clearTimeout(silenceTimer.current);
          silenceTimer.current = null;
        }
        requestAnimationFrame(checkSilence);
      };

      checkSilence();
    } catch (error) {
      setError("Microphone access denied or not available.");
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    setIsProcessing(true);
    clearTimeout(silenceTimer.current);

    try {
      const { blob } = await recorderRef.current.stop();
      const audioFile = new File([blob], "audio.wav", { type: "audio/wav" });

      const formData = new FormData();
      formData.append("file", audioFile);

      // Send recorded audio to backend
      const transcriptionResponse = await fetch(`${backendUrl}/transcribe`, {
        method: "POST",
        body: formData,
      });

      const transcriptionData = await transcriptionResponse.json();
      if (transcriptionData.error) {
        setError(transcriptionData.error);
        setIsProcessing(false);
        return;
      }

      // Update conversation with transcription
      setConversation([{ role: "AI", text: `Transcribed Text: ${transcriptionData.transcription}` }]);

      // Send text for analysis
      const analysisResponse = await fetch(`${backendUrl}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcriptionData.transcription }),
      });

      const analysisData = await analysisResponse.json();
      let formattedDiagnosis = analysisData.analysis
        .replace("**Key Symptoms Identified:**", "<strong><em>Key Symptoms Identified:</em></strong>")
        .replace("**Possible Medical Diagnosis:**", "<strong><em>Possible Medical Diagnosis:</em></strong>")
        .replace("**Follow-up Questions for Further Diagnosis:**", "<strong><em>Follow-up Questions for Further Diagnosis:</em></strong>")
        .replace("**Recommended Next Steps:**", "<strong><em>Recommended Next Steps:</em></strong>");

      setDiagnosis(formattedDiagnosis);
    } catch (error) {
      setError("Error processing the audio.");
    }

    setIsProcessing(false);
  };

  const handlePlayDiagnosis = () => {
    if (diagnosis) {
      // Stop any ongoing speech
      if (speechRef.current) {
        window.speechSynthesis.cancel();
      }

      const speech = new SpeechSynthesisUtterance();
      speech.text = diagnosis.replace(/<\/?[^>]+(>|$)/g, ""); // Remove HTML tags for clean speech
      speech.lang = "en-US"; // Set language to English
      speech.rate = 1; // Adjust speed (1 is normal)
      speech.pitch = 1; // Adjust pitch

      speechRef.current = speech;
      window.speechSynthesis.speak(speech);
    }
  };

  return (
    <div className="chatbot-container">
      <h1>Medical AI Chatbot</h1>
      {error && <p className="error-message">Error: {error}</p>}
      
      <div className="chatbox">
        {conversation.map((msg, index) => (
          <div key={index} className="message">
            <strong>{msg.role}: </strong>{msg.text}
          </div>
        ))}
      </div>

      {diagnosis && (
        <div className="diagnosis-box">
          <h2>Diagnosis</h2>
          <p dangerouslySetInnerHTML={{ __html: diagnosis }}></p>
          <button onClick={handlePlayDiagnosis}>Play Diagnosis</button>
        </div>
      )}

      {!isRecording && !isProcessing && (
        <button onClick={handleStartRecording}>Start Recording</button>
      )}

      {isRecording && <p>Listening... Speak now.</p>}
    </div>
  );
};

export default MedicalChatbot;
