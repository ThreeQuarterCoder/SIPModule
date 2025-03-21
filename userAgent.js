import { UserAgent, Registerer} from "sip.js";
import config from "./sipConfig.js";
import WS from "ws";

global.WebSocket = WS;
global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.MediaStream = wrtc.MediaStream;

export async function createUserAgent() {
  const { extension, password, server, wsPort, transport } = config;
  const uri = UserAgent.makeURI(`sip:${extension}@${server}`);
  if (!uri) throw new Error(`[ERROR] Invalid SIP URI: ${extension}@${server}`);

  const userAgent = new UserAgent({
    uri,
    authorizationUsername: extension,
    authorizationPassword: password,
    transportOptions: {
      server: `${transport}://${server}:${wsPort}`
    },
    sessionDescriptionHandlerFactoryOptions: {
      peerConnectionConfiguration: { iceServers: [] },
      offerOptions: { offerToReceiveAudio: true }
    }
  });

  await userAgent.start();
  const registerer = new Registerer(userAgent);
  await registerer.register();

  console.log(`[INFO] Registered extension ${extension} on PBX ${server}`);
  return userAgent;
}
