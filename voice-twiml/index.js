// E:\voice-agent\voice-twiml\index.js

const { WebPubSubServiceClient } = require("@azure/web-pubsub");

// Initialize the client pointing at your hub
const svc = new WebPubSubServiceClient(
  process.env.WEBPUBSUB_CONN,
  "voiceHub"
);

module.exports = async function (context) {
  context.log("TwiML function called, generating speech recognition TwiML");

  try {
    // Return TwiML that uses Twilio's speech recognition instead of streaming
    const twiml = `
      <Response>
        <Say voice="en-US-JennyNeural">
          Hi! I'm your AI voice assistant. I'm ready to chat with you. What would you like to talk about?
        </Say>
        <Gather input="speech" timeout="30" speechTimeout="auto" action="https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-stream" method="POST">
          <Say voice="en-US-JennyNeural">
            I'm listening...
          </Say>
        </Gather>
        <Redirect>https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-twiml</Redirect>
      </Response>
    `.trim();

    context.log("Generated TwiML with speech recognition:", twiml);

    context.res = {
      headers: { "Content-Type": "text/xml" },
      body: twiml
    };
  } catch (error) {
    context.log.error("Error generating TwiML:", error.message);
    
    // Fallback TwiML
    const fallbackTwiml = `
      <Response>
        <Say voice="en-US-JennyNeural">
          I'm having trouble right now. Please try again later.
        </Say>
      </Response>
    `.trim();
    
    context.res = {
      headers: { "Content-Type": "text/xml" },
      body: fallbackTwiml
    };
  }
};
