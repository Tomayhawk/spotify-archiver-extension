(function() {
  if (window.hasSpotifyExtractor) return; // prevent duplicate script injection
  window.hasSpotifyExtractor = true;

  browser.runtime.onMessage.addListener((request) => {
    if (request.action === "start") {
      startScraping(request.settings); // start scraping when the message is received
    }
  });

  function findScrollableElement() {
    const grids = document.querySelectorAll('div[role="grid"]');
    let mainGrid = Array.from(grids).find(g => {
        return g.getAttribute("aria-label") !== "Your Library" && g.clientWidth > 400; // find the main playlist grid
    });

    if (!mainGrid && grids.length > 0) {
        mainGrid = Array.from(grids).reduce((prev, curr) => 
            (prev.clientWidth > curr.clientWidth) ? prev : curr // fallback to the widest grid
        );
    }

    if (!mainGrid) {
      alert("Could not find the playlist. Please refresh and try again.");
      return null;
    }

    let el = mainGrid;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (['auto', 'scroll', 'hidden'].includes(style.overflowY) && el.scrollHeight >= el.clientHeight) {
        return el; // return the scrollable element
      }
      el = el.parentElement;
    }
    return document.documentElement; // default to the document root
  }

  async function startScraping(settings) {
    const scrollable = findScrollableElement();
    if (!scrollable) return;

    const collectedTracks = new Map(); // store collected track data
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    scrollable.scrollTop = 0; // start from the top of the playlist
    await wait(1000);

    let lastHighestIndex = 0;
    let noNewDataCount = 0;

    while (true) {
      const maxIndexInBatch = extractVisibleRows(collectedTracks, settings); // extract visible rows

      if (maxIndexInBatch > lastHighestIndex) {
        lastHighestIndex = maxIndexInBatch;
        noNewDataCount = 0;
        console.log(`Scraped up to #${lastHighestIndex}`);
      } else {
        noNewDataCount++;
      }

      const scrollStep = scrollable.clientHeight - 150;
      scrollable.scrollTop += scrollStep; // scroll down

      // smart wait
      let loaded = false;
      for (let i = 0; i < 10; i++) { 
        await wait(200); 
        const rows = document.querySelectorAll('div[role="row"]');
        for (let row of rows) {
            const indexVal = getRowIndex(row);
            if (indexVal > lastHighestIndex) {
                loaded = true;
                break;
            }
        }
        if (loaded) break;
      }

      const isAtBottom = (scrollable.scrollTop + scrollable.clientHeight) >= (scrollable.scrollHeight - 50);
      if (isAtBottom && noNewDataCount >= 2) break; 
      if (noNewDataCount > 5) break;
    }

    downloadCSV(collectedTracks, settings); // save the collected data as a csv file
  }

  function getRowIndex(row) {
    const firstCell = row.querySelector('div[role="gridcell"]'); 
    if (!firstCell) return -1;
    const text = firstCell.innerText.trim();
    const number = parseInt(text, 10);
    return isNaN(number) ? -1 : number; // extract the row index
  }

  function extractVisibleRows(map, settings) {
    const rows = document.querySelectorAll('div[role="row"]');
    let maxIndexFound = -1;

    rows.forEach((row) => {
      const indexNum = getRowIndex(row);
      if (indexNum === -1) return; 

      if (indexNum > maxIndexFound) maxIndexFound = indexNum;

      const titleLink = row.querySelector('a[href*="/track/"]');
      if (!titleLink) return;

      const trackId = titleLink.getAttribute('href');
      if (map.has(trackId)) return;

      let title = settings.title ? titleLink.innerText : "";
      
      let artist = "";
      if (settings.artist) {
        const artistLinks = row.querySelectorAll('a[href*="/artist/"]');
        artist = Array.from(artistLinks).map(a => a.innerText).join("; ");
      }

      let album = "";
      if (settings.album) {
        const albumLink = row.querySelector('a[href*="/album/"]');
        album = albumLink ? albumLink.innerText : "";
      }

      let dateAdded = "";
      let duration = "";
      if (settings.date || settings.duration) {
        const cells = row.querySelectorAll('div[role="gridcell"]');
        cells.forEach(cell => {
          const text = cell.innerText.trim();
          if (settings.duration && /^\d+:\d+$/.test(text)) {
            duration = text; // extract duration
          }
          else if (settings.date && text !== album && text !== title && text !== artist && text.length < 25) {
             if (text.includes("ago") || /\b\d{4}\b/.test(text) || text.includes(",")) {
                 dateAdded = text; // extract date added
             }
          }
        });
      }

      let url = "";
      if (settings.url) {
        url = `http://open.spotify.com${trackId}`; // fixed url format to open.spotify
      }

      let cover = "";
      if (settings.cover) {
        const img = row.querySelector('img');
        if (img) cover = img.src; // extract cover art url
      }

      let explicit = "No";
      if (settings.explicit) {
        const explicitTag = row.querySelector('[aria-label="Explicit"], [title="Explicit"]');
        if (explicitTag) explicit = "Yes"; // check for explicit tag
      }

      map.set(trackId, { index: indexNum, title, artist, album, dateAdded, duration, url, cover, explicit });
    });

    return maxIndexFound;
  }

  function downloadCSV(map, settings) {
    // sort by index number
    const sortedTracks = Array.from(map.values()).sort((a, b) => a.index - b.index);

    let headers = [];
    // only include header if checked
    if (settings.index) headers.push("#");
    
    if (settings.title) headers.push("Title");
    if (settings.artist) headers.push("Artist");
    if (settings.album) headers.push("Album");
    if (settings.date) headers.push("Date Added");
    if (settings.duration) headers.push("Length");
    if (settings.url) headers.push("URL");
    if (settings.cover) headers.push("Cover Art");
    if (settings.explicit) headers.push("Explicit");
    
    let csvContent = headers.join(",") + "\n";

    sortedTracks.forEach(data => {
      let row = [];
      // only include data if checked
      if (settings.index) row.push(data.index);
      
      if (settings.title) row.push(`"${data.title.replace(/"/g, '""')}"`);
      if (settings.artist) row.push(`"${data.artist.replace(/"/g, '""')}"`);
      if (settings.album) row.push(`"${data.album.replace(/"/g, '""')}"`);
      if (settings.date) row.push(`"${data.dateAdded}"`);
      if (settings.duration) row.push(`"${data.duration}"`);
      if (settings.url) row.push(`"${data.url}"`);
      if (settings.cover) row.push(`"${data.cover}"`);
      if (settings.explicit) row.push(`"${data.explicit}"`);
      
      csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spotify_playlist.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
})();
