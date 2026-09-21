# Steve Jobs Speech Shadowing Website

## Purpose

Build a private, browser-based practice website for shadowing Steve Jobs' Stanford commencement speech. The experience should feel like a lyrics reader: the current sentence remains prominent and synchronized with the YouTube video while nearby sentences provide context.

The website is for one user and one prepared speech. It does not require accounts, automatic speech recognition, pronunciation scoring, cloud storage, or support for arbitrary videos.

## Core Practice Flow

1. The learner opens the practice page and resumes an unfinished local session or starts from the first sentence.
2. The YouTube player plays one sentence from the speech.
3. The transcript automatically scrolls, highlights the active sentence, and dims nearby sentences.
4. At the sentence's end timestamp, the video pauses and recording becomes available.
5. The learner records their version of the sentence.
6. The learner can listen to their recording, redo it, or save it and move to the next sentence.
7. At the end of the speech, the learner can download all saved sentence recordings as one MP3 or permanently discard the session.

At any point, the learner can choose **Quit & Erase**. After confirmation, it permanently removes every local recording and all saved progress, then returns the application to the first sentence. Canceling the confirmation changes nothing.

Clicking any transcript sentence seeks the YouTube player to that sentence and makes it the active practice item.

## Screen Layout

Desktop uses a two-column practice area:

- Left: responsive YouTube player.
- Right: vertically scrolling transcript with the current sentence large and centered.
- Bottom: a shared control bar containing Hear Steve, Record/Stop, Listen, Redo, and Next controls, plus sentence count and overall progress.

Mobile uses the same controls but stacks the video above the transcript. Controls must remain reachable without covering the active transcript sentence.

The interface should be calm and focused. Only actions valid for the current practice state are enabled. In particular, Record becomes available after the source sentence finishes, Listen and Redo require an existing recording, and Next requires a saved recording.

## Components and Responsibilities

### YouTube Player

The embedded YouTube IFrame API controls playback and seeking. It receives the active sentence's start and end timestamps, starts at the sentence boundary, and pauses when playback reaches the end boundary.

### Timed Transcript

The transcript is prepared specifically for the Stanford speech. Each entry has a stable identifier, text, start time, end time, and sequence number. The transcript view observes the active entry, centers it when the learner advances or seeks, and allows click-to-seek.

### Practice Controller

The controller owns the explicit practice state: ready to hear, playing source, ready to record, recording, recorded, and completed. It coordinates the player, recorder, transcript, and navigation controls so that invalid actions cannot overlap.

### Audio Recorder

The browser MediaRecorder API captures one learner clip per sentence. Starting a redo replaces only the selected sentence's clip after the replacement recording succeeds, preventing accidental loss of the previous take.

### Session Store

Progress and recorded clips remain on the learner's device using browser storage. The session store tracks the active sentence, completed sentence identifiers, recordings, and minimal restoration metadata. No audio or practice data is sent to a server.

### MP3 Exporter

At completion, the exporter orders the saved clips by transcript sequence, decodes and joins them with short consistent gaps, and encodes the result as a downloadable MP3. Export does not delete the session; deletion occurs only when the learner explicitly chooses Discard Session.

## Data Flow

The prepared transcript supplies sentence boundaries to both the player and transcript view. The practice controller selects one sentence, asks the player to play its interval, and switches to recording readiness when the interval ends. The recorder returns a clip to the session store. Advancing selects the next transcript entry and repeats the loop.

On reload, the session store restores the latest active sentence and all completed clips. On export, stored clips flow through the MP3 exporter and are offered as a local browser download. On discard, the session store removes the progress metadata and every recorded clip.

## Failure Handling

- If microphone permission is denied, keep the current position and show a concise instruction for enabling microphone access.
- If recording is unsupported, explain that the browser is incompatible and recommend a current desktop version of Chrome, Edge, Firefox, or Safari.
- If the YouTube player or network fails, preserve all local recordings and offer a retry action.
- If a recording is empty or interrupted, retain the previous successful take and ask the learner to record again.
- If MP3 encoding fails, preserve the sentence clips and allow another export attempt without re-recording.
- If browser storage is full, stop before replacing or losing a clip and explain that space must be cleared.
- If Quit & Erase fails, keep the current session visible and offer the learner a retry instead of pretending deletion succeeded.

## Privacy and Persistence

Audio is local-only. The application has no user account, analytics requirement, upload endpoint, or cloud database. An unfinished session survives a normal refresh or browser restart on the same device and browser. Quit & Erase and Discard Session must request confirmation because they permanently delete all locally saved takes for the speech. Closing the tab is not treated as quitting because browsers cannot guarantee that asynchronous deletion completes during shutdown.

## Testing

Automated unit tests cover practice-state transitions, sentence-boundary behavior, transcript selection, session restoration, clip replacement, ordered audio assembly, and discard semantics.

Integration tests use fakes for the YouTube and MediaRecorder browser APIs to verify play-pause-record-replay-redo-next behavior and error recovery. A browser-level smoke test verifies microphone permission messaging, refresh recovery, responsive layout, MP3 download creation, canceled Quit & Erase, confirmed deletion, and permanent discard.

## Explicitly Out of Scope

- Automatic speech recognition or pronunciation scoring
- User accounts, sharing, or cloud synchronization
- Support for arbitrary YouTube videos or automatic transcript generation
- Editing transcript text or timestamps in the interface
- Continuous full-speech recording
- Native mobile applications

## Acceptance Criteria

- The Stanford speech plays from a YouTube embed one sentence at a time.
- The active transcript sentence remains highlighted and automatically centered.
- Playback pauses at the prepared end time for each sentence.
- The learner can record, replay, and redo one take per sentence.
- A refresh restores unfinished progress and successful recordings.
- Completing the speech enables one ordered MP3 download.
- Discarding the session removes all saved progress and recordings after confirmation.
- Quit & Erase is available during practice, changes nothing when canceled, and removes all saved progress and recordings when confirmed.
- No recorded audio leaves the browser.
