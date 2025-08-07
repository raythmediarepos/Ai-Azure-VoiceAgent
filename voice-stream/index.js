const { WebPubSubServiceClient } = require("@azure/web-pubsub");
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

const svc = new WebPubSubServiceClient(
  process.env.WEBPUBSUB_CONN,
  "voiceHub"
);

// Initialize Azure OpenAI with API key
const openai = new OpenAIClient(
  process.env.OPENAI_ENDPOINT,
  new AzureKeyCredential(process.env.OPENAI_KEY)
);

// Speech service configuration
const speechConfig = process.env.SPEECH_ENDPOINT 
  ? sdk.SpeechConfig.fromEndpoint(new URL(process.env.SPEECH_ENDPOINT), process.env.SPEECH_KEY)
  : sdk.SpeechConfig.fromSubscription(process.env.SPEECH_KEY, "westus");
speechConfig.speechRecognitionLanguage = "en-US";
speechConfig.speechSynthesisVoiceName = "en-US-JennyNeural";

// Store conversation sessions
const conversationSessions = new Map();

// Helper function to get or create conversation session
const getOrCreateSession = (sessionId) => {
  if (!conversationSessions.has(sessionId)) {
    conversationSessions.set(sessionId, {
      messages: [
        {
          role: "system",
          content: "You are a helpful AI voice assistant. Keep your responses conversational, concise (1-2 sentences), and natural for spoken conversation. You're talking to someone over the phone."
        }
      ]
    });
  }
  return conversationSessions.get(sessionId);
};

// Function to get AI response from Azure OpenAI
const getAIResponse = async (messages) => {
  try {
    const completion = await openai.getChatCompletions(
      "gpt-35-turbo", // Your deployment name
      messages,
      {
        maxTokens: 150,
        temperature: 0.7
      }
    );
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Azure OpenAI error:", error);
    return "I'm sorry, I'm having trouble processing that right now. Could you try again?";
  }
};

module.exports = async function (context, req) {
  context.log("VOICE-STREAM FUNCTION CALLED!");
  context.log("Request Method:", req.method);
  context.log("Request body:", JSON.stringify(req.body, null, 2));

  try {
    // Handle Twilio speech recognition results
    if (req.method === "POST" && req.body) {
      // Parse URL-encoded form data from Twilio
      const querystring = require('querystring');
      const formData = typeof req.body === 'string' ? querystring.parse(req.body) : req.body;
      
      const speechResult = formData.SpeechResult;
      const callSid = formData.CallSid;
      
      context.log("Parsed form data:", formData);
      context.log("Speech Result:", speechResult);
      context.log("Call SID:", callSid);
      
      if (speechResult && speechResult.trim().length > 0) {
        // Get or create session for this call
        const session = getOrCreateSession(callSid);
        
        // Add user message to conversation
        session.messages.push({
          role: "user",
          content: speechResult
        });
        
        context.log("Getting AI response for:", speechResult);
        
        // Get AI response
        const aiResponse = await getAIResponse(session.messages);
        context.log("AI Response:", aiResponse);
        
        // Add AI response to conversation
        session.messages.push({
          role: "assistant",
          content: aiResponse
        });
        
        // Return TwiML with AI response and continue listening
        const responseTwiml = `
          <Response>
            <Say voice="en-US-JennyNeural">${aiResponse}</Say>
            <Gather input="speech" timeout="30" speechTimeout="auto" action="https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-stream" method="POST">
              <Say voice="en-US-JennyNeural">What else would you like to know?</Say>
            </Gather>
            <Redirect>https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-twiml</Redirect>
          </Response>
        `.trim();
        
        context.res = {
          headers: { "Content-Type": "text/xml" },
          body: responseTwiml
        };
        return;
      } else {
        // No speech detected, try again
        const noSpeechTwiml = `
          <Response>
            <Say voice="en-US-JennyNeural">I didn't catch that. Could you please say that again?</Say>
            <Gather input="speech" timeout="30" speechTimeout="auto" action="https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-stream" method="POST">
              <Say voice="en-US-JennyNeural">I'm listening...</Say>
            </Gather>
            <Redirect>https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-twiml</Redirect>
          </Response>
        `.trim();
        
        context.res = {
          headers: { "Content-Type": "text/xml" },
          body: noSpeechTwiml
        };
        return;
      }
    }
    
    // Default response for other requests
    context.res = { 
      status: 200,
      body: "Voice stream endpoint ready"
    };
    
  } catch (error) {
    context.log.error("Function error:", error.message);
    context.log.error("Stack trace:", error.stack);
    
    // Error TwiML
    const errorTwiml = `
      <Response>
        <Say voice="en-US-JennyNeural">I'm sorry, I encountered an error. Please try calling again.</Say>
        <Hangup />
      </Response>
    `.trim();
    
    context.res = { 
      status: 200,
      headers: { "Content-Type": "text/xml" },
      body: errorTwiml
    };
  }
};
