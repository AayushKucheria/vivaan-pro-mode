import { NextRequest, NextResponse } from "next/server";
import { Assignment, AssignmentPreferences, CalendarBusySlot, CalendarFreeSlot, DailyScheduleBlock } from "@/types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "anthropic/claude-3.5-haiku";

function generateDefaultFreeSlots(
  preferences: AssignmentPreferences,
  daysAhead: number
): CalendarFreeSlot[] {
  const slots: CalendarFreeSlot[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const wake = preferences.wakeTime || "09:00";
  const sleep = preferences.sleepTime || "22:00";

  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    slots.push({
      date: date.toISOString().split("T")[0],
      start: wake,
      end: sleep,
    });
  }
  return slots;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fallbackSchedule(
  assignments: Assignment[],
  preferences: AssignmentPreferences,
  freeSlots: CalendarFreeSlot[]
): DailyScheduleBlock[] {
  const maxHoursPerDay = preferences.defaultWorkHoursPerDay;
  const incomplete = assignments
    .filter((a) => !a.completed)
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  if (incomplete.length === 0) return [];

  const blocks: DailyScheduleBlock[] = [];
  const remaining = new Map<string, number>();
  for (const a of incomplete) {
    remaining.set(a.id, a.estimatedHours);
  }

  // Group free slots by date
  const slotsByDate = new Map<string, CalendarFreeSlot[]>();
  for (const slot of freeSlots) {
    const existing = slotsByDate.get(slot.date) || [];
    existing.push(slot);
    slotsByDate.set(slot.date, existing);
  }

  // Sort dates
  const dates = Array.from(slotsByDate.keys()).sort();

  for (const dateStr of dates) {
    const daySlots = slotsByDate.get(dateStr)!;
    let dayHoursUsed = 0;

    for (const slot of daySlots) {
      let slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);

      for (const a of incomplete) {
        const rem = remaining.get(a.id) || 0;
        if (rem <= 0 || slotStart >= slotEnd || dayHoursUsed >= maxHoursPerDay) continue;

        const availMinutes = Math.min(
          slotEnd - slotStart,
          rem * 60,
          2 * 60, // max 2h per block
          (maxHoursPerDay - dayHoursUsed) * 60
        );
        if (availMinutes < 30) continue; // minimum 30 min block

        const hours = Math.round(availMinutes / 30) * 0.5; // round to 0.5h
        const actualMinutes = hours * 60;

        blocks.push({
          date: dateStr,
          assignmentId: a.id,
          assignmentName: a.name,
          hours,
          startTime: minutesToTime(slotStart),
          endTime: minutesToTime(slotStart + actualMinutes),
        });

        remaining.set(a.id, rem - hours);
        slotStart += actualMinutes;
        dayHoursUsed += hours;
      }
    }

    const totalRemaining = Array.from(remaining.values()).reduce((s, v) => s + v, 0);
    if (totalRemaining <= 0) break;
  }

  return blocks;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assignments: Assignment[] = body.assignments || [];
    const preferences: AssignmentPreferences = body.preferences || {
      defaultWorkHoursPerDay: 4,
      wakeTime: "09:00",
      sleepTime: "22:00",
    };
    const busySlots: CalendarBusySlot[] = body.busySlots || [];
    const freeSlots: CalendarFreeSlot[] = body.freeSlots || [];
    const calendarUsed = freeSlots.length > 0;

    const incomplete = assignments.filter((a) => !a.completed);
    if (incomplete.length === 0) {
      return NextResponse.json({
        blocks: [],
        generatedAt: new Date().toISOString(),
        assignmentIds: [],
        calendarUsed,
      });
    }

    // Use provided free slots or generate defaults from wake/sleep
    const effectiveFreeSlots = calendarUsed
      ? freeSlots
      : generateDefaultFreeSlots(preferences, 60);

    // Try AI schedule generation
    if (OPENROUTER_API_KEY) {
      try {
        const today = new Date().toISOString().split("T")[0];

        // Group free slots by date for the prompt (limit to first 21 days)
        const slotsByDate = new Map<string, CalendarFreeSlot[]>();
        for (const slot of effectiveFreeSlots) {
          const existing = slotsByDate.get(slot.date) || [];
          existing.push(slot);
          slotsByDate.set(slot.date, existing);
        }
        const freeSlotsText = Array.from(slotsByDate.entries())
          .slice(0, 21)
          .map(([date, slots]) =>
            `  ${date}: ${slots.map((s) => `${s.start}-${s.end}`).join(", ")}`
          )
          .join("\n");

        const prompt = `You are a study/work schedule optimizer. Given assignments, free time slots, and constraints, create an optimal day-by-day work schedule with concrete time slots.

Today's date: ${today}
Max work hours per day: ${preferences.defaultWorkHoursPerDay}

Assignments:
${incomplete
  .map(
    (a) =>
      `- "${a.name}" (ID: ${a.id}): Due ${a.dueDate.split("T")[0]}, ${a.estimatedHours}h estimated, priority: ${a.priority}`
  )
  .join("\n")}

Available free time slots per day:
${freeSlotsText}

Rules:
- Schedule work ONLY within the free time slots listed above
- Each block must have a concrete startTime and endTime (HH:MM format) that fits within a free slot
- Spread work across days, don't cram
- Prioritize high-priority and earlier-deadline assignments
- Don't exceed max hours per day
- Schedule ALL estimated hours for each assignment. The total hours scheduled MUST equal its estimatedHours.
- If an assignment can't be completed before its due date, schedule remaining hours after
- Each block should be 0.5-3 hours

Return a JSON object with this structure (no other text):
{"reasoning":"1-2 sentence explanation of the scheduling strategy","blocks":[{"date":"YYYY-MM-DD","assignmentId":"...","assignmentName":"...","hours":N,"startTime":"HH:MM","endTime":"HH:MM"}]}`;

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              "HTTP-Referer": "https://world-dashboard.local",
              "X-Title": "World Dashboard",
            },
            body: JSON.stringify({
              model: OPENROUTER_MODEL,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "{}";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const blocks: DailyScheduleBlock[] = parsed.blocks || [];
            return NextResponse.json({
              blocks,
              generatedAt: new Date().toISOString(),
              assignmentIds: incomplete.map((a) => a.id),
              reasoning: parsed.reasoning || undefined,
              calendarUsed,
            });
          }
        }
      } catch (e) {
        console.error("AI schedule generation failed:", e);
      }
    }

    // Fallback
    const blocks = fallbackSchedule(incomplete, preferences, effectiveFreeSlots);
    return NextResponse.json({
      blocks,
      generatedAt: new Date().toISOString(),
      assignmentIds: incomplete.map((a) => a.id),
      calendarUsed,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
