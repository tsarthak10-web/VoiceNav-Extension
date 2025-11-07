// 1. Initialize Speech Recognition (STT) and Synthesis (TTS)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;

// Check if the browser supports the Web Speech API
if (!SpeechRecognition) {
  console.error("VoiceNav Error: Speech Recognition API not supported.");
} else {
  const recognition = new SpeechRecognition();
  let isListening = false; // Our new state variable
  
  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  // --- Core Recognition Functions ---

  function startListening() {
    if (isListening) return; // Don't start if already started
    isListening = true;
    try {
      recognition.start();
      speak("Voice navigation activated.");
    } catch (e) {
      console.warn("VoiceNav:", e.message);
    }
    // NEW: Broadcast the status change to the popup
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: true });
  }

  function stopListening() {
    if (!isListening) return; // Don't stop if already stopped
    isListening = false;
    recognition.stop();
    synthesis.cancel(); // Stop any speech
    speak("Voice navigation deactivated.");
    // NEW: Broadcast the status change to the popup
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: false });
  }

  // --- Event Handlers for Recognition ---

  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const command = lastResult[0].transcript.trim().toLowerCase();

    console.log("VoiceNav Command:", command);
    handleCommand(command);
  };

  recognition.onend = () => {
    // Only restart if we are *supposed* to be listening
    if (isListening) {
      try {
        recognition.start();
      } catch(e) {
        console.warn("VoiceNav: Restart error:", e.message);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error("VoiceNav Error:", event.error);
  };

  // --- Command and Control Logic ---
  // (All functions handleCommand, speak, readMainContent remain unchanged)

  function handleCommand(command) {
    if (command.includes("scroll down")) {
      window.scrollBy(0, 500);
    } else if (command.includes("scroll up")) {
      window.scrollBy(0, -500);
    } else if (command.includes("go back")) {
      history.back();
    } else if (command.includes("go forward")) {
      history.forward();
    } else if (command.includes("open first article") || command.includes("open first link")) {
      const firstLink = document.querySelector('article a, main a, a');
      if (firstLink) {
        speak(`Opening link: ${firstLink.textContent}`);
        firstLink.click();
      } else {
        speak("No links found.");
      }
    } else if (command.includes("read this section aloud") || command.includes("read page")) {
      readMainContent();
    } else if (command.includes("stop reading")) {
      synthesis.cancel();
    }
  }

  function speak(text) {
    if (synthesis.speaking) {
      synthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      // Only restart recognition if we are in the listening state
      if (isListening) {
        try {
          recognition.start();
        } catch(e) {
          console.log("Recognition stopped.");
        }
      }
    };
    // Pause recognition while we are speaking
    if (isListening) {
        recognition.stop();
    }
    synthesis.speak(utterance);
  }

  function readMainContent() {
    let content = '';
    const mainElement = document.querySelector('main') || document.querySelector('article') || document.body;
    const readableElements = mainElement.querySelectorAll('h1, h2, h3, p, li');
    if (readableElements.length > 0) {
      readableElements.forEach(el => {
        content += el.textContent + ' . ';
      });
    } else {
      content = mainElement.textContent;
    }
    if (content.trim().length === 0) {
      speak("No readable content found on this page.");
    } else {
      speak(content);
    }
  }


  // 5. Listen for messages from popup AND background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "startListening") {
      startListening();
      sendResponse({ status: "Listening started." });
    } else if (request.command === "stopListening") {
      stopListening();
      sendResponse({ status: "Listening stopped." });
    } else if (request.command === "toggleListening") {
      // This is from the keyboard shortcut
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
      sendResponse({ status: isListening ? "Now listening" : "Now stopped" });
    } else if (request.command === "getStatus") {
      // This is from the popup asking for the current state
      sendResponse({ isListening: isListening });
    }
    return true; // Keep the message channel open for async response
  });
}