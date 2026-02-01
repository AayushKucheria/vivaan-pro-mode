import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface YouTubeSubscriptionItem {
  snippet: {
    resourceId: {
      channelId: string;
    };
    title: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
    };
  };
}

interface YouTubeSubscriptionsResponse {
  items?: YouTubeSubscriptionItem[];
  nextPageToken?: string;
}

interface SubscriptionChannel {
  id: string;
  name: string;
  thumbnail?: string;
}

/**
 * Fetch user's YouTube subscriptions using their OAuth access token.
 * Returns a list of channels the user is subscribed to.
 */
export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Please sign in with YouTube." },
      { status: 401 }
    );
  }

  try {
    const channels: SubscriptionChannel[] = [];
    let pageToken: string | undefined;

    // Fetch all pages of subscriptions (YouTube API returns 50 per page)
    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("mine", "true");
      url.searchParams.set("maxResults", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("YouTube subscriptions API error:", response.status, errorData);

        if (response.status === 401) {
          return NextResponse.json(
            { error: "YouTube access expired. Please sign in again." },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: "Failed to fetch subscriptions from YouTube" },
          { status: response.status }
        );
      }

      const data: YouTubeSubscriptionsResponse = await response.json();

      for (const item of data.items || []) {
        channels.push({
          id: item.snippet.resourceId.channelId,
          name: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url ||
                     item.snippet.thumbnails?.default?.url,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return NextResponse.json({
      channels,
      count: channels.length,
    });
  } catch (error) {
    console.error("Error fetching YouTube subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}
