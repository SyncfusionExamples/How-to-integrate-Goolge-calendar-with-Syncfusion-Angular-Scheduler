import { Component, OnInit, Injectable, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { ScheduleModule, DayService, WeekService, WorkWeekService, MonthService, AgendaService, ResizeService, DragAndDropService, ScheduleComponent } from '@syncfusion/ej2-angular-schedule';

/* Configuration - Your Google Calendar Credentials */
export const CONFIG = {
  clientId: '813402107624-laflee2os9mauqkgi2g3slbhubbsj2a9.apps.googleusercontent.com',
  apiKey: 'AIzaSyBQ0fs5BWKB5s6EmrbcDvERbKWNsP-77Cs',
  calendarId: 'primary'
};

/* Google Calendar Service */
@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private tokenClient: any = null;
  private accessToken: string | null = null;
  public signedIn$ = new BehaviorSubject<boolean>(false);
  public userEmail$ = new BehaviorSubject<string>('');
  public lastGsiError$ = new BehaviorSubject<string | null>(null);
  private scope = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';
  public calendarId: string = CONFIG.calendarId;

  constructor(private http: HttpClient) {}

  private initializeTokenClient() {
    const clientId = CONFIG.clientId;
    if (!clientId) { this.lastGsiError$.next('clientId not set'); return; }
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
    } catch (e) {
      this.lastGsiError$.next(String(e));
    }
  }

  private ensureGsiReady(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).google?.accounts?.oauth2) return resolve();
      const interval = 200; let waited = 0;
      const h = setInterval(() => {
        if ((window as any).google?.accounts?.oauth2) { clearInterval(h); return resolve(); }
        waited += interval; if (waited >= timeout) { clearInterval(h); return reject(new Error('GSI not available')); }
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
      if (!this.tokenClient) { this.lastGsiError$.next('token client not initialized'); return; }
      this.tokenClient.requestAccessToken({ prompt });
    }).catch(err => {
      this.lastGsiError$.next(String(err));
      this.signedIn$.next(false);
    });
  }

  public async signOut(): Promise<void> {
    if (this.accessToken) {
      try { await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, { method: 'POST' }); } catch {}
    }
    this.accessToken = null;
    this.signedIn$.next(false);
    this.userEmail$.next('');
  }

  private authHeaders(): HttpHeaders { return new HttpHeaders({ Authorization: `Bearer ${this.accessToken}` }); }

  public getEvents(timeMin?: string, timeMax?: string, expandRecurring: boolean = true): Observable<any> {
    const params: any = { 
      singleEvents: expandRecurring ? 'true' : 'false', 
      orderBy: expandRecurring ? 'startTime' : undefined 
    };
    if (timeMin) params.timeMin = timeMin;
    if (timeMax) params.timeMax = timeMax;
    if (params.maxResults) params.maxResults = '2500'; // Get more events for recurring series
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

/* Main App Component */
@Component({
  standalone: true,
  selector: 'app-root',
  imports: [CommonModule, ScheduleModule],
  providers: [DayService, WeekService, WorkWeekService, MonthService, AgendaService, ResizeService, DragAndDropService, GoogleCalendarService],
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
  public eventSettings: any = { dataSource: [], allowAdding: true, allowEditing: true, allowDeleting: true };
  public isSignedIn = false;
  public selectedDate: Date = new Date();
  public scheduleViews: Array<any> = [{ option: 'Day' }, { option: 'Week' }, { option: 'WorkWeek' }, { option: 'Month' }];

  constructor(private gcal: GoogleCalendarService) {}

  ngOnInit(): void {
    this.gcal.signedIn$.subscribe(signedIn => {
      console.log('Sign-in status changed:', signedIn);
      this.isSignedIn = signedIn;
      if (signedIn) {
        console.log('User signed in, loading events automatically...');
        this.loadEvents();
      } else {
        this.events = [];
        this.eventSettings = { ...this.eventSettings, dataSource: [] };
      }
    });
  }

  private mapEventFromGoogle(ge: any) {
    const start = ge.start?.dateTime || ge.start?.date;
    const end = ge.end?.dateTime || ge.end?.date;
    
    const event: any = {
      Id: ge.id,
      Subject: ge.summary || '(no title)',
      Description: ge.description || '',
      StartTime: start ? new Date(start) : null,
      EndTime: end ? new Date(end) : null,
      IsAllDay: !!ge.start?.date,
      _raw: ge
    };
    
    // Handle recurring events
    if (ge.recurrence && ge.recurrence.length > 0) {
      // Google Calendar returns recurrence as an array of RRULE strings like "RRULE:FREQ=DAILY;COUNT=10"
      // Syncfusion expects just the rule without "RRULE:" prefix
      let rrule = ge.recurrence[0];
      if (rrule.startsWith('RRULE:')) {
        rrule = rrule.substring(6); // Remove "RRULE:" prefix
      }
      event.RecurrenceRule = rrule;
      console.log('Loaded recurring event - Google format:', ge.recurrence[0], '-> Syncfusion format:', event.RecurrenceRule);
    }
    
    // Skip recurring event instances (they have recurringEventId)
    if (ge.recurringEventId) {
      event.RecurrenceID = ge.recurringEventId;
      console.log('Recurring event instance, parent ID:', ge.recurringEventId);
    }
    
    return event;
  }

  private mapEventToGoogle(e: any) {
    console.log('Mapping event to Google format:', e);
    
    const googleEvent: any = { 
      summary: e.Subject || '(no title)', 
      description: e.Description || '' 
    };
    
    // Handle date/time
    if (e.IsAllDay) {
      const s = e.StartTime instanceof Date ? e.StartTime : new Date(e.StartTime);
      const en = e.EndTime instanceof Date ? e.EndTime : new Date(e.EndTime);
      googleEvent.start = { date: s.toISOString().split('T')[0] };
      googleEvent.end = { date: en.toISOString().split('T')[0] };
    } else {
      const s = e.StartTime instanceof Date ? e.StartTime.toISOString() : e.StartTime;
      const en = e.EndTime instanceof Date ? e.EndTime.toISOString() : e.EndTime;
      googleEvent.start = { dateTime: s, timeZone: 'UTC' };
      googleEvent.end = { dateTime: en, timeZone: 'UTC' };
    }
    
    // Handle recurring events
    if (e.RecurrenceRule) {
      console.log('Original RecurrenceRule:', e.RecurrenceRule);
      
      // Google Calendar expects RRULE: prefix if not present
      let rrule = e.RecurrenceRule;
      if (!rrule.startsWith('RRULE:')) {
        rrule = 'RRULE:' + rrule;
      }
      
      // Google Calendar expects recurrence as an array
      googleEvent.recurrence = [rrule];
      console.log('Formatted recurrence for Google:', googleEvent.recurrence);
    }
    
    console.log('Final Google Event:', googleEvent);
    return googleEvent;
  }

  public loadEvents() {
    console.log('loadEvents() called');
    const now = new Date();
    const timeMin = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();
    
    console.log('Fetching events from', timeMin, 'to', timeMax);
    
    this.gcal.getEvents(timeMin, timeMax).subscribe({
      next: (res: any) => {
        console.log('API Response:', res);
        const items = res.items || [];
        console.log('Number of events:', items.length);
        this.events = items.map((it: any) => this.mapEventFromGoogle(it));
        console.log('Mapped events:', this.events);
        
        // Create new object reference to trigger change detection
        this.eventSettings = { 
          dataSource: this.events, 
          allowAdding: true, 
          allowEditing: true, 
          allowDeleting: true 
        };
        console.log('Updated eventSettings:', this.eventSettings);
        
        // Force scheduler to refresh
        setTimeout(() => {
          if (this.scheduleObj) {
            console.log('Refreshing scheduler...');
            this.scheduleObj.refresh();
          }
        }, 100);
      },
      error: (err: any) => {
        console.error('Error loading events:', err);
      }
    });
  }

  public onActionComplete(args: any) {
    console.log('Action complete:', args.requestType, args);
    
    if (args.requestType === 'eventCreated') {
      const added = args.addedRecords || [];
      console.log('Creating', added.length, 'event(s)');
      
      for (const a of added) {
        console.log('Event to create:', a);
        const body = this.mapEventToGoogle(a);
        console.log('Sending to Google Calendar API:', body);
        
        this.gcal.insertEvent(body).subscribe({
          next: (created: any) => { 
            console.log('✅ Event created successfully:', created);
            a.Id = created.id;
            // If it's a recurring event, reload to get all instances
            if (created.recurrence || a.RecurrenceRule) {
              console.log('Recurring event created, reloading events in 1 second...');
              setTimeout(() => this.loadEvents(), 1000);
            }
          },
          error: (e: any) => { 
            console.error('❌ Failed to create event:', e);
            console.error('Error details:', e.error);
            // Reload events on error to sync state
            setTimeout(() => this.loadEvents(), 500);
          }
        });
      }
    }
    if (args.requestType === 'eventChanged') {
      const changed = args.changedRecords || [];
      for (const c of changed) {
        if (!c.Id) continue;
        const body = this.mapEventToGoogle(c);
        console.log('Updating event:', c.Id, body);
        this.gcal.updateEvent(c.Id, body).subscribe({
          next: () => {
            console.log('Event updated successfully');
            // Reload if recurring event was modified
            if (body.recurrence || c.RecurrenceRule) {
              console.log('Recurring event updated, reloading events...');
              setTimeout(() => this.loadEvents(), 1000);
            }
          },
          error: (e: any) => { 
            console.error('Failed to update event:', e);
            this.loadEvents();
          }
        });
      }
    }
    if (args.requestType === 'eventRemoved') {
      const removed = args.deletedRecords || [];
      for (const r of removed) {
        if (!r.Id) continue;
        console.log('Deleting event:', r.Id);
        this.gcal.deleteEvent(r.Id).subscribe({
          next: () => {
            console.log('Event deleted successfully');
          },
          error: (e: any) => { 
            console.error('Failed to delete event:', e);
            this.loadEvents();
          }
        });
      }
    }
  }

  public signIn() { this.gcal.signIn(); }
  public signOut() { this.gcal.signOut(); }
}