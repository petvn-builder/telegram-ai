import { createEmbedding } from "@/lib/embeddings";
import { askOpenAI } from "@/lib/openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  const supabase = getSupabaseAdmin();
  const SUMMARY_TTL_HOURS = 24;

  console.log(`\n========== [SUMMARY] START ==========`);
  console.log(`[SUMMARY] Entity: ${entity.name} (${entity.id})`);

  try {
    // Check if summary exists and is fresh
    const isFresh =
      entity.summary &&
      entity.summary_updated_at &&
      Date.now() - new Date(entity.summary_updated_at).getTime() < SUMMARY_TTL_HOURS * 60 * 60 * 1000;

    if (isFresh) {
      console.log(`[SUMMARY] ✅ Using cached summary`);
      console.log(`========== [SUMMARY] END ==========\n`);
      return entity.summary;
    }

    console.log(`[SUMMARY] 🔄 Generating new summary...`);

    // Fetch all related notes
    console.log(`[SUMMARY] Fetching knowledge links for entity ${entity.id}...`);
    const { data: links, error: linksError } = await supabase
      .from("knowledge_links")
      .select("knowledge_id")
      .eq("entity_id", entity.id);

    if (linksError) {
      console.error(`[SUMMARY] ❌ Link fetch error:`, linksError);
      throw linksError;
    }

    console.log(`[SUMMARY] Found ${links?.length || 0} links`);

    const knowledgeIds = (links || []).map(l => l.knowledge_id);

    let notesText = "";
    if (knowledgeIds.length > 0) {
      console.log(`[SUMMARY] Fetching ${knowledgeIds.length} notes...`);
      const { data: notes, error: notesError } = await supabase
        .from("knowledge")
        .select("content")
        .in("id", knowledgeIds);

      if (notesError) {
        console.error(`[SUMMARY] ❌ Notes fetch error:`, notesError);
        throw notesError;
      }

      notesText = (notes || [])
        .map(n => n.content)
        .join("\n");
      
      console.log(`[SUMMARY] Fetched ${notes?.length || 0} notes, content length: ${notesText.length}`);
    }

    // Generate summary with AI
    console.log(`[SUMMARY] 🤖 Calling OpenAI...`);
    
    const summaryPrompt = `
You are generating a structured knowledge summary for a person/project/topic in a personal knowledge graph.

Entity:
Name: ${entity.name}
Type: ${entity.type}

Related Notes:
${notesText || "(No notes yet)"}

Generate a structured summary using exactly this format:

### Short Summary
2-3 sentences describing who/what this entity is and their main role.

### Key Insights
- Key insight 1
- Key insight 2
- Key insight 3 (add more if relevant)

### Important Facts
- Name: ${entity.name}
- Role: (role if known from notes, else omit this line)
- (any other key facts from the notes)

Be concise and factual. Only include facts from the provided notes. Do NOT invent information.`;

    const summary = await askOpenAI("", summaryPrompt);

    console.log(`[SUMMARY] OpenAI returned: ${summary?.substring(0, 80) || "NULL"}...`);

    if (!summary) {
      console.warn(`[SUMMARY] ⚠️  OpenAI returned empty/null response`);
      console.log(`========== [SUMMARY] END ==========\n`);
      return null;
    }

    // Save to database
    console.log(`[SUMMARY] 💾 Saving to DB...`);
    
    const { data, error } = await supabase
      .from("entities")
      .update({
        summary: summary,
        summary_updated_at: new Date().toISOString()
      })
      .eq("id", entity.id)
      .select();

    if (error) {
      console.error(`[SUMMARY] ❌ Database update error:`, error);
      console.error(`[SUMMARY] Error code:`, error.code);
      console.error(`[SUMMARY] Error message:`, error.message);
      console.error(`[SUMMARY] Error hint:`, error.hint);
      throw error;
    }

    console.log(`[SUMMARY] ✅ SUCCESS! Saved summary for ${entity.name}`);
    console.log(`[SUMMARY] Summary: ${summary.substring(0, 100)}...`);
    console.log(`========== [SUMMARY] END ==========\n`);
    return summary;
  } catch (error) {
    console.error(`\n❌ ❌ ❌ [SUMMARY] CRITICAL ERROR ❌ ❌ ❌`);
    console.error(`[SUMMARY] Entity: ${entity.name}`);
    console.error(`[SUMMARY] Error:`, error);
    console.error(`[SUMMARY] Stack:`, error.stack);
    console.error(`========== [SUMMARY] END (WITH ERROR) ==========\n`);
    return null;
  }
}

// ==========================================
// UUID LOOKUP HELPER
// ==========================================

async function getUuidForTelegramUser(telegramUserId) {
  const { data } = await getSupabaseAdmin()
    .from("user_identities")
    .select("user_id")
    .eq("telegram_user_id", String(telegramUserId))
    .single();
  return data?.user_id ?? null;
}

export async function POST(req) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const message = body.message;

  if (!message) return new Response("ok");

  const chatId = message.chat.id.toString();
  const text = message.text;

  console.log("[TG] raw text:", JSON.stringify(text));

  if (!text) return new Response("ok");

  // =========================
  // START LINK COMMAND (account linking)
  // =========================

  if (text.startsWith("/start link_")) {
    const rawToken = text.slice("/start link_".length).trim();
    try {
      const { consumeLinkToken } = await import("@/lib/telegram-link");
      await consumeLinkToken(
        rawToken,
        message.from.id.toString(),
        message.from.username || ""
      );
      await sendTelegram(chatId, "✅ Telegram linked! You can now use all commands.");
    } catch (err) {
      await sendTelegram(chatId, `❌ ${err.message}`);
    }
    return new Response("ok");
  }

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
// UUID GUARD — all commands below require a linked account
// =========================

const userUuid = await getUuidForTelegramUser(message.from.id);
if (!userUuid) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "the website";
  await sendTelegram(
    chatId,
    `Please register at ${appUrl} and connect your Telegram in Settings first.`
  );
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
    .eq("user_id", userUuid)
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

  // 3️⃣ Get related entities (entities sharing the same notes)
let relatedEntities = [];
if (knowledgeIds.length > 0) {
  const { data: relatedLinks } = await supabase
    .from("knowledge_links")
    .select("entity_id")
    .in("knowledge_id", knowledgeIds);

  const relatedEntityIds = [...new Set(
    (relatedLinks || [])
      .map(l => l.entity_id)
      .filter(id => id !== entity.id)
  )];

  if (relatedEntityIds.length > 0) {
    const { data: relatedData } = await supabase
      .from("entities")
      .select("name, type")
      .in("id", relatedEntityIds);
    relatedEntities = relatedData || [];
  }
}

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
// TASK CREATION COMMAND
// =========================

if (text.startsWith("/task")) {
  const content = text.slice(5).trim();

  if (!content) {
    await sendTelegram(
      chatId,
      "Usage: /task <title> [due date] [priority]\n\nExamples:\n/task Call Ricky tomorrow\n/task Review proposal next friday high\n/task Send invoice in 3 days"
    );
    return new Response("ok");
  }

  try {
    const { parseTaskText, createTask } = await import("@/lib/tasks");
    const { title, priority, due_date } = parseTaskText(content);

    if (!title) {
      await sendTelegram(chatId, "❌ Could not parse task title. Try: /task <title>");
      return new Response("ok");
    }

    const task = await createTask(supabase, userUuid, {
      title,
      priority,
      due_date,
      created_from: "telegram",
      telegram_message_id: String(message.message_id),
    });

    // Build confirmation message
    let confirmMsg = `✅ Task: "${task.title}"`;
    if (task.due_date) {
      const d = new Date(task.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() === today.getTime()) confirmMsg += "\n📅 Due: Today";
      else if (d.getTime() === tomorrow.getTime()) confirmMsg += "\n📅 Due: Tomorrow";
      else confirmMsg += `\n📅 Due: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    if (task.priority !== "medium") {
      confirmMsg += `\n⚡ Priority: ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`;
    }
    if (task.entities.length > 0) {
      confirmMsg += `\n🏷️ Linked: ${task.entities.map((e) => e.name).join(", ")}`;
    }

    await sendTelegram(chatId, confirmMsg);
  } catch (err) {
    console.error("[Task Command] Error:", err);
    await sendTelegram(chatId, "❌ Failed to create task. Please try again.");
  }

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
          user_id: userUuid,
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

let processedCount = 0;
let errorCount = 0;
let processedEntities = [];

// 4️⃣ Insert & Link entities (WITH structured fields)
for (let entity of entities) {
  const name = entity.name?.trim();
  const type = entity.type?.trim();

  if (!name || !type) {
    console.warn(`❌ Skipping invalid entity: name=${name}, type=${type}`);
    errorCount++;
    continue;
  }

  try {
    console.log(`📝 Processing entity: ${name}`);
    
    const structuredData = {
      attributes: entity.attributes || {},
      events: entity.events || [],
      relationships: entity.relationships || [],
      responsibilities: entity.responsibilities || []
    };

    const { data: existingEntity, error: existError } = await supabase
      .from("entities")
      .select("*")
      .eq("user_id", userUuid)
      .eq("name", name)
      .maybeSingle();

    if (existError) {
      console.error(`❌ Error querying entity ${name}:`, existError);
      errorCount++;
      continue;
    }

    let entityId;
    let entityToSummarize = null;

    if (existingEntity) {
      console.log(`🔄 Updating existing entity: ${name}`);
      entityId = existingEntity.id;
      entityToSummarize = existingEntity;

      const { error: updateError } = await supabase
        .from("entities")
        .update({
          ...structuredData,
          summary_updated_at: null
        })
        .eq("id", entityId);

      if (updateError) {
        console.error(`❌ Error updating entity ${name}:`, updateError);
        errorCount++;
        continue;
      }
    } else {
      console.log(`✨ Creating new entity: ${name}`);
      const { data: newEntity, error: insertError } = await supabase
        .from("entities")
        .insert({
          user_id: userUuid,
          name,
          type,
          ...structuredData,
          summary: null,
          summary_updated_at: null
        })
        .select()
        .single();

      if (insertError) {
        console.error(`❌ Error creating entity ${name}:`, insertError);
        errorCount++;
        continue;
      }

      console.log(`✅ Created entity: ${name}`);
      entityId = newEntity.id;
      entityToSummarize = newEntity;
    }

    // Link knowledge to entity
    console.log(`🔗 Linking knowledge to ${name}...`);
    const { error: linkError } = await supabase
      .from("knowledge_links")
      .insert({
        user_id: userUuid,
        knowledge_id: insertedKnowledge.id,
        entity_id: entityId,
      });

    if (linkError) {
      console.error(`❌ Error linking ${name}:`, linkError);
      errorCount++;
      continue;
    }

    console.log(`✅ Linked ${name}`);
    processedCount++;
    processedEntities.push({ name, type });

    // Generate summary
    if (entityToSummarize) {
      console.log(`\n🧠 Generating summary for ${name}...`);
      try {
        const summary = await generateAndSaveSummary(entityToSummarize, chatId);
        console.log(`✅ Summary generated for ${name}`);
      } catch (summaryErr) {
        console.error(`⚠️  Summary generation error for ${name}:`, summaryErr.message);
        // Don't fail on summary error
      }
    }

  } catch (entityErr) {
    console.error(`❌ Unexpected error processing ${name}:`, entityErr);
    errorCount++;
  }
}

// Send summary message with status
let summaryMsg = `✅ Saved! Processed: ${processedCount} entities${errorCount > 0 ? `, Errors: ${errorCount}` : ''}`;
if (processedEntities.length > 0) {
  summaryMsg += `\n\n🏷️ Entities:\n`;
  summaryMsg += processedEntities.map(e => `• ${e.name} (${e.type})`).join('\n');
}
console.log(summaryMsg);
await sendTelegram(chatId, summaryMsg);
  
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
    match_user: userUuid,
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
  .eq("user_id", userUuid);

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
        user_id: userUuid,
        content: text,
        role: "user",
        embedding: userEmbedding,
      },
      {
        user_id: userUuid,
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
