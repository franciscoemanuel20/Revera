#!/bin/sh
# Dev server com o Node instalado via nvm (este Mac não tem Node global).
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
cd "$(dirname "$0")/.."
exec npm run dev -- --port 3001
