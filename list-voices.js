// List all available voices in your Azure Speech Service
const sdk = require('microsoft-cognitiveservices-speech-sdk');

async function listAvailableVoices() {
    try {
        // Use your existing environment variables from the function app
        const speechConfig = sdk.SpeechConfig.fromSubscription(
            process.env.SPEECH_KEY || 'your-key-here',
            process.env.SPEECH_REGION || 'westus'
        );
        
        console.log('🔍 Fetching available voices from your Azure Speech Service...\n');
        
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
        
        const voices = await new Promise((resolve, reject) => {
            synthesizer.getVoicesAsync(
                (result) => {
                    if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
                        resolve(result.voices);
                    } else {
                        reject(new Error(`Failed to get voices: ${result.errorDetails}`));
                    }
                },
                (error) => reject(error)
            );
        });
        
        console.log(`📋 Found ${voices.length} voices total\n`);
        
        // Filter for English US voices with "Phoebe" or multilingual
        const relevantVoices = voices.filter(voice => 
            voice.locale === 'en-US' && 
            (voice.shortName.toLowerCase().includes('phoebe') || 
             voice.shortName.toLowerCase().includes('multilingual') ||
             voice.shortName.toLowerCase().includes('ava'))
        );
        
        console.log('🎯 Relevant English US voices:');
        console.log('=====================================');
        
        relevantVoices.forEach(voice => {
            console.log(`Name: ${voice.shortName}`);
            console.log(`Display: ${voice.localName}`);
            console.log(`Gender: ${voice.gender}`);
            console.log(`Styles: ${voice.styleList ? voice.styleList.join(', ') : 'None'}`);
            console.log('---');
        });
        
        if (relevantVoices.length === 0) {
            console.log('❌ No Phoebe or multilingual voices found');
            console.log('\n📋 All English US voices:');
            voices.filter(v => v.locale === 'en-US').forEach(voice => {
                console.log(`- ${voice.shortName} (${voice.localName})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error listing voices:', error.message);
        console.log('\n💡 Make sure your SPEECH_KEY and SPEECH_REGION are set correctly');
    }
}

listAvailableVoices();
