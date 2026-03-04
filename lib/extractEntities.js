import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function extractEntities(text) {
  const trimmedText = text.slice(0, 5000);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Extract entities from personal notes. Return only entities explicitly mentioned. Never invent information.
Types: person, project, topic, company, tool, goal, event, resource`,
      },
      {
        role: "user",
        content: trimmedText,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "entities",
        strict: true,
        schema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: {
                    type: "string",
                    enum: ["person", "project", "topic", "company", "tool", "goal", "event", "resource"],
                  },
                  attributes: {
                    type: "object",
                    properties: {
                      role: { type: ["string", "null"] },
                      organization: { type: ["string", "null"] },
                    },
                    required: ["role", "organization"],
                    additionalProperties: false,
                  },
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        datetime: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["type", "datetime", "description"],
                      additionalProperties: false,
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        target: { type: "string" },
                        target_role: { type: ["string", "null"] },
                      },
                      required: ["type", "target", "target_role"],
                      additionalProperties: false,
                    },
                  },
                  responsibilities: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["name", "type", "attributes", "events", "relationships", "responsibilities"],
                additionalProperties: false,
              },
            },
          },
          required: ["entities"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const entities = parsed.entities ?? [];
    if (!Array.isArray(entities)) {
      console.warn("[extractEntities] Unexpected response shape:", typeof entities);
      return [];
    }
    console.log(`[extractEntities] Successfully extracted ${entities.length} entities`);
    return entities;
  } catch (error) {
    console.error("[extractEntities] Parse error:", error.message);
    console.log("[extractEntities] Raw LLM response:", response.choices[0].message.content);
    return [];
  }
}
