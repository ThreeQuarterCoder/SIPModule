import { Inviter, SessionState } from "sip.js";
import { streamAudioToCall } from "./audioProcessor.js";

export async function forceSendRecvModifier(description) {
    console.log("[SDP] Original SDP Before Modification:\n", description.sdp);

    description.sdp = description.sdp
        .replace(/a=sendonly/g, "a=sendrecv")
        .replace(/a=recvonly/g, "a=sendrecv")
        .replace(/a=inactive/g, "a=sendrecv");

    console.log("[SDP] Modified SDP After Applying Fix:\n", description.sdp);
    return description;
}

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
        inviter.stateChange.addListener((newState) => {
            console.log("[DEBUG] Call state =>", newState);
            if (newState === SessionState.Established) {
                console.log("[INFO] Call established => Setting up audio");
                streamAudioToCall(inviter, audioFilePath);
            } else if (newState === SessionState.Terminated) {
                console.log("[INFO] Call ended or failed.");
            }
        });

        await inviter.invite();
        console.log("[INFO] Outbound call INVITE sent =>", targetNumber);
    } catch (err) {
        console.error("[ERROR] placeCall() failed:", err);
    }
}
