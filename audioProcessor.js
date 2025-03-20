import fs from "fs";
import wav from "node-wav";
import wrtc from "@roamhq/wrtc";

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

export function streamAudioToCall(pc, filePath) {
  const { RTCAudioSource } = wrtc.nonstandard || {};
  if (!RTCAudioSource) {
    console.error("[ERROR] RTCAudioSource is not available.");
    return;
  }

  const source = new RTCAudioSource();
  const track = source.createTrack();
  pc.addTrack(track);
  pc.addTransceiver(track, { direction: "sendrecv" });

  let { sampleRate, samples } = loadWavPCM(filePath);
  if (sampleRate !== 8000) {
    console.warn(`[WARN] WAV sampleRate=${sampleRate} != 8000. Consider resampling.`);
  }

  const chunkSize = Math.floor(sampleRate * 0.01);
  let frameIndex = 0;
  let doneReading = false;
  const comfortNoise = new Int16Array(chunkSize).fill(100);
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
      chunk = comfortNoise;
    }

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
  }, 10);

  return intervalId;
}
