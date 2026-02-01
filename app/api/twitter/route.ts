import { NextResponse } from "next/server";
import { getOrRefresh, DEFAULT_TTL } from "../_cache";

interface Tweet {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  url: string;
  publishedAt: string;
}

// Placeholder refresh function - replace with real Twitter API calls later
async function refreshTwitter(): Promise<Tweet[]> {
  // TODO: Implement actual Twitter/X API integration
  // For now, return empty array
  return [];
}

// GET: returns cached tweets
export async function GET() {
  const { data: tweets, lastUpdated } = await getOrRefresh(
    "twitter",
    refreshTwitter,
    DEFAULT_TTL
  );

  return NextResponse.json({
    tweets,
    generatedAt: new Date(lastUpdated).toISOString(),
  });
}
