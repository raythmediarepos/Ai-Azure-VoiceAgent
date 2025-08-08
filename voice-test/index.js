const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

module.exports = async function (context, req) {
  context.log("Voice agent test function called");
  
  const tests = [];
  
  // Test 1: Check environment variables
  tests.push({
    name: "Environment Variables",
    status: process.env.OPENAI_ENDPOINT && process.env.OPENAI_KEY && process.env.SPEECH_KEY && process.env.COSMOS_CONN ? "✅ PASS" : "❌ FAIL",
    details: {
      openai_endpoint: process.env.OPENAI_ENDPOINT ? "Set" : "Missing",
      openai_key: process.env.OPENAI_KEY ? "Set" : "Missing", 
      speech_key: process.env.SPEECH_KEY ? "Set" : "Missing",
      cosmos_conn: process.env.COSMOS_CONN ? "Set" : "Missing"
    }
  });
  
  // Test 2: Azure OpenAI connection with new SDK
  try {
    const openai = new AzureOpenAI({
      endpoint: process.env.OPENAI_ENDPOINT,
      apiKey: process.env.OPENAI_KEY,
      apiVersion: "2024-02-15-preview",
      deployment: "gpt-35-turbo"
    });
    
    const completion = await openai.chat.completions.create({
      model: "gpt-35-turbo",
      messages: [{ role: "user", content: "Hello, this is a test." }],
      max_tokens: 10
    });
    
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
  
  // Test 4: Cosmos DB Connection
  try {
    const { CosmosClient } = require("@azure/cosmos");
    
    if (!process.env.COSMOS_CONN) {
      throw new Error("COSMOS_CONN environment variable not set");
    }
    
    if (!process.env.COSMOS_CONN.includes('AccountEndpoint=') || !process.env.COSMOS_CONN.includes('AccountKey=')) {
      throw new Error("COSMOS_CONN appears to be MongoDB format, not SQL API format. Expected: AccountEndpoint=https://...;AccountKey=...");
    }
    
    const cosmosClient = new CosmosClient(process.env.COSMOS_CONN);
    const { database } = await cosmosClient.databases.createIfNotExists({ id: 'voiceai' });
    
    tests.push({
      name: "Cosmos DB SQL API",
      status: "✅ PASS",
      details: { 
        database: database.id,
        connection_format: "SQL API (correct)",
        endpoint: "Connected successfully"
      }
    });
  } catch (error) {
    tests.push({
      name: "Cosmos DB SQL API",
      status: "❌ FAIL", 
      details: { 
        error: error.message,
        connection_string_set: process.env.COSMOS_CONN ? "Yes" : "No",
        expected_format: "AccountEndpoint=https://...;AccountKey=..."
      }
    });
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Voice Agent Test Results</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        .test { margin: 15px 0; padding: 15px; border-left: 4px solid #ccc; background: #fafafa; border-radius: 5px; }
        .pass { border-left-color: #4CAF50; background-color: #f1f8f4; }
        .fail { border-left-color: #f44336; background-color: #fef1f0; }
        .details { margin-top: 10px; padding: 10px; background: white; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
        .next-steps { margin-top: 30px; padding: 20px; background: #e3f2fd; border-radius: 5px; }
        .next-steps h2 { color: #1976d2; margin-top: 0; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0; border-radius: 3px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎯 Voice Agent Test Results</h1>
        
        ${tests.map(test => `
          <div class="test ${test.status.includes('✅') ? 'pass' : 'fail'}">
            <strong>${test.name}: ${test.status}</strong>
            <div class="details">
              <pre>${JSON.stringify(test.details, null, 2)}</pre>
            </div>
          </div>
        `).join('')}
        
        <div class="next-steps">
          <h2>📞 Next Steps</h2>
          ${tests.every(t => t.status.includes('✅')) ? `
            <p>✅ <strong>All tests passed!</strong> Your voice agent is ready.</p>
            <ol>
              <li>Call your Twilio phone number to test the voice agent</li>
              <li>Check Azure Function logs for processing details</li>
              <li>Monitor Cosmos DB Data Explorer for saved conversations</li>
            </ol>
          ` : `
            <div class="warning">
              ⚠️ <strong>Some tests failed.</strong> Please fix the issues above before testing.
            </div>
            <p>Common fixes:</p>
            <ul>
              <li>Add COSMOS_CONN to your environment variables</li>
              <li>Verify all API keys are correct</li>
              <li>Check network connectivity to Azure services</li>
            </ul>
          `}
        </div>
      </div>
    </body>
    </html>
  `;

  context.res = {
    headers: { "Content-Type": "text/html" },
    body: html
  };
};