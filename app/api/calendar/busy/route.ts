import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CalendarBusySlot, CalendarFreeSlot } from "@/types";

function toHHMM(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const startDate = body.startDate || new Date().toISOString().split("T")[0];
    const daysAhead = body.daysAhead || 14;
    const wakeTime = body.wakeTime || "09:00";
    const sleepTime = body.sleepTime || "22:00";

    const timeMin = new Date(`${startDate}T${wakeTime}:00`).toISOString();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysAhead);
    const timeMax = new Date(
      `${endDate.toISOString().split("T")[0]}T${sleepTime}:00`
    ).toISOString();

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: "primary" }],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Google Calendar FreeBusy error:", err);
      return NextResponse.json(
        { error: "Failed to fetch calendar data" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const busyPeriods = data.calendars?.primary?.busy || [];

    const busySlots: CalendarBusySlot[] = busyPeriods.map(
      (p: { start: string; end: string }) => ({
        start: p.start,
        end: p.end,
      })
    );

    // Derive free slots from busy slots within wake/sleep bounds
    const freeSlots: CalendarFreeSlot[] = [];
    const startD = new Date(startDate);
    for (let d = 0; d < daysAhead; d++) {
      const current = new Date(startD);
      current.setDate(current.getDate() + d);
      const dateStr = current.toISOString().split("T")[0];

      const dayStart = new Date(`${dateStr}T${wakeTime}:00`);
      const dayEnd = new Date(`${dateStr}T${sleepTime}:00`);

      // Collect busy periods that overlap this day's waking hours, sorted by start
      const dayBusy = busySlots
        .map((s) => ({
          start: Math.max(new Date(s.start).getTime(), dayStart.getTime()),
          end: Math.min(new Date(s.end).getTime(), dayEnd.getTime()),
        }))
        .filter((s) => s.end > s.start)
        .sort((a, b) => a.start - b.start);

      let cursor = dayStart.getTime();
      for (const busy of dayBusy) {
        if (busy.start > cursor) {
          freeSlots.push({
            date: dateStr,
            start: toHHMM(cursor),
            end: toHHMM(busy.start),
          });
        }
        cursor = Math.max(cursor, busy.end);
      }
      if (cursor < dayEnd.getTime()) {
        freeSlots.push({
          date: dateStr,
          start: toHHMM(cursor),
          end: toHHMM(dayEnd.getTime()),
        });
      }
    }

    return NextResponse.json({ busySlots, freeSlots });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch calendar busy times" },
      { status: 500 }
    );
  }
}
