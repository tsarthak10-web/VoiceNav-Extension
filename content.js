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
  
  // --- NEW: Inactivity Timer ---
  let inactivityTimer = null;
  
  // --- Command List Array (unchanged) ---
  const allCommandsChunks = [
      "Here are all the commands.",
      "Category: Navigation.",
      "scroll down, or, go down.",
      "scroll up, or, go up.",
      "go back, or, previous page.",
      "go forward, or, next page.",
      "Category: Tab Management.",
      "close tab.",
      "new tab.",
      "search for [your query].",
      "go to [website dot com].",
      "Category: Content Reading.",
      "read page, or, start reading.",
      "stop reading, or, stop.",
      "read buttons, or, list buttons.",
      "Category: Interaction.",
      "open first link.",
      "Category: System.",
      "help, or, what can i say.",
      "read all commands.",
      "yes, or, confirm.",
      "no, or, cancel.",
  ];

  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  // --- NEW: Timer Function ---
  function resetInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => {
      if (isListening) {
        speak("Stopping due to inactivity.");
        stopListening(); // Call the silent stop
      }
    }, 120000); // 2 minutes (120,000 ms)
  }
  // --- END NEW ---

  // --- MODIFIED: Core Recognition Functions ---
  function startListening() {
    if (isListening) return; 
    chrome.runtime.sendMessage({ command: "startListening" });
    isListening = true;
    try {
      recognition.start();
      speak("Voice navigation activated.");
      resetInactivityTimer(); // Start the timer
    } catch (e) {
      console.warn("VoiceNav:", e.message);
    }
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: true });
  }

  // MODIFIED: This is now a "silent" stop
  function stopListening() {
    if (!isListening) return;
    chrome.runtime.sendMessage({ command: "stopListening" });
    isListening = false;
    recognition.stop();
    pendingAction = null; 
    speechQueue = [];
    isSpeakingQueue = false;
    chunksReadSincePrompt = 0; 
    
    if (inactivityTimer) { // Clear the timer
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: false });
    // NO speak() call here
  }
  // --- END MODIFIED ---

  // --- MODIFIED: Event Handlers for Recognition ---
  recognition.onresult = (event) => {
    resetInactivityTimer(); // Reset timer on successful command
    
    const lastResult = event.results[event.results.length - 1];
    const command = lastResult[0].transcript.trim().toLowerCase();
    commandLog.push(command);
    chrome.runtime.sendMessage({ newCommandLogEntry: command }); 
    console.log("VoiceNav Command:", command);
    handleCommand(command);
  };
  // (onend, onerror are unchanged)
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

  // --- handleCommand (MODIFIED "stop reading") ---
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
          stopListening(); // Call silent stop
        }
        return; 
      }
      
      if (action.type === 'confirmReadAllCommands') {
        if (command.includes('yes') || command.includes('confirm')) {
          speechQueue = [...allCommandsChunks]; 
          isSpeakingQueue = true;
          chunksReadSincePrompt = -1000; 
          speakNextChunk();
        } else if (command.includes('no') || command.includes('cancel')) {
          speak("Okay, action cancelled.");
          stopListening(); // Call silent stop
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
    
    // --- CATEGORY: Tab Management ---
    } else if (command.includes("close tab") || command.includes("close this tab")) {
      chrome.runtime.sendMessage({ command: "closeTab" });
    } else if (command.includes("new tab") || command.includes("open new tab")) {
      chrome.runtime.sendMessage({ command: "newTab" });
    } else if (command.startsWith("search for ")) {
      const query = command.substring(11);
      speak(`Searching for ${query}`);
      chrome.runtime.sendMessage({ command: "search", query: query });
    } else if (command.startsWith("go to ") || command.startsWith("open ")) {
      let url;
      if (command.startsWith("go to ")) {
        url = command.substring(6);
      } else {
        url = command.substring(5);
      }
      url = url.replace(/ dot /g, '.').replace(/\s/g, ''); 
      speak(`Opening ${url}`);
      chrome.runtime.sendMessage({ command: "openUrl", url: url });
    
    // --- CATEGORY: Content Reading ---
    } else if (command.includes("read page") || command.includes("start reading") || command.includes("read article") || command.includes("read this section")) {
      readMainContent();
    } else if (command.includes("stop reading") || command === "stop") {
      // MODIFIED: Speak *before* calling silent stop
      speechQueue = [];
      isSpeakingQueue = false;
      chunksReadSincePrompt = 0;
      pendingAction = null; 
      chrome.runtime.sendMessage({ command: "speak", text: "" }); // Stop current speech
      speak("Stopping.");
      stopListening(); // Call silent stop
    } else if (command.includes("read buttons") || command.includes("list buttons")) {
      const buttons = document.querySelectorAll('button, [role="button"]');
      const buttonTexts = Array.from(buttons).map(b => b.textContent.trim()).filter(t => t.length > 0);
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
      const helpText = "Basic commands are: . read page. . stop reading. . go back. . close tab. . To hear all commands, say, . read all commands.";
      speak(helpText);
    } else if (command.includes("read all commands")) {
      pendingAction = { type: 'confirmReadAllCommands' };
      speak("This is a long list. Do you want me to read all commands?");
    }
  }

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
      isSpeakingQueue = false;
      chunksReadSincePrompt = 0; 
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
  
  // 5. MODIFIED: Listen for messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "startListening") {
      startListening();
      sendResponse({ status: "Listening started." });
    } else if (request.command === "stopListening") {
      // This comes from the popup button
      speak("Voice navigation deactivated.");
      stopListening(); // Call silent stop
      sendResponse({ status: "Listening stopped." });
    } else if (request.command === "toggleListening") {
      // This comes from the keyboard shortcut
      if (isListening) {
        speak("Voice navigation deactivated.");
        stopListening(); // Call silent stop
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