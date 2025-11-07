// --- View Navigation ---
const mainView = document.getElementById('main-view');
const settingsView = document.getElementById('settings-view');
const logsView = document.getElementById('logs-view');
const cmdView = document.getElementById('cmd-view');

document.addEventListener('DOMContentLoaded', () => {
  // Nav Buttons
  document.getElementById('settings-btn').addEventListener('click', () => {
    mainView.style.display = 'none';
    settingsView.style.display = 'block';
  });

  document.getElementById('logs-btn').addEventListener('click', () => {
    mainView.style.display = 'none';
    logsView.style.display = 'block';
  });
  
  document.getElementById('cmd-btn').addEventListener('click', () => {
    mainView.style.display = 'none';
    cmdView.style.display = 'block';
  });

  // Back Buttons
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mainView.style.display = 'block';
      settingsView.style.display = 'none';
      logsView.style.display = 'none';
      cmdView.style.display = 'none';
    });
  });

  // --- Dark Mode Logic ---
  const darkModeToggle = document.getElementById('darkModeToggle');
  chrome.storage.sync.get('darkMode', (data) => {
    if (data.darkMode) {
      document.body.classList.add('dark-mode');
      darkModeToggle.checked = true;
    }
  });
  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      document.body.classList.add('dark-mode');
      chrome.storage.sync.set({ darkMode: true });
    } else {
      document.body.classList.remove('dark-mode');
      chrome.storage.sync.set({ darkMode: false });
    }
  });

  // --- Manage Shortcuts Button Listener ---
  document.getElementById('manageShortcutsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  
  // --- Speed Slider Logic ---
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  chrome.storage.sync.get('speechRate', (data) => {
    const rate = data.speechRate || 1.0;
    speedSlider.value = rate;
    speedValue.textContent = `${parseFloat(rate).toFixed(1)}x`;
  });
  speedSlider.addEventListener('input', () => {
    const rate = speedSlider.value;
    speedValue.textContent = `${parseFloat(rate).toFixed(1)}x`;
    chrome.storage.sync.set({ speechRate: rate });
  });
});

// --- Existing Logic ---
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusText = document.getElementById('status-text');
const statusIndicator = document.getElementById('status-indicator');
const commandLogList = document.getElementById('commandLogList');
const speechLogList = document.getElementById('speechLogList');
const voiceSelect = document.getElementById('voiceSelect');

// --- Voice Population and Saving ---
function populateVoiceList() {
  chrome.tts.getVoices((voices) => {
    voiceSelect.innerHTML = '';
    chrome.storage.sync.get(['selectedVoice'], (result) => {
      const savedVoice = result.selectedVoice;
      let hasSelected = false;

      voices.forEach((voice) => {
        if (voice.lang && voice.lang.includes('en')) {
          const option = document.createElement('option');
          option.textContent = `${voice.voiceName} (${voice.lang})`;
          option.value = voice.voiceName;
          if (voice.voiceName === savedVoice) {
            option.selected = true;
            hasSelected = true;
          }
          voiceSelect.appendChild(option);
        }
      });

      if (!hasSelected && voiceSelect.options.length > 0) {
        voiceSelect.options[0].selected = true;
        chrome.storage.sync.set({ selectedVoice: voiceSelect.options[0].value });
      }
    });
  });
}
voiceSelect.addEventListener('change', () => {
  const selectedVoice = voiceSelect.value;
  chrome.storage.sync.set({ selectedVoice: selectedVoice }, () => {
    console.log('Voice saved:', selectedVoice);
  });
});
populateVoiceList();

// --- Log Helpers ---
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

// --- UI Update Helper ---
function updateUI(isListening) {
  if (isListening) {
    statusText.textContent = 'Status: LISTENING';
    statusIndicator.classList.add('listening');
  } else {
    statusText.textContent = 'Status: STOPPED';
    statusIndicator.classList.remove('listening');
  }
  startButton.disabled = isListening;
  stopButton.disabled = !isListening;
}

// --- Main Logic (on popup open) ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    const tab = tabs[0];
    chrome.tabs.sendMessage(tab.id, { command: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
          statusText.textContent = 'Reloading...';
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              sessionStorage.setItem('voiceNavAutoStart', 'true');
            }
          }, () => {
            chrome.tabs.reload(tab.id);
            window.close();
          });
        } else {
          statusText.textContent = 'Cannot run here';
          startButton.disabled = true;
          stopButton.disabled = true;
        }
        return;
      }
      
      updateUI(response.isListening);

      chrome.tabs.sendMessage(tab.id, { command: "getLog" }, (response) => {
        if (!chrome.runtime.lastError && response && response.log) {
          commandLogList.innerHTML = '';
          response.log.forEach(addCommandLogEntry);
        }
      });

      chrome.tabs.sendMessage(tab.id, { command: "getSpeechLog" }, (response) => {
        if (!chrome.runtime.lastError && response && response.log) {
          speechLogList.innerHTML = '';
          response.log.forEach(addSpeechLogEntry);
        }
      });
    });
  }
});

// --- Button Listeners ---
startButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { command: "startListening" });
  });
});
stopButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { command: "stopListening" });
  });
});

// --- Real-time Updates ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.statusUpdate === true) {
    updateUI(message.isListening);
  }
  if (message.newCommandLogEntry) {
    addCommandLogEntry(message.newCommandLogEntry);
  }
  if (message.newSpeechLogEntry) {
    addSpeechLogEntry(message.newSpeechLogEntry);
  }
});