document.addEventListener("DOMContentLoaded", async () => {
  const keys = ["index", "title", "artist", "album", "date", "duration", "url", "cover", "explicit"];
  const saved = await browser.storage.local.get(keys); // retrieve saved settings from local storage

  keys.forEach(key => {
    const checkbox = document.getElementById(key);
    if (saved[key] !== undefined) {
      checkbox.checked = saved[key]; // restore checkbox states based on saved settings
    }
  });
});

document.getElementById("startBtn").addEventListener("click", async () => {
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = "Injecting script..."; // update status message

  const settings = {
    index: document.getElementById("index").checked,
    title: document.getElementById("title").checked,
    artist: document.getElementById("artist").checked,
    album: document.getElementById("album").checked,
    date: document.getElementById("date").checked,
    duration: document.getElementById("duration").checked,
    url: document.getElementById("url").checked,
    cover: document.getElementById("cover").checked,
    explicit: document.getElementById("explicit").checked
  };

  await browser.storage.local.set(settings); // save the current settings to local storage

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  await browser.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ["extractor.js"] // inject the extractor script into the active tab
  });

  browser.tabs.sendMessage(activeTab.id, { action: "start", settings: settings }); // send a message to start scraping

  statusDiv.textContent = "Scraping... Watch the playlist scroll!"; // update status message
});
