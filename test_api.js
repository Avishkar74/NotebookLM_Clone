// test_api.js - Verify OpenAI-compatible API connection
// Requires openai and dotenv packages

import { config } from "dotenv";
import OpenAI from "openai";
config();

const apiKey = process.env.CHATANYWHERE_API_KEY;
const baseURL = process.env.BASE_URL;

if (!apiKey) {
  console.error("❌ Missing CHATANYWHERE_API_KEY in .env");
  process.exit(1);
}
if (!baseURL) {
  console.error("❌ Missing BASE_URL in .env");
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL });

async function runTest() {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply exactly: API works" }],
    });
    const response = completion.choices?.[0]?.message?.content?.trim();
    console.log("✅ Response:", response);
    if (response === "API works") {
      console.log("✅ API verification succeeded");
    } else {
      console.warn("⚠️ Unexpected response. Verify prompt and model.");
    }
  } catch (err) {
    // Diagnose common errors
    if (err?.status === 401) {
      console.error("❌ 401 Unauthorized – Check API key configuration.");
    } else if (err?.status === 404) {
      console.error("❌ 404 Not Found – Verify model name (gpt-4o-mini) and endpoint.");
    } else if (err?.status === 429) {
      console.error("❌ 429 Rate limit – Free tier limited to 200 requests/day.");
    } else if (err?.code === "ETIMEDOUT" || err?.code === "ECONNREFUSED") {
      console.error("❌ Timeout or connection error – Ensure the base URL is reachable. If not, switch BASE_URL in .env to https://api.chatanywhere.org/v1");
    } else {
      console.error("❌ Unexpected error:", err);
    }
    process.exit(1);
  }
}

runTest();
