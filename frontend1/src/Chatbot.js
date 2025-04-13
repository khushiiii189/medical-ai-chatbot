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
  const speechRef = useRef(null);
  const fullDiagnosisRef = useRef("");
  const followUpsRef = useRef("");
  const recommendationsRef = useRef("");
  const keySymptomsRef = useRef("");

  useEffect(() => {
    if (keySymptomsRef.current && !displayedSymptoms) {
      revealTextAndSpeak(keySymptomsRef.current, setDisplayedSymptoms);
    }
    if (fullDiagnosisRef.current && !isDiagnosisFinal) {
      revealTextAndSpeak(fullDiagnosisRef.current, setDisplayedDiagnosis);
      setIsDiagnosisFinal(true);
    }
  }, [diagnosis, keySymptoms, isDiagnosisFinal, displayedSymptoms]);

  const revealTextAndSpeak = (text, setter) => {
    if (!text) return;
    let index = 0;
    let buffer = "";
  
    setter(""); // clear existing text
    const interval = setInterval(() => {
      buffer += text[index];
      setter(buffer); // always update from buffer
      index++;
      if (index >= text.length) {
        clearInterval(interval);
        const speech = new SpeechSynthesisUtterance(buffer);
        speech.lang = "en-US";
        speech.rate = 1;
        speech.pitch = 1;
        window.speechSynthesis.speak(speech);
      }
    }, 60);
  };
  
  const handleStartRecording = async () => {
    setError(null);
    setIsRecording(true);
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderRef.current = new Recorder(audioContextRef.current);
      await recorderRef.current.init(stream);
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
    console.log("Full Text:", text);
    console.log("Looking for section:", label);
    const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\*\\*${safeLabel}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`, "m");
    const match = text.match(regex);
    console.log("Regex match result:", match);
    if (match) {
      return match[1].trim();
    }
    return `No ${label} found. Please check the input format or try again.`;
  };
  

  const cleanText = (text) => {
    if (!text) return "";
    // Only remove potentially harmful non-ASCII symbols
    text = text.replace(/[^\x20-\x7E\n]/g, "");
    return text.trim();
  };

  const fixTypos = (text) => {
    if (!text) return "";
    // Remove consecutive repeated characters (handles more cases)
    text = text.replace(/(\w)\1{2,}/g, "$1");
    // Replace double spaces with a single space and trim extra spaces at the start/end
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  };
  
  
  

  const speakText = (text) => {
    if (speechRef.current) window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 1;
    speech.pitch = 1;
    speechRef.current = speech;
    window.speechSynthesis.speak(speech);
  };

  const handleFollowUpsClick = () => {
    revealTextAndSpeak(followUpsRef.current, setDisplayFollowUps);
  };

  const handleRecommendationsClick = () => {
    revealTextAndSpeak(recommendationsRef.current, setDisplayRecommendations);
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
          <button onClick={handleFollowUpsClick}>Show Follow-up Questions</button>
          <button onClick={handleRecommendationsClick}>Show Recommendations</button>
          {displayFollowUps && <div><h4>Follow-up Questions:</h4><p>{displayFollowUps}</p></div>}
          {displayRecommendations && <div><h4>Recommendations:</h4><p>{displayRecommendations}</p></div>}
        </div>
      )}

      {!isRecording && !isProcessing && (
        <button onClick={handleStartRecording}>Start Recording</button>
      )}

      {isRecording && <p>🎙️ Listening... Speak now.</p>}
      {isProcessing && <p>🔄 Processing audio, please wait...</p>}
    </div>
  );
};

export default MedicalChatbot;
