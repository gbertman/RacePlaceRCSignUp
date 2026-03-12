# RacePlaceRC Signup App

This repository contains a full-stack web application for signing up for RC racing classes. The frontend is built with React and Bootstrap; the backend uses Express.

## Features

- Register racers with name (required), transponder (optional), and multiple class selections
- View a live list of everyone who's signed up (transponder hidden)
- Edit an existing signup by clicking the racer's name
- Download the registration list as a CSV (`Name,Transponder,Class` with multiple lines per racer as needed)
- Classes are stored in a server-side text file and can be edited via a separate screen
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

    This will start the backend on port 4000 and the React development server on port 3000.

3. **Open** your browser to `http://localhost:3000` to access the signup interface.

4. Use the "Edit Classes" link to manage the list of available classes.

## Data Files

- `server/data/classes.txt` – newline-separated list of class names
- `server/data/registrations.json` – JSON object storing registrations keyed by racer name

Feel free to edit these directly if needed.
