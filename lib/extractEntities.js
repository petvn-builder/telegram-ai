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

Format:
[
  { "name": "Entity Name", "type": "person" }
]

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
