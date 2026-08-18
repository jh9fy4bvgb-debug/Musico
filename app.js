/* =====================================================
  COZY PLAYER
  APP.JS
===================================================== */




/* =====================================================
  CONFIG
===================================================== */


const CLIENT_ID = "407ae9143c414199bfc6d996113b22a6";


const REDIRECT_URI = "http://127.0.0.1:5500/";


const SCOPES = [
   "user-read-currently-playing",
   "user-read-playback-state",
   "user-modify-playback-state",
   "user-top-read",
   "user-read-recently-played"
];




/* =====================================================
  PLAYER STATE
===================================================== */


let currentBeats = [];
let nextBeatIndex = 0;
let lastAnalysisTrackId = null;
let lastTrackId = null;


let currentProgressMs = 0;
let currentDurationMs = 0;
let currentIsPlaying = false;
let lastProgressSyncTime = 0;




/* =====================================================
  LYRICS STATE
===================================================== */


let lyricsTrackId = null;
let syncedLyrics = [];
let activeLyricIndex = -1;
let currentRenderedLyric = -1;
const LYRIC_STYLES = ["glow", "spatial", "vintage", "graffiti"];
let lyricsStyle = localStorage.getItem("cozy-lyrics-style") || "glow";




/* =====================================================
  DISCOVERY STATE
===================================================== */


let discoveryTracks = [];
let discoveryIndex = 0;
let discoveryLoaded = false;




/* =====================================================
  LOGIN
===================================================== */


function generateRandomString(length) {


   const chars =
       "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";


   let result = "";


   for (let i = 0; i < length; i++) {
       result += chars.charAt(
           Math.floor(Math.random() * chars.length)
       );
   }


   return result;
}


/* =====================================================
  LIVE LYRICS — RENDER, STYLE & WORD SYNC
===================================================== */

function setLyricsStyle(style) {

   lyricsStyle = style === "3d" ? "spatial" : style;
   lyricsStyle = lyricsStyle === "fluid" ? "graffiti" : lyricsStyle;
   if (!LYRIC_STYLES.includes(lyricsStyle)) lyricsStyle = "glow";
   localStorage.setItem("cozy-lyrics-style", lyricsStyle);

   LYRIC_STYLES.forEach(name => {
       document.body.classList.toggle(
           `lyrics-style-${name}`,
           lyricsStyle === name && name !== "glow"
       );
   });

   document.querySelectorAll("[data-lyrics-style]").forEach(button => {
       const selected = button.dataset.lyricsStyle === lyricsStyle;
       button.classList.toggle("is-selected", selected);
       button.setAttribute("aria-pressed", String(selected));
   });

   if (activeLyricIndex >= 0) {
       updateLyricLineStates(activeLyricIndex);
   }

   requestAnimationFrame(() => {
       if (lyricsStyle === "vintage") {
           prepareVintageRows();
       } else {
           unwrapVintageRows();
       }
   });
}

function setupLyricsStyleSwitcher() {

   document.querySelectorAll("[data-lyrics-style]").forEach(button => {
       button.addEventListener("click", () => {
           setLyricsStyle(button.dataset.lyricsStyle);
       });
   });

   setLyricsStyle(lyricsStyle);
}

function renderLyrics() {

   const lyricsElement = document.querySelector("#lyrics");
   if (!lyricsElement) return;

   currentRenderedLyric = -1;

   lyricsElement.innerHTML = syncedLyrics.map((line, index) => {
       const words = line.text.split(/\s+/).filter(Boolean);
       const wordHtml = words.map((word, wordIndex) => `
           <span class="lyric-word" data-word-index="${wordIndex}">
               ${escapeHtml(word)}
           </span>
       `).join(" ");

       return `
           <div class="lyrics-line" data-index="${index}">
               ${wordHtml}
           </div>
       `;
   }).join("");

   applySpatialLayout(lyricsElement);

   if (lyricsStyle === "vintage") {
       requestAnimationFrame(prepareVintageRows);
   }
}

function prepareVintageRows() {

   document.querySelectorAll(".lyrics-line").forEach(line => {
       if (line.dataset.vintagePrepared === "true") return;

       const words = [...line.querySelectorAll(".lyric-word")];
       if (!words.length) return;

       const rows = [];
       let currentRow = [];
       let previousTop = null;

       words.forEach(word => {
           const wordTop = word.offsetTop;

           if (previousTop !== null && Math.abs(wordTop - previousTop) > 3) {
               rows.push(currentRow);
               currentRow = [];
           }

           currentRow.push(word);
           previousTop = wordTop;
       });

       if (currentRow.length) rows.push(currentRow);

       line.replaceChildren();

       rows.forEach((rowWords, rowIndex) => {
           const row = document.createElement("span");
           row.className = "vintage-row";
           row.style.setProperty("--vintage-row-delay", `${rowIndex * .48}s`);

           rowWords.forEach((word, wordIndex) => {
               row.append(word);
               if (wordIndex < rowWords.length - 1) {
                   row.append(document.createTextNode(" "));
               }
           });

           line.append(row);
       });

       line.dataset.vintagePrepared = "true";
   });
}

function unwrapVintageRows() {

   document.querySelectorAll(".lyrics-line[data-vintage-prepared='true']").forEach(line => {
       const words = [...line.querySelectorAll(".lyric-word")];
       line.replaceChildren();

       words.forEach((word, index) => {
           line.append(word);
           if (index < words.length - 1) {
               line.append(document.createTextNode(" "));
           }
       });

       delete line.dataset.vintagePrepared;
   });
}

function spatialValue(seed, min, max) {

   const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
   const fraction = value - Math.floor(value);
   return min + fraction * (max - min);
}

function applySpatialLayout(lyricsElement) {

   lyricsElement.querySelectorAll(".lyrics-line").forEach((line, lineIndex) => {
       line.style.setProperty("--spatial-turn", `${spatialValue(lineIndex + 1, -13, 13).toFixed(2)}deg`);
       line.style.setProperty("--spatial-yaw", `${spatialValue(lineIndex + 17, -12, 12).toFixed(2)}deg`);
       line.style.setProperty("--spatial-drift", `${spatialValue(lineIndex + 41, -13, 13).toFixed(2)}px`);
       line.style.setProperty("--spatial-delay", `${spatialValue(lineIndex + 73, -5, 0).toFixed(2)}s`);

       line.querySelectorAll(".lyric-word").forEach((word, wordIndex) => {
           const seed = (lineIndex + 1) * 31 + wordIndex + 1;
           word.style.setProperty("--word-turn", `${spatialValue(seed, -16, 16).toFixed(2)}deg`);
           word.style.setProperty("--word-lift", `${spatialValue(seed + 19, -10, 10).toFixed(2)}px`);
           word.style.setProperty("--word-delay", `${spatialValue(seed + 37, -1.2, 0).toFixed(2)}s`);
       });
   });
}

function escapeHtml(text) {

   const div = document.createElement("div");
   div.textContent = text;
   return div.innerHTML;
}

function updateLyricLineStates(activeIndex) {

   const lines = document.querySelectorAll(".lyrics-line");

   lines.forEach((line, index) => {
       const distance = index - activeIndex;
       line.classList.remove("active", "near", "past", "future");
       line.style.setProperty("--lyric-distance", String(distance));

       if (distance === 0) {
           line.classList.add("active");
       } else if (Math.abs(distance) === 1) {
           line.classList.add("near", distance < 0 ? "past" : "future");
       } else {
           line.classList.add(distance < 0 ? "past" : "future");
       }
   });

   const activeLine = lines[activeIndex];
   if (activeLine && lyricsStyle !== "graffiti") {
       activeLine.scrollIntoView({ behavior: "smooth", block: "center" });
   }
}

function updateActiveLyric() {

   if (!syncedLyrics.length) return;

   const elapsed = currentIsPlaying ? Date.now() - lastProgressSyncTime : 0;
   const currentMs = Math.min(currentProgressMs + elapsed, currentDurationMs);
   let newIndex = -1;

   for (let i = 0; i < syncedLyrics.length; i++) {
       if (syncedLyrics[i].time <= currentMs) newIndex = i;
       else break;
   }

   if (newIndex === -1) return;

   const lines = document.querySelectorAll(".lyrics-line");
   if (!lines.length) return;

   if (newIndex !== currentRenderedLyric) {
       currentRenderedLyric = newIndex;
       activeLyricIndex = newIndex;
       updateLyricLineStates(newIndex);

       const activeLine = lines[newIndex];
       if (activeLine && lyricsStyle === "spatial") {
           activeLine.animate([
               { transform: "translate3d(0, 14px, -460px) rotateX(23deg)", opacity: 0 },
               { transform: "translate3d(0, -4px, 40px) rotateX(-2deg)", opacity: 1 },
               { transform: "translate3d(0, 0, 24px) rotateX(0deg)", opacity: 1 }
           ], { duration: 900, easing: "cubic-bezier(.16, 1, .3, 1)" });
       }
   }

   const activeLine = lines[newIndex];
   if (!activeLine) return;

   const currentLine = syncedLyrics[newIndex];
   const nextLine = syncedLyrics[newIndex + 1];
   const lineDuration = nextLine
       ? nextLine.time - currentLine.time
       : Math.max(2500, currentDurationMs - currentLine.time);
   const progress = Math.max(0, Math.min(1, (currentMs - currentLine.time) / lineDuration));
   const words = activeLine.querySelectorAll(".lyric-word");
   const visibleWords = Math.max(0, Math.min(words.length, Math.floor(progress * (words.length + .7))));
   const isGraffitiStyle = lyricsStyle === "graffiti";
   const isVintageStyle = lyricsStyle === "vintage";

   words.forEach((word, index) => {
       word.classList.toggle(
           "sung",
           isGraffitiStyle || isVintageStyle || index < visibleWords - 1
       );
       word.classList.toggle(
           "current",
           !isGraffitiStyle && !isVintageStyle && currentIsPlaying && index === visibleWords - 1 && visibleWords > 0
       );
   });
}




async function sha256(plain) {


   const encoder = new TextEncoder();


   const data = encoder.encode(plain);


   return await crypto.subtle.digest(
       "SHA-256",
       data
   );
}




function base64urlencode(input) {


   return btoa(
       String.fromCharCode(
           ...new Uint8Array(input)
       )
   )
       .replace(/\+/g, "-")
       .replace(/\//g, "_")
       .replace(/=+$/, "");
}




async function login() {


   const verifier =
       generateRandomString(128);


   const hashed =
       await sha256(verifier);


   const challenge =
       base64urlencode(hashed);


   localStorage.setItem(
       "code_verifier",
       verifier
   );


   const params =
       new URLSearchParams({


           client_id: CLIENT_ID,


           response_type: "code",


           redirect_uri: REDIRECT_URI,


           scope: SCOPES.join(" "),


           code_challenge_method: "S256",


           code_challenge: challenge


       });


   window.location.href =
       "https://accounts.spotify.com/authorize?" +
       params.toString();
}




function showLoginButton() {


   const btn =
       document.querySelector(".login-button");


   if (btn) {
       btn.style.display = "inline-block";
   }
}




/* =====================================================
  TOKEN — AUTHORIZATION CODE
===================================================== */


async function getToken(code) {


   const verifier =
       localStorage.getItem("code_verifier");


   const response =
       await fetch(
           "https://accounts.spotify.com/api/token",
           {
               method: "POST",


               headers: {
                   "Content-Type":
                       "application/x-www-form-urlencoded"
               },


               body:
                   new URLSearchParams({


                       client_id: CLIENT_ID,


                       grant_type:
                           "authorization_code",


                       code: code,


                       redirect_uri:
                           REDIRECT_URI,


                       code_verifier:
                           verifier


                   })
           }
       );


   const data =
       await response.json();


   if (data.access_token) {


       localStorage.setItem(
           "access_token",
           data.access_token
       );


       localStorage.setItem(
           "refresh_token",
           data.refresh_token || ""
       );


       window.history.replaceState(
           {},
           document.title,
           "/"
       );


       loadCurrentTrack();


       setInterval(
           loadCurrentTrack,
           3000
       );


   } else {


       console.error(data);


       alert(
           "Errore durante il login Spotify."
       );
   }
}




/* =====================================================
  TOKEN — REFRESH
===================================================== */


async function refreshAccessToken() {


   const refreshToken =
       localStorage.getItem(
           "refresh_token"
       );


   if (!refreshToken) {


       showLoginButton();


       return false;
   }


   try {


       const response =
           await fetch(
               "https://accounts.spotify.com/api/token",
               {
                   method: "POST",


                   headers: {
                       "Content-Type":
                           "application/x-www-form-urlencoded"
                   },


                   body:
                       new URLSearchParams({


                           client_id: CLIENT_ID,


                           grant_type:
                               "refresh_token",


                           refresh_token:
                               refreshToken


                       })
               }
           );


       const data =
           await response.json();


       if (data.access_token) {


           localStorage.setItem(
               "access_token",
               data.access_token
           );


           if (data.refresh_token) {


               localStorage.setItem(
                   "refresh_token",
                   data.refresh_token
               );
           }


           return true;
       }


       console.error(
           "Impossibile rinnovare il token:",
           data
       );


   } catch (error) {


       console.error(
           "Errore refresh token:",
           error
       );
   }


   showLoginButton();


   return false;
}




/* =====================================================
  GENERIC SPOTIFY FETCH
===================================================== */


async function spotifyFetch(
   url,
   options = {},
   retry = true
) {


   let token =
       localStorage.getItem("access_token");


   if (!token) {
       return null;
   }


   const headers = {
       ...(options.headers || {}),
       Authorization:
           `Bearer ${token}`
   };


   let response;


   try {


       response =
           await fetch(
               url,
               {
                   ...options,
                   headers
               }
           );


   } catch (error) {


       console.error(
           "Errore connessione Spotify:",
           error
       );


       return null;
   }


   if (
       response.status === 401 &&
       retry
   ) {


       const refreshed =
           await refreshAccessToken();


       if (refreshed) {


           return spotifyFetch(
               url,
               options,
               false
           );
       }
   }


   return response;
}




/* =====================================================
  AUDIO ANALYSIS
===================================================== */


async function loadAudioAnalysis(trackId) {


   if (
       lastAnalysisTrackId === trackId
   ) {
       return;
   }


   lastAnalysisTrackId =
       trackId;


   currentBeats = [];
   nextBeatIndex = 0;


   const response =
       await spotifyFetch(
           `https://api.spotify.com/v1/audio-analysis/${trackId}`
       );


   if (!response || !response.ok) {
       return;
   }


   try {


       const data =
           await response.json();


       if (data && data.beats) {


           currentBeats =
               data.beats.map(
                   beat =>
                       beat.start * 1000
               );
       }


   } catch (error) {


       console.warn(
           "Impossibile caricare audio analysis:",
           error
       );
   }
}




/* =====================================================
  CURRENT TRACK
===================================================== */


async function loadCurrentTrack() {


   const response =
       await spotifyFetch(
           "https://api.spotify.com/v1/me/player/currently-playing"
       );


   if (!response) {
       return;
   }


   if (response.status === 204) {
       return;
   }


   if (!response.ok) {


       console.error(
           "Spotify API error:",
           response.status
       );


       return;
   }


   const data =
       await response.json();


   if (!data.item) {
       return;
   }


   const track =
       data.item;




   /* =================================================
      LYRICS
   ================================================= */


   loadLyrics(track);


   loadAudioAnalysis(track.id);




   /* =================================================
      NASCONDI LOGIN
   ================================================= */


   const loginButton =
       document.querySelector(
           ".login-button"
       );


   if (loginButton) {


       loginButton.style.display =
           "none";
   }




   /* =================================================
      PLAY / PAUSE
   ================================================= */


   if (data.is_playing) {


       document.body.classList.remove(
           "paused"
       );


       const status =
           document.querySelector(
               ".status-text"
           );


       if (status) {
           status.textContent =
               "IN RIPRODUZIONE";
       }


   } else {


       document.body.classList.add(
           "paused"
       );


       const status =
           document.querySelector(
               ".status-text"
           );


       if (status) {
           status.textContent =
               "IN PAUSA";
       }
   }




   /* =================================================
      CAMBIO CANZONE
   ================================================= */


   const isNewSong =
       lastTrackId !== null &&
       lastTrackId !== track.id;




   const coverUrl =
       track.album &&
       track.album.images &&
       track.album.images.length
           ? track.album.images[0].url
           : "";




   const applyTrackContent =
       () => {


           const cover =
               document.querySelector(
                   ".cover"
               );


           if (cover && coverUrl) {


               cover.style.backgroundImage =
                   `url("${coverUrl}")`;
           }




           const artist =
               document.querySelector(
                   ".artist"
               );


           if (artist) {


               artist.textContent =
                   track.artists
                       .map(
                           artist =>
                               artist.name
                       )
                       .join(", ");
           }




           const title =
               document.querySelector(
                   ".title"
               );


           if (title) {


               title.textContent =
                   track.name;
           }




           const lyricsArtist =
               document.querySelector(
                   ".lyrics-artist"
               );


           const lyricsTitle =
               document.querySelector(
                   ".lyrics-title"
               );




           if (lyricsArtist) {


               lyricsArtist.textContent =
                   track.artists
                       .map(
                           artist =>
                               artist.name
                       )
                       .join(", ");
           }




           if (lyricsTitle) {


               lyricsTitle.textContent =
                   track.name;
           }
       };




   if (isNewSong) {


       await animateTrackChange(
           applyTrackContent
       );


       if (coverUrl) {
           extractColors(coverUrl);
       }


   } else {


       applyTrackContent();


       if (
           coverUrl &&
           !document.body.dataset.colorsApplied
       ) {


           extractColors(
               coverUrl
           );


           document.body.dataset.colorsApplied =
               "true";
       }
   }




   lastTrackId =
       track.id;




   /* =================================================
      PROGRESS
   ================================================= */


   currentProgressMs =
       data.progress_ms || 0;


   currentDurationMs =
       track.duration_ms || 0;


   currentIsPlaying =
       data.is_playing;


   lastProgressSyncTime =
       Date.now();


   updateActiveLyric();
}




/* =====================================================
  PLAY SELECTED TRACK
===================================================== */


/*
  Questa è la parte che mancava.


  Quando l'utente clicca una canzone nella Discovery,
  Spotify riceve il suo URI e la riproduce.
*/


async function playTrack(track) {


   if (!track) {
       return;
   }


   const token =
       localStorage.getItem(
           "access_token"
       );


   if (!token) {


       alert(
           "Accedi con Spotify per riprodurre una canzone."
       );


       return;
   }




   try {


       /*
          Prima cerchiamo il dispositivo Spotify
          attualmente disponibile.
       */


       const devicesResponse =
           await spotifyFetch(
               "https://api.spotify.com/v1/me/player/devices"
           );


       let deviceId = null;


       if (
           devicesResponse &&
           devicesResponse.ok
       ) {


           const deviceData =
               await devicesResponse.json();


           const devices =
               deviceData.devices || [];




           /*
              Preferiamo il dispositivo già attivo.
           */


           const activeDevice =
               devices.find(
                   device =>
                       device.is_active
               );




           if (activeDevice) {


               deviceId =
                   activeDevice.id;


           } else if (devices.length > 0) {


               /*
                  Se non c'è un dispositivo attivo,
                  utilizziamo il primo disponibile.
               */


               deviceId =
                   devices[0].id;
           }
       }




       /*
          Costruiamo il body della richiesta.
       */


       const body = {
           uris: [
               track.uri
           ]
       };




       /*
          Se abbiamo trovato un dispositivo,
          diciamo esplicitamente a Spotify dove
          riprodurre la canzone.
       */


       if (deviceId) {


           body.device_id =
               deviceId;
       }




       const response =
           await spotifyFetch(
               "https://api.spotify.com/v1/me/player/play",
               {
                   method: "PUT",


                   headers: {
                       "Content-Type":
                           "application/json"
                   },


                   body:
                       JSON.stringify(body)
               }
           );




       if (!response) {
           return;
       }




       if (response.ok) {


           /*
              Aggiorniamo immediatamente
              la Discovery.
           */


           selectDiscoveryTrack(
               discoveryIndex
           );




           /*
              Aspettiamo un attimo che Spotify
              aggiorni lo stato del player.
           */


           setTimeout(
               loadCurrentTrack,
               500
           );


           return;
       }




       /*
          Errore molto comune:
          nessun dispositivo Spotify disponibile.
       */


       if (response.status === 404) {


           alert(
               "Non è stato trovato un dispositivo Spotify attivo. Apri Spotify su un dispositivo e riprova."
           );


           return;
       }




       let errorData = null;


       try {
           errorData =
               await response.json();
       } catch (e) {
           // Nessun JSON disponibile
       }




       console.error(
           "Errore riproduzione Spotify:",
           response.status,
           errorData
       );




   } catch (error) {


       console.error(
           "Errore durante la riproduzione:",
           error
       );
   }
}




/* =====================================================
  PROGRESS TICK
===================================================== */


function tickProgress() {


   if (!currentDurationMs) {
       return;
   }




   const elapsed =
       currentIsPlaying
           ? Date.now() -
             lastProgressSyncTime
           : 0;




   const estimatedMs =
       Math.min(
           currentProgressMs +
           elapsed,
           currentDurationMs
       );




   const ratio =
       estimatedMs /
       currentDurationMs;




   const progressBar =
       document.querySelector(
           ".progress-bar"
       );


   if (progressBar) {


       progressBar.style.width =
           `${ratio * 100}%`;
   }




   const currentTime =
       document.querySelector(
           ".current-time"
       );


   if (currentTime) {


       currentTime.textContent =
           formatTime(
               estimatedMs
           );
   }




   const totalTime =
       document.querySelector(
           ".total-time"
       );


   if (totalTime) {


       totalTime.textContent =
           formatTime(
               currentDurationMs
           );
   }




   updateActiveLyric();




   /* =================================================
      BLOB BEAT
   ================================================= */


   if (
       currentIsPlaying &&
       currentBeats.length > 0
   ) {


       const elapsed =
           Date.now() -
           lastProgressSyncTime;


       const currentMs =
           Math.min(
               currentProgressMs +
               elapsed,
               currentDurationMs
           );




       if (
           nextBeatIndex > 0 &&
           currentMs <
           currentBeats[
               nextBeatIndex - 1
           ]
       ) {


           nextBeatIndex = 0;
       }




       while (
           nextBeatIndex <
               currentBeats.length &&
           currentMs >=
               currentBeats[
                   nextBeatIndex
               ]
       ) {


           triggerBeatPulse();


           nextBeatIndex++;
       }
   }
}




setInterval(
   tickProgress,
   250
);




/* =====================================================
  FADE CAMBIO CANZONE
===================================================== */


function animateTrackChange(
   updateContent
) {


   return new Promise(
       resolve => {


           const cover =
               document.querySelector(
                   ".cover"
               );


           const info =
               document.querySelector(
                   ".song-info"
               );




           if (!cover || !info) {


               updateContent();


               resolve();


               return;
           }




           cover.classList.remove(
               "cover-flipping"
           );


           info.classList.remove(
               "song-changing-out",
               "song-changing-in"
           );




           cover.classList.add("cover-flipping");


           info.classList.add(
               "song-changing-out"
           );




           setTimeout(
               () => {


                   info.classList.remove(
                       "song-changing-out"
                   );




                   updateContent();




                   info.classList.add(
                       "song-changing-in"
                   );




                   setTimeout(
                       () => {


                           cover.classList.remove("cover-flipping");


                           info.classList.remove(
                               "song-changing-in"
                           );


                           resolve();


                       },
                       650
                   );


               },
               420
           );
       }
   );
}




/* =====================================================
  COLOR EXTRACTION
===================================================== */


function extractColors(
   imageUrl
) {


   const image =
       new Image();


   image.crossOrigin =
       "Anonymous";




   image.onload =
       function () {


           try {


               const canvas =
                   document.createElement(
                       "canvas"
                   );


               const ctx =
                   canvas.getContext(
                       "2d",
                       {
                           willReadFrequently:
                               true
                       }
                   );




               canvas.width = 50;
               canvas.height = 50;




               ctx.drawImage(
                   image,
                   0,
                   0,
                   50,
                   50
               );




               const pixels =
                   ctx.getImageData(
                       0,
                       0,
                       50,
                       50
                   ).data;




               const colors = [];




               for (
                   let i = 0;
                   i < pixels.length;
                   i += 16
               ) {


                   const r =
                       pixels[i];


                   const g =
                       pixels[i + 1];


                   const b =
                       pixels[i + 2];




                   const brightness =
                       (r + g + b) / 3;




                   if (
                       brightness < 20 ||
                       brightness > 245
                   ) {
                       continue;
                   }




                   const max =
                       Math.max(
                           r,
                           g,
                           b
                       );


                   const min =
                       Math.min(
                           r,
                           g,
                           b
                       );




                   const saturation =
                       max === 0
                           ? 0
                           : (
                               max - min
                           ) / max;




                   if (
                       saturation < 0.18
                   ) {
                       continue;
                   }




                   colors.push({


                       r,
                       g,
                       b,
                       saturation,
                       brightness


                   });
               }




               colors.sort(
                   (a, b) =>
                       b.saturation -
                       a.saturation
               );




               const selected = [];




               for (
                   const color
                   of colors
               ) {


                   if (
                       selected.length >= 4
                   ) {
                       break;
                   }




                   const tooSimilar =
                       selected.some(
                           existing =>
                               colorDistance(
                                   color,
                                   existing
                               ) < 65
                       );




                   if (!tooSimilar) {


                       selected.push(
                           color
                       );
                   }
               }




               while (
                   selected.length < 4
               ) {


                   selected.push(
                       colors[
                           selected.length
                       ] || {
                           r: 70,
                           g: 70,
                           b: 100
                       }
                   );
               }




               applyBlobColors(
                   selected
               );


           } catch (error) {


               console.warn(
                   "Errore estrazione colori:",
                   error
               );
           }
       };




   image.onerror =
       function () {


           console.warn(
               "Impossibile leggere la cover."
           );
       };




   image.src =
       imageUrl;
}




/* =====================================================
  COLOR DISTANCE
===================================================== */


function colorDistance(
   a,
   b
) {


   const r =
       a.r - b.r;


   const g =
       a.g - b.g;


   const blue =
       a.b - b.b;




   return Math.sqrt(
       r * r +
       g * g +
       blue * blue
   );
}




/* =====================================================
  APPLY COLORS
===================================================== */


function applyBlobColors(
   colors
) {


   const blobs =
       document.querySelectorAll(
           ".blob"
       );




   colors.forEach(
       (color, index) => {


           if (!blobs[index]) {
               return;
           }




           const factor =
               1.12;




           const r =
               Math.min(
                   255,
                   Math.round(
                       color.r *
                       factor
                   )
               );




           const g =
               Math.min(
                   255,
                   Math.round(
                       color.g *
                       factor
                   )
               );




           const b =
               Math.min(
                   255,
                   Math.round(
                       color.b *
                       factor
                   )
               );




           blobs[index].style.background =
               `rgb(${r}, ${g}, ${b})`;

           const fluidR = Math.round(r + (255 - r) * 0.42);
           const fluidG = Math.round(g + (255 - g) * 0.42);
           const fluidB = Math.round(b + (255 - b) * 0.42);

           document.documentElement.style.setProperty(
               `--cover-color-${index + 1}`,
               `rgb(${r}, ${g}, ${b})`
           );

           document.documentElement.style.setProperty(
               `--graffiti-color-${index + 1}`,
               `rgb(${fluidR}, ${fluidG}, ${fluidB})`
           );
       }
   );
}




/* =====================================================
  PAGE NAVIGATION
===================================================== */


function goToDiscovery() {


   document
       .querySelector(".app-pages")
       .classList.add(
           "discovery-active"
       );




   if (!discoveryLoaded) {


       loadDiscovery();
   }
}




function goToLyrics() {


   document
       .querySelector(".app-pages")
       .classList.add(
           "lyrics-active"
       );


   updateActiveLyric();
}




function goToHome() {


   document
       .querySelector(".app-pages")
       .classList.remove(
           "lyrics-active",
           "discovery-active"
       );
}




/* =====================================================
  DISCOVERY — LOAD
===================================================== */


async function loadDiscovery() {


   if (discoveryLoaded) {
       return;
   }




   const trackElement =
       document.querySelector(
           ".discovery-track"
       );


   const messageElement =
       document.querySelector(
           ".discovery-message"
       );




   if (!trackElement) {
       return;
   }




   const token =
       localStorage.getItem(
           "access_token"
       );




   if (!token) {


       if (messageElement) {


           messageElement.textContent =
               "ACCEDI CON SPOTIFY PER SCOPRIRE LA TUA MUSICA.";
       }


       return;
   }




   if (messageElement) {


       messageElement.textContent =
           "CARICAMENTO…";
   }




   try {


       /*
          Recuperiamo i brani ascoltati di recente.
          Se non ce ne sono abbastanza, aggiungiamo
          anche i brani più ascoltati dell'utente.
       */


       const recentResponse =
           await spotifyFetch(
               "https://api.spotify.com/v1/me/player/recently-played?limit=20"
           );




       const tracks = [];




       if (
           recentResponse &&
           recentResponse.ok
       ) {


           const recentData =
               await recentResponse.json();




           for (
               const item
               of recentData.items || []
           ) {


               if (
                   item.track &&
                   item.track.type === "track"
               ) {


                   if (
                       !tracks.some(
                           track =>
                               track.id ===
                               item.track.id
                       )
                   ) {


                       tracks.push(
                           item.track
                       );
                   }
               }
           }
       }




       /*
          Se abbiamo meno di 12 canzoni,
          prendiamo anche i top tracks.
       */


       if (tracks.length < 12) {


           const topResponse =
               await spotifyFetch(
                   "https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term"
               );




           if (
               topResponse &&
               topResponse.ok
           ) {


               const topData =
                   await topResponse.json();




               for (
                   const track
                   of topData.items || []
               ) {


                   if (
                       !tracks.some(
                           existing =>
                               existing.id ===
                               track.id
                       )
                   ) {


                       tracks.push(track);
                   }
               }
           }
       }




       discoveryTracks =
           tracks.slice(0, 20);




       if (!discoveryTracks.length) {


           if (messageElement) {


               messageElement.textContent =
                   "NON È STATO POSSIBILE TROVARE LA TUA MUSICA.";
           }


           return;
       }




       discoveryIndex = 0;


       discoveryLoaded = true;


       renderDiscovery();




   } catch (error) {


       console.error(
           "Errore Discovery:",
           error
       );




       if (messageElement) {


           messageElement.textContent =
               "IMPOSSIBILE CARICARE LA DISCOVERY.";
       }
   }
}




/* =====================================================
  DISCOVERY — RENDER
===================================================== */


function renderDiscovery() {


   const trackElement =
       document.querySelector(
           ".discovery-track"
       );


   const messageElement =
       document.querySelector(
           ".discovery-message"
       );




   if (!trackElement) {
       return;
   }




   trackElement.innerHTML = "";




   discoveryTracks.forEach(
       (track, index) => {


           const card =
               document.createElement(
                   "button"
               );




           card.className =
               "discovery-card";




           card.type =
               "button";




           card.dataset.index =
               index;




           const cover =
               document.createElement(
                   "div"
               );




           cover.className =
               "discovery-cover";




           if (
               track.album &&
               track.album.images &&
               track.album.images.length
           ) {


               cover.style.backgroundImage =
                   `url("${track.album.images[0].url}")`;
           }




           const info =
               document.createElement(
                   "div"
               );




           info.className =
               "discovery-card-info";




           const title =
               document.createElement(
                   "div"
               );




           title.className =
               "discovery-card-title";




           title.textContent =
               track.name;




           const artist =
               document.createElement(
                   "div"
               );




           artist.className =
               "discovery-card-artist";




           artist.textContent =
               track.artists
                   .map(
                       artist =>
                           artist.name
                   )
                   .join(", ");




           const source =
               document.createElement(
                   "div"
               );




           source.className =
               "discovery-card-source";




           source.textContent =
               "LA TUA MUSICA";




           info.appendChild(
               title
           );


           info.appendChild(
               artist
           );


           info.appendChild(
               source
           );




           card.appendChild(
               cover
           );


           card.appendChild(
               info
           );




           /*
              CLICK SULLA COVER / CARD


              Se clicchi sulla canzone centrale,
              viene riprodotta.


              Se clicchi una canzone laterale,
              prima la selezioniamo.
           */


           card.addEventListener(
               "click",
               () => {


                   if (
                       discoveryIndex !==
                       index
                   ) {


                       selectDiscoveryTrack(
                           index
                       );


                       return;
                   }




                   playTrack(
                       track
                   );
               }
           );




           trackElement.appendChild(
               card
           );
       }
   );




   if (messageElement) {


       messageElement.style.display =
           "none";
   }




   selectDiscoveryTrack(
       discoveryIndex
   );
}




/* =====================================================
  DISCOVERY — SELECT TRACK
===================================================== */


function selectDiscoveryTrack(
   index
) {


   if (
       !discoveryTracks.length
   ) {
       return;
   }




   discoveryIndex =
       Math.max(
           0,
           Math.min(
               index,
               discoveryTracks.length - 1
           )
       );




   const cards =
       document.querySelectorAll(
           ".discovery-card"
       );




   cards.forEach(
       (card, cardIndex) => {


           card.classList.remove(
               "selected",
               "near",
               "far"
           );




           const distance =
               Math.abs(
                   cardIndex -
                   discoveryIndex
               );




           if (
               cardIndex ===
               discoveryIndex
           ) {


               card.classList.add(
                   "selected"
               );


           } else if (
               distance === 1
           ) {


               card.classList.add(
                   "near"
               );


           } else {


               card.classList.add(
                   "far"
               );
           }
       }
   );




   /*
      Posizioniamo il carousel in modo che
      la canzone selezionata sia esattamente
      al centro dello schermo.
   */


   const trackElement =
       document.querySelector(
           ".discovery-track"
       );




   const selectedCard =
       cards[
           discoveryIndex
       ];




   if (
       trackElement &&
       selectedCard
   ) {


       const viewport =
           document.querySelector(
               ".discovery-viewport"
           );




       if (viewport) {


           const viewportCenter =
               viewport.clientWidth / 2;




           const cardCenter =
               selectedCard.offsetLeft +
               selectedCard.offsetWidth / 2;




           const offset =
               viewportCenter -
               cardCenter;




           trackElement.style.transform =
               `translateX(${offset}px) translateY(-50%)`;
       }
   }




   /*
      Aggiorniamo il testo sopra al carousel.
   */


   const track =
       discoveryTracks[
           discoveryIndex
       ];




   if (!track) {
       return;
   }




   const selectedSource =
       document.querySelector(
           ".discovery-selected-source"
       );


   const selectedArtist =
       document.querySelector(
           ".discovery-selected-artist"
       );


   const selectedTitle =
       document.querySelector(
           ".discovery-selected-title"
       );




   if (selectedSource) {


       selectedSource.textContent =
           "LA TUA MUSICA";
   }




   if (selectedArtist) {


       selectedArtist.textContent =
           track.artists
               .map(
                   artist =>
                       artist.name
               )
               .join(", ");
   }




   if (selectedTitle) {


       selectedTitle.textContent =
           track.name;
   }
}




/* =====================================================
  DISCOVERY — NEXT
===================================================== */


function discoveryNext() {


   if (
       !discoveryTracks.length
   ) {
       return;
   }




   selectDiscoveryTrack(
       discoveryIndex + 1
   );
}




/* =====================================================
  DISCOVERY — PREVIOUS
===================================================== */


function discoveryPrevious() {


   if (
       !discoveryTracks.length
   ) {
       return;
   }




   selectDiscoveryTrack(
       discoveryIndex - 1
   );
}




/* =====================================================
  LRCLIB — LOAD LYRICS
===================================================== */


async function loadLyrics(
   track
) {


   if (!track) {
       return;
   }




   if (
       lyricsTrackId === track.id
   ) {
       return;
   }




   lyricsTrackId =
       track.id;




   syncedLyrics = [];


   activeLyricIndex = -1;
   currentRenderedLyric = -1;




   const lyricsElement =
       document.querySelector(
           "#lyrics"
       );




   if (!lyricsElement) {
       return;
   }




   lyricsElement.innerHTML = `


       <div class="lyrics-message">
           Caricamento testo…
       </div>


   `;




   const params =
       new URLSearchParams({


           track_name:
               track.name,


           artist_name:
               track.artists
                   .map(
                       artist =>
                           artist.name
                   )
                   .join(", "),


           album_name:
               track.album.name,


           duration:
               Math.round(
                   track.duration_ms /
                   1000
               )


       });




   try {


       const response =
           await fetch(
               `https://lrclib.net/api/get?${params.toString()}`,
               {
                   headers: {
                       "X-User-Agent":
                           "Cozy Player/1.0"
                   }
               }
           );




       if (!response.ok) {


           throw new Error(
               `LRCLIB HTTP ${response.status}`
           );
       }




       const data =
           await response.json();




       if (
           lyricsTrackId !== track.id
       ) {
           return;
       }




       if (
           !data.syncedLyrics
       ) {


           lyricsElement.innerHTML = `


               <div class="lyrics-message">
                   Testo sincronizzato non disponibile.
               </div>


           `;


           return;
       }




       syncedLyrics =
           parseSyncedLyrics(
               data.syncedLyrics
           );




       renderLyrics();


       updateActiveLyric();




   } catch (error) {


       console.error(
           "Errore caricamento LRCLIB:",
           error
       );




       if (
           lyricsTrackId !== track.id
       ) {
           return;
       }




       lyricsElement.innerHTML = `


           <div class="lyrics-message">
               Impossibile caricare il testo.
           </div>


       `;
   }
}




/* =====================================================
  PARSE SYNCED LYRICS
===================================================== */


function parseSyncedLyrics(
   lrc
) {


   const lines =
       lrc.split("\n");


   const result = [];




   for (
       const line
       of lines
   ) {


       const match =
           line.match(
               /^\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/
           );




       if (!match) {
           continue;
       }




       const minutes =
           parseInt(
               match[1],
               10
           );




       const seconds =
           parseInt(
               match[2],
               10
           );




       const fraction =
           match[3]
               ? parseInt(
                   match[3].padEnd(
                       3,
                       "0"
                   ),
                   10
               )
               : 0;




       const timeMs =
           minutes *
           60 *
           1000 +


           seconds *
           1000 +


           fraction;




       const text =
           match[4].trim();




       if (!text) {
           continue;
       }




       result.push({


           time:
               timeMs,


           text:
               text


       });
   }




   result.sort(
       (a, b) =>
           a.time -
           b.time
   );




   return result;
}




/* =====================================================
  TIME
===================================================== */


function formatTime(
   ms
) {


   const seconds =
       Math.floor(
           ms / 1000
       );




   const minutes =
       Math.floor(
           seconds / 60
       );




   const remainingSeconds =
       seconds % 60;




   return (


       `${minutes}:` +


       remainingSeconds
           .toString()
           .padStart(
               2,
               "0"
           )


   );
}




/* =====================================================
  BEAT PULSE
===================================================== */


function triggerBeatPulse() {


   const blobs =
       document.querySelectorAll(
           ".blob"
       );




   blobs.forEach(
       blob => {


           blob.classList.remove(
               "pulse"
           );




           void blob.offsetWidth;




           blob.classList.add(
               "pulse"
           );
       }
   );
}




/* =====================================================
  START
===================================================== */


const params =
   new URLSearchParams(
       window.location.search
   );




const code =
   params.get("code");




if (code) {


   getToken(code);


} else if (


   localStorage.getItem(
       "access_token"
   )


) {


   loadCurrentTrack();


   setInterval(
       loadCurrentTrack,
       3000
   );
}


/* =====================================================
  LIVE LYRICS LOOP
===================================================== */

setupLyricsStyleSwitcher();

setInterval(updateActiveLyric, 80);
