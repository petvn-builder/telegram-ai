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
  const telegramId = message.from.id;
  const username = message.from.username || "";
  const text = message.text;

  if (!text) return new Response("ok");

  // =========================
  // START COMMAND
  // =========================

  if (text === "/start") {
    await getOrCreateUser(telegramId, username);

    await sendTelegram(chatId, `
🧠 Welcome to Your AI Memory Assistant

Use:
/save <text>  → Save knowledge
/entity <name> → View structured entity

Ask naturally:
• What do I know about AWS?
• Tell me about Alex
`);

    return new Response("ok");
  }

  // =========================
  // ENTITY VIEW
  // =========================

  if (text.toLowerCase().startsWith("/entity")) {
    const name = text.slice(7).trim();
    if (!name) {
      await sendTelegram(chatId, "Usage: /entity <name>");
      return new Response("ok");
    }

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

    const { data: links } = await supabase
      .from("knowledge_links")
      .select("knowledge_id")
      .eq("entity_id", entity.id);

    const knowledgeIds = (links || []).map(l => l.knowledge_id);

    const { data: notes } = await supabase
      .from("knowledge")
      .select("content")
      .in("id", knowledgeIds);

    const notesText = (notes || []).map(n => n.content).join("\n");

    const summaryPrompt = `
Summarize the following entity:

Name: ${entity.name}
Type: ${entity.type}

Notes:
${notesText}

Give:
1. Short summary
2. Key insights
3. Important facts
Keep concise.
`;

    const summary = await askOpenAI("", summaryPrompt);

    await sendTelegram(chatId, `🧠 ${entity.name} (${entity.type})

${summary}`);

    return new Response("ok");
  }

  // =========================
  // DAILY LIMIT
  // =========================

  let user = await getOrCreateUser(telegramId, username);
  user = await resetIfNewDay(user);

  if (await isLimitReached(user)) {
    await sendTelegram(chatId, "🚫 Daily limit reached (20 messages).");
    return new Response("ok");
  }

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

    const embedding = await createEmbedding(content);

    const { data: insertedKnowledge } = await supabase
      .from("knowledge")
      .insert({
        user_id: chatId,
        content,
        role: "note",
        embedding
      })
      .select()
      .single();

    const { extractEntities } = await import("@/lib/extractEntities");
    let entities = await extractEntities(content);
    if (!Array.isArray(entities)) entities = [];

    for (let entity of entities) {
      const name = entity.name?.trim();
      const type = entity.type?.trim();
      if (!name || !type) continue;

      const structuredData = {
        attributes: entity.attributes || {},
        events: entity.events || [],
        relationships: entity.relationships || [],
        responsibilities: entity.responsibilities || []
      };

      const { data: existing } = await supabase
        .from("entities")
        .select("id")
        .eq("user_id", chatId)
        .eq("name", name)
        .maybeSingle();

      let entityId;

      if (existing) {
        entityId = existing.id;
        await supabase.from("entities").update(structuredData).eq("id", entityId);
      } else {
        const { data: created } = await supabase
          .from("entities")
          .insert({
            user_id: chatId,
            name,
            type,
            ...structuredData
          })
          .select()
          .single();

        entityId = created.id;
      }

      await supabase.from("knowledge_links").insert({
        user_id: chatId,
        knowledge_id: insertedKnowledge.id,
        entity_id: entityId
      });
    }

    await sendTelegram(chatId, "Saved and structured 🧠");
    return new Response("ok");
  }

  // =========================
  // SEARCH MEMORY (VECTOR FIRST)
  // =========================

  const queryEmbedding = await createEmbedding(text);

  const { data: memories } = await supabase.rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_user: chatId,
    match_count: 8
  });

  let memory = "";
  for (let item of memories || []) {
    memory += `[${item.role}] ${item.content}\n`;
  }

  // =========================
  // GRAPH CONTEXT (AFTER MEMORY EXISTS)
  // =========================

  const { data: possibleEntities } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", chatId);

  let graphMemory = "";

  for (let entity of possibleEntities || []) {
    if (memory.toLowerCase().includes(entity.name.toLowerCase())) {

      const { data: links } = await supabase
        .from("knowledge_links")
        .select("knowledge_id")
        .eq("entity_id", entity.id);

      const knowledgeIds = (links || []).map(l => l.knowledge_id);

      const { data: notes } = await supabase
        .from("knowledge")
        .select("content")
        .in("id", knowledgeIds);

      graphMemory += `
==============================
ENTITY CONTEXT
==============================
Name: ${entity.name}
Type: ${entity.type}
Attributes: ${JSON.stringify(entity.attributes || {})}
Events: ${JSON.stringify(entity.events || [])}
Relationships: ${JSON.stringify(entity.relationships || [])}
Responsibilities: ${JSON.stringify(entity.responsibilities || [])}
`;

      for (let note of notes || []) {
        graphMemory += `- ${note.content}\n`;
      }

      graphMemory += "\n";
    }
  }

  // =========================
  // ASK OPENAI
  // =========================

  const combinedMemory = graphMemory + "\n" + memory;
  const aiResponse = await askOpenAI(combinedMemory, text);

  await sendTelegram(chatId, aiResponse);

  // =========================
  // SAVE CONVERSATION
  // =========================

  const userEmbedding = await createEmbedding(text);
  const aiEmbedding = await createEmbedding(aiResponse);

  await supabase.from("knowledge").insert([
    { user_id: chatId, content: text, role: "user", embedding: userEmbedding },
    { user_id: chatId, content: aiResponse, role: "ai", embedding: aiEmbedding }
  ]);

  return new Response("ok");
}

async function sendTelegram(chatId, text) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }
  );
}
