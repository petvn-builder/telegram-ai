import { createEmbedding } from "@/lib/embeddings";
import { askOpenAI } from "@/lib/openai";
import { getSupabase } from "@/lib/supabase";

import {
  getOrCreateUser,
  resetIfNewDay,
  isLimitReached,
  incrementUsage
} from "@/lib/user";

export async function POST(req) {
  const supabase = getSupabase();
  const body = await req.json();
  const message = body.message;

  if (!message) return new Response("ok");

  const chatId = message.chat.id.toString();
  const text = message.text;

  if (!text) return new Response("ok");

  // =========================
// START COMMAND (NO LIMIT, NO SAVE)
// =========================

if (text === "/start") {
  const telegramId = message.from.id;
  const username = message.from.username || "";

  // Ensure user exists
  await getOrCreateUser(telegramId, username);

  const welcomeMessage = `
🧠 Welcome to Your AI Memory Assistant

Think of me as your second brain.

You can:

💾 Save knowledge  
Use:
/save <your text>

Example:
→ /save My AWS key expires in March

🔎 Ask naturally  
→ When does my AWS key expire?  
→ What do I know about project deadlines?

Everything you save is:
• Private  
• Organized  
• Instantly searchable  

Start by saving something important.
  `;

  await sendTelegram(chatId, welcomeMessage);

  return new Response("ok");
}

// =========================
// ENTITY VIEW COMMAND
// =========================

if (text.toLowerCase().startsWith("/entity")) {

  const name = text.slice(7).trim();

  if (!name) {
    await sendTelegram(chatId, "Usage: /entity <name>");
    return new Response("ok");
  }

  // 1️⃣ Find entity
  const { data: entity } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", chatId)
    .ilike("name", name)
    .single();

  if (!entity) {
    await sendTelegram(chatId, "Entity not found.");
    return new Response("ok");
  }

  // 2️⃣ Get linked knowledge
  const { data: links } = await supabase
    .from("knowledge_links")
    .select("knowledge_id")
    .eq("entity_id", entity.id);

  const knowledgeIds = links.map(l => l.knowledge_id);

  const { data: notes } = await supabase
    .from("knowledge")
    .select("content")
    .in("id", knowledgeIds);

  // 3️⃣ Get related entities
const { data: relatedLinks } = await supabase
.from("knowledge_links")
.select("entity_id")
.in("knowledge_id", knowledgeIds);

const relatedEntityIds = relatedLinks
.map(l => l.entity_id)
.filter(id => id !== entity.id);

const { data: relatedEntities } = await supabase
.from("entities")
.select("name, type")
.in("id", relatedEntityIds);

// 4️⃣ Build summary with AI
const notesText = (notes || [])
.map(n => n.content)
.join("\n");

const summaryPrompt = `
You are generating a structured knowledge page.

Entity:
Name: ${entity.name}
Type: ${entity.type}

Notes:
${notesText}

Generate:
1. Short summary (2-4 sentences)
2. Key insights
3. Important facts
Keep it concise.
`;

const summaryResponse = await askOpenAI("", summaryPrompt);

// 5️⃣ Format response
let response = `🧠 ${entity.name} (${entity.type})\n\n`;
response += `📄 Summary:\n${summaryResponse}\n\n`;

if (relatedEntities && relatedEntities.length > 0) {
response += `🔗 Related:\n`;
for (let r of relatedEntities) {
  response += `• ${r.name} (${r.type})\n`;
}
}

await sendTelegram(chatId, response);
return new Response("ok");

}


  // =========================
  // DAILY LIMIT CHECK
  // =========================

  const telegramId = message.from.id; // real user id
  const username = message.from.username || "";

  let user = await getOrCreateUser(telegramId, username);
  user = await resetIfNewDay(user);

  if (await isLimitReached(user)) {
    await sendTelegram(
      chatId,
      "🚫 You've reached your daily limit (20 messages). Try again tomorrow or contact Petvn for help."
    );
    return new Response("ok");
  }

  // Increment BEFORE AI work
  await incrementUsage(user.id);

  // =========================
  // SAVE COMMAND
  // =========================

  if (text.startsWith("/save")) {
    const content = text.replace("/save", "").trim();
  
    if (!content) {
      await sendTelegram(chatId, "Write something after /save 🙂");
      return new Response("ok");
    }
  
    // 1️⃣ Create embedding
    const embedding = await createEmbedding(content);
  
    // 2️⃣ Insert knowledge
    const { data: insertedKnowledge, error: insertError } =
      await supabase
        .from("knowledge")
        .insert({
          user_id: chatId,
          content,
          role: "note",
          embedding,
        })
        .select()
        .single();
  
    if (insertError) {
      console.error("Knowledge insert error:", insertError);
      await sendTelegram(chatId, "Error saving memory.");
      return new Response("ok");
    }
  
    // 3️⃣ Extract entities
const { extractEntities } = await import("@/lib/extractEntities");
let entities = await extractEntities(content);

console.log("Extracted:", entities);

if (!Array.isArray(entities)) {
  entities = [];
}

// 4️⃣ Insert & Link entities
for (let entity of entities) {
  const name = entity.name?.trim();
  const type = entity.type?.trim();

  if (!name || !type) continue;

  const { data: existingEntity } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", chatId)
    .eq("name", name)
    .maybeSingle();

  let entityId;

  if (existingEntity) {
    entityId = existingEntity.id;
  } else {
    const { data: newEntity, error } = await supabase
      .from("entities")
      .insert({
        user_id: chatId,
        name,
        type,
      })
      .select()
      .single();

    if (error) {
      console.error("Entity insert error:", error);
      continue;
    }

    entityId = newEntity.id;
  }

  await supabase.from("knowledge_links").insert({
    user_id: chatId,
    knowledge_id: insertedKnowledge.id,
    entity_id: entityId,
  });
}


  
    await sendTelegram(chatId, "Saved and structured 🧠🔗");
  
    return new Response("ok");
  }
  

  // =========================
  // SEARCH MEMORY
  // =========================
      // =========================
// GRAPH CONTEXT ENHANCEMENT
// =========================

const { data: possibleEntities } = await supabase
.from("entities")
.select("*")
.eq("user_id", chatId);

let graphMemory = "";

for (let entity of possibleEntities || []) {
if (text.toLowerCase().includes(entity.name.toLowerCase())) {

  const { data: links } = await supabase
    .from("knowledge_links")
    .select("knowledge_id")
    .eq("entity_id", entity.id);

  const knowledgeIds = links.map(l => l.knowledge_id);

  const { data: notes } = await supabase
    .from("knowledge")
    .select("content")
    .in("id", knowledgeIds);

  graphMemory += `\n[Entity: ${entity.name}]\n`;

  for (let note of notes || []) {
    graphMemory += `${note.content}\n`;
  }
}
}
  
  const queryEmbedding = await createEmbedding(text);

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

  let memory = "";

  for (let item of memories || []) {
    memory += `[${item.role}] ${item.content}\n`;
  }

  console.log("----- MEMORY SENT TO OPENAI -----");
  console.log(memory);
  console.log("----- USER MESSAGE -----");
  console.log(text);
  console.log("----------------------------------");

  // =========================
  // ASK OPENAI
  // =========================

  const combinedMemory = graphMemory + "\n" + memory;
  const aiResponse = await askOpenAI(combinedMemory, text);


  await sendTelegram(chatId, aiResponse);

  // =========================
  // SAVE USER + AI
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
