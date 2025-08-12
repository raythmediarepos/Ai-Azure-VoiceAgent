const { AzureOpenAI } = require("openai");
const AzureSpeechService = require("../shared/azureSpeechService");
const VoiceManager = require("../shared/voiceManager");

module.exports = async function (context, req) {
  context.log("🧪 Testing Azure Speech Services with Alloy Turbo");
  
  const tests = [];
  
  // Test 1: Check environment variables (including speech-specific ones)
  tests.push({
    name: "Environment Variables",
    status: process.env.OPENAI_ENDPOINT && process.env.OPENAI_KEY && process.env.SPEECH_KEY && process.env.SPEECH_REGION && process.env.COSMOS_CONN ? "✅ PASS" : "❌ FAIL",
    details: {
      openai_endpoint: process.env.OPENAI_ENDPOINT ? "Set" : "Missing",
      openai_key: process.env.OPENAI_KEY ? "Set" : "Missing", 
      speech_key: process.env.SPEECH_KEY ? "Set" : "Missing",
      speech_region: process.env.SPEECH_REGION ? process.env.SPEECH_REGION : "Missing",
      cosmos_conn: process.env.COSMOS_CONN ? "Set" : "Missing",
      storage_connection: process.env.AZURE_STORAGE_CONNECTION_STRING ? "Set (Optional)" : "Not Set (Optional)"
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
  
  // Test 3: Azure Speech Services with Alloy Turbo
  let speechTestResult = null;
  try {
    const speechService = new AzureSpeechService();
    const testText = "Hello! This is a test of the Azure Speech Services with Alloy Turbo multilingual voice. How does this sound?";
    
    const result = await speechService.synthesizeSpeech(testText, {
      emotion: 'friendly',
      emphasis: false,
      isEmergency: false
    });

    if (result.success) {
      speechTestResult = result;
      tests.push({
        name: "Azure Speech Services (Alloy Turbo)",
        status: "✅ PASS",
        details: { 
          voice: "en-US-AlloyTurboMultilingualNeural",
          format: "MP3 High Quality (48kHz)",
          duration: result.duration || 'N/A',
          audio_size: `${Math.round(result.audioData.length / 1024)}KB`,
          test_text: testText.substring(0, 50) + "..."
        }
      });
    } else {
      tests.push({
        name: "Azure Speech Services (Alloy Turbo)",
        status: "❌ FAIL",
        details: { error: result.error }
      });
    }
  } catch (error) {
    tests.push({
      name: "Azure Speech Services (Alloy Turbo)",
      status: "❌ FAIL", 
      details: { error: error.message }
    });
  }

  // Test 4: Voice Manager Integration
  try {
    const voiceManager = new VoiceManager();
    const testTwiml = await voiceManager.generateVoiceResponse(
      "This is a test of the voice manager integration.",
      {
        emotion: 'friendly',
        urgencyLevel: 'normal',
        followUpPrompt: "How did that sound?"
      }
    );

    tests.push({
      name: "Voice Manager Integration",
      status: testTwiml && testTwiml.includes('<Response>') ? "✅ PASS" : "❌ FAIL",
      details: { 
        twiml_generated: testTwiml ? "Yes" : "No",
        contains_audio: testTwiml && testTwiml.includes('data:audio/mp3') ? "Azure Audio" : "Twilio Fallback",
        response_length: testTwiml ? `${testTwiml.length} chars` : "N/A"
      }
    });
  } catch (error) {
    tests.push({
      name: "Voice Manager Integration",
      status: "❌ FAIL",
      details: { error: error.message }
    });
  }
  
  // Test 5: Cosmos DB Connection
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
      <title>🎤 Azure Speech Services Test - Alloy Turbo</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #2563eb; padding-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .test { margin: 20px 0; padding: 20px; border-left: 5px solid #ccc; background: #fafafa; border-radius: 8px; transition: all 0.3s ease; }
        .test:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .pass { border-left-color: #10b981; background-color: #f0fdf4; }
        .fail { border-left-color: #ef4444; background-color: #fef2f2; }
        .details { margin-top: 15px; padding: 15px; background: white; border-radius: 6px; font-family: 'Consolas', monospace; font-size: 0.9em; border: 1px solid #e5e5e5; }
        .audio-section { margin: 20px 0; padding: 25px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white; }
        .audio-section h3 { margin-top: 0; color: white; }
        audio { width: 100%; margin: 15px 0; border-radius: 5px; }
        button { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; margin: 8px; font-size: 14px; transition: background 0.3s; }
        button:hover { background: #1d4ed8; }
        button:disabled { background: #9ca3af; cursor: not-allowed; }
        .success { color: #10b981; font-weight: bold; }
        .error { color: #ef4444; font-weight: bold; }
        .info { background: #e0f2fe; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #0ea5e9; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 5px; color: #92400e; }
        .feature-list { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .feature-list ul { margin: 10px 0; padding-left: 20px; }
        .feature-list li { margin: 8px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎤 Azure Speech Services Test Results <span style="font-size: 0.6em; color: #666;">Alloy Turbo Multilingual</span></h1>
        
        ${speechTestResult && speechTestResult.success ? `
          <div class="audio-section">
            <h3>🎵 Voice Quality Test - Alloy Turbo</h3>
            <div class="success">✅ Azure Speech synthesis successful!</div>
            <p><strong>Voice Model:</strong> en-US-AlloyTurboMultilingualNeural</p>
            <p><strong>Audio Quality:</strong> High-quality MP3 (48kHz, 192kbps)</p>
            
            <h4>Generated Audio Sample:</h4>
            <audio controls>
              <source src="data:audio/mp3;base64,${speechTestResult.audioData}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>
            <br>
            <button onclick="document.querySelector('audio').play()">🔊 Play Sample</button>
            <button onclick="testEmergencyVoice()">🚨 Test Emergency Voice</button>
            <button onclick="testContextualVoice()">🗣️ Test Contextual Voice</button>
          </div>
        ` : `
          <div class="warning">
            <h3>⚠️ Azure Speech Services Not Available</h3>
            <p>The system will use enhanced Twilio Neural voices as fallback.</p>
          </div>
        `}
        
        <div class="feature-list">
          <h3>🌟 Implemented Features</h3>
          <ul>
            <li><strong>Alloy Turbo Multilingual Voice:</strong> Most natural Azure voice model</li>
            <li><strong>Context-Aware Speech:</strong> Voice adapts based on conversation urgency</li>
            <li><strong>Emergency Voice Adaptation:</strong> Faster, more urgent tone for emergencies</li>
            <li><strong>SSML Enhancement:</strong> Natural pauses, emphasis, and emotional expression</li>
            <li><strong>Intelligent Fallback:</strong> Enhanced Twilio Neural voices if Azure fails</li>
            <li><strong>Audio Caching:</strong> Optional Azure Blob storage for performance</li>
          </ul>
        </div>
        
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
        
        <script>
          async function testEmergencyVoice() {
            const button = event.target;
            button.disabled = true;
            button.textContent = '🔄 Testing...';
            
            try {
              const response = await fetch('/api/voice-test?test=emergency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testType: 'emergency' })
              });
              
              const result = await response.text();
              // Create modal or update page with emergency voice test
              alert('Emergency voice test completed! Check console for details.');
            } catch (error) {
              alert('Emergency test failed: ' + error.message);
            } finally {
              button.disabled = false;
              button.textContent = '🚨 Test Emergency Voice';
            }
          }
          
          async function testContextualVoice() {
            const button = event.target;
            button.disabled = true;
            button.textContent = '🔄 Testing...';
            
            try {
              const response = await fetch('/api/voice-test?test=contextual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testType: 'contextual' })
              });
              
              const result = await response.text();
              alert('Contextual voice test completed! Check console for details.');
            } catch (error) {
              alert('Contextual test failed: ' + error.message);
            } finally {
              button.disabled = false;
              button.textContent = '🗣️ Test Contextual Voice';
            }
          }
          
          // Auto-refresh every 30 seconds if not all tests pass
          ${!tests.every(t => t.status.includes('✅')) ? `
            setTimeout(() => {
              console.log('Auto-refreshing test results...');
              location.reload();
            }, 30000);
          ` : ''}
        </script>
      </body>
      </html>
    `;

  context.res = {
    headers: { "Content-Type": "text/html" },
    body: html
  };
};