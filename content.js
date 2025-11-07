// 1. Initialize Speech Recognition (STT) and Synthesis (TTS)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// const synthesis = window.speechSynthesis; // <-- We NO LONGER use this

// Check if the browser supports the Web Speech API
if (!SpeechRecognition) {
  console.error("VoiceNav Error: Speech Recognition API not supported.");
} else {
  const recognition = new SpeechRecognition();
  let isListening = false;
  let commandLog = []; 
  let speechLog = []; 
  let pendingAction = null; 

  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  // --- Core Recognition Functions ---
  // (startListening is unchanged)

  function startListening() {
    if (isListening) return; 
    isListening = true;
    try {
      recognition.start();
      speak("Voice navigation activated.");
    } catch (e) {
      console.warn("VoiceNav:", e.message);
    }
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: true });
  }

  function stopListening() {
    if (!isListening) return;
    isListening = false;
    recognition.stop();
    pendingAction = null; 
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: false });
    // Speak *after* setting state. This will stop previous speech.
    speak("Voice navigation deactivated."); 
  }

  // --- Event Handlers for Recognition ---
  // (onresult and onend are unchanged)

  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const command = lastResult[0].transcript.trim().toLowerCase();

    commandLog.push(command);
    chrome.runtime.sendMessage({ newCommandLogEntry: command }); 

    console.log("VoiceNav Command:", command);
    handleCommand(command);
  };

  recognition.onend = () => {
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
  // (handleCommand is almost the same)
  
  function handleCommand(command) {
    if (pendingAction) {
      const action = pendingAction; 
      pendingAction = null; 
      if (command.includes('yes') || command.includes('confirm')) {
        if (action.type === 'readButtons') {
          const buttonList = action.data.join(' . ');
          speak(`The buttons are: . ${buttonList}`);
        }
        return; 
      } else if (command.includes('no') || command.includes('cancel')) {
        speak("Okay, action cancelled.");
        return; 
      }
    }

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
      // MODIFIED: Tell the background TTS to stop
      chrome.runtime.sendMessage({ command: "speak", text: "" }); // Sends empty text to stop
    }
    else if (command.includes("read buttons") || command.includes("list buttons")) {
      const buttons = document.querySelectorAll('button, [role="button"]');
      const buttonTexts = Array.from(buttons)
                                .map(b => b.textContent.trim())
                                .filter(t => t.length > 0);
      if (buttonTexts.length > 0) {
        pendingAction = { type: 'readButtons', data: buttonTexts };
        speak(`I found ${buttonTexts.length} buttons. Would you like me to read them?`);
      } else {
        speak("I could not find any buttons on this page.");
      }
    }
    else if (command.includes("help") || command.includes("what can i say") || command.includes("show commands")) {
      const helpText = "Here are the commands you can use: . Scroll down. . Scroll up. . Go back. . Go forward. . Open first link. . Read page. . Read buttons. . Stop reading. . and . Help.";
      speak(helpText);
    }
  }

  // --- NEW: speak() function ---
  // This function now sends a message to background.js
  function speak(text) {
    // Log speech locally
    speechLog.push(text);
    chrome.runtime.sendMessage({ newSpeechLogEntry: text });

    // Stop recognition *before* speaking
    if (isListening) {
        recognition.stop();
    }
    
    // Tell the background script to speak
    chrome.runtime.sendMessage({ command: "speak", text: text });
  }

  // (isElementInViewport and readMainContent are unchanged)
  function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top < window.innerHeight && rect.bottom > 0
    );
  }
  function readMainContent() {
    let content = '';
    const mainElement = document.querySelector('main') || document.querySelector('article') || document.body;
    const allReadableElements = mainElement.querySelectorAll('h1, h2, h3, p, li');
    const visibleElements = Array.from(allReadableElements).filter(isElementInViewport);
    if (visibleElements.length > 0) {
      visibleElements.forEach(el => {
        const elClone = el.cloneNode(true);
        elClone.querySelectorAll(
          'sup.reference', 'button', '[role="button"]', '[aria-hidden="true"]'
        ).forEach(child => child.remove());
        const cleanText = elClone.textContent.trim();
        if (cleanText.length > 0) {
          content += cleanText + ' . ';
        }
      });
    }
    if (content.trim().length === 0) {
      speak("No readable text content found on the screen.");
    } else {
      speak(content);
    }
  }

  // --- MODIFIED: Message Listener ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "startListening") {
      startListening();
      sendResponse({ status: "Listening started." });
    } else if (request.command === "stopListening") {
      stopListening();
      sendResponse({ status: "Listening stopped." });
    } else if (request.command === "toggleListening") {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
      sendResponse({ status: isListening ? "Now listening" : "Now stopped" });
    } else if (request.command === "getStatus") {
      sendResponse({ isListening: isListening });
    } else if (request.command === "getLog") {
      sendResponse({ log: commandLog });
    } else if (request.command === "getSpeechLog") {
      sendResponse({ log: speechLog });
    } 
    // NEW: Listen for when speech has ended
    else if (request.command === "speechEnded") {
      // Now we can safely restart recognition
      if (isListening) {
        try {
          recognition.start();
        } catch(e) {
          console.log("Recognition error on restart.");
        }
      }
    }
    return true; // Keep channel open
  });

  // --- Auto-start logic (unchanged) ---
  (() => {
    const autoStartFlag = sessionStorage.getItem('voiceNavAutoStart');
    if (autoStartFlag === 'true') {
      sessionStorage.removeItem('voiceNavAutoStart');
      startListening();
    }
  })();
  
}