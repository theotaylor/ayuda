require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const HUGGINGFACE_API_KEY = process.env.HUGGING_FACE_API_KEY_DEV

// Function to test the Hugging Face token and summarization
async function testTokenAndSummarization() {
    const sampleText = "Hugging Face is creating a tool that democratizes AI. It’s essential for anyone looking to harness the power of AI and machine learning.";

    try {
        // First, check the token's validity
        const tokenResponse = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
            },
        });

        if (!tokenResponse.ok) {
            throw new Error(`HTTP error! status: ${tokenResponse.status}`);
        }

        const modelInfo = await tokenResponse.json();
        console.log('Token is valid. Model info:', modelInfo);

        // Now test the summarization
        const summaryResponse = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: sampleText,
            }),
        });

        if (!summaryResponse.ok) {
            const errorData = await summaryResponse.json();
            console.error('Error during summarization:', errorData);
            throw new Error(`HTTP error! status: ${summaryResponse.status}`);
        }

        const summaryData = await summaryResponse.json();
        console.log('Summary result:', summaryData);
        
        // Handle the output of the summarization
        if (Array.isArray(summaryData) && summaryData.length > 0 && summaryData[0].summary_text) {
            console.log('Summary:', summaryData[0].summary_text);
        } else {
            console.error('No summary found in the response. Full response:', summaryData);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testTokenAndSummarization();
