// Listen for the command defined in manifest.json
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-listening") {
    // Get the currently active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Send a "toggle" message to the content script in that tab
        chrome.tabs.sendMessage(tabs[0].id, { command: "toggleListening" });
      }
    });
  }
});