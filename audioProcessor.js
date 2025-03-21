import fs from "fs";
import wav from "node-wav";
import wrtc from "@roamhq/wrtc";

const { RTCAudioSource, RTCAudioSink } = wrtc.nonstandard || {};

export function loadWavPCM(filePath) {
  console.log(`[DEBUG] Loading WAV from: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const result = wav.decode(buffer);
  const { sampleRate, channelData } = result;
  const floatSamples = channelData[0];

  const pcm16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    let val = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm16[i] = val * 32767;
  }

  console.log(`[DEBUG] WAV loaded: sampleRate=${sampleRate}, length=${pcm16.length} samples`);
  return { sampleRate, samples: pcm16 };
}

export function streamAudioToCall(session, filePath) {
  const sdh = session.sessionDescriptionHandler;
  if (!sdh || !sdh.peerConnection) {
    console.error("[ERROR] No sessionDescriptionHandler or PeerConnection found.");
    return;
  }

  const pc = sdh.peerConnection;

  // Debug ICE connection states for NAT/firewall troubleshooting
  pc.addEventListener("iceconnectionstatechange", () => {
    console.log("[ICE] Connection State =>", pc.iceConnectionState);
  });


  // Log inbound audio
  pc.addEventListener("track", (evt) => {
    if (evt.track.kind === "audio") {
      console.log("[DEBUG] Inbound audio track detected!");
      const sink = new RTCAudioSink(evt.track);
      sink.ondata = (data) => {
        console.log(`[DEBUG] Inbound => ${data.samples.length} samples @ ${data.sampleRate} Hz`);
      };
    }
  });

  // Create outbound audio source track
  const source = new RTCAudioSource();
  const track = source.createTrack();
  const sender = pc.addTrack(track);
  pc.addTransceiver(track, { direction: "sendrecv" });

  //const filePath = "C:/Users/conne/Downloads/eyeBeamRecording_250306_190452 (online-audio-converter.com).wav";
  let { sampleRate, samples } = loadWavPCM(filePath);

  // Ensure sample rate is correct
  if (sampleRate !== 8000) {
    console.warn(`[WARN] WAV sampleRate=${sampleRate} != 8000. Consider resampling.`);
  }

  const chunkSize = Math.floor(sampleRate * 0.01); // 10ms frame (80 samples for 8kHz)
  let frameIndex = 0;
  let doneReading = false;

  // Create a comfort noise buffer instead of pure silence
  const comfortNoise = new Int16Array(chunkSize).fill(100); // Tiny non-zero noise

  const frameIntervalMs = 10;
  const intervalId = setInterval(() => {
    let chunk;

    if (!doneReading) {
      const start = frameIndex * chunkSize;
      const end = start + chunkSize;

      if (start >= samples.length) {
        doneReading = true;
        console.log("[DEBUG] WAV file finished => Sending comfort noise...");
      } else {
        chunk = samples.slice(start, end);
        frameIndex++;
        console.log(`[DEBUG] Sending WAV chunk: ${chunk.length} samples`);
      }
    }

    if (doneReading) {
      chunk = comfortNoise; // Instead of pure silence, send a small noise frame
    }

    // Ensure the buffer is always the correct size
    if (chunk.length === 0) {
      console.error("[ERROR] Tried to send empty audio buffer! Using comfort noise instead.");
      chunk = comfortNoise;
    }

    source.onData({
      samples: chunk,
      sampleRate,
      bitsPerSample: 16,
      channelCount: 1
    });
  }, frameIntervalMs);

  // Stop sending on call end
  session.stateChange.on((newState) => {
    if (newState === SessionState.Terminated) {
      console.log("[DEBUG] Stopped sending (call ended).");
      clearInterval(intervalId);
    }
  });
}
