#!/bin/bash

# Start backend in background
echo "Starting backend server..."
(cd backend && npm start) &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend in foreground
echo "Starting frontend server..."
cd frontend && npm run dev

# If frontend exits, kill backend
kill $BACKEND_PID 2>/dev/null