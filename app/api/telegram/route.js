import { createEmbedding } from "@/lib/embeddings";
import { askOpenAI } from "@/lib/openai";
import { getSupabase } from "@/lib/supabase";

import {
  getOrCreateUser,
  resetIfNewDay,
  isLimitReached,
  incrementUsage
} from "@/lib/user";

// ==========================================
// GENERATE & SAVE ENTITY SUMMARY
// ==========================================

async function generateAndSaveSummary(entity, chatId) {
  const supabase = getSupabase();
  const SUMMARY_TTL_HOURS = 24;

  try {
    console.log(`[Summary] START: Generating summary for entity: ${entity.name} (ID: ${entity.id})`);

    // Check if summary exists and is fresh
    const isFresh =
      entity.summary &&
      entity.summary_updated_at &&
      Date.now() - new Date(entity.summary_updated_at).getTime() < SUMMARY_TTL_HOURS * 60 * 60 * 1000;

    if (isFresh) {
      console.log(`[Summary] Using cached summary for entity: ${entity.name}`);
      return entity.summary; // Use cached summary
    }

    console.log(`[Summary] No fresh cache, generating new summary for: ${entity.name}`);

    // Fetch all related notes
    const { data: links, error: linksError } = await supabase
      .from("knowledge_links")
      .select("knowledge_id")
      .eq("entity_id", entity.id);

    if (linksError) {
      console.error(`[Summary] Error fetching links for ${entity.name}:`, linksError);
      throw linksError;
    }

    console.log(`[Summary] Found ${links?.length || 0} links for ${entity.name}`);

    const knowledgeIds = (links || []).map(l => l.knowledge_id);

    let notesText = "";
    if (knowledgeIds.length > 0) {
      const { data: notes, error: notesError } = await supabase
        .from("knowledge")
        .select("content")
        .in("id", knowledgeIds);

      if (notesError) {
        console.error(`[Summary] Error fetching notes for ${entity.name}:`, notesError);
        throw notesError;
      }

      notesText = (notes || [])
        .map(n => n.content)
        .join("\n");
      
      console.log(`[Summary] Fetched ${notes?.length || 0} notes for ${entity.name}`);
    }

    // Generate summary with AI
    console.log(`[Summary] Calling OpenAI for ${entity.name}...`);
    
    const summaryPrompt = `
You are generating a concise knowledge summary for a person/project/topic in a personal knowledge graph.

Entity:
Name: ${entity.name}
Type: ${entity.type}

Related Notes:
${notesText || "(No notes yet)"}

Generate a brief summary (2-4 sentences). Focus on key facts, roles, and relationships.
Be concise and factual. Do NOT invent information.`;

    const summary = await askOpenAI("", summaryPrompt);

    console.log(`[Summary] OpenAI response for ${entity.name}: ${summary?.substring(0, 100)}...`);

    if (!summary) {
      console.warn(`[Summary] OpenAI returned empty summary for ${entity.name}`);
      return null;
    }

    // Save to database
    console.log(`[Summary] Saving summary to DB for ${entity.name}...`);
    
    const { data, error } = await supabase
      .from("entities")
      .update({
        summary: summary,
        summary_updated_at: new Date().toISOString()
      })
      .eq("id", entity.id)
      .select();

    if (error) {
      console.error(`[Summary] Error saving summary for ${entity.name}:`, error);
      throw error;
    }

    console.log(`[Summary] SUCCESS: Saved summary for entity: ${entity.name}`);
    return summary;
  } catch (error) {
    console.error(`[Summary] FAILED for entity ${entity.name}:`, error);
    console.error(`[Summary] Error details:`, {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details
    });
    // Don't throw - allow process to continue
    return null;
  }
}

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

// 4️⃣ Get or generate summary
  try {
    console.log(`[Entity Command] Fetching summary for ${entity.name}...`);
    const summary = await generateAndSaveSummary(entity, chatId);

    // 5️⃣ Format response
    let response = `🧠 ${entity.name} (${entity.type})\n\n`;
    response += `📄 Summary:\n${summary || "(No summary generated)"}\n\n`;

    if (relatedEntities && relatedEntities.length > 0) {
      response += `🔗 Related:\n`;
      for (let r of relatedEntities) {
        response += `• ${r.name} (${r.type})\n`;
      }
    }

    console.log(`[Entity Command] Sending response for ${entity.name}`);
    await sendTelegram(chatId, response);
    return new Response("ok");
  } catch (error) {
    console.error("[Entity Command] Error displaying entity:", error);
    await sendTelegram(chatId, `Error displaying entity: ${error.message}`);
    return new Response("ok");
  }

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

console.log(`[Entity] Processing ${entities.length} entities for knowledge ID: ${insertedKnowledge.id}`);

// 4️⃣ Insert & Link entities (WITH structured fields)
for (let entity of entities) {
  const name = entity.name?.trim();
  const type = entity.type?.trim();

  if (!name || !type) {
    console.warn(`[Entity] Skipping invalid entity: name=${name}, type=${type}`);
    continue;
  }

  console.log(`[Entity] Processing: ${name} (${type})`);

  const structuredData = {
    attributes: entity.attributes || {},
    events: entity.events || [],
    relationships: entity.relationships || [],
    responsibilities: entity.responsibilities || []
  };

  const { data: existingEntity, error: existError } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", chatId)
    .eq("name", name)
    .maybeSingle();

  if (existError) {
    console.error(`[Entity] Error querying existing entity ${name}:`, existError);
    continue;
  }

  let entityId;
  let isNewEntity = false;
  let entityToSummarize = null;

  if (existingEntity) {
    console.log(`[Entity] Found existing entity: ${name} (ID: ${existingEntity.id})`);
    entityId = existingEntity.id;
    entityToSummarize = existingEntity;

    // 🔥 UPDATE structured fields if entity already exists
    const { error: updateError } = await supabase
      .from("entities")
      .update({
        ...structuredData,
        summary_updated_at: null // Reset summary to force regeneration on next view
      })
      .eq("id", entityId);

    if (updateError) {
      console.error(`[Entity] Error updating entity ${name}:`, updateError);
      continue;
    }
    console.log(`[Entity] Updated existing entity: ${name}`);

  } else {
    console.log(`[Entity] Creating new entity: ${name}`);
    const { data: newEntity, error: insertError } = await supabase
      .from("entities")
      .insert({
        user_id: chatId,
        name,
        type,
        ...structuredData,
        summary: null,
        summary_updated_at: null
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[Entity] Error creating entity ${name}:`, insertError);
      continue;
    }

    console.log(`[Entity] Created new entity: ${name} (ID: ${newEntity.id})`);
    entityId = newEntity.id;
    isNewEntity = true;
    entityToSummarize = newEntity;
  }

  // 🔗 Link knowledge to entity
  console.log(`[Entity] Creating link: knowledge ${insertedKnowledge.id} -> entity ${entityId}`);
  const { error: linkError } = await supabase
    .from("knowledge_links")
    .insert({
      user_id: chatId,
      knowledge_id: insertedKnowledge.id,
      entity_id: entityId,
    });

  if (linkError) {
    console.error(`[Entity] Error creating link for ${name}:`, linkError);
    continue;
  }
  console.log(`[Entity] Successfully linked ${name} to knowledge`);

  // 🧠 Generate summary for new or updated entity (ASYNC - don't wait)
  if (entityToSummarize) {
    console.log(`[Entity] Triggering async summary generation for ${entityToSummarize.name} (ID: ${entityToSummarize.id})`);
    (async () => {
      try {
        await generateAndSaveSummary(entityToSummarize, chatId);
      } catch (err) {
        console.error(`[Entity] Exception in summary generation for ${entityToSummarize.name}:`, err);
      }
    })();
  } else {
    console.warn(`[Entity] No entityToSummarize for ${name}`);
  }
}
  
    await sendTelegram(chatId, "Saved and structured 🧠🔗");
  
    return new Response("ok");
  }
  

 // =========================
// SEARCH MEMORY
// =========================

let memory = "";
let graphMemory = "";

// 1️⃣ Create embedding
const queryEmbedding = await createEmbedding(text);

// 2️⃣ Vector search
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

// 3️⃣ Build memory string (clean + dedup + filtered)

const uniqueContents = new Set();
const MAX_MEMORY_CHARS = 2000;

const normalizedCurrentMessage = text.trim().toLowerCase();

for (let item of memories || []) {

  if (!item?.content) continue;

  // Skip AI responses
  if (item.role === "ai") continue;

  const normalizedItem = item.content.trim().toLowerCase();

  // 🚫 Skip echo of current message
  if (normalizedItem === normalizedCurrentMessage) continue;

  // Deduplicate
  if (uniqueContents.has(normalizedItem)) continue;
  uniqueContents.add(normalizedItem);

  memory += `[${item.role}] ${item.content}\n`;

  if (memory.length > MAX_MEMORY_CHARS) break;
}

// =========================
// GRAPH CONTEXT ENHANCEMENT
// =========================

// fetch entities once
const { data: possibleEntities } = await supabase
  .from("entities")
  .select("*")
  .eq("user_id", chatId);

const normalizedQuestion = text.toLowerCase().trim();

let injectedEntities = 0;
const MAX_ENTITIES = 5;

for (let entity of possibleEntities || []) {

  if (!entity.name) continue;

  const normalizedName = entity.name.toLowerCase().trim();

  if (
    normalizedQuestion.includes(normalizedName) &&
    injectedEntities < MAX_ENTITIES
  ) {

    // Use cached summary if available
    let entityContext = `${entity.name} (${entity.type})`;
    
    if (entity.summary) {
      entityContext += `\nSummary: ${entity.summary}`;
    }

    graphMemory += entityContext + "\n";

    // Add related notes if summary is not fresh
    const { data: links } = await supabase
      .from("knowledge_links")
      .select("knowledge_id")
      .eq("entity_id", entity.id);

    const knowledgeIds = (links || []).map(l => l.knowledge_id);
    if (knowledgeIds.length) {

      const { data: notes } = await supabase
        .from("knowledge")
        .select("content")
        .in("id", knowledgeIds)
        .limit(2); // Limit to 2 most recent

      for (let note of (notes || [])) {
        graphMemory += `  - ${note.content}\n`;
      }
    }

    graphMemory += "\n";

    injectedEntities++;
  }
}


console.log("---- GRAPH MEMORY BUILT ----");
console.log(graphMemory || "No graph context injected");
console.log("----------------------------");

  console.log("----- MEMORY SENT TO OPENAI -----");
  console.log(memory);
  console.log("----- USER MESSAGE -----");
  console.log(text);
  console.log("----------------------------------");

  // =========================
  // ASK OPENAI
  // =========================

  let combinedMemory = "";

  if (graphMemory.trim().length > 0) {
  combinedMemory += "=== ENTITY CONTEXT ===\n";
  combinedMemory += graphMemory.trim() + "\n\n";
  }

  if (memory.trim().length > 0) {
  combinedMemory += "=== RELEVANT MEMORY ===\n";
  combinedMemory += memory.trim();
  }


  console.log("----- FINAL MEMORY SENT TO OPENAI -----");
console.log(combinedMemory);
console.log("--------------------------------------");

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
