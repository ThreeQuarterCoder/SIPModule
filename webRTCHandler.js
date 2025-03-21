import wrtc from "@roamhq/wrtc";

export function setupSessionAudio(session) {
  const sdh = session.sessionDescriptionHandler;
  if (!sdh || !sdh.peerConnection) {
    console.error("[ERROR] No sessionDescriptionHandler or PeerConnection found.");
    return;
  }

  const pc = sdh.peerConnection;

  console.log("[DEBUG] Setting up WebRTC Peer Connection...");

  // Debug ICE connection states for troubleshooting
  pc.addEventListener("iceconnectionstatechange", () => {
    console.log("[ICE] Connection State =>", pc.iceConnectionState);
  });

  // Handle inbound audio
  pc.addEventListener("track", (evt) => {
    if (evt.track.kind === "audio") {
      console.log("[DEBUG] Inbound audio track detected!");
    }
  });

  // Add outbound audio track
  const source = new wrtc.nonstandard.RTCAudioSource();
  const track = source.createTrack();
  pc.addTrack(track);
  pc.addTransceiver(track, { direction: "sendrecv" });

  console.log("[DEBUG] WebRTC setup complete.");
}
