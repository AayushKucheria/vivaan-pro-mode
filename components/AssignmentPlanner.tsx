"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./EmptyState";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Assignment,
  WorkSchedule,
  AssignmentPreferences,
  DEFAULT_ASSIGNMENT_PREFERENCES,
  CalendarBusySlot,
  CalendarFreeSlot,
} from "@/types";

type View = "assignments" | "schedule";

export function AssignmentPlanner() {
  const { data: session } = useSession();
  const [assignments, setAssignments] = useLocalStorage<Assignment[]>("assignments", []);
  const [schedule, setSchedule] = useLocalStorage<WorkSchedule | null>("workSchedule", null);
  const [preferences] = useLocalStorage<AssignmentPreferences>(
    "assignmentPreferences",
    DEFAULT_ASSIGNMENT_PREFERENCES
  );

  const [view, setView] = useState<View>("assignments");
  const [loading, setLoading] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<"idle" | "fetching" | "connected" | "error">("idle");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBlockIdx, setEditingBlockIdx] = useState<number | null>(null);
  const [editingHours, setEditingHours] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newHours, setNewHours] = useState("2");
  const [newPriority, setNewPriority] = useState<Assignment["priority"]>("medium");

  const scheduleStale =
    schedule &&
    !assignments.every((a) => schedule.assignmentIds.includes(a.id)) &&
    assignments.some((a) => !a.completed);

  const addAssignment = () => {
    if (!newName.trim() || !newDueDate) return;
    const assignment: Assignment = {
      id: `assign-${Date.now()}`,
      name: newName.trim(),
      dueDate: new Date(newDueDate).toISOString(),
      estimatedHours: parseFloat(newHours) || 2,
      priority: newPriority,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setAssignments((prev) => [...prev, assignment]);
    setNewName("");
    setNewDueDate("");
    setNewHours("2");
    setNewPriority("medium");
    setShowAddForm(false);
  };

  const toggleComplete = (id: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, completed: !a.completed } : a))
    );
  };

  const deleteAssignment = (id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const generateSchedule = async () => {
    setLoading(true);
    setCalendarStatus("idle");
    try {
      // Fetch calendar busy times + free slots if authenticated
      let busySlots: CalendarBusySlot[] = [];
      let freeSlots: CalendarFreeSlot[] = [];
      if (session?.accessToken) {
        setCalendarStatus("fetching");
        try {
          const calRes = await fetch("/api/calendar/busy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wakeTime: preferences.wakeTime || "09:00",
              sleepTime: preferences.sleepTime || "22:00",
            }),
          });
          if (calRes.ok) {
            const calData = await calRes.json();
            busySlots = calData.busySlots || [];
            freeSlots = calData.freeSlots || [];
            setCalendarStatus("connected");
          } else {
            setCalendarStatus("error");
          }
        } catch {
          setCalendarStatus("error");
        }
      }

      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments, preferences, busySlots, freeSlots }),
      });
      if (!res.ok) throw new Error("Failed");
      const data: WorkSchedule = await res.json();
      // Preserve manual overrides
      if (schedule) {
        const overrides = new Map<string, number>();
        for (const b of schedule.blocks) {
          if (b.isManualOverride) {
            overrides.set(`${b.date}-${b.assignmentId}`, b.hours);
          }
        }
        data.blocks = data.blocks.map((b) => {
          const key = `${b.date}-${b.assignmentId}`;
          if (overrides.has(key)) {
            return { ...b, hours: overrides.get(key)!, isManualOverride: true };
          }
          return b;
        });
      }
      setSchedule(data);
      setView("schedule");
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const saveBlockEdit = (idx: number) => {
    const hours = parseFloat(editingHours);
    if (isNaN(hours) || hours <= 0 || !schedule) return;
    const newBlocks = [...schedule.blocks];
    newBlocks[idx] = { ...newBlocks[idx], hours, isManualOverride: true };
    setSchedule({ ...schedule, blocks: newBlocks });
    setEditingBlockIdx(null);
  };

  // Sort: incomplete by due date, completed at bottom
  const sortedAssignments = [...assignments].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const incompleteCount = assignments.filter((a) => !a.completed).length;

  const priorityColor = (p: Assignment["priority"]) =>
    p === "high" ? "text-red-500" : p === "medium" ? "text-yellow-500" : "text-green-500";

  const priorityBg = (p: Assignment["priority"]) =>
    p === "high"
      ? "bg-red-500/15 text-red-500"
      : p === "medium"
        ? "bg-yellow-500/15 text-yellow-500"
        : "bg-green-500/15 text-green-500";

  const dueDateColor = (dueDate: string, completed: boolean) => {
    if (completed) return "text-[var(--muted)]";
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "text-red-500";
    if (diffDays === 0) return "text-yellow-500";
    if (diffDays <= 3) return "text-orange-500";
    return "text-[var(--muted)]";
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Group schedule blocks by date
  const blocksByDate = new Map<string, typeof schedule extends null ? never : NonNullable<typeof schedule>["blocks"]>();
  if (schedule) {
    for (const block of schedule.blocks) {
      const existing = blocksByDate.get(block.date) || [];
      existing.push(block);
      blocksByDate.set(block.date, existing);
    }
  }

  return (
    <section className="h-full flex flex-col bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
      <SectionHeader
        icon="📋"
        title="Assignments"
        count={incompleteCount > 0 ? incompleteCount : undefined}
      />

      {/* View toggle + actions */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setView("assignments")}
          className={`text-xs px-2 py-1 rounded ${view === "assignments" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
        >
          List
        </button>
        <button
          onClick={() => setView("schedule")}
          className={`text-xs px-2 py-1 rounded ${view === "schedule" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
        >
          Schedule
        </button>
        <div className="flex-1" />
        {view === "assignments" && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {showAddForm ? "Cancel" : "+ Add"}
          </button>
        )}
        {calendarStatus === "connected" && (
          <span className="text-[10px] text-green-500" title="Google Calendar connected">
            Cal
          </span>
        )}
        <button
          onClick={generateSchedule}
          disabled={loading || incompleteCount === 0}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--foreground)] disabled:opacity-50"
        >
          {loading ? "Generating..." : scheduleStale ? "Regenerate" : "Generate Schedule"}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && view === "assignments" && (
        <div className="mb-3 p-3 bg-[var(--background)] border border-[var(--border)] rounded-md space-y-2">
          <input
            type="text"
            placeholder="Assignment name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAssignment()}
            className="w-full px-2 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded focus:outline-none focus:border-[var(--foreground)]"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded focus:outline-none focus:border-[var(--foreground)]"
            />
            <input
              type="number"
              placeholder="Hours"
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
              min="0.5"
              step="0.5"
              className="w-20 px-2 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded focus:outline-none focus:border-[var(--foreground)]"
            />
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Assignment["priority"])}
              className="px-2 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded focus:outline-none focus:border-[var(--foreground)]"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button
            onClick={addAssignment}
            disabled={!newName.trim() || !newDueDate}
            className="px-3 py-1.5 text-sm bg-[var(--foreground)] text-[var(--background)] rounded disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "assignments" && (
          <>
            {assignments.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState
                  message="No assignments yet"
                  submessage="Add one to get started"
                />
              </div>
            ) : (
              <ul className="space-y-1">
                {sortedAssignments.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center gap-2 p-2 rounded hover:bg-[var(--border)] transition-colors group ${a.completed ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={a.completed}
                      onChange={() => toggleComplete(a.id)}
                      className="w-3.5 h-3.5 rounded shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${a.completed ? "line-through text-[var(--muted)]" : ""}`}>
                        {a.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityBg(a.priority)}`}>
                          {a.priority}
                        </span>
                        <span className={`text-xs ${dueDateColor(a.dueDate, a.completed)}`}>
                          {formatDate(a.dueDate)}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {a.estimatedHours}h
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteAssignment(a.id)}
                      className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {view === "schedule" && (
          <>
            {!schedule || schedule.blocks.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState
                  message="No schedule generated"
                  submessage="Add assignments and click Generate"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Calendar status banner */}
                {schedule.calendarUsed ? (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-green-500 bg-green-500/10 border border-green-500/20 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    Scheduled around your Google Calendar events
                  </div>
                ) : (
                  <div className="px-2 py-1.5 text-[10px] text-[var(--muted)] bg-[var(--background)] border border-[var(--border)] rounded">
                    Calendar not connected — using default hours
                  </div>
                )}

                {/* AI reasoning */}
                {schedule.reasoning && (
                  <div>
                    <button
                      onClick={() => setShowReasoning(!showReasoning)}
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      {showReasoning ? "▾" : "▸"} Why this schedule?
                    </button>
                    {showReasoning && (
                      <p className="mt-1 px-2 py-1.5 text-xs text-[var(--muted)] bg-[var(--background)] border border-[var(--border)] rounded">
                        {schedule.reasoning}
                      </p>
                    )}
                  </div>
                )}

                {scheduleStale && (
                  <div className="p-2 text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded">
                    Assignments changed since last generation. Consider regenerating.
                  </div>
                )}
                {Array.from(blocksByDate.entries()).map(([date, blocks]) => {
                  const totalHours = blocks.reduce((s, b) => s + b.hours, 0);
                  const isToday =
                    date === new Date().toISOString().split("T")[0];
                  return (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${isToday ? "text-blue-400" : "text-[var(--muted)]"}`}>
                          {isToday ? "Today" : formatDate(date + "T00:00:00")}
                        </span>
                        <span className="text-[10px] text-[var(--muted)]">
                          {totalHours}h
                        </span>
                      </div>
                      <div className="space-y-1">
                        {blocks.map((block) => {
                          const globalIdx = schedule.blocks.indexOf(block);
                          const assignment = assignments.find(
                            (a) => a.id === block.assignmentId
                          );
                          return (
                            <div
                              key={`${block.date}-${block.assignmentId}`}
                              className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--background)] border border-[var(--border)]"
                            >
                              {assignment && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor(assignment.priority).replace("text-", "bg-")}`}
                                />
                              )}
                              {block.startTime && block.endTime ? (
                                <span className="text-[10px] text-[var(--muted)] tabular-nums shrink-0 w-[72px]">
                                  {block.startTime}–{block.endTime}
                                </span>
                              ) : null}
                              <span className="text-sm flex-1 truncate">
                                {block.assignmentName}
                              </span>
                              {editingBlockIdx === globalIdx ? (
                                <input
                                  type="number"
                                  value={editingHours}
                                  onChange={(e) => setEditingHours(e.target.value)}
                                  onBlur={() => saveBlockEdit(globalIdx)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveBlockEdit(globalIdx);
                                    if (e.key === "Escape") setEditingBlockIdx(null);
                                  }}
                                  autoFocus
                                  min="0.5"
                                  step="0.5"
                                  className="w-14 px-1 py-0.5 text-xs bg-transparent border border-[var(--border)] rounded focus:outline-none focus:border-[var(--foreground)] text-right"
                                />
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingBlockIdx(globalIdx);
                                    setEditingHours(block.hours.toString());
                                  }}
                                  className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] tabular-nums shrink-0"
                                  title="Click to edit hours"
                                >
                                  {block.hours}h
                                  {block.isManualOverride && (
                                    <span className="ml-0.5 text-blue-400">*</span>
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
