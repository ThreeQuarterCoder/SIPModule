export async function forceSendRecvModifier(description) {
    console.log("[SDP] Original SDP Before Modification:\n", description.sdp);
  
    description.sdp = description.sdp
      .replace(/a=sendonly/g, "a=sendrecv")
      .replace(/a=recvonly/g, "a=sendrecv")
      .replace(/a=inactive/g, "a=sendrecv");
  
    console.log("[SDP] Modified SDP After Applying Fix:\n", description.sdp);
    return description;
  }
  
