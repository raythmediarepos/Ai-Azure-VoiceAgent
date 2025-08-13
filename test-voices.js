// Quick test script to try different Phoebe voice name formats
const sdk = require('microsoft-cognitiveservices-speech-sdk');

const possibleNames = [
    'en-US-PhoebeMultilingualNeural',
    'en-US-PhoebeNeural', 
    'en-US-Phoebe',
    'en-US-PhoebeMultilingual',
    'Phoebe Multilingual',
    'PhoebeMultilingual'
];

async function testVoiceName(voiceName) {
    try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(
            process.env.SPEECH_KEY,
            process.env.SPEECH_REGION
        );
        
        speechConfig.speechSynthesisVoiceName = voiceName;
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
        
        console.log(`Testing voice name: ${voiceName}`);
        
        const result = await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync("Hello, this is a test.", 
                resolve,
                reject
            );
        });
        
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`✅ SUCCESS: ${voiceName} works!`);
            return true;
        } else {
            console.log(`❌ FAILED: ${voiceName} - ${result.errorDetails}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ ERROR: ${voiceName} - ${error.message}`);
        return false;
    }
}

async function testAllVoices() {
    console.log('🎤 Testing different Phoebe voice name formats...\n');
    
    for (const voiceName of possibleNames) {
        const works = await testVoiceName(voiceName);
        if (works) {
            console.log(`\n🎯 FOUND WORKING VOICE: ${voiceName}`);
            break;
        }
        console.log(''); // blank line
    }
}

testAllVoices().catch(console.error);
