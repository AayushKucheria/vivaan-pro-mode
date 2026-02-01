import { NextRequest, NextResponse } from "next/server";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

interface YouTubeChannelItem {
  id: string;
  snippet: {
    title: string;
    customUrl?: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface YouTubeChannelResponse {
  items?: YouTubeChannelItem[];
}

/**
 * Parse YouTube URL to extract channel ID or handle.
 * Supports various URL formats:
 * - youtube.com/channel/UC... (direct channel ID)
 * - youtube.com/@handle
 * - youtube.com/c/CustomName
 * - youtube.com/user/Username
 */
function parseYouTubeUrl(url: string): { type: "id" | "handle" | "username" | "custom"; value: string } | null {
  try {
    // Handle cases where user pastes just the handle
    if (url.startsWith("@")) {
      return { type: "handle", value: url };
    }

    // Add protocol if missing
    let normalizedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      normalizedUrl = `https://${url}`;
    }

    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.replace("www.", "");
    
    if (!hostname.includes("youtube.com")) {
      return null;
    }

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    
    if (pathParts.length === 0) {
      return null;
    }

    // /channel/UC... - direct channel ID
    if (pathParts[0] === "channel" && pathParts[1]) {
      return { type: "id", value: pathParts[1] };
    }

    // /@handle - new style handle
    if (pathParts[0].startsWith("@")) {
      return { type: "handle", value: pathParts[0] };
    }

    // /c/CustomName - custom URL
    if (pathParts[0] === "c" && pathParts[1]) {
      return { type: "custom", value: pathParts[1] };
    }

    // /user/Username - legacy username
    if (pathParts[0] === "user" && pathParts[1]) {
      return { type: "username", value: pathParts[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve handle/username/custom to channel ID using YouTube API.
 */
async function resolveToChannelId(
  type: "id" | "handle" | "username" | "custom",
  value: string
): Promise<{ channelId: string; name: string; handle?: string; thumbnail?: string } | null> {
  if (!YOUTUBE_API_KEY) {
    return null;
  }

  // Helper to extract best thumbnail
  const getThumbnail = (thumbnails?: YouTubeChannelItem["snippet"]["thumbnails"]) =>
    thumbnails?.medium?.url || thumbnails?.high?.url || thumbnails?.default?.url;

  // If already a channel ID, just fetch the channel details
  if (type === "id") {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("id", value);
    url.searchParams.set("part", "snippet");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data: YouTubeChannelResponse = await response.json();
    const channel = data.items?.[0];
    
    if (!channel) return null;

    return {
      channelId: channel.id,
      name: channel.snippet.title,
      handle: channel.snippet.customUrl,
      thumbnail: getThumbnail(channel.snippet.thumbnails),
    };
  }

  // For handles, use forHandle parameter
  if (type === "handle") {
    const handle = value.startsWith("@") ? value : `@${value}`;
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("forHandle", handle);
    url.searchParams.set("part", "snippet");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data: YouTubeChannelResponse = await response.json();
    const channel = data.items?.[0];
    
    if (!channel) return null;

    return {
      channelId: channel.id,
      name: channel.snippet.title,
      handle: channel.snippet.customUrl || handle,
      thumbnail: getThumbnail(channel.snippet.thumbnails),
    };
  }

  // For username, use forUsername parameter
  if (type === "username") {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("forUsername", value);
    url.searchParams.set("part", "snippet");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data: YouTubeChannelResponse = await response.json();
    const channel = data.items?.[0];
    
    if (!channel) return null;

    return {
      channelId: channel.id,
      name: channel.snippet.title,
      handle: channel.snippet.customUrl,
      thumbnail: getThumbnail(channel.snippet.thumbnails),
    };
  }

  // For custom URLs, we need to search (less reliable)
  // Custom URLs are being phased out, so this is a fallback
  if (type === "custom") {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("q", value);
    url.searchParams.set("type", "channel");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("part", "snippet");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const channelId = data.items?.[0]?.id?.channelId;
    
    if (!channelId) return null;

    // Fetch full channel details
    return resolveToChannelId("id", channelId);
  }

  return null;
}

/**
 * POST: Resolve a YouTube URL to channel info.
 * Request: { url: string }
 * Response: { channelId: string, name: string, handle?: string } or error
 */
export async function POST(request: NextRequest) {
  if (!YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YouTube API not configured" },
      { status: 500 }
    );
  }

  let url: string;
  try {
    const body = await request.json();
    url = body.url?.trim();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!url) {
    return NextResponse.json(
      { error: "URL is required" },
      { status: 400 }
    );
  }

  const parsed = parseYouTubeUrl(url);
  
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not parse YouTube URL. Try a channel URL like youtube.com/@channelname" },
      { status: 400 }
    );
  }

  try {
    const result = await resolveToChannelId(parsed.type, parsed.value);

    if (!result) {
      return NextResponse.json(
        { error: "Channel not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to resolve channel:", error);
    return NextResponse.json(
      { error: "Failed to resolve channel" },
      { status: 500 }
    );
  }
}
