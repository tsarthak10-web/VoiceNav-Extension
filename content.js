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
  let chunksReadSincePrompt = 0; // This will count sentences
  
  // --- Inactivity Timer ---
  let inactivityTimer = null;
  
  // --- Command List Array ---
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
      "find search, or, search this website.",
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

  // --- Timer Function ---
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

  // --- Core Recognition Functions ---
  async function startListening() {
    if (isListening) return; 
    
    // Check permissions first
    let permissionState;
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      permissionState = permissionStatus.state;
    } catch (e) {
      console.warn("Could not query permissions. Assuming 'prompt'.", e.message);
      permissionState = 'prompt'; // Fallback if API fails
    }

    if (permissionState === 'denied') {
      speak("Microphone access is blocked. You must go to browser settings to allow it.");
      return; // Can't do anything else
    }

    if (permissionState === 'prompt') {
      speak("This site needs permission to use your microphone. The prompt will appear now. Press Tab, then Enter, to allow.");
    }

    // Now, actually try to start
    chrome.runtime.sendMessage({ command: "startListening" });
    isListening = true;
    try {
      recognition.start();
      
      if (permissionState === 'granted') {
        speak("Voice navigation activated.");
      }
      resetInactivityTimer(); // Start the timer
      
    } catch (e) {
      console.warn("VoiceNav:", e.message);
      isListening = false;
    }
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: true });
  }

  // This is a "silent" stop
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

  // --- Event Handlers for Recognition ---
  recognition.onresult = (event) => {
    resetInactivityTimer(); // Reset timer on successful command
    
    const lastResult = event.results[event.results.length - 1];
    const command = lastResult[0].transcript.trim().toLowerCase();
    
    if (!isListening && (command.includes('yes') || command.includes('confirm'))) {
      if (navigator.permissions) {
         navigator.permissions.query({name: 'microphone'}).then(status => {
           if (status.state === 'granted') {
             speak("Voice navigation activated.");
             isListening = true;
             chrome.runtime.sendMessage({ statusUpdate: true, isListening: true });
           }
         });
      }
    }
    
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
    if (event.error === 'not-allowed') {
      speak("Microphone access was denied.");
      stopListening();
    }
    console.error("VoiceNav Error:", event.error);
  };

  // --- handleCommand ---
  function handleCommand(command) {
    if (pendingAction) {
      const action = pendingAction; 
      pendingAction = null; 

      if (action.type === 'performSearch') {
        const searchBar = action.data;
        const query = command; 
        
        if (document.body.contains(searchBar)) {
          searchBar.value = query; // Fill the search bar
          
          const form = searchBar.closest('form');
          if (form) {
            form.submit();
          } else {
            const enterEvent = new KeyboardEvent('keydown', {
              bubbles: true, cancelable: true, keyCode: 13, key: 'Enter'
            });
            searchBar.dispatchEvent(enterEvent);
          }
          
          speak(`Searching for ${query}`);
        } else {
          speak("Sorry, the search bar is no longer available.");
        }
        return; // Action is handled
      }
      
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
          chunksReadSincePrompt = -1000; // Bypass 5-line limit
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
    } else if (command.includes("find search") || command.includes("search website") || command.includes("search this site")) {
      const searchInput = findSearchInput();
      if (searchInput) {
        searchInput.focus();
        pendingAction = { type: 'performSearch', data: searchInput };
        speak("What do you want to search for?");
      } else {
        speak("Sorry, I could not find a search bar on this page.");
      }
    
    // --- CATEGORY: System ---
    } else if (command.includes("help") || command.includes("what can i say") || command.includes("show commands") || command === "commands") {
      const helpText = "Basic commands are: . read page. . stop reading. . find search. . close tab. . To hear all commands, say, . read all commands.";
      speak(helpText);
    } else if (command.includes("read all commands")) {
      pendingAction = { type: 'confirmReadAllCommands' };
      speak("This is a long list. Do you want me to read all commands?");
    }
  }

  // --- speak function ---
  function speak(text) {
    speechLog.push(text);
    chrome.runtime.sendMessage({ newCommandLogEntry: text });
    if (isListening) {
        recognition.stop();
    }
    chrome.runtime.sendMessage({ command: "speak", text: text });
  }
  
  // --- speakNextChunk ---
  function speakNextChunk() {
    if (isSpeakingQueue && chunksReadSincePrompt >= 5) {
      isSpeakingQueue = false; // Pause the queue
      chunksReadSincePrompt = 0; // Reset the counter
      pendingAction = { type: 'continueReading' };
      speak("Do you want to continue?");
      return; // Stop here and wait for user input
    }
    if (speechQueue.length > 0 && isSpeakingQueue) {
      const chunk = speechQueue.shift();
      chunksReadSincePrompt++; // This will be -999, -998... for "read all"
      speak(chunk);
    } else {
      isSpeakingQueue = false;
      chunksReadSincePrompt = 0;
      if (isListening) {
        try { recognition.start(); } catch(e) {}
      }
    }
  }
  
  // --- findSearchInput() ---
  function findSearchInput() {
    const selectors = [
        'input[type="search"]',
        '[role="searchbox"]',
        'input[name="q"], textarea[name="q"]',
        'input[name="s"], textarea[name="s"]',
        '[id*="search"]',
        '[placeholder*="search"]',
        '[class*="search"]',
        'input[name="query"], textarea[name="query"]'
    ];
    for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && (input.offsetWidth > 0 || input.offsetHeight > 0)) {
            return input;
        }
    }
    return null;
  }

  // --- readMainContent ---
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
        '[class*="promo-"]', '[class**="comment-"]', '[class*="footer"]',
        '[class*="header"]', '[class*="infobox"]', '[role="navigation"]',
        '[role="complementary"]', '[role="banner"]', '[role="contentinfo"]',
        '#footer', '#header', '#sidebar'
    ];

    mainClone.querySelectorAll(junkSelectors.join(', ')).forEach(el => {
        el.remove(); // Remove the junk
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
  
  // 5. MODIFIED: Message Listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "startListening") {
      startListening();
      sendResponse({ status: "Listening started." });
    } else if (request.command === "stopListening") {
      speak("Voice navigation deactivated.");
      stopListening();
      sendResponse({ status: "Listening stopped." });
    } else if (request.command === "toggleListening") {
      if (isListening) {
        speak("Voice navigation deactivated.");
        stopListening();
      } else {
        startListening();
      }
      sendResponse({ status: isListening ? "Now listening" : "Now stopped" });
    
    // --- NEW: Handle silent stop ---
    } else if (request.command === "silentStop") {
      stopListening(); // Call the silent stop
      sendResponse({ status: "silently stopped" });
    // --- END NEW ---
    
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

  // --- Auto-start logic ---
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