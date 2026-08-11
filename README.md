# RacePlaceRC Signup App

This repository contains a full-stack web application for signing up for RC racing classes. The frontend is built with React, Vite, and Mantine; the backend uses Express and SQLite.

## Features

- Register racers with first name, last name, and multiple class selections
- View a live list of everyone who's signed up, with real-time updates across connected devices
- Edit an existing signup by clicking the racer's name
- Download the registration list as a CSV (`FirstName,LastName,ClassName,IsPaid`) named `YYYY-MM-DD Race Registrations.csv`
- Admin tools for reset, CSV download, printing, driver management, maintenance backup/restore, and class editing live on `/admin`
- Admins can print scan-friendly sheets per track, photograph them from a phone, verify GPT-extracted names and race marks, and import the approved racers
- Classes, tracks, drivers, users, and registrations are stored in SQLite and can be managed from the admin screens.

## Dependencies & APIs

### Backend

- **express**: handles HTTP routes
- **cors**: enables cross-origin requests from the React client
- **better-sqlite3**: stores application data in SQLite
- **openai** and **multer**: analyze photographed signup sheets without saving the uploaded image
- **socket.io**: pushes live registration and class updates to connected clients

### Frontend

- **vite**: development server and production bundler
- **react-router-dom**: client-side routing for navigation
- **@mantine/core** and **@mantine/hooks**: accessible UI components, responsive layouts, and interaction utilities
- **socket.io-client**: listens for live server updates in the signup and admin screens

The OpenAI API is only required when GPT-assisted sheet scanning is enabled.

### GPT-assisted sheet scanning

The scan workflow uses the OpenAI Responses API with image input and Structured Outputs. Set the API key on the server before starting the application:

```powershell
$env:OPENAI_API_KEY='your-api-key'
npm start
```

The default model is `gpt-5.6-terra`. Override it when needed:

```powershell
$env:OPENAI_VISION_MODEL='gpt-5.6-terra'
```

The API key must never be placed in the React client or committed to this repository. Sheet photographs are held in memory only for analysis and are not written to disk. GPT output is presented on a required verification page before registrations or new drivers are saved.

- [OpenAI image and vision documentation](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Create and manage an OpenAI API key](https://platform.openai.com/api-keys)

## Getting Started

1. **Install** dependencies (from workspace root):
    ```bash
    npm install
    npm install --prefix server
    npm install --prefix client
    ```
2. **Run in development**:
    ```bash
    npm run dev
    ```
3. **Open** your browser to `http://localhost:3000` to access the signup interface.
4. Open `/admin` to manage the list of available classes and other admin actions.

## Production

1. **Build** the client:
    ```bash
    npm run build
    ```
2. **Start in production**:
    ```bash
    NODE_ENV=production npm start
    ```

In development, the React app runs on port `3000` and proxies API requests to the Express server on port `4000`. In production, Express serves the built client from `client/build`.

## SQLite data

The default database is `server/data/raceplace.sqlite`. Override its location with `SQLITE_DB_FILE`.

For a brand-new database, the server automatically creates an `admin` user with the password `admin`. Change this password in User Management after the first login. You can override either initial value before the first start:

```text
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-password
```

These variables are only used when the database does not contain an administrator. Existing administrator accounts are never overwritten during startup.

On Render, mount a persistent disk and place the database on that disk, for example:

```text
SQLITE_DB_FILE=/var/data/raceplace.sqlite
```
