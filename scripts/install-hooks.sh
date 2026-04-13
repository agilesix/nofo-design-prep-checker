#!/bin/sh
# Installs git hooks. Run once after cloning: sh scripts/install-hooks.sh
cp scripts/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
cp scripts/commit-msg .git/hooks/commit-msg
chmod +x .git/hooks/commit-msg
echo "Git hooks installed."
