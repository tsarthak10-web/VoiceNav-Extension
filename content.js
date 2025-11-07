// 1. Initialize Speech Recognition (STT) and Synthesis (TTS)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Check if the browser supports the Web Speech API
if (!SpeechRecognition) {
  console.error("VoiceNav Error: Speech Recognition API not supported.");
} else {
  const recognition = new SpeechRecognition();
  let isListening = false;
  let commandLog = []; 
  let speechLog = []; 
  let pendingAction = null; 

  // --- Speech Queue ---
  let speechQueue = [];
  let isSpeakingQueue = false;
  let chunksReadSincePrompt = 0; 

  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  // --- Core Recognition Functions ---
  // (startListening and stopListening are unchanged)

  function startListening() {
    if (isListening) return; 
    chrome.runtime.sendMessage({ command: "startListening" });
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
    chrome.runtime.sendMessage({ command: "stopListening" });
    isListening = false;
    recognition.stop();
    pendingAction = null; 
    
    speechQueue = [];
    isSpeakingQueue = false;
    chunksReadSincePrompt = 0; 
    
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: false });
    speak("Voice navigation deactivated."); 
  }

  // --- Event Handlers for Recognition ---
  // (onresult, onend, onerror are unchanged)
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

  // --- START OF MODIFIED handleCommand ---
  function handleCommand(command) {
    if (pendingAction) {
      const action = pendingAction; 
      pendingAction = null; 

      if (action.type === 'readButtons') {
        if (command.includes('yes') || command.includes('confirm')) {
          const buttonList = action.data.join(' . ');
          speak(`The buttons are: . ${buttonList}`);
        } else if (command.includes('no') || command.includes('cancel')) {
          speak("Okay, action cancelled.");
        }
        return; 
      }
      
      if (action.type === 'continueReading') {
        if (command.includes('yes') || command.includes('confirm')) {
          isSpeakingQueue = true; 
          speakNextChunk(); 
        } else if (command.includes('no') || command.includes('cancel')) {
          speechQueue = []; 
          isSpeakingQueue = false;
          speak("Okay, stopping.");
        }
        return; 
      }
    }
    
    // --- CATEGORY: Navigation ---
    if (command.includes("scroll down") || command.includes("go down")) {
      window.scrollBy(0, 500);
    
    } else if (command.includes("scroll up") || command.includes("go up")) {
      window.scrollBy(0, -500);
    
    } else if (command.includes("go back") || command.includes("previous page") || command === "back") {
      history.back(); 
    
    } else if (command.includes("go forward") || command.includes("next page") || command === "forward") {
      history.forward();
    
    // --- CATEGORY: Content Reading ---
    } else if (command.includes("read page") || command.includes("start reading") || command.includes("read article") || command.includes("read this section")) {
      readMainContent();
    
    } else if (command.includes("stop reading") || command === "stop") {
      speechQueue = [];
      isSpeakingQueue = false;
      chunksReadSincePrompt = 0;
      pendingAction = null; 
      chrome.runtime.sendMessage({ command: "speak", text: "" }); 
    
    } else if (command.includes("read buttons") || command.includes("list buttons")) {
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
    
    // --- CATEGORY: Interaction ---
    } else if (command.includes("open first link") || command.includes("open first article") || command.includes("click first link")) {
      const firstLink = document.querySelector('article a, main a, a');
      if (firstLink) {
        speak(`Opening link: ${firstLink.textContent}`);
        firstLink.click();
      } else {
        speak("No links found.");
      }
    
    // --- CATEGORY: System ---
    } else if (command.includes("help") || command.includes("what can i say") || command.includes("show commands") || command === "commands") {
      // NEW: Only read categories
      const helpText = "The command categories are: . Navigation. . Content Reading. . Interaction. . and . System.";
      speak(helpText);
    }
  }
  // --- END OF MODIFIED handleCommand ---

  // --- speak function (unchanged) ---
  function speak(text) {
    speechLog.push(text);
    chrome.runtime.sendMessage({ newSpeechLogEntry: text });
    if (isListening) {
        recognition.stop();
    }
    chrome.runtime.sendMessage({ command: "speak", text: text });
  }
  
  // --- speakNextChunk (unchanged) ---
  function speakNextChunk() {
    if (isSpeakingQueue && chunksReadSincePrompt >= 5) {
      isSpeakingQueue = false; // Pause the queue
      chunksReadSincePrompt = 0; // Reset the counter
      pendingAction = { type: 'continueReading' };
      speak("Do you want to continue?");
      return; 
    }

    if (speechQueue.length > 0 && isSpeakingQueue) {
      const chunk = speechQueue.shift();
      chunksReadSincePrompt++; 
      speak(chunk);
    } else {
      isSpeakingQueue = false;
      chunksReadSincePrompt = 0;
      if (isListening) {
        try { recognition.start(); } catch(e) {}
      }
    }
  }

  // --- readMainContent (unchanged) ---
  function readMainContent() {
    let contentChunks = [];
    const mainElement = document.querySelector('article') || 
                        document.querySelector('main') || 
                        document.querySelector('div#mw-content-text') || 
                        document.body;
    const mainClone = mainElement.cloneNode(true);

    const junkSelectors = [
        'aside', 'nav', 'header', 'footer',
        '.infobox', '.sidebar', '.widget', '.ad', '.ads',
        '.advert', '.comment', '.promo', '.noprint',
        '[class*="sidebar"]', '[class*="widget"]', '[class*="ad-"]',
        '[class*="promo-"]', '[class*="comment-"]', '[class*="footer"]',
        '[class*="header"]', '[class*="infobox"]', '[role="navigation"]',
        '[role="complementary"]', '[role="banner"]', '[role="contentinfo"]',
        '#footer', '#header', '#sidebar'
    ];
    mainClone.querySelectorAll(junkSelectors.join(', ')).forEach(el => {
        el.remove();
    });

    const readableElements = mainClone.querySelectorAll('h1, h2, h3, h4, p, li');

    if (readableElements.length > 0) {
      readableElements.forEach(el => {
        el.querySelectorAll(
          'sup', 'button', '[role="button"]',
          '[aria-hidden="true"]', '.mw-editsection'
        ).forEach(child => child.remove());
        
        const cleanText = el.textContent.trim();
        
        if (cleanText.length > 0) {
          const sentences = cleanText.split('.')
                                     .filter(s => s.trim().length > 0)
                                     .map(s => s.trim() + '.');
          contentChunks.push(...sentences);
        }
      });
    }

    if (contentChunks.length === 0) {
      speak("No readable text content found.");
    } else {
      speechQueue = contentChunks;
      isSpeakingQueue = true;
      chunksReadSincePrompt = 0; 
      speakNextChunk();
    }
  }
  
  // 5. Message Listener (unchanged)
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
    else if (request.command === "speechEnded") {
      if (isSpeakingQueue) {
        speakNextChunk();
      } else if (isListening) {
        try { recognition.start(); } catch(e) {}
      }
    }
    return true; 
  });

  // --- Auto-start logic (unchanged) ---
  (() => {
    const autoStartFlag = sessionStorage.getItem('voiceNavAutoStart');
    if (autoStartFlag === 'true') {
      sessionStorage.removeItem('voiceNavAutoStart');
      startListening(); 
    } else {
      chrome.runtime.sendMessage({ command: "queryActiveStatus" }, (response) => {
        if (response && response.isActive) {
          startListening();
        }
      });
    }
  })();
  
}