import { createEmbedding } from "@/lib/embeddings";
import { askOpenAI } from "@/lib/openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertEntitiesAndLink } from "@/lib/entities";
import { resolveEntities } from "@/lib/entity-resolver";

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
// TODO COMMAND
// =========================

if (text === "/todo") {
  try {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, status, due_date, priority")
      .eq("user_id", userUuid)
      .in("status", ["doing", "next", "waiting", "inbox"])
      .order("created_at", { ascending: false })
      .limit(10)

    if (!tasks || tasks.length === 0) {
      await sendTelegram(chatId, "📋 No active tasks. Create one with /task <title>")
      return new Response("ok")
    }

    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
    tasks.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

    const sections = [
      { status: "doing", label: "🔵 Doing" },
      { status: "next", label: "⏭ Next" },
      { status: "waiting", label: "⏳ Waiting" },
      { status: "inbox", label: "📥 Inbox" },
    ]

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

    let msg = "📋 Tasks\n"
    for (const { status, label } of sections) {
      const group = tasks.filter(t => t.status === status)
      if (group.length === 0) continue
      msg += `\n${label}\n`
      for (const t of group) {
        msg += `• ${t.title}`
        if (t.due_date) {
          const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
          if (d.getTime() === today.getTime()) msg += " (today)"
          else if (d.getTime() === tomorrow.getTime()) msg += " (tomorrow)"
          else if (d < today) msg += " (⚠ overdue)"
          else msg += ` (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
        }
        msg += "\n"
      }
    }

    await sendTelegram(chatId, msg.trim())
  } catch (err) {
    console.error("[Todo Command] Error:", err)
    await sendTelegram(chatId, "❌ Failed to load tasks.")
  }
  return new Response("ok")
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

// 4️⃣ Insert & Link entities (merged, case-normalised, no summary generation)
const savedEntities = await upsertEntitiesAndLink(
  supabase,
  userUuid,
  insertedKnowledge.id,
  entities
);

const processedEntities = savedEntities.map(e => ({ name: e.name, type: e.type }));

// Send save confirmation
let summaryMsg = `✅ Saved! ${processedEntities.length} entit${processedEntities.length === 1 ? "y" : "ies"} linked`;
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

// =========================
// TIER 1: ENTITY CONTEXT (alias + embedding resolution)
// =========================

const MAX_ENTITIES = 5;
const matchedEntityIds = new Set();
const matchedEntityNames = new Set();
const entityLinkedNoteIds = new Set();
const allMatchedEntityNoteIds = new Set();

const resolvedEntities = await resolveEntities(userUuid, text, { maxEntities: MAX_ENTITIES });

for (const entity of resolvedEntities) {
  matchedEntityIds.add(entity.id);
  matchedEntityNames.add(entity.name.toLowerCase().trim());

  graphMemory += `${entity.name} (${entity.type})\n`;

  // Fetch linked knowledge IDs for this entity
  const { data: links } = await supabase
    .from("knowledge_links")
    .select("knowledge_id")
    .eq("entity_id", entity.id);

  const knowledgeIds = (links || []).map(l => l.knowledge_id);

  for (const id of knowledgeIds) allMatchedEntityNoteIds.add(id);

  if (knowledgeIds.length) {
    const { data: notes } = await supabase
      .from("knowledge")
      .select("id, content")
      .in("id", knowledgeIds)
      .order("created_at", { ascending: false })
      .limit(5);

    const fetchedNotes = notes || [];
    if (fetchedNotes.length > 0) {
      for (const note of fetchedNotes) {
        entityLinkedNoteIds.add(note.id);
        graphMemory += `  - ${note.content}\n`;
      }
    } else {
      const { data: full } = await supabase.from("entities").select("summary").eq("id", entity.id).maybeSingle();
      if (full?.summary) graphMemory += `Summary: ${full.summary}\n`;
    }
  } else {
    const { data: full } = await supabase.from("entities").select("summary").eq("id", entity.id).maybeSingle();
    if (full?.summary) graphMemory += `Summary: ${full.summary}\n`;
  }

  graphMemory += "\n";
}

console.log(`[MEMORY] Tier 1 (entity-linked): ${entityLinkedNoteIds.size} notes, ${matchedEntityIds.size} entities matched`);
console.log("---- GRAPH MEMORY BUILT ----");
console.log(graphMemory || "No graph context injected");
console.log("----------------------------");

// =========================
// TIER 2: SEMANTIC SEARCH (filtered by entity context)
// =========================

const queryEmbedding = await createEmbedding(text);

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

// Diagnostic: log what fields the RPC actually returns (helps verify id/similarity availability)
if (memories?.length > 0) {
  console.log(`[MEMORY] RPC sample fields: ${Object.keys(memories[0]).join(', ')}`);
}

const uniqueContents = new Set();
const MAX_MEMORY_CHARS = 2000;
const SIMILARITY_THRESHOLD = 0.75;

const normalizedCurrentMessage = text.trim().toLowerCase();
let tier2Count = 0;

for (let item of memories || []) {

  if (!item?.content) continue;

  // Skip AI responses and user chat messages — only notes belong in RELEVANT MEMORY
  if (item.role === "ai" || item.role === "user") continue;

  const normalizedItem = item.content.trim().toLowerCase();

  // Skip echo of current message
  if (normalizedItem === normalizedCurrentMessage) continue;

  // Skip notes already included in ENTITY CONTEXT
  if (item.id && entityLinkedNoteIds.has(item.id)) continue;

  // Entity-relevance gate: block notes unrelated to matched entities
  if (matchedEntityIds.size > 0) {
    // Primary: note is formally entity-linked (works if RPC returns id)
    const isEntityLinked = item.id && allMatchedEntityNoteIds.has(item.id);

    if (!isEntityLinked) {
      // Secondary: note content explicitly mentions a matched entity name
      // Catches relevant but unlinked notes (e.g. "Crocs UAT result" mentions "Crocs")
      const mentionsEntity = matchedEntityNames.size > 0 &&
        [...matchedEntityNames].some(name =>
          name.length >= 3 && item.content.toLowerCase().includes(name)
        );

      if (!mentionsEntity) continue; // No entity mention → unrelated, block it

      // Name-matched but not formally linked — require decent similarity if available
      if (item.similarity !== undefined && item.similarity < 0.70) continue;
    }
  } else {
    // No entity matched: base similarity threshold
    if (item.similarity !== undefined && item.similarity < SIMILARITY_THRESHOLD) continue;
  }

  // Deduplicate by content
  if (uniqueContents.has(normalizedItem)) continue;
  uniqueContents.add(normalizedItem);

  memory += `[${item.role}] ${item.content}\n`;
  tier2Count++;

  if (memory.length > MAX_MEMORY_CHARS) break;
}

console.log(`[MEMORY] Tier 2 (semantic, threshold=${SIMILARITY_THRESHOLD}): ${tier2Count} notes added`);
console.log(`[MEMORY] Final: ${entityLinkedNoteIds.size + tier2Count} notes total sent to OpenAI`);

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
