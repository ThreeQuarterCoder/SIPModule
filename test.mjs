


// Polyfill for SIP.js in Node
if (typeof global.MediaStreamTrackEvent === "undefined") {
  class MediaStreamTrackEvent extends Event {
    constructor(type, eventInitDict) {
      super(type);
      this.track = (eventInitDict && eventInitDict.track) || null;
    }
  }
  global.MediaStreamTrackEvent = MediaStreamTrackEvent;
}

import { UserAgent, Registerer, Inviter, SessionState } from "sip.js";
//import wrtc from "wrtc";
import wrtc from "@roamhq/wrtc";
//import wrtc from "@koush/wrtc";
import WS from "ws";
import fs from "fs";
import wav from "node-wav";
//import { RTCAudioSource } from "@roamhq/wrtc/types/nonstandard";

// For SIP.js WebRTC handling
global.WebSocket = WS;
global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.MediaStream = wrtc.MediaStream;

// Fallback if no real microphone
if (!global.navigator) global.navigator = {};
if (!global.navigator.mediaDevices) {
  global.navigator.mediaDevices = {
    getUserMedia: async () => {
      console.log("[INFO] Using dummy microphone (no real mic).");
      return new wrtc.MediaStream();
    }
  };
}

const { RTCAudioSource, RTCAudioSink } = wrtc.nonstandard || {};


// Force 'sendrecv' mode in SDP to enable two-way audio
async function forceSendRecvModifier(description) {
  console.log("[SDP] Original SDP Before Modification:/n", description.sdp);

  description.sdp = description.sdp
    .replace(/a=sendonly/g, "a=sendrecv")
    .replace(/a=recvonly/g, "a=sendrecv")
    .replace(/a=inactive/g, "a=sendrecv"); // Ensure media stream is active

  console.log("[SDP] Modified SDP After Applying Fix:/n", description.sdp);
  return description;
}

// Load a WAV file and return an Int16Array plus sampleRate
function loadWavPCM(filePath) {
  console.log(`[DEBUG] Loading WAV from: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const result = wav.decode(buffer); // { sampleRate, channelData: [Float32Array, ...] }
  const { sampleRate, channelData } = result;
  const floatSamples = channelData[0]; // Use only the first channel for mono audio

  // Convert Float32 to Int16
  const pcm16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    let val = Math.max(-1, Math.min(1, floatSamples[i])); // Clamp values between -1 and 1
    pcm16[i] = val * 32767;
  }

  console.log(`[DEBUG] WAV loaded: sampleRate=${sampleRate}, length=${pcm16.length} samples`);
  return { sampleRate, samples: pcm16 };
}

// Create & register user agent for SIP communication
async function createUserAgent() {
  const extension = "sam111";
  const password = "Dmbg10ab@@@@";
  const server = "sam2.pstn.twilio.com"; // PBX IP

  const uri = UserAgent.makeURI(`sip:${extension}@${server}`);
  if (!uri) throw new Error(`[ERROR] Invalid SIP URI: ${extension}@${server}`);

  const userAgent = new UserAgent({
    uri,
    authorizationUsername: extension,
    authorizationPassword: password,
    transportOptions: {
      server: `wss://${server}:443`
    },
    sessionDescriptionHandlerFactoryOptions: {
      peerConnectionConfiguration: {
        iceServers: [] // No STUN/TURN required for local PBX
      },
      offerOptions: { offerToReceiveAudio: true },
      sessionDescriptionHandlerModifiers: [forceSendRecvModifier]
    }
  });

  await userAgent.start();
  const registerer = new Registerer(userAgent);
  await registerer.register();

  console.log(`[INFO] Registered extension ${extension} on PBX ${server}`);
  return userAgent;
}

// Place a call and handle media setup
async function placeCall(userAgent, targetNumber) {
  const targetUri = UserAgent.makeURI(targetNumber);
  if (!targetUri) {
    console.error("[ERROR] Invalid target URI:", targetNumber);
    return;
  }

  console.log("[DEBUG] Placing call to =>", targetNumber);

  const inviter = new Inviter(userAgent, targetUri, {
    sessionDescriptionHandlerModifiers: [forceSendRecvModifier],
    sessionDescriptionHandlerOptions: { offerOptions: { offerToReceiveAudio: true } }
  });

  try {
    inviter.stateChange.addListener((newState) => {
      console.log("[DEBUG] Call state =>", newState);
      if (newState === SessionState.Established) {
        console.log("[INFO] Call established => Setting up audio");
        setupSessionAudio(inviter);
      } else if (newState === SessionState.Terminated) {
        console.log("[INFO] Call ended or failed.");
      }
    });

    await inviter.invite();
    console.log("[INFO] Outbound call INVITE sent =>", targetNumber);

    // inviter.stateChange.on((newState) => {
    //   console.log("[DEBUG] Call state =>", newState);
    //   if (newState === SessionState.Established) {
    //     console.log("[INFO] Call established => Setting up audio");
    //     setupSessionAudio(inviter);
    //   } else if (newState === SessionState.Terminated) {
    //     console.log("[INFO] Call ended or failed.");
    //   }
    // });
  } catch (err) {
    console.error("[ERROR] placeCall() failed:", err);
  }
}

// Setup and manage media streams
function setupSessionAudio(session) {
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

  // Load and play WAV file
  const filePath = "/Users/krsnadas/sip-node-project/audio.wav";

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


// Main execution flow
async function main() {
  console.log("[DEBUG] Starting SIP call...");
  const userAgent = await createUserAgent();
  const target = "sip:+918123558443@sam2.pstn.twilio.com"; // Adjust target
  //const target = "sip:07977743973@192.168.1.7"; // Adjust target
  placeCall(userAgent, target);
}

main().catch(console.error);
