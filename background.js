// (Your chrome.commands.onCommand listener should be here, unchanged)

// MODIFIED: Listen for 'speak' commands from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "speak") {
    if (sender.tab) {
      
      // 1. Get the user's saved voice
      chrome.storage.sync.get(['selectedVoice'], (result) => {
        
        // 2. Stop any previous speech
        chrome.tts.stop();
        
        const speakOptions = {
          onEvent: (event) => {
            if (event.type === 'end' || event.type === 'interrupted' || event.type === 'cancelled') {
              // Send a message back to the *specific tab* that requested it
              chrome.tabs.sendMessage(sender.tab.id, { command: "speechEnded" });
            }
          }
        };

        // 3. If a voice was saved, add it to the options
        if (result.selectedVoice) {
          speakOptions.voiceName = result.selectedVoice;
        }
        
        // 4. Speak the new text with the selected options
        chrome.tts.speak(request.text, speakOptions);
      });
    }
    return true; // Keep channel open for async storage call
  }
});