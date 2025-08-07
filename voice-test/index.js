const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

module.exports = async function (context, req) {
  context.log("Voice agent test function called");
  
  const tests = [];
  
  // Test 1: Check environment variables
  tests.push({
    name: "Environment Variables",
    status: process.env.OPENAI_ENDPOINT && process.env.OPENAI_KEY && process.env.SPEECH_KEY && process.env.WEBPUBSUB_CONN ? "✅ PASS" : "❌ FAIL",
    details: {
      openai_endpoint: process.env.OPENAI_ENDPOINT ? "Set" : "Missing",
      openai_key: process.env.OPENAI_KEY ? "Set" : "Missing", 
      speech_key: process.env.SPEECH_KEY ? "Set" : "Missing",
      webpubsub_conn: process.env.WEBPUBSUB_CONN ? "Set" : "Missing"
    }
  });
  
  // Test 2: Azure OpenAI connection
  try {
    const openai = new OpenAIClient(
      process.env.OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.OPENAI_KEY)
    );
    
    const completion = await openai.getChatCompletions(
      "gpt-35-turbo",
      [{ role: "user", content: "Hello, this is a test." }],
      { maxTokens: 10 }
    );
    
    tests.push({
      name: "Azure OpenAI",
      status: "✅ PASS",
      details: { response: completion.choices[0].message.content }
    });
  } catch (error) {
    tests.push({
      name: "Azure OpenAI", 
      status: "❌ FAIL",
      details: { error: error.message }
    });
  }
  
  // Test 3: Speech service configuration
  try {
    const speechConfig = process.env.SPEECH_ENDPOINT 
      ? sdk.SpeechConfig.fromEndpoint(new URL(process.env.SPEECH_ENDPOINT), process.env.SPEECH_KEY)
      : sdk.SpeechConfig.fromSubscription(process.env.SPEECH_KEY, "westus");
    speechConfig.speechSynthesisVoiceName = "en-US-JennyNeural";
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Mulaw8Khz8BitMono;
    
    tests.push({
      name: "Speech Service Config",
      status: "✅ PASS",
      details: { 
        voice: speechConfig.speechSynthesisVoiceName,
        format: "µ-law 8kHz 8-bit mono",
        endpoint: process.env.SPEECH_ENDPOINT ? "Custom endpoint" : "Default region (westus)"
      }
    });
  } catch (error) {
    tests.push({
      name: "Speech Service Config",
      status: "❌ FAIL", 
      details: { error: error.message }
    });
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Voice Agent Test Results</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .test { margin: 10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
        .pass { background-color: #d4edda; border-color: #c3e6cb; }
        .fail { background-color: #f8d7da; border-color: #f5c6cb; }
        .details { margin-top: 5px; font-size: 0.9em; color: #666; }
      </style>
    </head>
    <body>
      <h1>Voice Agent Test Results</h1>
      ${tests.map(test => `
        <div class="test ${test.status.includes('✅') ? 'pass' : 'fail'}">
          <strong>${test.name}: ${test.status}</strong>
          <div class="details">
            <pre>${JSON.stringify(test.details, null, 2)}</pre>
          </div>
        </div>
      `).join('')}
      
      <h2>Next Steps</h2>
      <p>If all tests pass, try calling your Twilio phone number to test the voice agent.</p>
      <p>Check the Azure Function logs for detailed processing information.</p>
    </body>
    </html>
  `;

  context.res = {
    headers: { "Content-Type": "text/html" },
    body: html
  };
}; 