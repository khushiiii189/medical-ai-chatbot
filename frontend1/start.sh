#!/bin/bash
# Activate virtual environment
source /app/venv/bin/activate
# Start Gunicorn server
exec gunicorn -w 4 -b 0.0.0.0:5000 Chatbot:app
