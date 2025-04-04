# Use a specific Python version base image
FROM python:3.11-slim

# Install system dependencies for building the packages
RUN apt-get update && \
    apt-get install -y \
    gcc \
    libsndfile1-dev \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y \
    alsa-utils \
    libasound2 \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*


# Set the working directory inside the container
WORKDIR /app

# Copy the requirements.txt into the container
COPY requirements.txt .

# Install dependencies listed in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code into the container
COPY . .

# Expose the port your app will run on
EXPOSE 8000

# Set the command to run your app using Gunicorn
CMD ["gunicorn", "Chatbot:app", "-b", "0.0.0.0:8000"]
