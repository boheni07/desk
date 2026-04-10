'use client';

import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Shared hook for notification unread count polling.
 * Prevents duplicate polling when multiple components mount simultaneously.
 */

// Module-level shared state to deduplicate across components
let sharedCount = 0;
let listeners = new Set<(count: number) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

async function fetchCount() {
  try {
    const res = await fetch('/api/notifications/unread-count');
    if (res.ok) {
      const json = await res.json();
      sharedCount = json.data?.count ?? json.count ?? 0;
      listeners.forEach((fn) => fn(sharedCount));
    }
  } catch {
    // Silently ignore polling errors
  }
}

function startPolling() {
  if (pollTimer) return;
  fetchCount();
  pollTimer = setInterval(fetchCount, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function useUnreadCount() {
  const [count, setCount] = useState(sharedCount);

  useEffect(() => {
    subscriberCount++;
    listeners.add(setCount);
    startPolling();

    return () => {
      subscriberCount--;
      listeners.delete(setCount);
      if (subscriberCount === 0) {
        stopPolling();
      }
    };
  }, []);

  const refresh = useCallback(() => {
    fetchCount();
  }, []);

  return { unreadCount: count, refreshUnreadCount: refresh };
}
