# RacePlaceRC Signup App

This repository contains a full-stack web application for signing up for RC racing classes. The frontend is built with React and Bootstrap; the backend uses Express.

## Features

- Register racers with first name, last name, and multiple class selections
- View a live list of everyone who's signed up
- Edit an existing signup by clicking the racer's name
- Download the registration list as a CSV (`First Name,Last Name,Class`) named `Race YYYY-MM-DD.csv`
- Admin tools for reset, CSV download, printing, and class editing live on `/admin`
- Classes are stored in a server-side JSON file (`data/classes.json`) and can be edited via the `/admin` screen. Track types come from `server/data/track.json`, and class grouping in the UI follows those values dynamically.
- Data persists to files on the server so it survives restarts

## Dependencies & APIs

### Backend

- **express**: handles HTTP routes
- **cors**: enables cross-origin requests from the React client
- **body-parser**: parses JSON request bodies

### Frontend

- **react-router-dom**: client-side routing for navigation
- **bootstrap** and **react-bootstrap**: UI styling

No additional external APIs are required; all data is served locally.

## Getting Started

1. **Install** dependencies (from workspace root):
   ```bash
   npm install
   cd client && npm install
   ```
2. **Run** the application:
   ```bash
   npm run start
   ```
3. **Open** your browser to `http://localhost:3000` to access the signup interface.
4. Open `/admin` to manage the list of available classes and other admin actions.

## Data Files

- `server/data/classes.json` - JSON array of classes with `name` and `type`
- `server/data/track.json` - JSON array of available track types for the admin dropdown
- `server/data/registrations.json` - JSON object storing registrations keyed by racer name

Feel free to edit these directly if needed.
