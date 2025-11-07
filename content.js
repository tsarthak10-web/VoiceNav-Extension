// 1. Initialize Speech Recognition (STT) and Synthesis (TTS)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// const synthesis = window.speechSynthesis; // We no longer use this directly

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
  // (startListening and stopListening are unchanged)

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

  // --- Command and Control Logic ---
  // (handleCommand is unchanged)
  
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
      chrome.runtime.sendMessage({ command: "speak", text: "" }); 
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

  // --- speak and isElementInViewport are unchanged ---
  function speak(text) {
    speechLog.push(text);
    chrome.runtime.sendMessage({ newSpeechLogEntry: text });
    if (isListening) {
        recognition.stop();
    }
    chrome.runtime.sendMessage({ command: "speak", text: text });
  }
  function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top < window.innerHeight && rect.bottom > 0
    );
  }

  // --- START OF MODIFIED readMainContent ---
  function readMainContent() {
    let content = '';
    
    // --- NEW GENERIC SELECTOR ---
    // 1. Look for standard <article> tag (common on news sites).
    // 2. Fall back to standard <main> tag.
    // 3. Fall back to Wikipedia's specific content ID.
    // 4. If all else fails, use the whole <body>.
    const mainElement = document.querySelector('article') || 
                        document.querySelector('main') || 
                        document.querySelector('div#mw-content-text') || 
                        document.body;
    
    // Select all potential readable elements *within* that container
    const allReadableElements = mainElement.querySelectorAll('h1, h2, h3, h4, p, li');

    // --- NEW GENERIC FILTER ---
    // This is the most important change
    const visibleAndValidElements = Array.from(allReadableElements)
      .filter(el => {
        // 1. Is the element on the screen?
        const inViewport = isElementInViewport(el);
        
        // 2. Is the element *inside* a container we want to ignore?
        //    el.closest() checks the element itself and all its parents
        //    [class*="..."] checks for a class that *contains* the word.
        //    This is how we make it work on almost any site.
        const inJunk = el.closest(
            'aside',          // Standard HTML tag for sidebars
            'nav',            // Standard HTML tag for navigation
            'header',         // Standard HTML tag for headers
            'footer',         // Standard HTML tag for footers
            '[class*="ad"]',        // Any element with "ad" in its class
            '[class*="sidebar"]',   // Any element with "sidebar" in its class
            '[class*="comment"]',   // Any element with "comment" in its class
            '[class*="widget"]',    // Any element with "widget" in its class
            '[class*="promo"]',     // Any element with "promo" in its class
            '[class*="infobox"]',   // Catches Wikipedia's infobox
            '.noprint'        // "No print" sections
        );
        
        // 3. Only include it if it's IN VIEWPORT and NOT IN JUNK
        return inViewport && !inJunk;
      });
    // --- END OF NEW FILTER ---


    if (visibleAndValidElements.length > 0) {
      visibleAndValidElements.forEach(el => {
        // Clone the element to avoid changing the live page
        const elClone = el.cloneNode(true);
        
        // Now we just clean up in-line junk
        elClone.querySelectorAll(
          'sup',                // Superscript text (like citations)
          'button',             // Buttons
          '[role="button"]',
          '[aria-hidden="true"]'
        ).forEach(child => child.remove());
        
        // Get the cleaned text
        const cleanText = elClone.textContent.trim();
        
        if (cleanText.length > 0) {
          content += cleanText + '. ';
        }
      });
    }

    if (content.trim().length === 0) {
      speak("No readable text content found on the screen.");
    } else {
      speak(content);
    }
  }
  // --- END OF MODIFIED readMainContent ---


  // 5. Listen for messages from popup AND background script
  // (Message Listener is unchanged)
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
      if (isListening) {
        try {
          recognition.start();
        } catch(e) {
          console.log("Recognition error on restart.");
        }
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
    }
  })();
  
}