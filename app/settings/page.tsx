"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSeenVideos } from "@/hooks/useSeenVideos";
import { YouTubeOAuthButton } from "@/components/YouTubeOAuthButton";
import {
  YouTubeChannel,
  YouTubeFilters,
  DEFAULT_YOUTUBE_FILTERS,
  YouTubePreferences,
  DEFAULT_YOUTUBE_PREFERENCES,
  YouTubeChannelGroup,
  DEFAULT_CHANNEL_GROUPS,
  ShortsChannel,
  ShortsPreferences,
  DEFAULT_SHORTS_PREFERENCES,
  DEFAULT_SHORTS_CHANNELS,
  Assignment,
  AssignmentPreferences,
  DEFAULT_ASSIGNMENT_PREFERENCES,
} from "@/types";

export default function SettingsPage() {
  const { data: session } = useSession();
  // Assignment preferences state
  const [assignmentPreferences, setAssignmentPreferences] = useLocalStorage<AssignmentPreferences>(
    "assignmentPreferences",
    DEFAULT_ASSIGNMENT_PREFERENCES
  );
  const [, setAssignments] = useLocalStorage<Assignment[]>("assignments", []);
  const [, setWorkSchedule] = useLocalStorage<null>("workSchedule", null);

  // YouTube channels state
  const [youtubeChannels, setYoutubeChannels] = useLocalStorage<YouTubeChannel[]>("youtubeChannels", []);
  const [newChannelUrl, setNewChannelUrl] = useState("");
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState("");

  // YouTube preferences state
  const [youtubePreferences, setYoutubePreferences] = useLocalStorage<YouTubePreferences>(
    "youtubePreferences",
    DEFAULT_YOUTUBE_PREFERENCES
  );

  // YouTube filters state
  const [youtubeFilters, setYoutubeFilters] = useLocalStorage<YouTubeFilters>("youtubeFilters", DEFAULT_YOUTUBE_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // Seen videos state
  const { clearForChannel, clearAll, getSeenCountForChannel } = useSeenVideos();

  // Import subscriptions state
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  // Channel groups state
  const [channelGroups, setChannelGroups] = useLocalStorage<YouTubeChannelGroup[]>(
    "youtubeChannelGroups",
    DEFAULT_CHANNEL_GROUPS
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [categorizingChannels, setCategorizingChannels] = useState(false);

  // Shorts state
  const [shortsChannels, setShortsChannels] = useLocalStorage<ShortsChannel[]>("shortsChannels", DEFAULT_SHORTS_CHANNELS);
  const [shortsPreferences, setShortsPreferences] = useLocalStorage<ShortsPreferences>("shortsPreferences", DEFAULT_SHORTS_PREFERENCES);
  const [newShortsChannelUrl, setNewShortsChannelUrl] = useState("");
  const [showAddShortsChannel, setShowAddShortsChannel] = useState(false);
  const [shortsChannelLoading, setShortsChannelLoading] = useState(false);
  const [shortsChannelError, setShortsChannelError] = useState("");

  const addShortsChannel = async () => {
    if (!newShortsChannelUrl.trim()) return;
    setShortsChannelLoading(true);
    setShortsChannelError("");

    try {
      const res = await fetch("/api/youtube/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newShortsChannelUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setShortsChannelError(data.error || "Failed to resolve channel");
        return;
      }

      if (shortsChannels.some((c) => c.id === data.channelId)) {
        setShortsChannelError("Channel already added");
        return;
      }

      const newChannel: ShortsChannel = {
        id: data.channelId,
        name: data.name,
        handle: data.handle,
        thumbnail: data.thumbnail,
        enabled: true,
      };

      setShortsChannels((prev) => [...prev, newChannel]);
      setNewShortsChannelUrl("");
      setShowAddShortsChannel(false);
    } catch {
      setShortsChannelError("Failed to resolve channel");
    } finally {
      setShortsChannelLoading(false);
    }
  };

  const enabledChannelsCount = youtubeChannels.filter((c) => c.enabled).length;

  const toggleChannel = (id: string) => {
    setYoutubeChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const removeChannel = (id: string) => {
    setYoutubeChannels((prev) => prev.filter((c) => c.id !== id));
  };

  const addChannel = async () => {
    if (!newChannelUrl.trim()) return;

    setChannelLoading(true);
    setChannelError("");

    try {
      const res = await fetch("/api/youtube/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newChannelUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setChannelError(data.error || "Failed to resolve channel");
        return;
      }

      // Check if channel already exists
      if (youtubeChannels.some((c) => c.id === data.channelId)) {
        setChannelError("Channel already added");
        return;
      }

      const newChannel: YouTubeChannel = {
        id: data.channelId,
        name: data.name,
        handle: data.handle,
        thumbnail: data.thumbnail,
        enabled: true,
        newPriority: false,
        hideSeenVideos: false,
      };

      setYoutubeChannels((prev) => [...prev, newChannel]);
      setNewChannelUrl("");
      setShowAddChannel(false);
    } catch {
      setChannelError("Failed to resolve channel");
    } finally {
      setChannelLoading(false);
    }
  };

  const importSubscriptions = async () => {
    setImportLoading(true);
    setImportError("");
    setImportSuccess("");

    try {
      const res = await fetch("/api/youtube/subscriptions");
      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || "Failed to import subscriptions");
        return;
      }

      const subscriptionIds = new Set(data.channels.map((c: { id: string }) => c.id));
      const existingIds = new Set(youtubeChannels.map((c) => c.id));

      // Find new channels to add
      const newChannels: YouTubeChannel[] = [];
      for (const sub of data.channels) {
        if (!existingIds.has(sub.id)) {
          newChannels.push({
            id: sub.id,
            name: sub.name,
            thumbnail: sub.thumbnail,
            enabled: true,
            isFromOAuth: true,
            newPriority: false,
            hideSeenVideos: false,
          });
        }
      }

      // Find OAuth-imported channels to remove (no longer subscribed)
      const removedCount = youtubeChannels.filter(
        (c) => c.isFromOAuth && !subscriptionIds.has(c.id)
      ).length;

      // AI categorize new channels
      if (newChannels.length > 0) {
        setCategorizingChannels(true);
        try {
          const existingGroupNames = channelGroups
            .filter((g) => g.id !== "uncategorized")
            .map((g) => g.name);

          const catRes = await fetch("/api/youtube/categorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channels: newChannels.map((c) => ({ id: c.id, name: c.name })),
              existingGroups: existingGroupNames,
            }),
          });

          if (catRes.ok) {
            const catData = await catRes.json();

            // Create new groups that don't exist
            const existingGroupNamesLower = new Set(
              channelGroups.map((g) => g.name.toLowerCase())
            );
            const newGroups: YouTubeChannelGroup[] = [];
            for (const groupName of catData.groups || []) {
              if (!existingGroupNamesLower.has(groupName.toLowerCase())) {
                newGroups.push({
                  id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  name: groupName,
                  order: channelGroups.length + newGroups.length,
                });
              }
            }

            if (newGroups.length > 0) {
              setChannelGroups((prev) => [...prev.filter((g) => g.id !== "uncategorized"), ...newGroups, ...prev.filter((g) => g.id === "uncategorized")]);
            }

            // Assign group IDs to new channels
            const groupNameToId = new Map<string, string>();
            for (const g of [...channelGroups, ...newGroups]) {
              groupNameToId.set(g.name.toLowerCase(), g.id);
            }

            for (const result of catData.results || []) {
              const channel = newChannels.find((c) => c.id === result.channelId);
              if (channel) {
                const groupId = groupNameToId.get(result.group.toLowerCase()) || "uncategorized";
                channel.groupId = groupId;
              }
            }
          }
        } catch (e) {
          console.error("AI categorization failed:", e);
          // Continue without categorization
        } finally {
          setCategorizingChannels(false);
        }
      }

      // Update channels: keep manual + still-subscribed OAuth, add new
      setYoutubeChannels((prev) => {
        const kept = prev.filter((c) => !c.isFromOAuth || subscriptionIds.has(c.id));
        return [...kept, ...newChannels];
      });

      // Build success message
      const parts: string[] = [];
      if (newChannels.length > 0) {
        parts.push(`added ${newChannels.length}`);
      }
      if (removedCount > 0) {
        parts.push(`removed ${removedCount}`);
      }
      if (parts.length > 0) {
        setImportSuccess(`Synced: ${parts.join(", ")}`);
      } else {
        setImportSuccess("Already in sync");
      }
    } catch {
      setImportError("Failed to import subscriptions");
    } finally {
      setImportLoading(false);
    }
  };

  const toggleChannelNewPriority = (id: string) => {
    setYoutubeChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, newPriority: !c.newPriority } : c))
    );
  };

  const toggleChannelHideSeen = (id: string) => {
    setYoutubeChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, hideSeenVideos: !c.hideSeenVideos } : c))
    );
  };

  // Group management functions
  const addGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: YouTubeChannelGroup = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
      order: channelGroups.filter((g) => g.id !== "uncategorized").length,
    };
    setChannelGroups((prev) => [
      ...prev.filter((g) => g.id !== "uncategorized"),
      newGroup,
      ...prev.filter((g) => g.id === "uncategorized"),
    ]);
    setNewGroupName("");
  };

  const renameGroup = (id: string) => {
    if (!editingGroupName.trim()) return;
    setChannelGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name: editingGroupName.trim() } : g))
    );
    setEditingGroupId(null);
    setEditingGroupName("");
  };

  const deleteGroup = (id: string) => {
    if (id === "uncategorized") return;
    // Move all channels in this group to uncategorized
    setYoutubeChannels((prev) =>
      prev.map((c) => (c.groupId === id ? { ...c, groupId: "uncategorized" } : c))
    );
    setChannelGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const moveChannelToGroup = (channelId: string, groupId: string) => {
    setYoutubeChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, groupId } : c))
    );
  };

  // AI categorize uncategorized channels
  const categorizeUncategorized = async () => {
    const uncategorized = youtubeChannels.filter(
      (c) => !c.groupId || c.groupId === "uncategorized"
    );

    if (uncategorized.length === 0) {
      return;
    }

    setCategorizingChannels(true);

    try {
      const existingGroupNames = channelGroups
        .filter((g) => g.id !== "uncategorized")
        .map((g) => g.name);

      const catRes = await fetch("/api/youtube/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: uncategorized.map((c) => ({ id: c.id, name: c.name })),
          existingGroups: existingGroupNames,
        }),
      });

      if (catRes.ok) {
        const catData = await catRes.json();

        // Create new groups that don't exist
        const existingGroupNamesLower = new Set(
          channelGroups.map((g) => g.name.toLowerCase())
        );
        const newGroups: YouTubeChannelGroup[] = [];
        for (const groupName of catData.groups || []) {
          if (!existingGroupNamesLower.has(groupName.toLowerCase())) {
            newGroups.push({
              id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: groupName,
              order: channelGroups.length + newGroups.length,
            });
          }
        }

        if (newGroups.length > 0) {
          setChannelGroups((prev) => [
            ...prev.filter((g) => g.id !== "uncategorized"),
            ...newGroups,
            ...prev.filter((g) => g.id === "uncategorized"),
          ]);
        }

        // Build group name to ID map
        const groupNameToId = new Map<string, string>();
        for (const g of [...channelGroups, ...newGroups]) {
          groupNameToId.set(g.name.toLowerCase(), g.id);
        }

        // Update channel groupIds
        const updates = new Map<string, string>();
        for (const result of catData.results || []) {
          const groupId = groupNameToId.get(result.group.toLowerCase()) || "uncategorized";
          updates.set(result.channelId, groupId);
        }

        setYoutubeChannels((prev) =>
          prev.map((c) => {
            const newGroupId = updates.get(c.id);
            return newGroupId ? { ...c, groupId: newGroupId } : c;
          })
        );
      }
    } catch (e) {
      console.error("AI categorization failed:", e);
    } finally {
      setCategorizingChannels(false);
    }
  };

  const uncategorizedCount = youtubeChannels.filter(
    (c) => !c.groupId || c.groupId === "uncategorized"
  ).length;

  // Get channels grouped
  const getChannelsByGroup = () => {
    const grouped = new Map<string, YouTubeChannel[]>();
    for (const group of channelGroups) {
      grouped.set(group.id, []);
    }
    // Ensure uncategorized exists
    if (!grouped.has("uncategorized")) {
      grouped.set("uncategorized", []);
    }
    for (const channel of youtubeChannels) {
      const groupId = channel.groupId || "uncategorized";
      const list = grouped.get(groupId);
      if (list) {
        list.push(channel);
      } else {
        grouped.get("uncategorized")?.push(channel);
      }
    }
    return grouped;
  };

  const channelsByGroup = getChannelsByGroup();
  const sortedGroups = [...channelGroups].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-medium tracking-tight">SETTINGS</h1>
          <Link
            href="/"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {/* Assignment Planner */}
        <section className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">
            Assignment Planner
          </h2>
          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Default Work Hours per Day
              </label>
              <input
                type="number"
                value={assignmentPreferences.defaultWorkHoursPerDay}
                onChange={(e) =>
                  setAssignmentPreferences((prev) => ({
                    ...prev,
                    defaultWorkHoursPerDay: parseFloat(e.target.value) || 4,
                  }))
                }
                min="1"
                max="16"
                step="0.5"
                className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Maximum hours allocated per day when generating schedules
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Wake Time
                </label>
                <input
                  type="time"
                  value={assignmentPreferences.wakeTime || "09:00"}
                  onChange={(e) =>
                    setAssignmentPreferences((prev) => ({
                      ...prev,
                      wakeTime: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Sleep Time
                </label>
                <input
                  type="time"
                  value={assignmentPreferences.sleepTime || "22:00"}
                  onChange={(e) =>
                    setAssignmentPreferences((prev) => ({
                      ...prev,
                      sleepTime: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
                />
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Used for calendar integration to determine available hours
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirm("Clear all assignments?")) {
                    setAssignments([]);
                  }
                }}
                className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:border-[var(--foreground)] transition-colors"
              >
                Clear All Assignments
              </button>
              <button
                onClick={() => {
                  if (confirm("Clear generated schedule?")) {
                    setWorkSchedule(null);
                  }
                }}
                className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:border-[var(--foreground)] transition-colors"
              >
                Clear Schedule
              </button>
            </div>
          </div>
        </section>

        {/* YouTube Account */}
        <section className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">
            YouTube Account
          </h2>
          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md space-y-4">
            <div>
              <YouTubeOAuthButton />
            </div>
            {session && (
              <div>
                <button
                  onClick={importSubscriptions}
                  disabled={importLoading || categorizingChannels}
                  className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:border-[var(--foreground)] transition-colors disabled:opacity-50"
                >
                  {importLoading ? (categorizingChannels ? "Categorizing..." : "Importing...") : "Import Subscriptions"}
                </button>
                {importError && (
                  <p className="mt-2 text-xs text-red-500">{importError}</p>
                )}
                {importSuccess && (
                  <p className="mt-2 text-xs text-green-500">{importSuccess}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Video Display Preferences */}
        <section className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">
            Video Display
          </h2>
          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md">
            <label className="block text-sm font-medium mb-2">
              Videos to Show
            </label>
            <select
              value={youtubePreferences.videoCount}
              onChange={(e) =>
                setYoutubePreferences((prev) => ({
                  ...prev,
                  videoCount: parseInt(e.target.value, 10),
                }))
              }
              className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
            >
              <option value={3}>3 videos</option>
              <option value={4}>4 videos</option>
              <option value={5}>5 videos</option>
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Number of random videos to display in the YouTube section
            </p>
          </div>
        </section>

        {/* YouTube Channels */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide">
              YouTube Channels
              <span className="ml-2 text-[var(--muted)] font-normal normal-case">
                ({enabledChannelsCount} enabled)
              </span>
            </h2>
            <button
              onClick={() => {
                setShowAddChannel(!showAddChannel);
                setChannelError("");
              }}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {showAddChannel ? "Cancel" : "+ Add Channel"}
            </button>
          </div>

          {/* Add Channel Form */}
          {showAddChannel && (
            <div className="mb-4 p-3 bg-[var(--card)] border border-[var(--border)] rounded-md space-y-2">
              <input
                type="text"
                placeholder="YouTube URL (e.g., youtube.com/@3blue1brown)"
                value={newChannelUrl}
                onChange={(e) => {
                  setNewChannelUrl(e.target.value);
                  setChannelError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !channelLoading) {
                    addChannel();
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
              />
              {channelError && (
                <p className="text-xs text-red-500">{channelError}</p>
              )}
              <button
                onClick={addChannel}
                disabled={!newChannelUrl.trim() || channelLoading}
                className="px-3 py-1.5 text-sm bg-[var(--foreground)] text-[var(--background)] rounded-md disabled:opacity-50"
              >
                {channelLoading ? "Resolving..." : "Add"}
              </button>
            </div>
          )}

          {/* Add Group Form + AI Categorize */}
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="New group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGroup()}
              className="flex-1 min-w-[150px] px-3 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
            />
            <button
              onClick={addGroup}
              disabled={!newGroupName.trim()}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:border-[var(--foreground)] transition-colors disabled:opacity-50"
            >
              + Add Group
            </button>
            {uncategorizedCount > 0 && (
              <button
                onClick={categorizeUncategorized}
                disabled={categorizingChannels}
                className="px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-md hover:bg-purple-500/30 transition-colors disabled:opacity-50"
              >
                {categorizingChannels ? "Categorizing..." : `AI Categorize (${uncategorizedCount})`}
              </button>
            )}
          </div>

          {categorizingChannels && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
              <p className="text-sm text-blue-400">AI is categorizing new channels...</p>
            </div>
          )}

          {/* Grouped Channels List */}
          {youtubeChannels.length === 0 ? (
            <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md">
              <p className="text-sm text-[var(--muted)]">
                No channels added yet. Add a YouTube channel to see random videos from it.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map((group) => {
                const channels = channelsByGroup.get(group.id) || [];
                if (channels.length === 0 && group.id !== "uncategorized") return null;

                return (
                  <div key={group.id} className="border border-[var(--border)] rounded-md overflow-hidden">
                    {/* Group Header */}
                    <div className="px-3 py-2 bg-[var(--card)] border-b border-[var(--border)] flex items-center gap-2">
                      {editingGroupId === group.id ? (
                        <>
                          <input
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renameGroup(group.id);
                              if (e.key === "Escape") {
                                setEditingGroupId(null);
                                setEditingGroupName("");
                              }
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 text-sm bg-transparent border border-[var(--border)] rounded focus:outline-none focus:border-[var(--foreground)]"
                          />
                          <button
                            onClick={() => renameGroup(group.id)}
                            className="text-xs text-green-500 hover:text-green-400"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingGroupId(null);
                              setEditingGroupName("");
                            }}
                            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-medium">
                            {group.name}
                            <span className="ml-2 text-[var(--muted)] font-normal">
                              ({channels.length})
                            </span>
                          </span>
                          {group.id !== "uncategorized" && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingGroupId(group.id);
                                  setEditingGroupName(group.name);
                                }}
                                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete group "${group.name}"? Channels will be moved to Uncategorized.`)) {
                                    deleteGroup(group.id);
                                  }
                                }}
                                className="text-xs text-red-500 hover:text-red-400 transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Channels in Group - Grid Layout */}
                    {channels.length > 0 ? (
                      <div className="p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {channels.map((channel) => (
                          <div
                            key={channel.id}
                            className={`relative p-2 rounded-md border border-[var(--border)] hover:border-[var(--muted)] transition-colors group ${
                              !channel.enabled ? "opacity-50" : ""
                            }`}
                          >
                            {/* Remove button */}
                            <button
                              onClick={() => removeChannel(channel.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              title="Remove channel"
                            >
                              ×
                            </button>

                            {/* Channel content */}
                            <div className="flex flex-col items-center text-center">
                              {/* Thumbnail + checkbox overlay */}
                              <div className="relative mb-1">
                                <label className="cursor-pointer">
                                  {channel.thumbnail ? (
                                    <img
                                      src={channel.thumbnail}
                                      alt=""
                                      className="w-10 h-10 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-[var(--border)]" />
                                  )}
                                  <input
                                    type="checkbox"
                                    checked={channel.enabled}
                                    onChange={() => toggleChannel(channel.id)}
                                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded border-[var(--border)]"
                                  />
                                </label>
                              </div>

                              {/* Channel name */}
                              <a
                                href={`https://www.youtube.com/channel/${channel.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs truncate w-full hover:text-blue-500 transition-colors"
                                title={channel.name}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {channel.name}
                              </a>

                              {/* Compact preferences */}
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  onClick={() => toggleChannelNewPriority(channel.id)}
                                  className={`text-[10px] px-1 rounded ${
                                    channel.newPriority
                                      ? "bg-green-500/20 text-green-500"
                                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                                  }`}
                                  title="New Priority"
                                >
                                  NP
                                </button>
                                <button
                                  onClick={() => toggleChannelHideSeen(channel.id)}
                                  className={`text-[10px] px-1 rounded ${
                                    channel.hideSeenVideos
                                      ? "bg-blue-500/20 text-blue-500"
                                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                                  }`}
                                  title="Hide Seen"
                                >
                                  HS
                                </button>
                                {/* Move dropdown */}
                                <select
                                  value={channel.groupId || "uncategorized"}
                                  onChange={(e) => moveChannelToGroup(channel.id, e.target.value)}
                                  className="text-[10px] bg-transparent border-none text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Move to group"
                                >
                                  {sortedGroups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 text-sm text-[var(--muted)]">
                        No channels in this group
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* YouTube Filters */}
          <div className="mt-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {showFilters ? "▼ Hide Filters" : "▶ Show Filters"}
            </button>

            {showFilters && (
              <div className="mt-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-md space-y-4">
                {/* Min Duration */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Minimum Duration
                  </label>
                  <select
                    value={youtubeFilters.minDurationSeconds}
                    onChange={(e) =>
                      setYoutubeFilters((prev) => ({
                        ...prev,
                        minDurationSeconds: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
                  >
                    <option value={0}>No minimum</option>
                    <option value={60}>1 minute</option>
                    <option value={180}>3 minutes</option>
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                    <option value={1200}>20 minutes</option>
                    <option value={1800}>30 minutes</option>
                  </select>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Filter out shorter videos (like Shorts)
                  </p>
                </div>

                {/* Min View Count */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Minimum Views
                  </label>
                  <select
                    value={youtubeFilters.minViewCount}
                    onChange={(e) =>
                      setYoutubeFilters((prev) => ({
                        ...prev,
                        minViewCount: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
                  >
                    <option value={0}>No minimum</option>
                    <option value={1000}>1K views</option>
                    <option value={10000}>10K views</option>
                    <option value={50000}>50K views</option>
                    <option value={100000}>100K views</option>
                    <option value={500000}>500K views</option>
                    <option value={1000000}>1M views</option>
                  </select>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Filter out low-engagement videos
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Shorts Channels */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide">
              Shorts Channels
              <span className="ml-2 text-[var(--muted)] font-normal normal-case">
                ({shortsChannels.filter((c) => c.enabled).length} enabled)
              </span>
            </h2>
            <button
              onClick={() => {
                setShowAddShortsChannel(!showAddShortsChannel);
                setShortsChannelError("");
              }}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {showAddShortsChannel ? "Cancel" : "+ Add Channel"}
            </button>
          </div>

          {showAddShortsChannel && (
            <div className="mb-4 p-3 bg-[var(--card)] border border-[var(--border)] rounded-md space-y-2">
              <input
                type="text"
                placeholder="YouTube URL (e.g., youtube.com/@MrBeast)"
                value={newShortsChannelUrl}
                onChange={(e) => {
                  setNewShortsChannelUrl(e.target.value);
                  setShortsChannelError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !shortsChannelLoading) addShortsChannel();
                }}
                className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
              />
              {shortsChannelError && (
                <p className="text-xs text-red-500">{shortsChannelError}</p>
              )}
              <button
                onClick={addShortsChannel}
                disabled={!newShortsChannelUrl.trim() || shortsChannelLoading}
                className="px-3 py-1.5 text-sm bg-[var(--foreground)] text-[var(--background)] rounded-md disabled:opacity-50"
              >
                {shortsChannelLoading ? "Resolving..." : "Add"}
              </button>
            </div>
          )}

          {/* Shorts Preferences */}
          <div className="mb-4 p-4 bg-[var(--card)] border border-[var(--border)] rounded-md space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Shorts per Refresh</label>
              <select
                value={shortsPreferences.shortsCount}
                onChange={(e) => setShortsPreferences((prev) => ({ ...prev, shortsCount: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
              >
                <option value={5}>5 shorts</option>
                <option value={10}>10 shorts</option>
                <option value={15}>15 shorts</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Minimum Views</label>
              <select
                value={shortsPreferences.minViewCount}
                onChange={(e) => setShortsPreferences((prev) => ({ ...prev, minViewCount: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--foreground)]"
              >
                <option value={1000}>1K views</option>
                <option value={10000}>10K views</option>
                <option value={50000}>50K views</option>
                <option value={100000}>100K views</option>
                <option value={500000}>500K views</option>
                <option value={1000000}>1M views</option>
              </select>
            </div>
          </div>

          {/* Shorts Channels List */}
          {shortsChannels.length === 0 ? (
            <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md">
              <p className="text-sm text-[var(--muted)]">
                No channels added yet. Add channels that post Shorts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {shortsChannels.map((channel) => (
                <div
                  key={channel.id}
                  className={`relative p-2 rounded-md border border-[var(--border)] hover:border-[var(--muted)] transition-colors group ${
                    !channel.enabled ? "opacity-50" : ""
                  }`}
                >
                  <button
                    onClick={() => setShortsChannels((prev) => prev.filter((c) => c.id !== channel.id))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Remove channel"
                  >
                    ×
                  </button>
                  <div className="flex flex-col items-center text-center">
                    <div className="relative mb-1">
                      <label className="cursor-pointer">
                        {channel.thumbnail ? (
                          <img src={channel.thumbnail} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[var(--border)]" />
                        )}
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={() =>
                            setShortsChannels((prev) =>
                              prev.map((c) => (c.id === channel.id ? { ...c, enabled: !c.enabled } : c))
                            )
                          }
                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded border-[var(--border)]"
                        />
                      </label>
                    </div>
                    <a
                      href={`https://www.youtube.com/channel/${channel.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs truncate w-full hover:text-blue-500 transition-colors"
                      title={channel.name}
                    >
                      {channel.name}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Seen Videos History */}
        <section className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-4">
            Seen Videos History
          </h2>
          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md">
            <p className="text-sm text-[var(--muted)] mb-3">
              Videos you&apos;ve clicked are tracked to help prioritize unseen content.
              History is automatically cleaned after 90 days.
            </p>
            <button
              onClick={() => {
                if (confirm("Clear all seen video history?")) {
                  clearAll();
                }
              }}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-md hover:border-[var(--foreground)] transition-colors"
            >
              Clear All Seen History
            </button>
          </div>
        </section>

        {/* Clear Data */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide mb-4">
            Data
          </h2>
          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-md">
            <p className="text-sm text-[var(--muted)] mb-3">
              Clear all local data including recent links and preferences.
            </p>
            <button
              onClick={() => {
                if (confirm("Clear all local data?")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="px-4 py-2 text-sm border border-red-500 text-red-500 rounded-md hover:bg-red-500/10 transition-colors"
            >
              Clear All Data
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
