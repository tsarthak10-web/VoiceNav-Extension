const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');
const logList = document.getElementById('logList'); // NEW

// NEW: Helper function to add an entry to the log UI
function addLogEntry(command) {
  const li = document.createElement('li');
  li.textContent = `> ${command}`;
  logList.appendChild(li);
  // Auto-scroll to the bottom
  logList.parentElement.scrollTop = logList.parentElement.scrollHeight;
}

// Helper function to update the popup's UI
function updateUI(isListening) {
  statusDiv.textContent = isListening ? 'Status: LISTENING' : 'Status: STOPPED';
  startButton.disabled = isListening;
  stopButton.disabled = !isListening;
}

// 1. When the popup opens, get the status AND the command log
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    // Get status (existing)
    chrome.tabs.sendMessage(tabs[0].id, { command: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error. Reload page.';
        startButton.disabled = true;
        stopButton.disabled = true;
      } else {
        updateUI(response.isListening);
      }
    });

    // NEW: Get the full log history
    chrome.tabs.sendMessage(tabs[0].id, { command: "getLog" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(chrome.runtime.lastError.message);
      } else if (response && response.log) {
        logList.innerHTML = ''; // Clear old list
        response.log.forEach(command => {
          addLogEntry(command);
        });
      }
    });
  }
});

// 2. Add listener for the START button
startButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { command: "startListening" });
  });
});

// 3. Add listener for the STOP button
stopButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { command: "stopListening" });
  });
});

// 4. Listen for real-time updates from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Listen for status updates (existing)
  if (message.statusUpdate === true) {
    updateUI(message.isListening);
  }

  // NEW: Listen for new log entries
  if (message.newLogEntry) {
    addLogEntry(message.newLogEntry);
  }
});