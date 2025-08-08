// E:\voice-agent\voice-twiml\index.js

module.exports = async function (context) {
  context.log("TwiML function called, generating speech recognition TwiML");

  try {
    // Return TwiML that uses Twilio's speech recognition instead of streaming
    const twiml = `
      <Response>
        <Say voice="en-US-JennyNeural">
          Hi, this is Blue Caller HVAC. How can I help you today?
        </Say>
        <Gather input="speech" timeout="30" speechTimeout="auto" action="https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-stream" method="POST">
          <Say voice="en-US-JennyNeural">
            I'm listening.
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
      status: 200,
      headers: { "Content-Type": "text/xml" },
      body: fallbackTwiml
    };
  }
};
