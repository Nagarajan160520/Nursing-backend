# Backend — Real-time (Socket.IO) Notes

This file documents the Socket.IO integration used for real-time updates in the Nursing Institute app.

## What is implemented
- Socket.IO server is initialized in `server.js` and attached to the same HTTP server.
- The server authenticates socket connections using the JWT token and joins sockets to useful rooms.
- The server instance is made available to controllers via `app.set('io', io)` and can be accessed with `req.app.get('io')`.

## Rooms used
- `students` — all student clients
- `user:<userId>` — per-user room; useful to notify a single student
- `course:<courseId>` — students of a specific course
- `year:<batchYear>` — students in a particular batch/year
- `semester:<semester>` — students by semester
- `admins` — admin clients
- `faculty` — faculty clients

## Events emitted (from Admin actions)
- `downloads:created` — payload: the saved Download document
- `attendance:changed` — payload: { date, subject, semester, course } (and optional studentId when targeted)
- `marks:added` — payload: { course, semester, subject, examType }
- `marks:published` — payload: { course, semester, subject, examType }
- `marks:updated` — payload: the updated Mark document

> Controllers emit using `io.to(room).emit(eventName, payload)`; check `adminController.js` for examples.

## Client connection example (browser)
```javascript
import { io } from 'socket.io-client';
const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const token = localStorage.getItem('token');
const socket = io(API_BASE, { auth: { token }, transports: ['websocket'] });

socket.on('connect', () => console.log('socket connected', socket.id));
socket.on('downloads:created', (d) => console.log('new download', d));
```

## Quick local setup
1. Install socket package: `cd backend && npm install socket.io`
2. Restart server: `npm run dev` or `npm start`
3. Confirm connections by checking server logs (it logs connect/disconnect) and by emitting an admin action (upload a download as admin) — relevant clients should receive the event.

## Production notes
- If you run multiple backend instances, use a Socket.IO adapter (e.g., Redis) to share events across nodes.
- Ensure `FRONTEND_URL` (or allowed origins) are configured correctly so Socket.IO CORS permits connections from the front-end domain.
- Socket authentication uses the same JWT secret as HTTP authentication; rotating secrets will invalidate socket connections.

If you want, I can add a small E2E Cypress test that simulates an admin upload and asserts the student's page receives an event. Let me know if you want that added.