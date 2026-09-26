import type { GetTrackingResponse } from '@email-tracker/shared';
import type { LocalTrackingRecord } from '../tracking/historyStorage.js';
import {
  requestTrackingDetail,
  requestTrackingList,
  TrackingQueryError,
} from '../api/trackingMessages.js';
import { formatDate, formatOpenCount, formatSubject } from './format.js';

interface TrackingViewApi {
  list: () => Promise<LocalTrackingRecord[]>;
  get: (id: string) => Promise<GetTrackingResponse>;
}
export class TrackingView {
  private active = false;
  private generation = 0;
  constructor(
    private readonly root: HTMLElement,
    private readonly api: TrackingViewApi = {
      list: requestTrackingList,
      get: requestTrackingDetail,
    },
  ) {
    root.hidden = true;
  }
  setActivated(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.generation++;
    this.root.replaceChildren();
    this.root.hidden = !active;
    if (active) void this.list();
  }
  private node<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text: string,
  ): HTMLElementTagNameMap[K] {
    const node = this.root.ownerDocument.createElement(tag);
    node.textContent = text;
    return node;
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const button = this.node('button', text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }
  private error(error: unknown): HTMLElement {
    const text =
      error instanceof TrackingQueryError && error.code === 'UNAUTHORIZED'
        ? 'Authorization expired'
        : error instanceof TrackingQueryError && error.code === 'NOT_FOUND'
          ? 'Tracking record not found'
          : 'Unable to load tracking information';
    const node = this.node('p', text);
    node.setAttribute('role', 'alert');
    return node;
  }
  private loading(): HTMLElement {
    const node = this.node('p', 'Loading…');
    node.setAttribute('role', 'status');
    return node;
  }
  private async list(): Promise<void> {
    if (!this.active) return;
    const generation = ++this.generation;
    const heading = this.node('h2', 'Recent tracked emails');
    this.root.replaceChildren(heading, this.loading());
    try {
      const records = await this.api.list();
      if (!this.active || generation !== this.generation) return;
      const list = this.node('ul', '');
      list.className = 'tracking-list';
      for (const record of [...records].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )) {
        const item = this.node('li', '');
        const button = this.button('', () => {
          void this.detail(record.trackingId);
        });
        button.append(
          this.node('strong', formatSubject(record.subject)),
          this.node('span', record.recipient),
          this.node('small', `Created: ${formatDate(record.createdAt)}`),
        );
        item.append(button);
        list.append(item);
      }
      this.root.replaceChildren(
        heading,
        records.length ? list : this.node('p', 'No tracked emails yet.'),
      );
    } catch (error) {
      if (!this.active || generation !== this.generation) return;
      this.root.replaceChildren(
        heading,
        this.error(error),
        this.button('Retry', () => {
          void this.list();
        }),
      );
    }
  }
  private async detail(id: string): Promise<void> {
    if (!this.active) return;
    const generation = ++this.generation;
    const back = this.button('Back', () => {
      void this.list();
    });
    const refresh = this.button('Refresh', () => {
      void this.detail(id);
    });
    refresh.disabled = true;
    const navigation = this.node('nav', '');
    navigation.setAttribute('aria-label', 'Tracking navigation');
    navigation.append(back, refresh);
    this.root.replaceChildren(navigation, this.loading());
    try {
      const tracking = await this.api.get(id);
      if (!this.active || generation !== this.generation) return;
      this.root.replaceChildren(
        navigation,
        this.node('h2', formatSubject(tracking.subject)),
        this.node('p', tracking.recipient),
      );
      const summary = this.node('dl', '');
      const fields = [
        [
          'Status',
          tracking.status === 'OPEN_DETECTED'
            ? 'Open detected'
            : 'Not opened yet',
        ],
        ['Opened', formatOpenCount(tracking.openCount)],
        ['First open', formatDate(tracking.firstOpenedAt)],
        ['Last open', formatDate(tracking.lastOpenedAt)],
      ];
      for (const [label, value] of fields)
        summary.append(this.node('dt', label), this.node('dd', value));
      this.root.append(summary);
      if (!tracking.events.length)
        this.root.append(this.node('p', 'No opens detected yet.'));
      else {
        this.root.append(this.node('h3', 'History'));
        const events = this.node('ol', '');
        events.className = 'tracking-events';
        for (const event of [...tracking.events].sort(
          (a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt),
        )) {
          const item = this.node('li', '');
          const time = this.node('time', formatDate(event.openedAt));
          time.dateTime = event.openedAt;
          item.append(
            time,
            this.node('p', event.ip ? `IP: ${event.ip}` : 'IP unavailable'),
          );
          if (event.userAgent) {
            const details = this.node('details', '');
            details.append(
              this.node('summary', 'User-Agent'),
              this.node('p', event.userAgent),
            );
            item.append(details);
          }
          events.append(item);
        }
        this.root.append(events);
      }
      this.root.append(
        this.node(
          'p',
          'An open detected is not proof that a person read the email. Image proxies, caching and preloading can affect results.',
        ),
      );
    } catch (error) {
      if (!this.active || generation !== this.generation) return;
      this.root.replaceChildren(navigation, this.error(error));
    } finally {
      if (generation === this.generation) refresh.disabled = false;
    }
  }
}
