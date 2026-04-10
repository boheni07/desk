'use client';

// Design Ref: §6 -- Push subscription management hook
// Plan SC: FR-23 Web Push registration/unregistration

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePushSubscriptionReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  isLoading: boolean;
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check support and current subscription state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    // Register service worker and check existing subscription
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        return registration.pushManager.getSubscription();
      })
      .then((subscription) => {
        setIsSubscribed(subscription !== null);
      })
      .catch(() => {
        // Service worker registration failed -- push not available
        setIsSupported(false);
      });
  }, []);

  const isLoadingRef = useRef(false);

  const subscribe = useCallback(async () => {
    if (!isSupported || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      // Get VAPID public key from server
      const vapidRes = await fetch('/api/push-subscriptions/vapid-key');
      if (!vapidRes.ok) throw new Error('VAPID key fetch failed');
      const vapidData = await vapidRes.json();
      if (!vapidData.publicKey) throw new Error('VAPID public key not available');
      const { publicKey } = vapidData;

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Subscribe via PushManager
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      const subJson = subscription.toJSON();
      const res = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: subJson.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh || '',
              auth: subJson.keys?.auth || '',
            },
          },
        }),
      });

      if (!res.ok) throw new Error('Subscription registration failed');
      setIsSubscribed(true);
    } catch (error) {
      console.error('Push subscribe error:', error);
      throw error;
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;

        // Remove from server first (reversible), then browser (irreversible)
        await fetch('/api/push-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });

        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      throw error;
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, subscribe, unsubscribe, isLoading };
}

/**
 * Convert a base64 URL-safe string to Uint8Array for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
