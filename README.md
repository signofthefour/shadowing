# Speak Along

A private, sentence-by-sentence English shadowing app built around Steve Jobs' 2005 Stanford commencement address.

The app streams the speech through YouTube, highlights the active transcript line, records one learner take per sentence, and stores progress locally in the browser. Recordings are never uploaded.

## Requirements

- Node.js `^22.22.2`, `^24.15.0`, or `>=26.0.0`
- npm
- A current Chrome, Edge, Firefox, or Safari browser
- Microphone permission
- Access to YouTube embeds

## Setup

```bash
npm install
npx playwright install chromium
npm run dev -- --host 127.0.0.1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Practice flow

1. Select **Hear Steve** to play the active sentence.
2. After playback stops, select **Record** and speak the sentence.
3. Select **Stop**, then use **Listen**, **Redo**, or **Next**.
4. Refreshing the page restores saved progress and successful takes.
5. After all 144 sentences, download the combined recording as an MP3 or discard the session.

**Quit & Erase** permanently removes this app's locally saved progress and recordings after confirmation.

## Commands

```bash
npm run dev       # Start the development server
npm test          # Run unit and component tests
npm run test:e2e  # Run desktop and mobile Playwright tests (Chromium required)
npm run build     # Type-check and create a production build
```

## YouTube troubleshooting

The player uses YouTube's IFrame API and identifies the current page origin for secure cross-window communication.

If the player does not load:

1. Use the exact URL printed by Vite; the recommended local URL is `http://127.0.0.1:5173`.
2. Try a private browser window with extensions and content blockers disabled.
3. Confirm that [the source video](https://www.youtube.com/watch?v=UF8uR6Z6KLc) opens directly.
4. Select **Retry video** after correcting the browser or network issue.

Browser-console messages from React DevTools, summarizer extensions, or a missing favicon do not prevent playback.

## Local video fallback

A downloaded video is not required and is not tracked by Git. For offline troubleshooting, place an MP4 at:

```text
public/video/stanford-speech.mp4
```

While the development server is running, it is available at `/video/stanford-speech.mp4`. The practice interface still uses YouTube unless its player implementation is changed.

## Privacy and storage

- Audio and progress stay in the browser's IndexedDB storage.
- The app has no accounts, analytics, upload endpoint, or cloud database.
- Clearing site data removes saved progress and recordings.
- YouTube may apply its own cookies and privacy policies to the embedded player.

## Project structure

```text
src/app/                 Main practice interface and flow
src/data/                Prepared transcript and sentence timings
src/domain/              Practice state machine and domain types
src/features/player/     YouTube IFrame API adapter
src/features/recorder/   Browser microphone recorder
src/features/session/    IndexedDB persistence
src/features/export/     MP3 assembly and encoding
e2e/                     Desktop and mobile browser tests
```

## Scope

This project supports one prepared speech. Pronunciation scoring, speech recognition, user accounts, arbitrary videos, and cloud synchronization are intentionally out of scope.

## License

UNLICENSED. The source video and speech remain subject to their respective owners' terms.
