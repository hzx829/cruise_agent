param(
  [ValidateSet('update', 'status')]
  [string]$Mode = 'update',
  [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'

# Keep this script deterministic: deploy the committed Git HEAD only.
$ServerUser = 'root'
$ServerHost = '211.149.161.68'
$ServerPort = 22000
$RemoteAppDir = '/srv/cruise_agent'
$RemoteDataDir = '/data'
$Domain = 'www.cruiseswift.com'
$AppPort = 3000
$Pm2AppName = 'cruise_agent'

function Info($Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Warn($Message) {
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function RunNative([string]$Command, [string[]]$CommandArgs) {
  & $Command @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

function RunSshScript([string]$Script, [string]$ArgsLine = '') {
  $target = "$ServerUser@$ServerHost"
  $normalizedScript = $Script -replace "`r`n", "`n"
  if ($ArgsLine) {
    $normalizedScript | & ssh -p $ServerPort $target "bash -s -- $ArgsLine"
  } else {
    $normalizedScript | & ssh -p $ServerPort $target 'bash -s'
  }
  if ($LASTEXITCODE -ne 0) {
    throw "remote script failed with exit code $LASTEXITCODE"
  }
}

function Get-RepoRoot {
  $root = (& git rev-parse --show-toplevel).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $root) {
    throw 'not inside a git repository'
  }
  return $root
}

function Ensure-CleanTrackedTree([string]$RepoRoot) {
  if ($AllowDirty) {
    Warn 'AllowDirty is set: tracked uncommitted changes may not be deployed unless committed.'
    return
  }

  & git -C $RepoRoot diff --quiet
  $worktreeDirty = $LASTEXITCODE -ne 0
  & git -C $RepoRoot diff --cached --quiet
  $indexDirty = $LASTEXITCODE -ne 0

  if ($worktreeDirty -or $indexDirty) {
    throw 'tracked changes are not committed. Commit first, then deploy.'
  }
}

function Show-Status {
  $script = @'
set -euo pipefail
APP_DIR="$1"
PM2_APP_NAME="$2"
APP_PORT="$3"

echo "== PM2 =="
pm2 list
echo

echo "== Deployed revision =="
cat "${APP_DIR}/.deploy-revision" 2>/dev/null || echo "unknown"
echo

echo "== Health =="
for path in /chat /admin/agent-traces /api/admin/agent-traces?limit=1; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}${path}")
  echo "${path} ${code}"
done
echo

echo "== Trace counts =="
cd "${APP_DIR}"
node -e "const Database=require('better-sqlite3'); const db=new Database(process.env.AGENT_DB_PATH || 'data/agent.db',{readonly:true}); console.log('agent_runs='+db.prepare('select count(*) as c from agent_runs').get().c); console.log('agent_steps='+db.prepare('select count(*) as c from agent_steps').get().c); db.close();"
'@

  RunSshScript $script "'$RemoteAppDir' '$Pm2AppName' '$AppPort'"
}

function Deploy-Update {
  $repoRoot = Get-RepoRoot
  Set-Location $repoRoot

  $envFile = Join-Path $repoRoot '.env.local'
  if (-not (Test-Path -LiteralPath $envFile)) {
    throw '.env.local does not exist'
  }

  Ensure-CleanTrackedTree $repoRoot

  $untracked = & git -C $repoRoot ls-files --others --exclude-standard
  if ($untracked) {
    Warn 'untracked files will not be deployed:'
    $untracked | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
  }

  $commit = (& git -C $repoRoot rev-parse --short HEAD).Trim()
  $archive = Join-Path $env:TEMP "cruise_agent_$commit.tar"
  $remoteArchive = "/tmp/cruise_agent_$commit.tar"
  $remoteEnv = "/tmp/cruise_agent_$commit.env"

  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }

  try {
    Info "Packaging Git HEAD $commit"
    RunNative 'git' @('-C', $repoRoot, 'archive', '--format=tar', "--output=$archive", 'HEAD')

    Info 'Uploading package and environment'
    RunNative 'scp' @('-P', "$ServerPort", $archive, "${ServerUser}@${ServerHost}:$remoteArchive")
    RunNative 'scp' @('-P', "$ServerPort", $envFile, "${ServerUser}@${ServerHost}:$remoteEnv")

    Info 'Building and switching release on server'
    $script = @'
set -euo pipefail
APP_DIR="$1"
DATA_DIR="$2"
PM2_APP_NAME="$3"
APP_PORT="$4"
COMMIT="$5"
ARCHIVE="$6"
ENV_FILE="$7"
SERVER_USER="$8"
BUILD_DIR="/tmp/cruise_agent_build_${COMMIT}_$$"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${APP_DIR}"

tar -xf "${ARCHIVE}" -C "${BUILD_DIR}"
mv "${ENV_FILE}" "${BUILD_DIR}/.env.local"
grep -q '^DB_PATH=' "${BUILD_DIR}/.env.local" || echo "DB_PATH=${DATA_DIR}/cruise_deals.db" >> "${BUILD_DIR}/.env.local"
echo "${COMMIT}" > "${BUILD_DIR}/.deploy-revision"

cd "${BUILD_DIR}"
pnpm install --frozen-lockfile
pnpm build

# Preserve runtime data such as data/agent.db; replace everything else from the built commit.
find "${APP_DIR}" -mindepth 1 -maxdepth 1 ! -name 'data' -exec rm -rf {} +
tar -C "${BUILD_DIR}" -cf - . | tar -C "${APP_DIR}" -xf -
cd /
rm -rf "${BUILD_DIR}" "${ARCHIVE}"

APP_IDS=$(pm2 jlist | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { const name = process.argv[1]; const ids = JSON.parse(s).filter(p => p.name === name).map(p => p.pm_id); console.log(ids.join(' ')); });" "${PM2_APP_NAME}")
read -r PRIMARY_ID EXTRA_IDS <<< "${APP_IDS}"

if [[ -n "${PRIMARY_ID:-}" ]]; then
  for extra_id in ${EXTRA_IDS:-}; do
    pm2 delete "${extra_id}" || true
  done
  pm2 reload "${PRIMARY_ID}" --update-env
else
  cd "${APP_DIR}"
  pm2 start "pnpm start" --name "${PM2_APP_NAME}" --cwd "${APP_DIR}"
  pm2 startup systemd -u "${SERVER_USER}" --hp /root || true
fi
pm2 save

for path in /chat /admin/agent-traces /api/admin/agent-traces?limit=1; do
  ok=0
  for i in {1..20}; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}${path}")
    if [[ "${code}" == "200" ]]; then
      ok=1
      break
    fi
    sleep 1
  done
  if [[ "${ok}" != "1" ]]; then
    echo "Health check failed: ${path} returned ${code}" >&2
    exit 1
  fi
done
'@

    RunSshScript $script "'$RemoteAppDir' '$RemoteDataDir' '$Pm2AppName' '$AppPort' '$commit' '$remoteArchive' '$remoteEnv' '$ServerUser'"
    Ok "Deployed $commit to https://$Domain"
  } finally {
    if (Test-Path -LiteralPath $archive) {
      Remove-Item -LiteralPath $archive -Force
    }
  }
}

switch ($Mode) {
  'update' { Deploy-Update }
  'status' { Show-Status }
}
