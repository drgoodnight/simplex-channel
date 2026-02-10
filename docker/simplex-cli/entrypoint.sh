#!/bin/sh
set -e

DB_FILE="/home/simplex/.simplex/simplex_v1_chat.db"
DISPLAY_NAME="${SIMPLEX_DISPLAY_NAME:-openclaw}"
PORT="${SIMPLEX_WS_PORT:-5225}"

# First run — create profile non-interactively
if [ ! -f "$DB_FILE" ]; then
    echo "First run — creating profile: $DISPLAY_NAME"

    # Start simplex-chat in background, pipe display name + empty full name
    printf '%s\n\n' "$DISPLAY_NAME" | simplex-chat \
        -d /home/simplex/.simplex \
        --files-folder /home/simplex/files \
        -p "$PORT" &
    PID=$!

    # Wait for the database to appear (profile created)
    for i in $(seq 1 30); do
        sleep 1
        if [ -f "$DB_FILE" ]; then
            echo "Profile created, stopping init process..."
            sleep 3
            kill $PID 2>/dev/null || true
            wait $PID 2>/dev/null || true
            sleep 3
            break
        fi
    done
fi

# Wait for port to be free (in case init process is still releasing)
echo "Waiting for port $PORT to be free..."
for i in $(seq 1 15); do
    if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        break
    fi
    sleep 1
done

echo "Starting SimpleX CLI on port $PORT"
echo "Current user: $(simplex-chat -d /home/simplex/.simplex -e '/user' 2>/dev/null | head -1 || echo $DISPLAY_NAME)"

exec simplex-chat \
    -d /home/simplex/.simplex \
    --files-folder /home/simplex/files \
    -p "$PORT"
