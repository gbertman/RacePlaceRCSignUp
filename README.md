# RacePlaceRC Signup App

This repository contains a full-stack web application for signing up for RC racing classes. The frontend is built with React and Bootstrap; the backend uses Express.

## Features

- Register racers with first name, last name, and multiple class selections
- View a live list of everyone who's signed up, with real-time updates across connected devices
- Edit an existing signup by clicking the racer's name
- Download the registration list as a CSV (`FirstName,LastName,ClassName,IsPaid`) named `YYYY-MM-DD Race Registrations.csv`
- Admin tools for reset, CSV download, printing, driver management, maintenance backup/restore, and class editing live on `/admin`
- Admins can print scan-friendly sheets per track, photograph them from a phone, verify GPT-extracted names and race marks, and import the approved racers
- Classes are stored in a server-side JSON file (`data/classes.json`) and can be edited via the `/admin` screen. Track types come from `server/data/track.json`, and class grouping in the UI follows those values dynamically.
- Data persists to files on the server so it survives restarts

## Dependencies & APIs

### Backend

- **express**: handles HTTP routes
- **cors**: enables cross-origin requests from the React client
- **body-parser**: parses JSON request bodies
- **socket.io**: pushes live registration and class updates to connected clients

### Frontend

- **react-router-dom**: client-side routing for navigation
- **bootstrap** and **react-bootstrap**: UI styling
- **socket.io-client**: listens for live server updates in the signup and admin screens

No additional external APIs are required; all data is served locally.

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
    cd server && npm install
    cd ../client && npm install
    ```
2. **Run in development**:
    ```bash
    npm start
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
    npm run start:prod
    ```

In development, the React app runs on port `3000` and proxies API requests to the Express server on port `4000`. In production, Express serves the built client from `client/build`.

## Data Files

- `server/data/classes.json` - JSON array of classes with `name` and `type`
- `server/data/track.json` - JSON array of available track types for the admin dropdown
- `server/data/registrations.json` - JSON object storing registrations keyed by racer name
- `server/data/drivers.json` - JSON array of saved drivers used for last-name matching in signup

Feel free to edit these directly if needed.
