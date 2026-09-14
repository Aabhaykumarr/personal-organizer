#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "==============================================="
echo "  Personal Organizer - Cloud Build Pipeline   "
echo "==============================================="

echo "--> 1. Installing Backend Python Dependencies"
pip install -r backend/requirements.txt

echo "--> 2. Installing Frontend Node Dependencies"
cd frontend
npm install

echo "--> 3. Compiling React Production Bundle"
npm run build
cd ..

echo "--> 4. Build Completed Successfully!"
