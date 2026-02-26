import { Component, OnInit, Injectable, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { ScheduleModule, DayService, WeekService, WorkWeekService, MonthService, AgendaService, ResizeService, DragAndDropService, ScheduleComponent } from '@syncfusion/ej2-angular-schedule';

export const CONFIG = {
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',//ENTER YOUR CLIENT-ID HERE
  apiKey: 'YOUR_API_KEY',//ENTER YOUR API KEY HERE
  calendarId: 'primary'//USE PRIMARY OR YOUR CALENDAR ID HERE
};

@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private tokenClient: any = null;
  private accessToken: string | null = null;
  public signedIn$ = new BehaviorSubject<boolean>(false);
  public userEmail$ = new BehaviorSubject<string>('');
  public lastGsiError$ = new BehaviorSubject<string | null>(null);
  private scope = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';
  public calendarId: string = CONFIG.calendarId;

  constructor(private http: HttpClient) { }

  private initializeTokenClient() {
    const clientId = CONFIG.clientId;
    if (!clientId) return;
    try {
      this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: this.scope,
        callback: (response: any) => {
          if (response.error) {
            this.lastGsiError$.next(response.error_description || response.error);
            this.signedIn$.next(false);
            return;
          }
          this.accessToken = response.access_token;
          this.lastGsiError$.next(null);
          this.signedIn$.next(!!this.accessToken);
          this.getUserInfo();
        }
      });
    } catch { }
  }

  private ensureGsiReady(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).google?.accounts?.oauth2) return resolve();
      const interval = 200;
      let waited = 0;
      const h = setInterval(() => {
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(h);
          return resolve();
        }
        waited += interval;
        if (waited >= timeout) {
          clearInterval(h);
          return reject();
        }
      }, interval);
    });
  }

  private getUserInfo() {
    if (!this.accessToken) return;
    this.http.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: new HttpHeaders({ Authorization: `Bearer ${this.accessToken}` })
    }).subscribe({
      next: (user: any) => this.userEmail$.next(user.email || ''),
      error: () => this.userEmail$.next('')
    });
  }

  public signIn(prompt = 'consent') {
    this.ensureGsiReady().then(() => {
      if (!this.tokenClient) this.initializeTokenClient();
      if (!this.tokenClient) return;
      this.tokenClient.requestAccessToken({ prompt });
    }).catch(() => {
      this.signedIn$.next(false);
    });
  }

  public async signOut(): Promise<void> {
    if (this.accessToken) {
      try { await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, { method: 'POST' }); } catch { }
    }
    this.accessToken = null;
    this.signedIn$.next(false);
    this.userEmail$.next('');
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.accessToken}` });
  }

  public getEvents(timeMin?: string, timeMax?: string, expandRecurring: boolean = true): Observable<any> {
    const params: any = {
      singleEvents: expandRecurring ? 'true' : 'false',
      orderBy: expandRecurring ? 'startTime' : undefined,
      maxResults: '2500'
    };
    if (timeMin) params.timeMin = timeMin;
    if (timeMax) params.timeMax = timeMax;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`;
    return this.http.get(url, { headers: this.authHeaders(), params });
  }

  public insertEvent(event: any): Observable<any> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`;
    return this.http.post(url, event, { headers: this.authHeaders() });
  }

  public updateEvent(eventId: string, event: any): Observable<any> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`;
    return this.http.patch(url, event, { headers: this.authHeaders() });
  }

  public deleteEvent(eventId: string): Observable<any> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`;
    return this.http.delete(url, { headers: this.authHeaders() });
  }
}

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [CommonModule, ScheduleModule],
  providers: [
    DayService, WeekService, WorkWeekService, MonthService, AgendaService,
    ResizeService, DragAndDropService, GoogleCalendarService
  ],
  template: `
    <div class="app-container">
      <div class="header">
        <h2>Google Calendar - Syncfusion Scheduler</h2>
        <div class="controls">
          <button class="btn btn-signin" (click)="signIn()" *ngIf="!isSignedIn">Sign In with Google</button>
          <button class="btn btn-reload" (click)="loadEvents()" *ngIf="isSignedIn">Reload Events</button>
          <button class="btn btn-signout" (click)="signOut()" *ngIf="isSignedIn">Sign Out</button>
        </div>
      </div>

      <ejs-schedule
        #scheduleObj
        width="100%"
        height="650px"
        [allowDragAndDrop]="true"
        [allowResizing]="true"
        [showQuickInfo]="true"
        (actionComplete)="onActionComplete($event)"
        [eventSettings]="eventSettings"
        currentView="Week"
        [views]="scheduleViews"
        [selectedDate]="selectedDate">
      </ejs-schedule>
    </div>
  `,
})
export class App implements OnInit {
  @ViewChild('scheduleObj') public scheduleObj?: ScheduleComponent;

  public events: any[] = [];
  // public eventSettings: any = { dataSource: [], allowAdding: true, allowEditing: true, allowDeleting: true };
  public eventSettings: any = {
    dataSource: [],
    allowAdding: true,
    allowEditing: true,
    allowDeleting: true,
    fields: {
      id: 'Id',
      subject: 'Subject',
      startTime: 'StartTime',
      endTime: 'EndTime',
      isAllDay: 'IsAllDay',
      recurrenceRule: 'RecurrenceRule',
      recurrenceID: 'RecurrenceID'
    }
  };
  public isSignedIn = false;
  public selectedDate: Date = new Date();
  public scheduleViews: Array<any> = [
    { option: 'Day' }, { option: 'Week' }, { option: 'WorkWeek' }, { option: 'Month' }
  ];

  constructor(private gcal: GoogleCalendarService) { }

  ngOnInit(): void {
    this.gcal.signedIn$.subscribe(signedIn => {
      this.isSignedIn = signedIn;
      if (signedIn) {
        this.loadEvents();
      } else {
        this.events = [];
        this.eventSettings = { ...this.eventSettings, dataSource: [] };
      }
    });
  }

  private parseDateOnly(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private toLocalDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private addDays(d: Date, days: number): Date {
    const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    nd.setDate(nd.getDate() + days);
    return nd;
  }

  private mapEventFromGoogle(ge: any) {
    const event: any = {
      Id: ge.id,
      Subject: ge.summary || '(no title)',
      Description: ge.description || '',
      IsAllDay: !!ge.start?.date,
      _raw: ge
    };

    if (ge.start?.date) {
      event.StartTime = this.parseDateOnly(ge.start.date);
      event.EndTime = this.parseDateOnly(ge.end?.date ?? ge.start.date);
    } else {
      event.StartTime = ge.start?.dateTime ? new Date(ge.start.dateTime) : null;
      event.EndTime = ge.end?.dateTime ? new Date(ge.end.dateTime) : null;
    }

    if (ge.recurrence && ge.recurrence.length > 0) {
      let rrule = ge.recurrence[0];
      if (rrule.startsWith('RRULE:')) rrule = rrule.substring(6);
      event.RecurrenceRule = rrule;
    }

    if (ge.recurringEventId) event.RecurrenceID = ge.recurringEventId;

    return event;
  }

  private mapEventToGoogle(e: any) {
    const googleEvent: any = {
      summary: e.Subject || '(no title)',
      description: e.Description || ''
    };

    if (e.IsAllDay) {
      const s = e.StartTime instanceof Date ? e.StartTime : new Date(e.StartTime);
      const en = e.EndTime instanceof Date ? e.EndTime : new Date(e.EndTime);
      const sLocal = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      let eLocal = new Date(en.getFullYear(), en.getMonth(), en.getDate());
      if (eLocal <= sLocal) eLocal = this.addDays(sLocal, 1);
      googleEvent.start = { date: this.toLocalDateString(sLocal) };
      googleEvent.end = { date: this.toLocalDateString(eLocal) };
    } else {
      googleEvent.start = { dateTime: e.StartTime instanceof Date ? e.StartTime.toISOString() : e.StartTime, timeZone: 'UTC' };
      googleEvent.end = { dateTime: e.EndTime instanceof Date ? e.EndTime.toISOString() : e.EndTime, timeZone: 'UTC' };
    }

    if (e.RecurrenceRule) {
      let rrule = e.RecurrenceRule.startsWith('RRULE:') ? e.RecurrenceRule : 'RRULE:' + e.RecurrenceRule;
      googleEvent.recurrence = [rrule];
    }

    return googleEvent;
  }

  public loadEvents() {
    const now = new Date();
    const timeMin = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();

    this.gcal.getEvents(timeMin, timeMax).subscribe({
      next: (res: any) => {
        const items = res.items || [];
        this.events = items.map((it: any) => this.mapEventFromGoogle(it));
        this.eventSettings = {
          dataSource: this.events,
          allowAdding: true,
          allowEditing: true,
          allowDeleting: true
        };
        setTimeout(() => this.scheduleObj?.refresh(), 100);
      },
      error: () => { }
    });
  }

  public onActionComplete(args: any) {
    if (args.requestType === 'eventCreated') {
      const added = args.addedRecords || [];
      for (const a of added) {
        const body = this.mapEventToGoogle(a);
        this.gcal.insertEvent(body).subscribe({
          next: (created: any) => {
            a.Id = created.id;
            (a as any)._raw = created;

            const idx = this.events.findIndex(ev =>
              ev === a ||
              (ev.Subject === a.Subject &&
                +new Date(ev.StartTime) === +new Date(a.StartTime) &&
                +new Date(ev.EndTime) === +new Date(a.EndTime))
            );
            if (idx > -1) {
              this.events[idx].Id = created.id;
              this.events[idx]._raw = created;
              this.eventSettings = { ...this.eventSettings, dataSource: [...this.events] };
            }

            setTimeout(() => this.loadEvents(), 300);
          },
          error: () => setTimeout(() => this.loadEvents(), 500)
        });
      }
    }
    if (args.requestType === 'eventChanged') {
      const changed = args.changedRecords || [];
      for (const c of changed) {
        if (!c.Id) continue;
        const body = this.mapEventToGoogle(c);
        this.gcal.updateEvent(c.Id, body).subscribe({
          next: () => {
            if (body.recurrence || c.RecurrenceRule) setTimeout(() => this.loadEvents(), 1000);
          },
          error: () => this.loadEvents()
        });
      }
    }
    if (args.requestType === 'eventRemoved') {
      const removed =
        (Array.isArray(args.deletedRecords) && args.deletedRecords.length ? args.deletedRecords :
          (args.data ? (Array.isArray(args.data) ? args.data : [args.data]) : [])) as any[];

      for (const r of removed) {
        const eventId = r?.Id || r?._raw?.id; // prefer real Google id
        if (!eventId) continue;

        this.gcal.deleteEvent(eventId).subscribe({
          next: () => setTimeout(() => this.loadEvents(), 300),
          error: () => this.loadEvents()
        });
      }
    }
  }

  public signIn() { this.gcal.signIn(); }
  public signOut() { this.gcal.signOut(); }
}






