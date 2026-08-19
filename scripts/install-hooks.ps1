# Install local Git hooks
$hookContent = @"
#!/usr/bin/env sh
# Automated Pre-Commit Privacy Hook
echo "🔒 Running pre-commit privacy & PII scan..."
node scripts/privacy-scan.mjs
if [ `$? -ne 0 ]; then
  echo "❌ Commit aborted: privacy violations detected. Fix before committing."
  exit 1
fi
"@

Set-Content -Path .git/hooks/pre-commit -Value $hookContent -Encoding utf8
Write-Host "✅ Git pre-commit privacy hook installed successfully." -ForegroundColor Green
