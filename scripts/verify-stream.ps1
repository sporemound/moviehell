# Verification script for Movie Hell Kick stream configuration and upstream availability
$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " MOVIE HELL STREAM SOURCE & EMBED VERIFICATION   " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

param(
    [string]$siteDomain = "https://movie-hell.pages.dev",
    [string]$kickChannel = "example_channel"
)
$embedUrl = "https://player.kick.com/$kickChannel"
$apiUrl = "$siteDomain/api/streams"
$homeUrl = "$siteDomain/"

$results = [ordered]@{}

# ----------------------------------------------------
# TEST 1: movie-hell /api/streams endpoint
# ----------------------------------------------------
Write-Host "[1/4] Checking Movie Hell API endpoint ($apiUrl)..." -NoNewline
try {
    $apiResp = Invoke-WebRequest -Uri $apiUrl -Method Get -TimeoutSec 10 -UseBasicParsing
    if ($apiResp.StatusCode -eq 200) {
        $data = $apiResp.Content | ConvertFrom-Json
        $kickStream = $data.streams | Where-Object { $_.platform -eq "kick" -and $_.channel -eq $kickChannel }
        if ($kickStream) {
            Write-Host " [PASS]" -ForegroundColor Green
            Write-Host "      - Registered Channel: $($kickStream.channel)" -ForegroundColor Gray
            Write-Host "      - Reported Status: $($kickStream.status)" -ForegroundColor Gray
            Write-Host "      - Embed URL: $($kickStream.embedUrl)" -ForegroundColor Gray
            $results["API Registration"] = "PASS (Configured: $($kickStream.channel))"
        } else {
            Write-Host " [FAIL: Channel $kickChannel not found in stream catalog]" -ForegroundColor Red
            $results["API Registration"] = "FAIL (Channel missing in catalog)"
        }
    } else {
        Write-Host " [FAIL: HTTP $($apiResp.StatusCode)]" -ForegroundColor Red
        $results["API Registration"] = "FAIL (HTTP $($apiResp.StatusCode))"
    }
} catch {
    Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
    $results["API Registration"] = "ERROR ($($_.Exception.Message))"
}

# ----------------------------------------------------
# TEST 2: Security & CSP Headers on movie-hell.pages.dev
# ----------------------------------------------------
Write-Host "`n[2/4] Checking CSP & framing headers on root page ($homeUrl)..." -NoNewline
try {
    $homeResp = Invoke-WebRequest -Uri $homeUrl -Method Get -TimeoutSec 10 -UseBasicParsing
    $csp = $homeResp.Headers["Content-Security-Policy"]
    $perm = $homeResp.Headers["Permissions-Policy"]
    
    $cspPass = $csp -like "*player.kick.com*"
    if ($cspPass) {
        Write-Host " [PASS]" -ForegroundColor Green
        Write-Host "      - CSP frame-src whitelist: Valid" -ForegroundColor Gray
        $results["CSP Whitelist"] = "PASS"
    } else {
        Write-Host " [WARN: CSP does not explicitly list player.kick.com]" -ForegroundColor Yellow
        Write-Host "      - Raw CSP: $csp" -ForegroundColor DarkGray
        $results["CSP Whitelist"] = "WARN"
    }
} catch {
    Write-Host " [ERROR: $($_.Exception.Message)]" -ForegroundColor Red
    $results["CSP Whitelist"] = "ERROR"
}

# ----------------------------------------------------
# TEST 3: Upstream Kick Channel Status
# ----------------------------------------------------
Write-Host "`n[3/4] Checking Upstream Kick Channel (https://kick.com/$kickChannel)..." -NoNewline
try {
    $kickHeaders = @{
        "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        "Accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    $kickResp = Invoke-WebRequest -Uri "https://kick.com/$kickChannel" -Headers $kickHeaders -Method Get -TimeoutSec 10 -UseBasicParsing -MaximumRedirection 3
    Write-Host " [HTTP $($kickResp.StatusCode)]" -ForegroundColor $(if ($kickResp.StatusCode -eq 200) { "Green" } else { "Yellow" })
    Write-Host "      - Response Content Length: $($kickResp.RawContentLength) bytes" -ForegroundColor Gray
    $results["Upstream Kick Channel"] = "HTTP $($kickResp.StatusCode)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode) {
        Write-Host " [HTTP ${statusCode} - $($_.Exception.Message)]" -ForegroundColor Yellow
        $results["Upstream Kick Channel"] = "HTTP $statusCode"
    } else {
        Write-Host " [NETWORK ERROR - $($_.Exception.Message)]" -ForegroundColor Red
        $results["Upstream Kick Channel"] = "NETWORK ERROR"
    }
}

# ----------------------------------------------------
# TEST 4: Upstream Kick Embed Player
# ----------------------------------------------------
Write-Host "`n[4/4] Checking Kick Embed Player ($embedUrl)..." -NoNewline
try {
    $playerHeaders = @{
        "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        "Referer" = "https://movie-hell.pages.dev/"
    }
    $playerResp = Invoke-WebRequest -Uri $embedUrl -Headers $playerHeaders -Method Get -TimeoutSec 10 -UseBasicParsing
    Write-Host " [HTTP $($playerResp.StatusCode)]" -ForegroundColor $(if ($playerResp.StatusCode -eq 200) { "Green" } else { "Yellow" })
    Write-Host "      - Content Type: $($playerResp.Headers['Content-Type'])" -ForegroundColor Gray
    Write-Host "      - Raw Length: $($playerResp.RawContentLength) bytes" -ForegroundColor Gray
    $results["Upstream Embed Player"] = "HTTP $($playerResp.StatusCode)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode) {
        Write-Host " [HTTP ${statusCode} - $($_.Exception.Message)]" -ForegroundColor Yellow
        $results["Upstream Embed Player"] = "HTTP $statusCode"
    } else {
        Write-Host " [NETWORK ERROR - $($_.Exception.Message)]" -ForegroundColor Red
        $results["Upstream Embed Player"] = "NETWORK ERROR"
    }
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host " SUMMARY OF VERIFICATION CHECKS                 " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
foreach ($key in $results.Keys) {
    Write-Host ("{0,-26} : {1}" -f $key, $results[$key])
}
Write-Host "==================================================" -ForegroundColor Cyan
