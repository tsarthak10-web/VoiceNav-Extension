// 1. Initialize Speech Recognition (STT) and Synthesis (TTS)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Check if the browser supports the Web Speech API
if (!SpeechRecognition) {
  console.error("VoiceNav Error: Speech Recognition API not supported.");
} else {
  const recognition = new SpeechRecognition();
  
  let isListening = false;
  let isSpeaking = false; // NEW: Flag to check if TTS is active
  let commandLog = []; 
  let speechLog = []; 
  let pendingAction = null; 

  // --- Speech Queue ---
  let speechQueue = [];
  let isSpeakingQueue = false;
  let chunksReadSincePrompt = 0; // This will count sentences
  
  // --- Inactivity Timer ---
  let inactivityTimer = null;
  
  // --- Command List Array (unchanged) ---
  const allCommandsChunks = [
      "Here are all the commands.",
      "Category: Navigation.",
      "scroll down, or, go down.",
      "scroll up, or, go up.",
      "go back, or, previous page.",
      "go forward, or, next page.",
      "next heading.",
      "previous heading.",
      "go to [text of heading or link].",
      "Category: Tab Management.",
      "close tab.",
      "new tab.",
      "search for [your query].",
      "go to [website dot com].",
      "Category: Content Reading.",
      "read page, or, read this section.",
      "read from top.",
      "list headings, or, show outline.",
      "stop reading, or, stop.",
      "read buttons, or, list buttons.",
      "Category: Interaction.",
      "click first link.",
      "click [text of link].",
      "find search, or, search this website.",
      "Category: Settings.",
      "increase speed, or, speak faster.",
      "decrease speed, or, speak slower.",
      "next voice, or, change voice.",
      "Category: System.",
      "help, or, what can i say.",
      "read all commands.",
      "where am i, or, read title.",
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
    // NEW: Check if the extension is currently speaking
    if (isSpeaking) {
      console.log("VoiceNav: Ignoring self-speech.");
      return;
    }
    
    chrome.runtime.sendMessage({ command: "playBeep" });
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
    if (event.error === 'no-speech') {
      console.log("VoiceNav: No speech detected. Listening again.");
    }
    else if (event.error === 'not-allowed') {
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
          speechQueue = action.data.map(text => "Button: " + text); 
          isSpeakingQueue = true;
          chunksReadSincePrompt = 0;
          speakNextChunk(); // Use the queue
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
    } else if (command.includes("next heading")) {
      const headings = getCleanHeadings();
      const nextHeading = headings.find(h => h.getBoundingClientRect().top > 5);
      if (nextHeading) {
        nextHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        speak(nextHeading.textContent);
      } else {
        speak("End of headings.");
      }
    } else if (command.includes("previous heading")) {
      const headings = getCleanHeadings();
      const prevHeading = headings.reverse().find(h => h.getBoundingClientRect().top < -5);
      if (prevHeading) {
        prevHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        speak(prevHeading.textContent);
      } else {
        speak("Start of headings.");
      }
    
    // --- CATEGORY: Tab Management ---
    } else if (command.includes("close tab") || command.includes("close this tab")) {
      chrome.runtime.sendMessage({ command: "closeTab" });
    } else if (command.includes("new tab") || command.includes("open new tab")) {
      chrome.runtime.sendMessage({ command: "newTab" });
    } else if (command.startsWith("search for ")) {
      const query = command.substring(11);
      speak(`Searching for ${query}`);
      chrome.runtime.sendMessage({ command: "search", query: query });
    
    // --- CATEGORY: Content Reading ---
    } else if (command.includes("read page") || command.includes("read this section") || command.includes("start reading")) {
      readCurrentSection();
    } else if (command.includes("read from top")) {
      readFromTop();
    } else if (command.includes("list headings") || command.includes("show outline")) {
      listHeadings();
    } else if (command.includes("stop reading") || command === "stop" || command.includes("stop listening")) {
      speechQueue = [];
      isSpeakingQueue = false;
      chunksReadSincePrompt = 0;
      pendingAction = null; 
      chrome.runtime.sendMessage({ command: "speak", text: "" }); // Stop current speech
      speak("Stopping.");
      stopListening(); // Call silent stop
    } else if (command.includes("read buttons") || command.includes("list buttons")) {
      
      const junkSelectors = ['aside', 'nav', 'header', 'footer', '.infobox', '.sidebar', '.noprint', '[role="navigation"]', '[role="complementary"]', '#p-lang'];
      const junkButtonText = [
        'search', 'hide', 'show', 'move to sidebar', 
        'expand all', 'jump to navigation', 'jump to search'
      ];

      const buttons = document.querySelectorAll('button, [role="button"]');
      
      const cleanButtonTexts = Array.from(buttons)
        .map(btn => {
          let text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
          return { el: btn, text: text };
        })
        .filter(item => {
          if (item.text.length === 0) return false;
          if (item.el.closest(junkSelectors.join(', '))) return false;
          if (junkButtonText.includes(item.text)) return false;
          return (item.el.offsetWidth > 0 || item.el.offsetHeight > 0);
        })
        .map(item => item.text.charAt(0).toUpperCase() + item.text.slice(1)); // Capitalize
      
      const uniqueButtonTexts = [...new Set(cleanButtonTexts)];

      if (uniqueButtonTexts.length > 0) {
        pendingAction = { type: 'readButtons', data: uniqueButtonTexts };
        speak(`I found ${uniqueButtonTexts.length} useful buttons. Would you like me to read them?`);
      } else {
        speak("I could not find any useful buttons on this page.");
      }
    
    // --- CATEGORY: Interaction & Navigation ---
    } else if (command.includes("click first link")) {
      const firstLink = document.querySelector('article a, main a, a');
      if (firstLink) {
        speak(`Opening link: ${firstLink.textContent}`);
        firstLink.click();
      } else {
        speak("No links found.");
      }
    } else if (command.startsWith("click ") || command.startsWith("open ") || command.startsWith("go to ")) {
      let targetText;
      if (command.startsWith("click ")) targetText = command.substring(6);
      else if (command.startsWith("open ")) targetText = command.substring(5);
      else targetText = command.substring(6); // "go to "
      
      // Check if it's a "go to [website]" command
      if (command.startsWith("go to ") || (command.startsWith("open ") && (targetText.includes(".") || targetText.includes(" dot ")))) {
         let url = targetText.replace(/ dot /g, '.').replace(/\s/g, ''); 
         speak(`Opening ${url}`);
         chrome.runtime.sendMessage({ command: "openUrl", url: url });
      } else {
        // It's a "click [text]" or "go to [text]" command for the page
        findAndActivate(targetText);
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
    
    // --- CATEGORY: System & Settings ---
    } else if (command.includes("help") || command.includes("what can i say") || command.includes("show commands") || command === "commands") {
      const helpText = "Basic commands are: . read page. . stop reading. . next heading. . go to [text]. . list headings. . find search. . close tab. . To hear all commands, say, . read all commands.";
      speak(helpText);
    } else if (command.includes("read all commands")) {
      pendingAction = { type: 'confirmReadAllCommands' };
      speak("This is a long list. Do you want me to read all commands?");
    } else if (command.includes("increase speed") || command.includes("speak faster")) {
      chrome.storage.sync.get('speechRate', (data) => {
        let newRate = (data.speechRate || 1.0) + 0.25;
        if (newRate > 2.5) newRate = 2.5; // Max speed
        chrome.storage.sync.set({ speechRate: newRate });
        speak(`Speed set to ${newRate.toFixed(2)}.`);
      });
    } else if (command.includes("decrease speed") || command.includes("speak slower")) {
      chrome.storage.sync.get('speechRate', (data) => {
        let newRate = (data.speechRate || 1.0) - 0.25;
        if (newRate < 0.5) newRate = 0.5; // Min speed
        chrome.storage.sync.set({ speechRate: newRate });
        speak(`Speed set to ${newRate.toFixed(2)}.`);
      });
    } else if (command.includes("next voice") || command.includes("change voice")) {
      chrome.tts.getVoices((voices) => {
        const englishVoices = voices.filter(v => v.lang.includes('en'));
        if (englishVoices.length === 0) {
          speak("No other voices are available.");
          return;
        }
        chrome.storage.sync.get('selectedVoice', (data) => {
          const currentVoiceName = data.selectedVoice;
          let currentIndex = englishVoices.findIndex(v => v.voiceName === currentVoiceName);
          
          let nextIndex = (currentIndex + 1) % englishVoices.length;
          let nextVoice = englishVoices[nextIndex];
          
          chrome.storage.sync.set({ selectedVoice: nextVoice.voiceName });
          speak(`Voice changed to ${nextVoice.voiceName}.`);
        });
      });
    } else if (command.includes("where am i") || command.includes("read title")) {
      speak(document.title);
    }
  }

  // --- MODIFIED: speak function ---
  function speak(text) {
    isSpeaking = true; // NEW: Set flag
    speechLog.push(text);
    // MODIFIED: This is the typo fix.
    chrome.runtime.sendMessage({ newSpeechLogEntry: text }); 
    // REMOVED: recognition.stop()
    chrome.runtime.sendMessage({ command: "speak", text: text });
  }
  // --- END MODIFIED ---
  
  // --- speakNextChunk ---
  function speakNextChunk() {
    // Check if 5 items have been read (and not in "read all" bypass mode)
    if (isSpeakingQueue && chunksReadSincePrompt >= 5 && chunksReadSincePrompt > 0) {
      isSpeakingQueue = false; // Pause the queue
      chunksReadSincePrompt = 0; // Reset the counter
      pendingAction = { type: 'continueReading' };
      speak("Do you want to continue?");
      return; // Stop here and wait for user input
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
  
  // --- getCleanHeadings() ---
  function getCleanHeadings(getEntries = false) {
    const junkSelectors = ['aside', 'nav', 'header', 'footer', '.infobox', '.sidebar', '.noprint', '[role="navigation"]', '[role="complementary"]'];
    
    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    
    const cleanHeadings = allHeadings.filter(el => {
      // Is it visible and not inside junk?
      return (el.offsetWidth > 0 || el.offsetHeight > 0) && !el.closest(junkSelectors.join(', '));
    });

    if (getEntries) {
      return cleanHeadings.map(el => ({ 
        text: el.textContent.trim(), 
        level: el.tagName[1] 
      }));
    }
    return cleanHeadings;
  }

  // --- findAndActivate() ---
  function findAndActivate(text) {
    const junkSelectors = ['aside', 'nav', 'header', 'footer', '.infobox', '.sidebar', '.noprint'];
    const allLinks = Array.from(document.querySelectorAll('a'));
    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    // Combine links and headings into one list
    const cleanEls = [...allLinks, ...allHeadings].filter(el => {
      return (el.offsetWidth > 0 || el.offsetHeight > 0) &&
             !el.closest(junkSelectors.join(', ')) &&
             el.textContent.trim().length > 0;
    });

    const targetEl = cleanEls.find(el => 
      el.textContent.trim().toLowerCase().includes(text)
    );

    if (targetEl) {
      if (targetEl.tagName === 'A') {
        speak(`Clicking ${targetEl.textContent}.`);
        targetEl.click();
      } else { // It's a heading
        speak(`Moving to ${targetEl.textContent}.`);
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      speak(`Sorry, I could not find ${text}.`);
    }
  }

  // --- findCurrentElement() ---
  function findCurrentElement() {
    const junkSelectors = ['aside', 'nav', 'header', 'footer', '.infobox', '.sidebar', '.noprint'];
    const readableElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    
    let bestElement = null;
    
    for (const el of readableElements) {
        const rect = el.getBoundingClientRect();
        // Find first visible element that is not junk
        if (rect.top >= 0 && rect.top < window.innerHeight && !el.closest(junkSelectors.join(','))) {
           bestElement = el;
           break;
        }
    }
    return bestElement;
  }
  
  // --- readCurrentSection() ---
  function readCurrentSection() {
    const currentEl = findCurrentElement();
    if (!currentEl) {
      speak("No readable text found on screen.");
      return;
    }
    
    let sectionElements = [currentEl];
    let nextEl = currentEl.nextElementSibling;
    
    // Keep adding elements until we hit the next heading
    while (nextEl && !nextEl.tagName.startsWith('H')) {
      sectionElements.push(nextEl);
      nextEl = nextEl.nextElementSibling;
    }
    
    // Now process these elements
    let contentChunks = [];
    if (sectionElements.length > 0) {
      sectionElements.forEach(el => {
        // Only process readable tags
        if (!['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)) {
            return;
        }
        
        const elClone = el.cloneNode(true);
        elClone.querySelectorAll(
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
      speak("No readable text content found in this section.");
    } else {
      speechQueue = contentChunks;
      isSpeakingQueue = true;
      chunksReadSincePrompt = 0; 
      speakNextChunk();
    }
  }

  // --- readFromTop() ---
  function readFromTop() {
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
  
  // 5. Message Listener
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
    } else if (request.command === "silentStop") {
      stopListening(); // Call the silent stop
      sendResponse({ status: "silently stopped" });
    } else if (request.command === "getStatus") {
      sendResponse({ isListening: isListening });
    } else if (request.command === "getLog") {
      sendResponse({ log: commandLog });
    } else if (request.command === "getSpeechLog") {
      sendResponse({ log: speechLog });
    } 
    else if (request.command === "speechEnded") {
      isSpeaking = false; // NEW: Set flag
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