// Test voices that are visible in your Speech Playground
const possibleVoices = {
    'ava_multilingual': 'en-US-AvaMultilingualNeural',
    'ava_standard': 'en-US-AvaNeural', 
    'alloy_turbo': 'en-US-AlloyTurboMultilingualNeural',
    'alloy_standard': 'en-US-AlloyNeural',
    'andrew_multilingual': 'en-US-AndrewMultilingualNeural',
    'nova_turbo': 'en-US-NovaTurboMultilingualNeural',
    'aria_neural': 'en-US-AriaNeural'
};

console.log('🎤 Voice names to test from your Speech Playground:');
console.log('=====================================================');

Object.entries(possibleVoices).forEach(([friendlyName, apiName]) => {
    console.log(`${friendlyName.padEnd(20)} → ${apiName}`);
});

console.log('\n💡 Action Plan:');
console.log('1. Click "View code" in Speech Playground');
console.log('2. Look for the exact voice name in the API request');
console.log('3. Test the voice quality by clicking play buttons');
console.log('4. Report back which voice sounds best!');
