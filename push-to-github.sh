#!/bin/bash

# Quick GitHub push script for code review mirror
# Usage: ./push-to-github.sh "your commit message"

REPO_URL="https://github.com/Krispy070/teaim-review.git"

# Check if commit message was provided
if [ -z "$1" ]; then
  echo "❌ Error: Please provide a commit message"
  echo "Usage: ./push-to-github.sh \"your commit message\""
  exit 1
fi

# Check if GitHub token is set, if not prompt for it
if [ -z "$GITHUB_TOKEN" ]; then
  echo "🔑 GitHub token not found in environment."
  echo "Please paste your GitHub token:"
  read -s GITHUB_TOKEN
  echo ""
  
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: No token provided"
    exit 1
  fi
fi

echo "📦 Adding changes..."
git add -A

echo "💾 Committing changes..."
git commit -m "$1"

echo "🚀 Pushing to GitHub..."
git push https://$GITHUB_TOKEN@github.com/Krispy070/teaim-review.git main

echo "✅ Done! View your code at: https://github.com/Krispy070/teaim-review"
