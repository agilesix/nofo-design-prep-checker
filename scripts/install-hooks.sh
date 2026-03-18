#!/bin/sh
# Installs the pre-push git hook that prevents direct pushes to main.
# Run once after cloning: sh scripts/install-hooks.sh
cp scripts/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "Git hooks installed."
