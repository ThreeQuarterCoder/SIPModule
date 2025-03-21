import {createUserAgent} from "./userAgent.js";
import {placeCall} from "./callHandler.js";
import wrtc from "@roamhq/wrtc";

global.WebSocket = WS;
global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.MediaStream = wrtc.MediaStream;

async function main() {
  console.log("[DEBUG] Starting SIP call...");
  const userAgent = await createUserAgent();
  const target = "sip:08123558443@192.168.1.7";
  const audioFilePath = "/Users/krsnadas/sip-node-project/audio.wav";

  await placeCall(userAgent, target, audioFilePath);
}

main().catch(console.error);
