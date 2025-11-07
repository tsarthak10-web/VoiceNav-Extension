// (Keep your existing chrome.commands.onCommand listener above this)

// NEW: Listen for 'speak' commands from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "speak") {
    if (sender.tab) { // Make sure it's from a content script
      
      // Stop any previous speech
      chrome.tts.stop(); 
      
      // Speak the new text
      chrome.tts.speak(request.text, {
        onEvent: (event) => {
          if (event.type === 'end' || event.type === 'interrupted' || event.type === 'cancelled') {
            // Send a message back to the *specific tab* that requested it
            chrome.tabs.sendMessage(sender.tab.id, { command: "speechEnded" });
          }
        }
      });
    }
  }
});