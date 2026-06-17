param(
  [string]$ServerUser = 'root',
  [string]$ServerHost = '101.132.141.97',
  [int]$ServerPort = 22,
  [string]$IdentityFile = (Resolve-Path (Join-Path $PSScriptRoot '..\..\cruiseswift.pem')).Path,
  [string]$SourceDb = (Resolve-Path (Join-Path $PSScriptRoot '..\..\curise_crawler\data\cruise_deals.db')).Path,
  [string]$RemoteDb = '/data/cruise_deals.db'
)

$ErrorActionPreference = 'Stop'

function RunNative([string]$Command, [string[]]$CommandArgs) {
  & $Command @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stageDir = Join-Path $env:TEMP "cruise_db_sync_$PID"
$snapshot = Join-Path $stageDir 'cruise_deals.db'
$backupScript = Join-Path $stageDir 'sqlite-backup.js'
$target = "$ServerUser@$ServerHost"
$remoteTmp = "$RemoteDb.tmp"

New-Item -ItemType Directory -Path $stageDir | Out-Null

try {
  @"
const { createRequire } = require('module');
const source = process.argv[2];
const target = process.argv[3];
const requireFromRepo = createRequire(process.argv[4] + '/package.json');
const Database = requireFromRepo('better-sqlite3');

(async () => {
  const db = new Database(source, { readonly: true });
  db.pragma('busy_timeout = 60000');
  await db.backup(target);
  db.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"@ | Set-Content -LiteralPath $backupScript -Encoding utf8

  Push-Location $repoRoot
  try {
    RunNative 'node' @($backupScript, $SourceDb, $snapshot, $repoRoot)
  } finally {
    Pop-Location
  }

  RunNative 'scp' @(
    '-C',
    '-i', $IdentityFile,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-P', "$ServerPort",
    $snapshot,
    "${target}:$remoteTmp"
  )

  RunNative 'ssh' @(
    '-i', $IdentityFile,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-p', "$ServerPort",
    $target,
    "mv '$remoteTmp' '$RemoteDb' && chmod 644 '$RemoteDb'; systemctl restart cruise-crawler-web.service >/dev/null 2>&1 || true; if command -v pm2 >/dev/null 2>&1; then pm2 restart cruise_agent >/dev/null 2>&1 || true; fi; ls -lh '$RemoteDb'"
  )
} finally {
  if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
  }
}
