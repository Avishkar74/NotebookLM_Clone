import OpenAI from 'openai';

async function test(baseUrl) {
    console.log(`Testing with baseURL: ${baseUrl}`);
    try {
        const client = new OpenAI({
            apiKey: 'invalid-key', // We only want to see if it throws on baseURL
            baseURL: baseUrl
        });
        // Try a request
        await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: 'test'
        });
    } catch (e) {
        console.log(`Error with ${baseUrl}: ${e.message}`);
    }
}

async function run() {
    await test('https://api.chatanywhere.org/v1');
    await test('api.chatanywhere.org/v1');
}

run();
