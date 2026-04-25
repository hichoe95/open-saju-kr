import { expect, type Page } from '@playwright/test';

export interface TrackedAnalyticsEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  sessionId?: string;
}

export interface AnalyticsRecorder {
  events: TrackedAnalyticsEvent[];
}

export async function installAnalyticsRecorder(page: Page): Promise<AnalyticsRecorder> {
  const recorder: AnalyticsRecorder = { events: [] };

  await page.route('**/api/analytics/track/event', async (route) => {
    const body = route.request().postDataJSON() as {
      event_type?: string;
      event_data?: Record<string, unknown>;
      session_id?: string;
    };

    recorder.events.push({
      eventType: body.event_type || 'unknown',
      eventData: body.event_data ?? {},
      sessionId: body.session_id,
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/api/analytics/track/funnel', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  return recorder;
}

export function findAnalyticsEvent(
  recorder: AnalyticsRecorder,
  eventType: string,
  predicate?: (event: TrackedAnalyticsEvent) => boolean
): TrackedAnalyticsEvent | undefined {
  return recorder.events.find((event) => event.eventType === eventType && (predicate ? predicate(event) : true));
}

export async function expectAnalyticsEvent(
  recorder: AnalyticsRecorder,
  eventType: string,
  predicate?: (event: TrackedAnalyticsEvent) => boolean
): Promise<TrackedAnalyticsEvent> {
  await expect.poll(
    () => Boolean(findAnalyticsEvent(recorder, eventType, predicate)),
    {
      message: `Expected analytics event: ${eventType}`,
    }
  ).toBe(true);

  return findAnalyticsEvent(recorder, eventType, predicate)!;
}
