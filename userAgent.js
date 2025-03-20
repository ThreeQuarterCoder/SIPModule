import { UserAgent, Registerer} from "sip.js";
import config from "./sipConfig.js";

export async function createUserAgent() {
  const { extension, password, server, wsPort } = config;
  const uri = UserAgent.makeURI(`sip:${extension}@${server}`);
  if (!uri) throw new Error(`[ERROR] Invalid SIP URI: ${extension}@${server}`);

  const userAgent = new UserAgent({
    uri,
    authorizationUsername: extension,
    authorizationPassword: password,
    transportOptions: {
      server: `ws://${server}:${wsPort}`
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
