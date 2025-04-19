import React, { useState, useRef, useEffect } from "react";
import Recorder from "recorder-js";
import "./Chatbot.css";

const backendUrl = "http://localhost:5000";

const MedicalChatbot = () => {
  const [conversation, setConversation] = useState([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [keySymptoms, setKeySymptoms] = useState("");
  const [followUps, setFollowUps] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [displayFollowUps, setDisplayFollowUps] = useState("");
  const [displayRecommendations, setDisplayRecommendations] = useState("");
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [displayedDiagnosis, setDisplayedDiagnosis] = useState("");
  const [displayedSymptoms, setDisplayedSymptoms] = useState("");
  const [isDiagnosisFinal, setIsDiagnosisFinal] = useState(false);

  const audioContextRef = useRef(null);
  const recorderRef = useRef(null);
  const silenceTimer = useRef(null);

  const fullDiagnosisRef = useRef("");
  const followUpsRef = useRef("");
  const recommendationsRef = useRef("");
  const keySymptomsRef = useRef("");

  const speakQueue = useRef([]);

  useEffect(() => {
    if (keySymptomsRef.current && displayedSymptoms === "") {
      revealText(keySymptomsRef.current, setDisplayedSymptoms, true);
    }

    if (fullDiagnosisRef.current && !isDiagnosisFinal) {
      revealText(fullDiagnosisRef.current, setDisplayedDiagnosis, true);
      setIsDiagnosisFinal(true);
    }
  }, [diagnosis, keySymptoms]);

  const speakWord = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const revealText = (text, setter, speak = false) => {
    if (!text) return;

    let index = 0;
    setter("");

    const words = text.split(" ");
    let currentText = "";

    const interval = setInterval(() => {
      const nextWord = words[index];
      currentText += " " + nextWord;
      setter(currentText.trim());

      index++;
      if (index >= words.length) {
        clearInterval(interval);
        if (speak) {
          const utterance = new SpeechSynthesisUtterance(currentText.trim());
          window.speechSynthesis.speak(utterance);
        }
      }
    }, 150);
  };

  const handleStartRecording = async () => {
    setError(null);
    setIsRecording(true);
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderRef.current = new Recorder(audioContextRef.current);
      recorderRef.current.init(stream);
      recorderRef.current.start();

      const audioInput = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      audioInput.connect(analyser);

      const checkSilence = () => {
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        const maxAmplitude = Math.max(...buffer.map(Math.abs));

        if (maxAmplitude < 0.01) {
          if (!silenceTimer.current) {
            silenceTimer.current = setTimeout(() => handleStopRecording(), 1500);
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
      const audioFile = new File([blob], "latest_audio.wav", { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", audioFile);

      // 🔧 FIXED: added method: "POST"
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

      setConversation([{ role: "AI", text: `Transcribed Text: ${transcriptionData.transcription}` }]);

      // 🔧 FIXED: added method: "POST"
      const analysisResponse = await fetch(`${backendUrl}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcriptionData.transcription }),
      });

      const analysisData = await analysisResponse.json();
      const result = cleanText(analysisData.analysis);

      keySymptomsRef.current = extractSection(result, "Key Symptoms Identified") || "No key symptoms mentioned.";
      fullDiagnosisRef.current = extractSection(result, "Possible Medical Diagnosis") || "Diagnosis pending further details.";
      followUpsRef.current = extractSection(result, "Follow-up Questions for Further Diagnosis") || "No follow-up questions provided.";
      recommendationsRef.current = extractSection(result, "Recommended Next Steps") || "No recommendations provided.";

      setKeySymptoms(keySymptomsRef.current);
      setDiagnosis(fullDiagnosisRef.current);
    } catch (error) {
      setError("Server error: " + error.message);
    }

    setIsProcessing(false);
  };

  const extractSection = (text, label) => {
    const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\*{1,2}${safeLabel}:\\*{1,2}\\s*([\\s\\S]*?)(?=\\n\\*{1,2}|$)`, "m");
    const match = text.match(regex);
    return match && match[1] ? match[1].trim() : null;
  };  

  const cleanText = (text) => {
    if (!text) return "";
    return text.trim();
  };

  const handleFollowUpsClick = () => {
    revealText(followUpsRef.current, setDisplayFollowUps, true);
  };

  const handleRecommendationsClick = () => {
    revealText(recommendationsRef.current, setDisplayRecommendations, true);
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

      {(keySymptoms || diagnosis) && (
        <div className="diagnosis-box">
          <h2>Diagnosis</h2>
          <p><strong>Key Symptoms Identified:</strong> {displayedSymptoms}</p>
          <p><strong>Possible Medical Diagnosis:</strong></p>
          <p>{displayedDiagnosis}</p>
          <br />
          <center><button onClick={handleFollowUpsClick}>Show Follow-up Questions</button></center>
          <center><button onClick={handleRecommendationsClick}>Show Recommendations</button></center>
          {displayFollowUps && <div><h4>Follow-up Questions:</h4><p>{displayFollowUps}</p></div>}
          {displayRecommendations && <div><h4>Recommendations:</h4><p>{displayRecommendations}</p></div>}
        </div>
      )}

      {!isRecording && !isProcessing && (
        <center><button onClick={handleStartRecording}>Start Recording</button></center>
      )}

      {isRecording && <p><center>🎙 Listening... Speak now.</center></p>}
    </div>
  );
};

export default MedicalChatbot;
