const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');
const commandLogList = document.getElementById('commandLogList');
const speechLogList = document.getElementById('speechLogList'); 

// (The helper functions: addCommandLogEntry, addSpeechLogEntry, updateUI are unchanged)
function addCommandLogEntry(command) {
  const li = document.createElement('li');
  li.textContent = `> ${command}`;
  commandLogList.appendChild(li);
  commandLogList.parentElement.scrollTop = commandLogList.parentElement.scrollHeight;
}
function addSpeechLogEntry(text) {
  const li = document.createElement('li');
  li.textContent = `> ${text}`;
  speechLogList.appendChild(li);
  speechLogList.parentElement.scrollTop = speechLogList.parentElement.scrollHeight;
}
function updateUI(isListening) {
  statusDiv.textContent = isListening ? 'Status: LISTENING' : 'Status: STOPPED';
  startButton.disabled = isListening;
  stopButton.disabled = !isListening;
}
// (End of helper functions)

// 1. When the popup opens, get status and BOTH logs
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    const tab = tabs[0]; // Get the full tab object

    // First, try to get the status
    chrome.tabs.sendMessage(tab.id, { command: "getStatus" }, (response) => {
      
      // --- START OF MODIFIED LOGIC ---
      if (chrome.runtime.lastError) {
        // ERROR: Content script isn't responding.
        console.warn(chrome.runtime.lastError.message);
        
        // Check if it's a normal webpage
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
          statusDiv.textContent = 'Error. Auto-reloading...';
          
          // 1. Set the auto-start flag in the tab's session storage
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              sessionStorage.setItem('voiceNavAutoStart', 'true');
            }
          }, () => {
            // 2. After the flag is set, reload the page
            chrome.tabs.reload(tab.id);
            window.close(); // Close the popup
          });

        } else {
          // It's a special page (e.g., chrome://), show a different error.
          statusDiv.textContent = 'Error: Cannot run here.';
          startButton.disabled = true;
          stopButton.disabled = true;
        }
        return; // Stop further execution
      }
      // --- END OF MODIFIED LOGIC ---

      // SUCCESS: Script is running. Update UI and get logs.
      updateUI(response.isListening);

      // Get the command log history
      chrome.tabs.sendMessage(tab.id, { command: "getLog" }, (response) => {
        if (!chrome.runtime.lastError && response && response.log) {
          commandLogList.innerHTML = ''; // Clear old list
          response.log.forEach(addCommandLogEntry);
        }
      });

      // Get the speech log history
      chrome.tabs.sendMessage(tab.id, { command: "getSpeechLog" }, (response) => {
        if (!chrome.runtime.lastError && response && response.log) {
          speechLogList.innerHTML = ''; // Clear old list
          response.log.forEach(addSpeechLogEntry);
        }
      });

    });
  }
});

// (The rest of the file: button listeners and runtime.onMessage listener...
// ...are all unchanged.)

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

  // Listen for new command log entries (MODIFIED)
  if (message.newCommandLogEntry) {
    addCommandLogEntry(message.newCommandLogEntry);
  }

  // Listen for new speech log entries (NEW)
  if (message.newSpeechLogEntry) {
    addSpeechLogEntry(message.newSpeechLogEntry);
  }
});