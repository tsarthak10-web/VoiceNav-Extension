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
      chrome.storage.sync.get(['selectedVoice', 'speechRate'], (result) => {
        chrome.tts.stop(); 
        const speakOptions = {
          onEvent: (event) => {
            if (event.type === 'end' || event.type === 'interrupted' || event.type === 'cancelled') {
              // Check if the tab still exists before sending a message
              chrome.tabs.get(sender.tab.id, (tab) => {
                if (!chrome.runtime.lastError) {
                  chrome.tabs.sendMessage(sender.tab.id, { command: "speechEnded" });
                }
              });
            }
          }
        };
        if (result.selectedVoice) {
          speakOptions.voiceName = result.selectedVoice;
        }
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
    if(sender.tab) activeTabs.add(sender.tab.id);
    sendResponse({ status: "started" });
  } else if (request.command === "stopListening") {
    if(sender.tab) activeTabs.delete(sender.tab.id);
    sendResponse({ status: "stopped" });
  } else if (request.command === "queryActiveStatus") {
    const isActive = sender.tab ? activeTabs.has(sender.tab.id) : false;
    sendResponse({ isActive: isActive });
  }
  
  // --- 3. MODIFIED: Handle Tab Management ---
  if (request.command === "closeTab") {
    if (sender.tab) {
      activeTabs.delete(sender.tab.id); // Remove from set
      chrome.tabs.remove(sender.tab.id);
    }
  } else if (request.command === "newTab") {
    // 1. Deactivate old tab
    if (sender.tab) {
       activeTabs.delete(sender.tab.id);
       chrome.tabs.sendMessage(sender.tab.id, { command: "silentStop" });
    }
    // 2. Create and activate new tab
    chrome.tabs.create({ url: "https://www.google.com", active: true }, (newTab) => {
      activeTabs.add(newTab.id);
    });
  } else if (request.command === "search" && request.query) {
    // 1. Deactivate old tab
    if (sender.tab) {
       activeTabs.delete(sender.tab.id);
       chrome.tabs.sendMessage(sender.tab.id, { command: "silentStop" });
    }
    // 2. Create and activate new tab
    const url = `https://www.google.com/search?q=${encodeURIComponent(request.query)}`;
    chrome.tabs.create({ url: url, active: true }, (newTab) => {
      activeTabs.add(newTab.id);
    });
  } else if (request.command === "openUrl" && request.url) {
    // 1. Deactivate old tab
    if (sender.tab) {
       activeTabs.delete(sender.tab.id);
       chrome.tabs.sendMessage(sender.tab.id, { command: "silentStop" });
    }
    // 2. Create and activate new tab
    let url = request.url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    chrome.tabs.create({ url: url, active: true }, (newTab) => {
      activeTabs.add(newTab.id);
    });
  }
  // --- END MODIFIED ---
  
  return true;
});