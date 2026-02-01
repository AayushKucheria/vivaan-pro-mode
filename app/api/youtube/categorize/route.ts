import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "anthropic/claude-3.5-haiku";

interface ChannelInput {
  id: string;
  name: string;
}

interface CategorizeRequest {
  channels: ChannelInput[];
  existingGroups?: string[]; // Existing group names to prefer
}

interface CategorizeResult {
  channelId: string;
  group: string;
}

/**
 * Use AI to categorize YouTube channels into groups based on their names.
 */
export async function POST(request: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: CategorizeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channels, existingGroups = [] } = body;

  if (!channels || channels.length === 0) {
    return NextResponse.json({ results: [], groups: [] });
  }

  const channelList = channels
    .map((c) => `- ${c.id}: ${c.name}`)
    .join("\n");

  const existingGroupsHint = existingGroups.length > 0
    ? `\nPrefer using these existing groups if they fit: ${existingGroups.join(", ")}`
    : "";

  const systemPrompt = `You categorize YouTube channels into groups based on their channel names.

Create concise group names (1-3 words) like: Cricket, Comedy, Tech, Fitness, Music, Gaming, News, Education, Cooking, etc.${existingGroupsHint}

Respond with ONLY valid JSON in this exact format:
{
  "results": [
    {"channelId": "UC...", "group": "Group Name"},
    ...
  ],
  "groups": ["Group1", "Group2", ...]
}

Rules:
- Every channel must be assigned to exactly one group
- Group names should be short and descriptive
- Use existing groups when appropriate
- Create new groups only when needed
- If unsure, use "Uncategorized"`;

  const userPrompt = `Categorize these YouTube channels:\n${channelList}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://world-dashboard.app",
        "X-Title": "World Dashboard",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenRouter API error:", error);
      return NextResponse.json(
        { error: "AI categorization failed" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let parsed: { results: CategorizeResult[]; groups: string[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse AI response:", content, e);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      results: parsed.results || [],
      groups: parsed.groups || [],
    });
  } catch (error) {
    console.error("Categorization error:", error);
    return NextResponse.json(
      { error: "Categorization failed" },
      { status: 500 }
    );
  }
}
