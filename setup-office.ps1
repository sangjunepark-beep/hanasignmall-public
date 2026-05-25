# ==========================================================
# HANASM Claude Code — 회사 PC 셋업 (한 방)
# ==========================================================
# 사용법 (회사 PC PowerShell에서 한 줄):
#   irm https://raw.githubusercontent.com/sangjunepark-beep/hanasignmall-claude-config/main/setup-office.ps1 | iex
#
# 또는 setup-office.bat 더블클릭
# ==========================================================

$ErrorActionPreference = "Continue"

function Step($n, $msg) { Write-Host ("`n[{0}] {1}" -f $n, $msg) -ForegroundColor Cyan }
function OK($msg)       { Write-Host ("    [OK] {0}" -f $msg) -ForegroundColor Green }
function Warn($msg)     { Write-Host ("    [!]  {0}" -f $msg) -ForegroundColor Yellow }
function Fail($msg)     { Write-Host ("    [X]  {0}" -f $msg) -ForegroundColor Red }

function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  HANASM Claude Code — 회사 PC 셋업" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ----------------------------------------------------------
# 0) winget 사전 확인
# ----------------------------------------------------------
Step 0 "winget 확인"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Fail "winget이 없습니다. Microsoft Store에서 'App Installer' 설치 후 다시 실행하세요."
  return
}
OK "winget 사용 가능"

# ----------------------------------------------------------
# 1) Node.js 설치 (Claude Code는 npm 기반)
# ----------------------------------------------------------
Step 1 "Node.js 설치"
if (Get-Command node -ErrorAction SilentlyContinue) {
  OK ("이미 설치됨 — " + (node --version))
} else {
  Warn "설치 중... (1~2분)"
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements | Out-Null
  RefreshPath
  if (Get-Command node -ErrorAction SilentlyContinue) { OK ("설치 완료 — " + (node --version)) }
  else { Fail "Node.js 설치 실패. 수동으로 https://nodejs.org 에서 설치하세요."; return }
}

# ----------------------------------------------------------
# 2) Claude Code 설치 (npm global)
# ----------------------------------------------------------
Step 2 "Claude Code 설치"
if (Get-Command claude -ErrorAction SilentlyContinue) {
  OK "이미 설치됨"
} else {
  Warn "설치 중... (npm install -g @anthropic-ai/claude-code)"
  npm install -g @anthropic-ai/claude-code 2>&1 | Out-Null
  RefreshPath
  if (Get-Command claude -ErrorAction SilentlyContinue) { OK "설치 완료" }
  else { Warn "claude 명령이 PATH에 없습니다. PowerShell 재시작 후 다시 확인하세요." }
}

# ----------------------------------------------------------
# 3) GitHub CLI 설치
# ----------------------------------------------------------
Step 3 "GitHub CLI 설치"
if (Get-Command gh -ErrorAction SilentlyContinue) {
  OK "이미 설치됨"
} else {
  Warn "설치 중..."
  winget install -e --id GitHub.cli --silent --accept-source-agreements --accept-package-agreements | Out-Null
  RefreshPath
  if (Get-Command gh -ErrorAction SilentlyContinue) { OK "설치 완료" }
  else { Warn "gh 명령이 PATH에 없습니다. 직접 경로 사용 시도..." }
}

# gh fallback (PATH에 없으면 직접 경로)
$ghCmd = "gh"
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  $ghPath = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $ghPath) { $ghCmd = $ghPath; OK "gh 직접 경로 사용" }
  else { Fail "gh CLI를 찾을 수 없습니다. PowerShell 재시작 후 다시 실행하세요."; return }
}

# ----------------------------------------------------------
# 4) GitHub 인증
# ----------------------------------------------------------
Step 4 "GitHub 인증 (sangjunepark-beep)"
$authed = $false
try {
  & $ghCmd auth status 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $authed = $true }
} catch {}

if ($authed) {
  OK "이미 인증됨"
} else {
  Warn "브라우저로 GitHub 로그인합니다. 표시되는 8자리 코드를 브라우저에 입력하세요."
  & $ghCmd auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { Fail "인증 실패. 수동으로 'gh auth login' 실행 후 다시 시도하세요."; return }
  OK "인증 완료"
}

# ----------------------------------------------------------
# 5) 백업 리포 clone / pull
# ----------------------------------------------------------
Step 5 "백업 리포 동기화 (hanasignmall-claude-config)"
$backupDir = "$env:USERPROFILE\hanasignmall-claude-config"
if (Test-Path $backupDir) {
  Push-Location $backupDir
  try {
    git pull 2>&1 | Out-Null
    OK ("git pull 완료 — " + $backupDir)
  } catch {
    Warn "git pull 실패 — clone부터 다시 시도하세요."
  }
  Pop-Location
} else {
  & $ghCmd repo clone sangjunepark-beep/hanasignmall-claude-config $backupDir
  if ($LASTEXITCODE -ne 0) { Fail "clone 실패. 권한·네트워크 확인."; return }
  OK ("Clone 완료 — " + $backupDir)
}

# ----------------------------------------------------------
# 6) ~/.claude/ 복원
# ----------------------------------------------------------
Step 6 "Claude Code 환경 복원"
$src = "$backupDir\claude-code-jimrn"
if (-not (Test-Path $src)) { Fail "백업 폴더 없음: $src"; return }

$claudeDir = "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force $claudeDir | Out-Null

Copy-Item "$src\CLAUDE.md" "$claudeDir\CLAUDE.md" -Force
OK ("CLAUDE.md → " + "$claudeDir\CLAUDE.md")

Copy-Item "$src\settings.json" "$claudeDir\settings.json" -Force
OK ("settings.json → " + "$claudeDir\settings.json")

$slug = "C--Users-$env:USERNAME"
$memDst = "$claudeDir\projects\$slug\memory"
New-Item -ItemType Directory -Force $memDst | Out-Null
Copy-Item "$src\memory\*" $memDst -Force
$memCount = (Get-ChildItem $memDst -File).Count
OK ("memory/ → $memDst ({0}개 파일)" -f $memCount)

# ----------------------------------------------------------
# 완료
# ----------------------------------------------------------
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  셋업 완료" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "  1. PowerShell 재시작 (PATH 반영)"
Write-Host "  2. 작업 디렉터리로 이동:  cd $env:USERPROFILE"
Write-Host "  3. Claude Code 실행:       claude"
Write-Host "     → 첫 실행 시 Anthropic 계정 로그인 (브라우저 자동 열림)"
Write-Host ""
Write-Host "와이어 맵 / 프로젝트 진행 관리:" -ForegroundColor Yellow
Write-Host "  https://sangjunepark-beep.github.io/hanasm-wire-map/"
Write-Host ""
Write-Host "양쪽 PC sync (작업 후):" -ForegroundColor Yellow
Write-Host "  Claude Code 안에서 '지침 메모리 스킬 모두 저장' 명령으로 백업 리포에 푸시"
Write-Host ""
