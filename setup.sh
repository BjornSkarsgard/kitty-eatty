#!/usr/bin/env bash
# Установка Claude Code и Node.js для проекта KittyEatty (Git Bash на Windows)
# Запуск в терминале PhpStorm: bash setup.sh

echo "1/3 Claude Code (официальный установщик Anthropic)..."
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"

echo "2/3 Добавляю ~/.local/bin в PATH для Git Bash..."
if ! grep -q '.local/bin' ~/.bashrc 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
fi
export PATH="$HOME/.local/bin:$PATH"

echo "3/3 Node.js LTS (нужен для Vite, Phaser и MCP)..."
if command -v node >/dev/null 2>&1; then
  echo "Node уже есть: $(node --version)"
else
  winget.exe install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
fi

echo
claude --version && echo "Готово. Перезапусти PhpStorm, затем в терминале: claude" \
  || echo "claude не найден. Перезапусти PhpStorm и попробуй: claude --version"
