import { createEmbedding } from "@/lib/embeddings";

import { askOpenAI } from "@/lib/openai";
import { getSupabase } from "@/lib/supabase";

export async function POST(req) {
  const supabase = getSupabase();
  const body = await req.json();
  const message = body.message;

  if (!message) return new Response("ok");

  const chatId = message.chat.id.toString();
  const text = message.text;

  if (!text) return new Response("ok");

  // =========================
  // SAVE COMMAND
  // =========================
  if (text.startsWith("/save")) {
    const content = text.replace("/save", "").trim();

    if (!content) {
      await sendTelegram(chatId, "Write something after /save 🙂");
      return new Response("ok");
    }

  const embedding = await createEmbedding(content);

  await supabase.from("knowledge").insert({
  user_id: chatId,
  content,
  role: "note",
  embedding,
});

    await sendTelegram(chatId, "Saved to memory 🧠");
    return new Response("ok");
  }

  // =========================
  // FETCH USER KNOWLEDGE
    // =========================
// FETCH RELEVANT MEMORY
// =========================

// 1️⃣ Create embedding of user query
const queryEmbedding = await createEmbedding(text);

// 2️⃣ Search similar memories
const { data: memories, error: memoryError } = await supabase.rpc(
  "match_knowledge",
  {
    query_embedding: queryEmbedding,
    match_user: chatId,
    match_count: 8,
  }
);

if (memoryError) {
  console.error("Memory search error:", memoryError);
}

// 3️⃣ Build structured memory string
let memory = "";

for (let item of memories || []) {
  memory += `[${item.role}] ${item.content}\n`;
}

// Debug logs
console.log("----- MEMORY SENT TO OPENAI -----");
console.log(memory);

console.log("----- USER MESSAGE -----");
console.log(text);
console.log("----------------------------------");

// 4️⃣ Ask OpenAI
const aiResponse = await askOpenAI(memory, text);

// 5️⃣ Send response to Telegram
await sendTelegram(chatId, aiResponse);

// =========================
// SAVE USER + AI MESSAGE
// =========================

const userEmbedding = await createEmbedding(text);
const aiEmbedding = await createEmbedding(aiResponse);

const { error: insertError } = await supabase
  .from("knowledge")
  .insert([
    {
      user_id: chatId,
      content: text,
      role: "user",
      embedding: userEmbedding,
    },
    {
      user_id: chatId,
      content: aiResponse,
      role: "ai",
      embedding: aiEmbedding,
    },
  ]);

if (insertError) {
  console.error("Insert error:", insertError);
}


  // Then call OpenAI
  const aiResponse = await askOpenAI(memory, text);


  // =========================
  // ASK OPENAI
  // =========================
  console.log("----- MEMORY SENT TO OPENAI -----");
  console.log(memory);

  console.log("----- USER MESSAGE -----");
  console.log(text);
  console.log("----------------------------------");

  const aiResponse = await askOpenAI(memory, text);


  // Send response to Telegram
  await sendTelegram(chatId, aiResponse);

  // =========================
  // BATCH INSERT (User + AI)
  // =========================
  // Create embeddings
const userEmbedding = await createEmbedding(text);
const aiEmbedding = await createEmbedding(aiResponse);

// Insert with vectors
const { error: insertError } = await supabase
  .from("knowledge")
  .insert([
    {
      user_id: chatId,
      content: text,
      role: "user",
      embedding: userEmbedding,
    },
    {
      user_id: chatId,
      content: aiResponse,
      role: "ai",
      embedding: aiEmbedding,
    },
  ]);

if (insertError) {
  console.error("Insert error:", insertError);
}

  return new Response("ok");
}

async function sendTelegram(chatId, text) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );
}
