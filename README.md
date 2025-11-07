# VoiceNav - Voice-Guided Web Navigator

A Chrome extension designed to help visually impaired users navigate the web using only their voice. This project provides hands-free control over websites, content reading, and browser-level actions.

## Features

* **Voice-First Interface:** Control your browser, navigate pages, and access settings entirely with your voice.
* **Audio Feedback:** Plays a quick "beep" sound on successful command recognition so you know you've been heard.
* **Smart Content Reading:**
    * Say **"read page"** to read the main article from your current position, 5 sentences at a time.
    * Say **"list headings"** to get a spoken outline of the page's structure.
    * Say **"read from top"** to read the full article from the beginning.
* **Contextual Navigation:**
    * Jump between sections using **"next heading"** and **"previous heading."**
    * Click any link on the page by saying **"click [text of link]"**.
* **Page & Tab Control:**
    * Open new tabs (to Google), close the current tab, and go back/forward in your history.
    * Search Google ("search for [query]") or open a website ("go to [website dot com]").
* **Accessible Settings:** All settings are controllable by voice:
    * **"increase/decrease speed"**
    * **"next voice"**
* **Smart Automation:**
    * Automatically stops listening after 2 minutes of inactivity.
    * Automatically continues listening when you navigate to a new page or open a new tab.

## How to Install and Use

1.  **Download:**
    * Click the green **`<> Code`** button on this GitHub page.
    * Select **"Download ZIP"**.
2.  **Unzip:**
    * Find the downloaded file (e.g., `VoiceNav-main.zip`) and unzip it. You will have a regular folder named `VoiceNav-main`.
3.  **Load in Chrome:**
    * Open Google Chrome.
    * In the address bar, type `chrome://extensions` and press Enter.
    * In the top-right corner, turn on the **"Developer mode"** toggle.
    * Click the **"Load unpacked"** button that appears on the top-left.
    * Select the `VoiceNav-main` folder you just unzipped.
4.  **Start:**
    * The "VoiceNav" extension is now installed. Pin it to your toolbar for easy access.
    * Go to any website (like `wikipedia.org`).
    * Click the extension icon and click **"Start Listening"** (or use your `Ctrl+Shift+L` shortcut).
5.  **First-Time Use:**
    * The very first time you use it on a website, it will ask for microphone permission.
    * The extension will speak, "This site needs permission to use your microphone. The prompt will appear now. Press Tab, then Enter, to allow."
    * Once you allow it, the extension will say, "Voice navigation activated." You're all set!

## All Voice Commands

Here is a full list of commands the extension understands:

```text
--- VoiceNav Commands ---

[Navigation]
- scroll down
- go down
- scroll up
- go up
- go back
- previous page
- back
- go forward
- next page
- forward
- next heading
- previous heading

[Tab Management]
- close tab
- close this tab
- new tab
- open new tab
- search for [your query]
- go to [website.com]
- open [website.com]

[Content Reading]
- read page
- read this section
- start reading
- read from top
- list headings
- show outline
- stop reading
- stop
- stop listening
- read buttons
- list buttons

[Interaction]
- click first link
- click [text of link]
- open [text of link]
- find search
- search website
- search this site

[Settings]
- increase speed
- speak faster
- decrease speed
- speak slower
- next voice
- change voice

[System & Confirmation]
- help
- what