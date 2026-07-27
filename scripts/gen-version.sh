#!/bin/bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$PROJECT_ROOT/VERSION"
OUTPUT_DIR="$PROJECT_ROOT/static"
OUTPUT_FILE="$OUTPUT_DIR/version.json"

# Read base version
BASE_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

# Get branch name
BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Get commit short hash
COMMIT_SHORT=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "0000000")

# Count total commits for build number
COMMIT_COUNT=$(git -C "$PROJECT_ROOT" rev-list --count HEAD 2>/dev/null || echo "0")

FULL_VERSION="V${BASE_VERSION}.${COMMIT_COUNT}-[${BRANCH}]-(${COMMIT_SHORT})"

mkdir -p "$OUTPUT_DIR"
cat > "$OUTPUT_FILE" << EOF
{
  "version": "$FULL_VERSION",
  "base": "$BASE_VERSION",
  "build": $COMMIT_COUNT,
  "branch": "$BRANCH",
  "commit": "$COMMIT_SHORT"
}
EOF

echo "Generated $OUTPUT_FILE"
echo "Version: $FULL_VERSION"
