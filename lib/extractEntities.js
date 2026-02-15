import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function extractEntities(text) {
  const prompt = `
Extract structured entities from the following text.

Allowed types:
person, project, topic, company, tool, goal, event, resource

Return ONLY valid JSON array.

Each entity must follow this structure:

[
  {
    "name": "Entity Name",
    "type": "person | project | topic | company | tool | goal | event | resource",
    "attributes": {
      "role": "string | null",
      "organization": "string | null"
    },
    "events": [
      {
        "type": "meeting | milestone | deadline",
        "datetime": "string",
        "description": "string"
      }
    ],
    "relationships": [
      {
        "type": "suggested_meeting | reports_to | collaborates_with",
        "target": "Entity Name",
        "target_role": "string | null"
      }
    ],
    "responsibilities": ["string"]
  }
]

If a field is not mentioned, return null or empty array.
Do NOT invent information.
Return ONLY JSON.

Text:
${text}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  try {
    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (error) {
    console.error("Entity extraction parse error:", error);
    return [];
  }
}
