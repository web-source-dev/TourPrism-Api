#!/bin/bash

echo "Setting up deployment environment..."

# Clean up any existing node_modules and package-lock.json
echo "Cleaning up existing installation..."
rm -rf node_modules
rm -f package-lock.json

# Install dependencies with clean slate
echo "Installing dependencies..."
npm install --production

# Test the connection
echo "Testing database connection..."
npm run test-connection

echo "Setup complete!"
