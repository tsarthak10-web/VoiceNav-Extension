const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');

// Helper function to update the popup's UI
function updateUI(isListening) {
  statusDiv.textContent = isListening ? 'Status: LISTENING' : 'Status: STOPPED';
  startButton.disabled = isListening;
  stopButton.disabled = !isListening;
}

// 1. When the popup opens, ask the content script for its current status
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { command: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be injected yet (e.g., on chrome:// pages)
        statusDiv.textContent = 'Error. Reload page.';
        startButton.disabled = true;
        stopButton.disabled = true;
      } else {
        updateUI(response.isListening);
      }
    });
  }
});

// 2. Add listener for the START button
startButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { command: "startListening" }, (response) => {
      // The update will now be handled by the runtime listener below
    });
  });
});

// 3. Add listener for the STOP button
stopButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { command: "stopListening" }, (response) => {
      // The update will now be handled by the runtime listener below
    });
  });
});

// 4. NEW: Listen for real-time status updates from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if this is the status update message we're looking for
  if (message.statusUpdate === true) {
    updateUI(message.isListening);
  }
});