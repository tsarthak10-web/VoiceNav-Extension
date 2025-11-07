// --- Set to store active tab IDs ---
let activeTabs = new Set();

// --- Clean up the set when a tab is closed ---
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// --- Keyboard Shortcut Listener ---
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-listening") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { command: "toggleListening" });
      }
    });
  }
});

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // 1. Handle speak commands
  if (request.command === "speak") {
    if (sender.tab) { 
      
      // MODIFIED: Get both voice and rate
      chrome.storage.sync.get(['selectedVoice', 'speechRate'], (result) => {
        
        chrome.tts.stop(); 
        const speakOptions = {
          onEvent: (event) => {
            if (event.type === 'end' || event.type === 'interrupted' || event.type === 'cancelled') {
              chrome.tabs.sendMessage(sender.tab.id, { command: "speechEnded" });
            }
          }
        };

        // Add saved voice
        if (result.selectedVoice) {
          speakOptions.voiceName = result.selectedVoice;
        }

        // NEW: Add saved rate
        if (result.speechRate) {
          speakOptions.rate = parseFloat(result.speechRate);
        }
        
        chrome.tts.speak(request.text, speakOptions);
      });
    }
    return true; // Keep channel open for async calls
  }

  // 2. Handle state tracking
  if (request.command === "startListening") {
    activeTabs.add(sender.tab.id);
    sendResponse({ status: "started" });
  } else if (request.command === "stopListening") {
    activeTabs.delete(sender.tab.id);
    sendResponse({ status: "stopped" });
  } else if (request.command === "queryActiveStatus") {
    const isActive = activeTabs.has(sender.tab.id);
    sendResponse({ isActive: isActive });
  }
  
  return true;
});