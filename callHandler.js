import { Inviter, SessionState } from "sip.js";
import { forceSendRecvModifier } from "./sdpModifier.js";
import { streamAudioToCall } from "./audioProcessor.js";

export async function placeCall(userAgent, targetNumber, audioFilePath) {
  const targetUri = userAgent.makeURI(targetNumber);
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
    await inviter.invite();
    console.log("[INFO] Outbound call INVITE sent =>", targetNumber);

    inviter.stateChange.on((newState) => {
      console.log("[DEBUG] Call state =>", newState);
      if (newState === SessionState.Established) {
        console.log("[INFO] Call established => Setting up audio");
        setupSessionAudio(inviter, audioFilePath);
      } else if (newState === SessionState.Terminated) {
        console.log("[INFO] Call ended or failed.");
      }
    });
  } catch (err) {
    console.error("[ERROR] placeCall() failed:", err);
  }
}

function setupSessionAudio(session, audioFilePath) {
  const sdh = session.sessionDescriptionHandler;
  if (!sdh || !sdh.peerConnection) {
    console.error("[ERROR] No sessionDescriptionHandler or PeerConnection found.");
    return;
  }

  const pc = sdh.peerConnection;
  pc.addEventListener("iceconnectionstatechange", () => {
    console.log("[ICE] Connection State =>", pc.iceConnectionState);
  });

  let intervalId = streamAudioToCall(pc, audioFilePath);

  session.stateChange.on((newState) => {
    if (newState === SessionState.Terminated) {
      console.log("[DEBUG] Stopped sending (call ended).");
      clearInterval(intervalId);
    }
  });
}
