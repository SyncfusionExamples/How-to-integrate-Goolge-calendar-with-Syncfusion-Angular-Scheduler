# EJ2-Angular Scheduler Integration with Google Calendar API

This project demonstrates how to integrate Syncfusion EJ2 Angular Scheduler with the Google Calendar API, allowing full CRUD operations (Create, Read, Update, Delete) directly on a user’s Google Calendar.

To run this project follow the below steps, 

1. Clone this project 
2. Install packages using `npm install` 

## Setting Up Your Google Cloud Project
To interact with Google Calendar, enable the API and create OAuth credentials.
- Visit the [Google Cloud Console](https://console.cloud.google.com).
- Click **Select a project** (dropdown at the top) and then **New Project**.
- Name your project (e.g., "React-Scheduler-Google") and click **Create**.
### Enable the Google Calendar API
- From the navigation menu (hamburger icon top-left), go to **APIs & Services** > **Library**.
Search for "Google Calendar API".
Select it and click **Enable**.
### Create OAuth Client ID
- Go to **APIs & Services** > **Credentials**.
- Click **Create Credentials** > **OAuth client ID**.
- Choose **Web application**.
- Add **Authorized JavaScript origins**: http://localhost:3000 (for development).
- Add **Authorized redirect URIs**: http://localhost:3000 (or your app's URL).
- Click **Create**.
- Copy the **Client ID** – you'll use it in the code.
### Create API Key
- Go to **APIs & Services** > **Credentials**. 
- Click **Create Credentials** > **API Key**.
- Copy the **API Key** – you'll use it in the code.

## Setting up your project
Replace your **calendar-id**, **client-id** and **calendar-id** in the **schedule.js**.
## Running the application.
```bash
ng serve --open
```
