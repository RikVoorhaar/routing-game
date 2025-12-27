#!/bin/sh
# Format only staged files in routing-app

# Get staged files that are in routing-app directory
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '^routing-app/' | sed 's|^routing-app/||')

if [ -z "$STAGED_FILES" ]; then
    echo "No staged files in routing-app to format"
    exit 0
fi

# Change to routing-app directory
cd "$(dirname "$0")/.."

# Run prettier on the staged files
echo "Formatting staged files..."
echo "$STAGED_FILES" | xargs -r prettier --write

echo "✓ Formatted staged files"

