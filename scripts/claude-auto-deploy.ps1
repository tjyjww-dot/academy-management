$ErrorActionPreference = 'Continue'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 한글 폴더 "클로드" Unicode codepoint 로 구성
$cfolder = [char]0xD074 + [char]0xB85C + [char]0xB4DC
$desktop = [Environment]::GetFolderPath('Desktop')
$repoPath = Join-Path $desktop (Join-Path $cfolder 'academy-management')
$logPath  = Join-Path $repoPath 'scripts\claude-auto-deploy-log.txt'
$msgPath  = Join-Path $repoPath 'scripts\.claude-next-commit-msg.txt'
$stagePath = Join-Path $repoPath 'scripts\.claude-next-stage.txt'

function Log {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline=$true, Position=0)]
        $text
    )
    process {
        if ($null -eq $text) { return }
        $text | Out-File -LiteralPath $script:logPath -Append -Encoding UTF8
    }
}

if (-not (Test-Path $repoPath)) {
    Write-Host ("ERROR: repo not found -> " + $repoPath)
    exit 1
}
Set-Location -LiteralPath $repoPath

"=== claude-auto-deploy start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -LiteralPath $logPath -Encoding UTF8
Log "pwd: $(Get-Location)"

# 0) stale index.lock 제거
if (Test-Path '.git/index.lock') {
    Remove-Item -LiteralPath '.git/index.lock' -Force -ErrorAction SilentlyContinue
    Log "removed stale .git/index.lock"
}

# 1) git config
git config user.email "tjyjww@gmail.com" | Out-Null
git config user.name  "tjyjww-dot"       | Out-Null

# 2) commit message 읽기 (UTF-8)
if (-not (Test-Path $msgPath)) {
    Log "ERROR: commit message file not found: $msgPath"
    Write-Host "ERROR: commit message file missing"
    exit 2
}
$commitMsg = Get-Content -LiteralPath $msgPath -Raw -Encoding UTF8
if ($null -eq $commitMsg) { $commitMsg = "" }
$commitMsg = $commitMsg.TrimEnd()
if ([string]::IsNullOrWhiteSpace($commitMsg)) {
    Log "ERROR: commit message is empty"
    Write-Host "ERROR: empty commit message"
    exit 3
}

Log ""
Log "=== commit message ==="
Log $commitMsg

# 3) 스테이징
Log ""
Log "=== git status (before) ==="
(git status --short 2>&1) | Out-String | Log

$stagedAny = $false
if (Test-Path $stagePath) {
    $paths = Get-Content -LiteralPath $stagePath -Encoding UTF8 | Where-Object { $_ -and ($_ -notmatch '^\s*#') -and ($_.Trim() -ne '') }
    if ($paths -and @($paths).Count -gt 0) {
        Log ""
        Log "=== git add (specific paths) ==="
        foreach ($p in @($paths)) {
            $p = $p.Trim()
            Log "add: $p"
            (git add -- $p 2>&1) | Out-String | Log
        }
        $stagedAny = $true
    }
}
if (-not $stagedAny) {
    Log ""
    Log "=== git add -A ==="
    (git add -A 2>&1) | Out-String | Log
}

Log ""
Log "=== git status (after add) ==="
(git status --short 2>&1) | Out-String | Log

# 4) commit (UTF-8 임시파일 -F)
Log ""
Log "=== git commit ==="
$tmpMsg = Join-Path $env:TEMP ("claude-commit-msg-" + [Guid]::NewGuid().ToString() + ".txt")
[System.IO.File]::WriteAllText($tmpMsg, $commitMsg, (New-Object System.Text.UTF8Encoding $false))
(git commit -F $tmpMsg 2>&1) | Out-String | Log
Remove-Item -LiteralPath $tmpMsg -Force -ErrorAction SilentlyContinue

Log ""
Log "=== git log -3 ==="
(git log --oneline -3 2>&1) | Out-String | Log

# 5) push
Log ""
Log "=== git push origin main ==="
(git push origin main 2>&1) | Out-String | Log

Log ""
Log "=== git log -3 (after push) ==="
(git log --oneline -3 2>&1) | Out-String | Log

Log ""
Log "=== DONE $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

# 6) 템플릿 파일 비움 (다음 실행 안전장치)
Clear-Content -LiteralPath $msgPath -ErrorAction SilentlyContinue
if (Test-Path $stagePath) { Clear-Content -LiteralPath $stagePath -ErrorAction SilentlyContinue }

Write-Host "=== DONE ==="
Get-Content -LiteralPath $logPath -Tail 80
